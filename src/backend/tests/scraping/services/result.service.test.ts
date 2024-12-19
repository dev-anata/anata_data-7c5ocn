import { describe, beforeAll, afterAll, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Logger } from 'winston';
import { v4 as uuidv4 } from 'uuid';

import { ResultService } from '../../../src/scraping/services/result.service';
import { CloudStorageService } from '../../../core/storage/cloud-storage.service';
import { BigQueryClientImpl } from '../../../core/database/bigquery.client';
import { MetricsCollector } from '../../../core/monitoring/metrics.collector';
import { ScrapingResult } from '../../../src/scraping/interfaces/result.interface';
import { NotFoundError, ValidationError } from '../../../core/utils/error.util';
import { storageConfig } from '../../../config/storage.config';

describe('ResultService', () => {
    let resultService: ResultService;
    let storageService: jest.Mocked<CloudStorageService>;
    let bigQueryClient: jest.Mocked<BigQueryClientImpl>;
    let metricsCollector: jest.Mocked<MetricsCollector>;
    let logger: jest.Mocked<Logger>;

    const mockStorageFile = {
        name: 'test-file',
        bucket: 'test-bucket',
        size: 1024,
        contentType: 'application/json',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        retentionExpiryDate: new Date()
    };

    const mockValidResult: ScrapingResult = {
        id: uuidv4(),
        jobId: uuidv4(),
        sourceType: 'WEBSITE',
        sourceUrl: 'https://test.com',
        timestamp: new Date(),
        storage: {
            rawFile: mockStorageFile,
            processedFile: mockStorageFile,
            bigQueryTable: 'test_dataset',
            version: '1.0',
            compressionType: 'gzip',
            encryptionKey: 'test-key'
        },
        metadata: {
            size: 1024,
            itemCount: 10,
            format: 'JSON',
            contentType: 'application/json',
            checksum: 'abc123',
            validationStatus: 'VALID',
            qualityMetrics: {
                completeness: 100,
                accuracy: 95,
                consistency: 98,
                freshness: 100
            },
            processingHistory: [{
                stepId: uuidv4(),
                operation: 'EXTRACT',
                timestamp: new Date(),
                duration: 1000,
                status: 'SUCCESS'
            }]
        }
    };

    beforeAll(() => {
        // Initialize mocks
        storageService = mock<CloudStorageService>();
        bigQueryClient = mock<BigQueryClientImpl>();
        metricsCollector = mock<MetricsCollector>();
        logger = mock<Logger>();

        // Setup metrics collector mock
        metricsCollector.startTimer = jest.fn().mockReturnValue({
            end: jest.fn()
        });
        metricsCollector.incrementCounter = jest.fn();
        metricsCollector.recordGauge = jest.fn();
    });

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();

        // Initialize ResultService with mocks
        resultService = new ResultService(
            storageService,
            bigQueryClient,
            metricsCollector,
            logger
        );
    });

    describe('storeResult', () => {
        test('should store result with CMEK encryption and metrics tracking', async () => {
            // Setup mocks
            storageService.uploadFile.mockResolvedValue(mockStorageFile);
            bigQueryClient.insert.mockResolvedValue();

            // Execute test
            const result = await resultService.storeResult(mockValidResult);

            // Verify CMEK encryption
            expect(storageService.uploadFile).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining(result.id),
                expect.any(Buffer),
                expect.objectContaining({
                    encryption: storageConfig.gcs.encryption.kmsKeyName
                })
            );

            // Verify metrics tracking
            expect(metricsCollector.startTimer).toHaveBeenCalledWith('result_storage_duration');
            expect(metricsCollector.incrementCounter).toHaveBeenCalledWith('results_stored_total');
            expect(metricsCollector.recordGauge).toHaveBeenCalledWith('result_size_bytes', result.metadata.size);

            // Verify BigQuery insertion
            expect(bigQueryClient.insert).toHaveBeenCalledWith(
                'scraping_results',
                expect.arrayContaining([
                    expect.objectContaining({
                        id: result.id,
                        job_id: result.jobId
                    })
                ])
            );
        });

        test('should validate result structure before storage', async () => {
            const invalidResult = { ...mockValidResult, metadata: { ...mockValidResult.metadata, size: -1 } };
            
            await expect(resultService.storeResult(invalidResult))
                .rejects
                .toThrow(ValidationError);
        });

        test('should handle storage failures with proper error propagation', async () => {
            storageService.uploadFile.mockRejectedValue(new Error('Storage failure'));

            await expect(resultService.storeResult(mockValidResult))
                .rejects
                .toThrow('Storage failure');

            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('getResult', () => {
        test('should retrieve result with parallel processing', async () => {
            // Setup mocks
            storageService.downloadFile.mockResolvedValue(Buffer.from(JSON.stringify(mockValidResult)));
            bigQueryClient.query.mockResolvedValue([{ storage_info: mockValidResult.storage }]);

            // Execute test
            const result = await resultService.getResult(mockValidResult.id);

            // Verify parallel retrieval
            expect(Promise.all).toHaveBeenCalled();
            expect(storageService.downloadFile).toHaveBeenCalledTimes(2);
            expect(bigQueryClient.query).toHaveBeenCalled();

            // Verify metrics
            expect(metricsCollector.startTimer).toHaveBeenCalledWith('result_retrieval_duration');
            expect(metricsCollector.incrementCounter).toHaveBeenCalledWith('results_retrieved_total');
        });

        test('should throw NotFoundError for non-existent results', async () => {
            bigQueryClient.query.mockResolvedValue([]);

            await expect(resultService.getResult(uuidv4()))
                .rejects
                .toThrow(NotFoundError);
        });

        test('should validate retrieved result data integrity', async () => {
            const invalidData = { ...mockValidResult, metadata: null };
            storageService.downloadFile.mockResolvedValue(Buffer.from(JSON.stringify(invalidData)));
            bigQueryClient.query.mockResolvedValue([{ storage_info: mockValidResult.storage }]);

            await expect(resultService.getResult(mockValidResult.id))
                .rejects
                .toThrow(ValidationError);
        });
    });

    describe('archiveResult', () => {
        test('should archive result with retention period', async () => {
            // Setup mocks
            storageService.moveToArchive.mockResolvedValue(mockStorageFile);
            bigQueryClient.query.mockResolvedValue([mockValidResult]);

            // Execute test
            await resultService.archiveResult(mockValidResult.id);

            // Verify archival with retention
            expect(storageService.moveToArchive).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining(mockValidResult.id),
                storageConfig.gcs.archiveBucket.retentionPeriodDays
            );

            // Verify BigQuery update
            expect(bigQueryClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE scraping_results'),
                [mockValidResult.id]
            );

            // Verify metrics
            expect(metricsCollector.incrementCounter).toHaveBeenCalledWith('results_archived_total');
        });

        test('should handle archival failures gracefully', async () => {
            storageService.moveToArchive.mockRejectedValue(new Error('Archive failure'));

            await expect(resultService.archiveResult(mockValidResult.id))
                .rejects
                .toThrow('Archive failure');

            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('deleteResult', () => {
        test('should perform secure deletion with cascade', async () => {
            // Setup mocks
            storageService.deleteFile.mockResolvedValue();
            bigQueryClient.query.mockResolvedValue([mockValidResult]);

            // Execute test
            await resultService.deleteResult(mockValidResult.id);

            // Verify cascading deletion
            expect(storageService.deleteFile).toHaveBeenCalledTimes(2);
            expect(bigQueryClient.query).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM scraping_results'),
                [mockValidResult.id]
            );

            // Verify metrics
            expect(metricsCollector.incrementCounter).toHaveBeenCalledWith('results_deleted_total');
        });

        test('should handle deletion failures with proper cleanup', async () => {
            storageService.deleteFile.mockRejectedValue(new Error('Delete failure'));

            await expect(resultService.deleteResult(mockValidResult.id))
                .rejects
                .toThrow('Delete failure');

            expect(logger.error).toHaveBeenCalled();
        });
    });
});