import { Storage, Bucket, File } from '@google-cloud/storage'; // v6.0.0
import { injectable } from 'inversify'; // v6.0.0
import { Logger } from 'winston'; // v3.8.0
import { operation } from 'retry'; // v0.13.0
import { StorageService, StorageFile, StorageOptions } from '../interfaces/storage.interface';
import { storageConfig } from '../../config/storage.config';
import { NotFoundError } from '../utils/error.util';
import { ReadableStream } from 'stream';

/**
 * Enhanced implementation of Google Cloud Storage service with CMEK encryption,
 * comprehensive error handling, and monitoring capabilities
 */
@injectable()
export class CloudStorageService implements StorageService {
    private storage: Storage;
    private readonly archiveBucketName: string;
    private readonly retryConfig = {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000
    };

    /**
     * Initializes Cloud Storage service with enhanced security configuration
     * @param logger - Winston logger instance for operation logging
     */
    constructor(private readonly logger: Logger) {
        // Initialize GCS client with CMEK configuration
        this.storage = new Storage({
            projectId: process.env.GCP_PROJECT_ID,
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            retryOptions: this.retryConfig
        });

        this.archiveBucketName = storageConfig.gcs.archiveBucket.name;
        this.validateConfiguration();
    }

    /**
     * Validates storage configuration and encryption settings
     * @throws Error if configuration is invalid
     */
    private validateConfiguration(): void {
        if (!storageConfig.gcs.encryption.enabled || !storageConfig.gcs.encryption.kmsKeyName) {
            throw new Error('CMEK encryption must be enabled and configured');
        }
    }

    /**
     * Uploads file to GCS with encryption and retry logic
     * @param bucketName - Target bucket name
     * @param fileName - Desired file name
     * @param content - File content
     * @param options - Upload options
     * @returns Promise<StorageFile> - Uploaded file metadata
     */
    public async uploadFile(
        bucketName: string,
        fileName: string,
        content: Buffer | ReadableStream,
        options?: StorageOptions
    ): Promise<StorageFile> {
        this.logger.info(`Starting file upload: ${fileName} to bucket: ${bucketName}`);

        try {
            const bucket = this.storage.bucket(bucketName);
            const file = bucket.file(fileName);

            const uploadOptions = {
                metadata: {
                    ...options?.metadata,
                    encryptionKey: storageConfig.gcs.encryption.kmsKeyName
                },
                contentType: options?.contentType,
                public: options?.public || false,
                resumable: true,
                gzip: true
            };

            // Implement retry logic for upload
            const retryOperation = operation(this.retryConfig);
            await new Promise((resolve, reject) => {
                retryOperation.attempt(async (currentAttempt) => {
                    try {
                        if (content instanceof Buffer) {
                            await file.save(content, uploadOptions);
                        } else {
                            await new Promise((resolve, reject) => {
                                const writeStream = file.createWriteStream(uploadOptions);
                                content
                                    .pipe(writeStream)
                                    .on('error', reject)
                                    .on('finish', resolve);
                            });
                        }
                        resolve(true);
                    } catch (error) {
                        if (retryOperation.retry(error as Error)) {
                            this.logger.warn(`Retry attempt ${currentAttempt} for upload: ${fileName}`);
                            return;
                        }
                        reject(error);
                    }
                });
            });

            const [metadata] = await file.getMetadata();

            // Set retention period if specified
            if (options?.retentionPeriod) {
                await file.setMetadata({
                    metadata: {
                        ...metadata.metadata,
                        retentionExpiryDate: new Date(
                            Date.now() + options.retentionPeriod * 24 * 60 * 60 * 1000
                        ).toISOString()
                    }
                });
            }

            this.logger.info(`Successfully uploaded file: ${fileName}`);

            return {
                name: metadata.name,
                bucket: metadata.bucket,
                size: metadata.size,
                contentType: metadata.contentType,
                createdAt: new Date(metadata.timeCreated),
                updatedAt: new Date(metadata.updated),
                metadata: metadata.metadata || {},
                retentionExpiryDate: metadata.metadata?.retentionExpiryDate 
                    ? new Date(metadata.metadata.retentionExpiryDate)
                    : new Date()
            };
        } catch (error) {
            this.logger.error(`Error uploading file: ${fileName}`, { error });
            throw error;
        }
    }

