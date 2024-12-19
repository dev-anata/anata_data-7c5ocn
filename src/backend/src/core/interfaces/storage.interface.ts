import { ReadableStream } from 'stream'; // v1.0.0

/**
 * Represents a file stored in the storage system with comprehensive metadata
 * @interface StorageFile
 */
export interface StorageFile {
    /** Unique identifier of the file within the bucket */
    name: string;
    
    /** Name of the GCS bucket containing the file */
    bucket: string;
    
    /** File size in bytes */
    size: number;
    
    /** MIME type of the file content */
    contentType: string;
    
    /** Timestamp of file creation */
    createdAt: Date;
    
    /** Timestamp of last file modification */
    updatedAt: Date;
    
    /** Custom metadata key-value pairs */
    metadata: Record<string, string>;
    
    /** Date when retention period expires */
    retentionExpiryDate: Date;
}

/**
 * Configuration options for storage operations with security and metadata controls
 * @interface StorageOptions
 */
export interface StorageOptions {
    /** MIME type for the file */
    contentType?: string;
    
    /** Custom metadata for the file */
    metadata?: Record<string, string>;
    
    /** Flag for public access control */
    public?: boolean;
    
    /** Retention period in days */
    retentionPeriod?: number;
    
    /** Customer-managed encryption key */
    encryption?: string;
}

/**
 * Core interface for storage service operations with comprehensive error handling
 * and security controls
 * @interface StorageService
 */
export interface StorageService {
    /**
     * Uploads a file to the specified bucket with optional metadata and security controls
     * @param bucketName - Name of the target bucket
     * @param fileName - Desired name for the file in storage
     * @param content - File content as Buffer or ReadableStream
     * @param options - Optional configuration for the upload
     * @returns Promise resolving to uploaded file metadata
     * @throws StorageError if upload fails
     */
    uploadFile(
        bucketName: string,
        fileName: string,
        content: Buffer | ReadableStream,
        options?: StorageOptions
    ): Promise<StorageFile>;

    /**
     * Downloads a file from the specified bucket
     * @param bucketName - Name of the source bucket
     * @param fileName - Name of the file to download
     * @returns Promise resolving to file content as Buffer
     * @throws StorageError if download fails or file not found
     */
    downloadFile(
        bucketName: string,
        fileName: string
    ): Promise<Buffer>;

    /**
     * Deletes a file from the specified bucket
     * @param bucketName - Name of the bucket containing the file
     * @param fileName - Name of the file to delete
     * @returns Promise resolving when deletion is complete
     * @throws StorageError if deletion fails
     */
    deleteFile(
        bucketName: string,
        fileName: string
    ): Promise<void>;

    /**
     * Lists files in the specified bucket with optional filtering
     * @param bucketName - Name of the bucket to list
     * @param prefix - Optional prefix to filter files
     * @param options - Optional configuration for listing
     * @returns Promise resolving to array of file metadata
     * @throws StorageError if listing fails
     */
    listFiles(
        bucketName: string,
        prefix?: string,
        options?: StorageOptions
    ): Promise<StorageFile[]>;

    /**
     * Moves a file to archive storage with optional retention period
     * @param sourceBucket - Name of the source bucket
     * @param fileName - Name of the file to archive
     * @param retentionPeriod - Optional retention period in days
     * @returns Promise resolving to archived file metadata
     * @throws StorageError if archival fails
     */
    moveToArchive(
        sourceBucket: string,
        fileName: string,
        retentionPeriod?: number
    ): Promise<StorageFile>;
}