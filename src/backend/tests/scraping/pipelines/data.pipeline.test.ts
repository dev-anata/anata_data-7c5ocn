// External imports
import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import { faker } from '@faker-js/faker';
import { SpanStatusCode } from '@opentelemetry/api';

// Internal imports
import { DataPipeline } from '../../../src/scraping/pipelines/data.pipeline';
import { CloudStorageService } from '../../../src/core/storage/cloud-storage.service';
import { BigQueryClientImpl } from '../../../src/core/database/bigquery.client';
import { ScrapingResult } from '../../../src/scraping/interfaces/result.interface';
import { ScrapingSourceType } from '../../../src/scraping/interfaces/config.interface';
import { storageConfig } from '../../../src/config/storage.config';

// Mock implementations
jest.mock('../../../src/core/storage/cloud-storage.service');
jest.mock('../../../src/core/database/bigquery.client');

describe('DataPipeline', () => {
  // Test fixtures
  let dataPipeline: DataPipeline;
  let mockStorageService: jest.Mocked<CloudStorageService>;
  let mockBigQueryClient: jest.Mocked<BigQueryClientImpl>;
  let testResult: ScrapingResult;

  beforeEach(() => {
    // Initialize mocks
    mockStorageService = {
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      encryptData: jest.fn(),
      beginTransaction: jest.fn(),
    } as any;

    mockBigQueryClient = {
      insert: jest.fn(),
      beginTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
    } as any;

    // Initialize DataPipeline with mocks
    dataPipeline = new DataPipeline(mockStorageService, mockBigQueryClient);

    // Create test data
    testResult = {
      id: faker.string.uuid(),
      jobId: faker.string.uuid(),
      sourceType: ScrapingSourceType.WEBSITE,
      sourceUrl: faker.internet.url(),
      timestamp: new Date(),
      storage: {
        rawFile: {
          name: 'test-raw.json',
          bucket: storageConfig.gcs.rawDataBucket.name,
          size: 1024,
          contentType: 'application/json',
          metadata: {},
          retentionExpiryDate: new Date()
        },
        processedFile: {
          name: 'test-processed.json',
          bucket: storageConfig.gcs.processedDataBucket.name,
          size: 512,
          contentType: 'application/json',
          metadata: {},
          retentionExpiryDate: new Date()
        },
        bigQueryTable: storageConfig.bigquery.dataset,
        version: '1.0.0',
        compressionType: 'GZIP',
        encryptionKey: storageConfig.gcs.encryption.kmsKeyName
      },
      metadata: {
        size: 1024,
        itemCount: 1,
        format: 'JSON',
        contentType: 'application/json',
        checksum: faker.string.alphanumeric(32),
        validationStatus: 'VALID',
        qualityMetrics: {
          completeness: 100,
          accuracy: 100,
          consistency: 100,
          freshness: 100
        },
        processingHistory: []
      }
    };
  });

  describe('processData', () => {
    test('should successfully process data with encryption and storage', async () => {
      // Setup mock responses
      mockStorageService.uploadFile.mockResolvedValueOnce({
        name: 'test-raw.json',
        bucket: storageConfig.gcs.rawDataBucket.name,
        size: 1024,
        contentType: 'application/json',
        metadata: {},
        retentionExpiryDate: new Date()
      });

      mockStorageService.uploadFile.mockResolvedValueOnce({
        name: 'test-processed.json',
        bucket: storageConfig.gcs.processedDataBucket.name,
        size: 512,
        contentType: 'application/json',
        metadata: {},
        retentionExpiryDate: new Date()
      });

      mockBigQueryClient.insert.mockResolvedValueOnce(undefined);

      // Execute test
      const result = await dataPipeline.processData(testResult);

      // Verify storage operations
      expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(2);
      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        storageConfig.gcs.rawDataBucket.name,
        `${testResult.id}/raw.json`,
        expect.any(Buffer),
        expect.objectContaining({
          contentType: 'application/json',
          encryption: storageConfig.gcs.encryption.kmsKeyName
        })
      );

      // Verify BigQuery operations
      expect(mockBigQueryClient.insert).toHaveBeenCalledTimes(1);
      expect(mockBigQueryClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          id: testResult.id,
          jobId: testResult.jobId,
          sourceType: testResult.sourceType
        })
      ]));

      // Verify result
      expect(result).toEqual(expect.objectContaining({
        id: testResult.id,
        storage: expect.objectContaining({
          rawFile: expect.any(Object),
          processedFile: expect.any(Object),
          bigQueryTable: storageConfig.bigquery.dataset
        }),
        metadata: expect.objectContaining({
          validationStatus: 'VALID',
          processingHistory: expect.arrayContaining([
            expect.objectContaining({
              operation: 'TRANSFORM',
              status: 'SUCCESS'
            })
          ])
        })
      }));
    });

    test('should handle validation errors correctly', async () => {
      // Create invalid test data
      const invalidResult = { ...testResult, sourceUrl: '' };

      // Execute test and expect error
      await expect(dataPipeline.processData(invalidResult)).rejects.toThrow('Schema validation failed');

      // Verify error handling
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
      expect(mockBigQueryClient.insert).not.toHaveBeenCalled();
    });

    test('should handle storage errors with proper rollback', async () => {
      // Setup mock storage failure
      mockStorageService.uploadFile.mockRejectedValueOnce(new Error('Storage error'));

      // Execute test and expect error
      await expect(dataPipeline.processData(testResult)).rejects.toThrow('Storage error');

      // Verify rollback
      expect(mockBigQueryClient.insert).not.toHaveBeenCalled();
      expect(testResult.metadata.processingHistory).toContainEqual(
        expect.objectContaining({
          operation: 'TRANSFORM',
          status: 'FAILURE',
          error: expect.objectContaining({
            message: expect.stringContaining('Storage error')
          })
        })
      );
    });

    test('should handle BigQuery errors with proper rollback', async () => {
      // Setup successful storage but failed BigQuery
      mockStorageService.uploadFile.mockResolvedValue({
        name: 'test.json',
        bucket: 'test-bucket',
        size: 1024,
        contentType: 'application/json',
        metadata: {},
        retentionExpiryDate: new Date()
      });
      mockBigQueryClient.insert.mockRejectedValueOnce(new Error('BigQuery error'));

      // Execute test and expect error
      await expect(dataPipeline.processData(testResult)).rejects.toThrow('BigQuery error');

      // Verify error handling and rollback
      expect(testResult.metadata.processingHistory).toContainEqual(
        expect.objectContaining({
          operation: 'TRANSFORM',
          status: 'FAILURE',
          error: expect.objectContaining({
            message: expect.stringContaining('BigQuery error')
          })
        })
      );
    });

    test('should enforce data quality thresholds', async () => {
      // Create test data with poor quality metrics
      const poorQualityResult = {
        ...testResult,
        metadata: {
          ...testResult.metadata,
          qualityMetrics: {
            completeness: 50,
            accuracy: 60,
            consistency: 40,
            freshness: 30
          }
        }
      };

      // Execute test
      const result = await dataPipeline.processData(poorQualityResult);

      // Verify quality validation
      expect(result.metadata.validationStatus).toBe('INVALID');
      expect(result.metadata.processingHistory).toContainEqual(
        expect.objectContaining({
          operation: 'TRANSFORM',
          status: 'SUCCESS'
        })
      );
    });
  });
});