    /**
     * Downloads file from GCS with retry logic
     * @param bucketName - Source bucket name
     * @param fileName - File to download
     * @returns Promise<Buffer> - File content
     */
    public async downloadFile(bucketName: string, fileName: string): Promise<Buffer> {
        this.logger.info(`Starting file download: ${fileName} from bucket: ${bucketName}`);

        try {
            const bucket = this.storage.bucket(bucketName);
            const file = bucket.file(fileName);

            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new NotFoundError(`File not found: ${fileName}`);
            }

            // Implement retry logic for download
            const retryOperation = operation(this.retryConfig);
            const buffer = await new Promise<Buffer>((resolve, reject) => {
                retryOperation.attempt(async (currentAttempt) => {
                    try {
                        const [content] = await file.download();
                        resolve(content);
                    } catch (error) {
                        if (retryOperation.retry(error as Error)) {
                            this.logger.warn(`Retry attempt ${currentAttempt} for download: ${fileName}`);
                            return;
                        }
                        reject(error);
                    }
                });
            });

            this.logger.info(`Successfully downloaded file: ${fileName}`);
            return buffer;
        } catch (error) {
            this.logger.error(`Error downloading file: ${fileName}`, { error });
            throw error;
        }
    }

    /**
     * Deletes file from GCS with retry logic
     * @param bucketName - Source bucket name
     * @param fileName - File to delete
     */
    public async deleteFile(bucketName: string, fileName: string): Promise<void> {
        this.logger.info(`Starting file deletion: ${fileName} from bucket: ${bucketName}`);

        try {
            const bucket = this.storage.bucket(bucketName);
            const file = bucket.file(fileName);

            // Check if file exists
            const [exists] = await file.exists();
            if (!exists) {
                throw new NotFoundError(`File not found: ${fileName}`);
            }

            // Implement retry logic for deletion
            const retryOperation = operation(this.retryConfig);
            await new Promise<void>((resolve, reject) => {
                retryOperation.attempt(async (currentAttempt) => {
                    try {
                        await file.delete();
                        resolve();
                    } catch (error) {
                        if (retryOperation.retry(error as Error)) {
                            this.logger.warn(`Retry attempt ${currentAttempt} for deletion: ${fileName}`);
                            return;
                        }
                        reject(error);
                    }
                });
            });

            this.logger.info(`Successfully deleted file: ${fileName}`);
        } catch (error) {
            this.logger.error(`Error deleting file: ${fileName}`, { error });
            throw error;
        }
    }

    /**
     * Lists files in GCS bucket with optional prefix filtering
     * @param bucketName - Bucket to list
     * @param prefix - Optional prefix filter
     * @param options - List options
     * @returns Promise<StorageFile[]> - Array of file metadata
     */
    public async listFiles(
        bucketName: string,
        prefix?: string,
        options?: StorageOptions
    ): Promise<StorageFile[]> {
        this.logger.info(`Listing files in bucket: ${bucketName}${prefix ? ` with prefix: ${prefix}` : ''}`);

        try {
            const bucket = this.storage.bucket(bucketName);
            const [files] = await bucket.getFiles({ prefix });

            const fileMetadata = await Promise.all(
                files.map(async (file) => {
                    const [metadata] = await file.getMetadata();
                    return {
                        name: metadata.name,
                        bucket: metadata.bucket,
                        size: metadata.size,
                        contentType: metadata.contentType,
                        createdAt: new Date(metadata.timeCreated),
                        updatedAt: new Date(metadata.updated),
                        metadata: metadata.metadata || {},
                        retentionExpiryDate: metadata.metadata?.retentionExpiryDate 
                            ? new Date(metadata.metadata.retentionExpiryDate)
                            : new Date()
                    };
                })
            );

            this.logger.info(`Successfully listed ${fileMetadata.length} files`);
            return fileMetadata;
        } catch (error) {
            this.logger.error(`Error listing files in bucket: ${bucketName}`, { error });
            throw error;
        }
    }

    /**
     * Moves file to archive storage with retention period
     * @param sourceBucket - Source bucket name
     * @param fileName - File to archive
     * @param retentionPeriod - Optional retention period in days
     * @returns Promise<StorageFile> - Archived file metadata
     */
    public async moveToArchive(
        sourceBucket: string,
        fileName: string,
        retentionPeriod?: number
    ): Promise<StorageFile> {
        this.logger.info(`Moving file: ${fileName} to archive from bucket: ${sourceBucket}`);

        try {
            const sourceBucketRef = this.storage.bucket(sourceBucket);
            const sourceFile = sourceBucketRef.file(fileName);
            const archiveBucket = this.storage.bucket(this.archiveBucketName);

            // Check if source file exists
            const [exists] = await sourceFile.exists();
            if (!exists) {
                throw new NotFoundError(`File not found: ${fileName}`);
            }

            // Copy to archive with retention period
            await sourceFile.copy(archiveBucket.file(fileName), {
                metadata: {
                    retentionExpiryDate: retentionPeriod 
                        ? new Date(Date.now() + retentionPeriod * 24 * 60 * 60 * 1000).toISOString()
                        : undefined
                }
            });

            // Delete source file after successful copy
            await sourceFile.delete();

            // Get archived file metadata
            const archivedFile = archiveBucket.file(fileName);
            const [metadata] = await archivedFile.getMetadata();

            this.logger.info(`Successfully archived file: ${fileName}`);

            return {
                name: metadata.name,
                bucket: metadata.bucket,
                size: metadata.size,
                contentType: metadata.contentType,
                createdAt: new Date(metadata.timeCreated),
                updatedAt: new Date(metadata.updated),
                metadata: metadata.metadata || {},
                retentionExpiryDate: metadata.metadata?.retentionExpiryDate 
                    ? new Date(metadata.metadata.retentionExpiryDate)
                    : new Date()
            };
        } catch (error) {
            this.logger.error(`Error archiving file: ${fileName}`, { error });
            throw error;
        }
    }
}