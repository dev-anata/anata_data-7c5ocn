/**
 * @fileoverview Unit tests for DataService with comprehensive performance benchmarking
 * and data classification verification.
 * @version 1.0.0
 */

import { describe, it, beforeEach, afterEach, expect, jest } from 'jest';
import { mock, MockProxy } from 'jest-mock-extended';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { Logger } from 'winston';
import { Meter, Histogram, Counter } from '@opentelemetry/metrics';
import { RedisCache } from '@cache/service';

import { DataService } from '../../../src/api/services/data.service';
import { 
  DataClassification, 
  DataSource, 
  DataQuery, 
  DataRecord,
  DataMetadata 
} from '../../../src/api/interfaces/data.interface';
import { GCPError } from '../../../src/types/gcp';

describe('DataService', () => {
  let mockBigQuery: MockProxy<BigQuery>;
  let mockStorage: MockProxy<Storage>;
  let mockLogger: MockProxy<Logger>;
  let mockCache: MockProxy<RedisCache>;
  let mockMeter: MockProxy<Meter>;
  let mockHistogram: MockProxy<Histogram>;
  let mockCounter: MockProxy<Counter>;
  let dataService: DataService;

  // Test data
  const testQuery: DataQuery = {
    filters: { type: 'test' },
    pagination: { page: 1, pageSize: 10 },
    sort: { field: 'createdAt', order: 'desc' },
    includeMetadata: true,
    classification: [DataClassification.PUBLIC]
  };

  const testRecord: DataRecord = {
    id: 'test-123',
    content: { data: 'test content' },
    metadata: {
      sourceId: 'src-123',
      sourceType: DataSource.API,
      classification: DataClassification.PUBLIC,
      createdAt: new Date(),
      retentionPeriod: 90,
      encryptionStatus: true,
      jurisdiction: 'US',
      lastModifiedAt: new Date(),
      lastModifiedBy: 'test-user'
    },
    version: '1.0.0',
    checksum: 'abc123'
  };

  beforeEach(() => {
    // Initialize mocks
    mockBigQuery = mock<BigQuery>();
    mockStorage = mock<Storage>();
    mockLogger = mock<Logger>();
    mockCache = mock<RedisCache>();
    mockMeter = mock<Meter>();
    mockHistogram = mock<Histogram>();
    mockCounter = mock<Counter>();

    // Configure meter mock
    mockMeter.createHistogram.mockReturnValue(mockHistogram);
    mockMeter.createCounter.mockReturnValue(mockCounter);

    // Initialize service
    dataService = new DataService(
      mockBigQuery,
      mockStorage,
      mockCache,
      mockLogger,
      mockMeter
    );

    // Reset timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Performance Tests', () => {
    it('should complete query operations within 500ms', async () => {
      // Configure cache miss scenario
      mockCache.get.mockResolvedValue(null);
      mockBigQuery.query.mockResolvedValue([[{ id: 1 }]]);

      const startTime = Date.now();
      await dataService.queryData(testQuery);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500);
      expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should optimize performance with cache hits', async () => {
      const cachedResult = JSON.stringify({ data: [], total: 0, page: 1, pageSize: 10 });
      mockCache.get.mockResolvedValue(cachedResult);

      const startTime = Date.now();
      await dataService.queryData(testQuery);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
      expect(mockBigQuery.query).not.toHaveBeenCalled();
    });

    it('should handle concurrent requests efficiently', async () => {
      const requests = Array(10).fill(testQuery);
      const startTime = Date.now();
      
      await Promise.all(requests.map(query => dataService.queryData(query)));
      
      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 10;
      
      expect(avgTime).toBeLessThan(500);
    });
  });

  describe('Data Classification Tests', () => {
    it('should enforce security controls for confidential data', async () => {
      const confidentialRecord = {
        ...testRecord,
        metadata: {
          ...testRecord.metadata,
          classification: DataClassification.CONFIDENTIAL
        }
      };

      await expect(dataService.storeData(confidentialRecord)).resolves.toBeTruthy();
      expect(mockStorage.bucket).toHaveBeenCalledWith(expect.stringContaining('confidential'));
    });

    it('should apply appropriate retention policies', async () => {
      const restrictedRecord = {
        ...testRecord,
        metadata: {
          ...testRecord.metadata,
          classification: DataClassification.RESTRICTED,
          retentionPeriod: 2555 // 7 years
        }
      };

      await dataService.storeData(restrictedRecord);
      expect(mockStorage.bucket).toHaveBeenCalledWith(expect.stringContaining('restricted'));
    });

    it('should validate data classification requirements', async () => {
      const invalidQuery: DataQuery = {
        ...testQuery,
        classification: [DataClassification.RESTRICTED],
      };

      await expect(dataService.queryData(invalidQuery))
        .rejects
        .toThrow('Insufficient classification level');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const timeoutError = new Error('DEADLINE_EXCEEDED');
      mockBigQuery.query.mockRejectedValue(timeoutError);

      await expect(dataService.queryData(testQuery))
        .rejects
        .toThrow('DEADLINE_EXCEEDED');
      expect(mockCounter.add).toHaveBeenCalledWith(1);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle storage failures with proper logging', async () => {
      const storageError: GCPError = {
        name: 'StorageError',
        message: 'Storage operation failed',
        type: 'RESOURCE_EXHAUSTED',
        code: 429,
        stack: ''
      };

      mockStorage.bucket().file().save.mockRejectedValue(storageError);

      await expect(dataService.storeData(testRecord))
        .rejects
        .toThrow('Storage operation failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Storage operation failed'),
        expect.any(Object)
      );
    });

    it('should handle cache failures by falling back to direct queries', async () => {
      mockCache.get.mockRejectedValue(new Error('Cache unavailable'));
      mockBigQuery.query.mockResolvedValue([[{ id: 1 }]]);

      const result = await dataService.queryData(testQuery);
      expect(result).toBeDefined();
      expect(mockBigQuery.query).toHaveBeenCalled();
    });
  });

  describe('Data Operations', () => {
    it('should successfully store and retrieve data', async () => {
      mockStorage.bucket().file().save.mockResolvedValue();
      const storedId = await dataService.storeData(testRecord);
      
      mockCache.get.mockResolvedValue(JSON.stringify(testRecord));
      const retrieved = await dataService.getData(storedId, DataClassification.PUBLIC);
      
      expect(retrieved).toEqual(testRecord);
    });

    it('should handle data deletion with proper cleanup', async () => {
      await dataService.deleteData('test-123');
      
      expect(mockCache.delete).toHaveBeenCalledWith('data:test-123');
      expect(mockStorage.bucket().file().delete).toHaveBeenCalled();
    });

    it('should enforce data integrity checks', async () => {
      const invalidRecord = {
        ...testRecord,
        checksum: 'invalid'
      };

      await expect(dataService.storeData(invalidRecord))
        .rejects
        .toThrow('Invalid data checksum');
    });
  });
});