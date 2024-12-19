import { describe, beforeEach, afterEach, it, jest, expect } from '@jest/globals'; // v29.0.0
import { Storage, Bucket, File } from '@google-cloud/storage'; // v6.0.0
import { Logger } from 'winston'; // v3.8.0
import { CloudStorageService } from '../../../src/core/storage/cloud-storage.service';
import { StorageOptions } from '../../../src/core/interfaces/storage.interface';
import { NotFoundError } from '../../../src/core/utils/error.util';
import { storageConfig } from '../../../src/config/storage.config';

// Mock GCP Storage
jest.mock('@google-cloud/storage');
jest.mock('winston');

describe('CloudStorageService', () => {
    let cloudStorageService: CloudStorageService;
    let mockStorage: jest.Mocked<Storage>;
    let mockBucket: jest.Mocked<Bucket>;
    let mockFile: jest.Mocked<File>;
    let mockLogger: jest.Mocked<Logger>;

    const testBucketName = 'test-bucket';
    const testFileName = 'test-file.txt';
    const testContent = Buffer.from('test content');
    const testEncryptionKey = 'projects/test-project/locations/global/keyRings/test-ring/cryptoKeys/test-key';
    const testRetentionPeriod = 90; // days

    beforeEach(() => {
        // Setup mocks
        mockFile = {
            save: jest.fn(),
            createWriteStream: jest.fn(),
            getMetadata: jest.fn(),
            exists: jest.fn(),
            delete: jest.fn(),
            copy: jest.fn(),
            setMetadata: jest.fn()
        } as unknown as jest.Mocked<File>;

        mockBucket = {
            file: jest.fn().mockReturnValue(mockFile),
            getFiles: jest.fn()
        } as unknown as jest.Mocked<Bucket>;

        mockStorage = {
            bucket: jest.fn().mockReturnValue(mockBucket)
        } as unknown as jest.Mocked<Storage>;

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        // Initialize service
        (Storage as unknown as jest.Mock).mockImplementation(() => mockStorage);
        cloudStorageService = new CloudStorageService(mockLogger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('File Operations', () => {
        describe('uploadFile', () => {
            const uploadOptions: StorageOptions = {
                contentType: 'text/plain',
                metadata: { source: 'test' },
                retentionPeriod: testRetentionPeriod
            };

            it('should successfully upload a file with Buffer content', async () => {
                mockFile.getMetadata.mockResolvedValue([{
                    name: testFileName,
                    bucket: testBucketName,
                    size: testContent.length,
                    contentType: 'text/plain',
                    timeCreated: new Date().toISOString(),
                    updated: new Date().toISOString(),
                    metadata: uploadOptions.metadata
                }]);

                const result = await cloudStorageService.uploadFile(
                    testBucketName,
                    testFileName,
                    testContent,
                    uploadOptions
                );

                expect(mockBucket.file).toHaveBeenCalledWith(testFileName);
                expect(mockFile.save).toHaveBeenCalledWith(
                    testContent,
                    expect.objectContaining({
                        metadata: expect.objectContaining({
                            encryptionKey: expect.any(String)
                        }),
                        contentType: uploadOptions.contentType,
                        resumable: true,
                        gzip: true
                    })
                );
                expect(result.name).toBe(testFileName);
                expect(result.bucket).toBe(testBucketName);
            });

            it('should handle upload failures with retries', async () => {
                const error = new Error('Upload failed');
                mockFile.save.mockRejectedValueOnce(error)
                    .mockRejectedValueOnce(error)
                    .mockResolvedValueOnce(undefined);

                await expect(cloudStorageService.uploadFile(
                    testBucketName,
                    testFileName,
                    testContent
                )).resolves.toBeDefined();

                expect(mockLogger.warn).toHaveBeenCalledTimes(2);
                expect(mockFile.save).toHaveBeenCalledTimes(3);
            });
        });

        describe('downloadFile', () => {
            it('should successfully download an existing file', async () => {
                mockFile.exists.mockResolvedValue([true]);
                mockFile.download.mockResolvedValue([testContent]);

                const result = await cloudStorageService.downloadFile(
                    testBucketName,
                    testFileName
                );

                expect(result).toEqual(testContent);
                expect(mockFile.download).toHaveBeenCalled();
            });

            it('should throw NotFoundError for non-existent file', async () => {
                mockFile.exists.mockResolvedValue([false]);

                await expect(cloudStorageService.downloadFile(
                    testBucketName,
                    testFileName
                )).rejects.toThrow(NotFoundError);
            });
        });

        describe('deleteFile', () => {
            it('should successfully delete an existing file', async () => {
                mockFile.exists.mockResolvedValue([true]);
                mockFile.delete.mockResolvedValue([]);

                await cloudStorageService.deleteFile(testBucketName, testFileName);

                expect(mockFile.delete).toHaveBeenCalled();
                expect(mockLogger.info).toHaveBeenCalledWith(
                    expect.stringContaining('Successfully deleted file')
                );
            });

            it('should throw NotFoundError when deleting non-existent file', async () => {
                mockFile.exists.mockResolvedValue([false]);

                await expect(cloudStorageService.deleteFile(
                    testBucketName,
                    testFileName
                )).rejects.toThrow(NotFoundError);
            });
        });

        describe('listFiles', () => {
            const mockFiles = [
                { name: 'file1.txt' },
                { name: 'file2.txt' }
            ];

            it('should list files with metadata', async () => {
                mockBucket.getFiles.mockResolvedValue([[
                    { getMetadata: () => Promise.resolve([mockFiles[0]]) },
                    { getMetadata: () => Promise.resolve([mockFiles[1]]) }
                ]]);

                const result = await cloudStorageService.listFiles(testBucketName);

                expect(result).toHaveLength(2);
                expect(mockBucket.getFiles).toHaveBeenCalled();
            });

            it('should filter files by prefix', async () => {
                const prefix = 'test/';
                await cloudStorageService.listFiles(testBucketName, prefix);

                expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix });
            });
        });
    });

    describe('Security Operations', () => {
        it('should set CMEK encryption on upload', async () => {
            mockFile.getMetadata.mockResolvedValue([{
                name: testFileName,
                timeCreated: new Date().toISOString(),
                updated: new Date().toISOString()
            }]);

            await cloudStorageService.uploadFile(
                testBucketName,
                testFileName,
                testContent
            );

            expect(mockFile.save).toHaveBeenCalledWith(
                expect.any(Buffer),
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        encryptionKey: storageConfig.gcs.encryption.kmsKeyName
                    })
                })
            );
        });

        it('should validate configuration on initialization', () => {
            expect(() => new CloudStorageService(mockLogger)).not.toThrow();
        });
    });

    describe('Retention and Archival', () => {
        describe('moveToArchive', () => {
            it('should successfully move file to archive with retention', async () => {
                mockFile.exists.mockResolvedValue([true]);
                mockFile.getMetadata.mockResolvedValue([{
                    name: testFileName,
                    timeCreated: new Date().toISOString(),
                    updated: new Date().toISOString()
                }]);

                await cloudStorageService.moveToArchive(
                    testBucketName,
                    testFileName,
                    testRetentionPeriod
                );

                expect(mockFile.copy).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        metadata: expect.objectContaining({
                            retentionExpiryDate: expect.any(String)
                        })
                    })
                );
                expect(mockFile.delete).toHaveBeenCalled();
            });

            it('should handle non-existent source file', async () => {
                mockFile.exists.mockResolvedValue([false]);

                await expect(cloudStorageService.moveToArchive(
                    testBucketName,
                    testFileName
                )).rejects.toThrow(NotFoundError);
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle network errors with retries', async () => {
            const networkError = new Error('Network error');
            mockFile.exists.mockResolvedValue([true]);
            mockFile.download
                .mockRejectedValueOnce(networkError)
                .mockRejectedValueOnce(networkError)
                .mockResolvedValueOnce([testContent]);

            await cloudStorageService.downloadFile(testBucketName, testFileName);

            expect(mockFile.download).toHaveBeenCalledTimes(3);
            expect(mockLogger.warn).toHaveBeenCalledTimes(2);
        });

        it('should handle quota exceeded errors', async () => {
            const quotaError = new Error('Quota exceeded');
            mockFile.exists.mockResolvedValue([true]);
            mockFile.download.mockRejectedValue(quotaError);

            await expect(cloudStorageService.downloadFile(
                testBucketName,
                testFileName
            )).rejects.toThrow(quotaError);
        });
    });
});