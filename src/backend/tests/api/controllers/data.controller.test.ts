/**
 * @fileoverview Comprehensive test suite for DataController
 * Tests API endpoints for functionality, performance, security, and data validation
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import supertest from 'supertest';
import { Request, Response } from 'express';
import now from 'performance-now';
import { DataController } from '../../../src/api/controllers/data.controller';
import { DataService } from '../../../src/api/services/data.service';
import { DataRecord, DataClassification, DataSource } from '../../../src/api/interfaces/data.interface';

// Mock DataService
jest.mock('../../../src/api/services/data.service');

// Test data setup
const testData: Record<string, DataRecord> = {
  validRecord: {
    id: 'test-123',
    content: {
      name: 'Test Data',
      value: 100
    },
    metadata: {
      sourceId: 'src-001',
      sourceType: DataSource.API,
      classification: DataClassification.INTERNAL,
      createdAt: new Date(),
      retentionPeriod: 90,
      encryptionStatus: true,
      jurisdiction: 'US',
      lastModifiedAt: new Date(),
      lastModifiedBy: 'test-user'
    },
    version: '1.0.0',
    checksum: 'a'.repeat(64)
  }
};

// Enhanced mock Response class for testing
class MockResponse {
  public statusCode: number = 200;
  public jsonData: any = null;
  public responseTime: number = 0;
  public headers: Record<string, string> = {};
  private startTime: number;

  constructor() {
    this.startTime = now();
  }

  status(code: number): MockResponse {
    this.statusCode = code;
    return this;
  }

  json(data: any): MockResponse {
    this.jsonData = data;
    this.responseTime = now() - this.startTime;
    return this;
  }

  setHeader(name: string, value: string): MockResponse {
    this.headers[name] = value;
    return this;
  }
}

// Performance measurement utility
async function measureResponseTime(operation: Promise<any>): Promise<number> {
  const start = now();
  await operation;
  return now() - start;
}

describe('DataController', () => {
  let mockDataService: jest.Mocked<DataService>;
  let dataController: DataController;
  let mockReq: Partial<Request>;
  let mockRes: MockResponse;
  let mockNext: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Initialize mocks
    mockDataService = {
      queryData: jest.fn(),
      getData: jest.fn(),
      storeData: jest.fn(),
      deleteData: jest.fn()
    } as any;

    dataController = new DataController(mockDataService);
    mockRes = new MockResponse();
    mockNext = jest.fn();
  });

  describe('queryData', () => {
    it('should return paginated data with valid query parameters', async () => {
      // Arrange
      const queryParams = {
        filters: { name: 'Test' },
        pagination: { page: 1, pageSize: 20 },
        sort: { field: 'createdAt', order: 'desc' as const },
        classification: [DataClassification.INTERNAL]
      };

      mockReq = {
        query: queryParams
      };

      mockDataService.queryData.mockResolvedValue({
        data: [testData.validRecord],
        total: 1,
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        queryTime: 100
      });

      // Act
      await dataController.queryData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.jsonData.data).toHaveLength(1);
      expect(mockDataService.queryData).toHaveBeenCalledWith(queryParams);
      expect(mockRes.headers['Cache-Control']).toBe('public, max-age=300');
    });

    it('should meet performance SLA of <500ms for 95% of requests', async () => {
      // Arrange
      const iterations = 100;
      const slaTarget = 500; // milliseconds
      const responseTimes: number[] = [];

      mockReq = {
        query: {
          filters: {},
          pagination: { page: 1, pageSize: 20 }
        }
      };

      mockDataService.queryData.mockResolvedValue({
        data: [testData.validRecord],
        total: 1,
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        queryTime: 100
      });

      // Act
      for (let i = 0; i < iterations; i++) {
        const responseTime = await measureResponseTime(
          dataController.queryData(mockReq as Request, mockRes as any, mockNext)
        );
        responseTimes.push(responseTime);
      }

      // Assert
      const p95 = responseTimes.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];
      expect(p95).toBeLessThan(slaTarget);
    });
  });

  describe('getData', () => {
    it('should return data record by ID with proper security checks', async () => {
      // Arrange
      mockReq = {
        params: { id: 'test-123' },
        headers: {
          'x-data-classification': DataClassification.INTERNAL
        }
      };

      mockDataService.getData.mockResolvedValue(testData.validRecord);

      // Act
      await dataController.getData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.jsonData).toEqual(testData.validRecord);
      expect(mockDataService.getData).toHaveBeenCalledWith(
        'test-123',
        DataClassification.INTERNAL
      );
    });

    it('should handle unauthorized access attempts', async () => {
      // Arrange
      mockReq = {
        params: { id: 'test-123' },
        headers: {
          'x-data-classification': DataClassification.PUBLIC
        }
      };

      mockDataService.getData.mockRejectedValue(new Error('Unauthorized access'));

      // Act
      await dataController.getData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('storeData', () => {
    it('should store valid data record with proper classification', async () => {
      // Arrange
      mockReq = {
        body: testData.validRecord
      };

      mockDataService.storeData.mockResolvedValue('test-123');

      // Act
      await dataController.storeData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockRes.statusCode).toBe(201);
      expect(mockRes.jsonData).toEqual({ id: 'test-123' });
      expect(mockDataService.storeData).toHaveBeenCalledWith(testData.validRecord);
    });

    it('should reject invalid data records', async () => {
      // Arrange
      mockReq = {
        body: {
          ...testData.validRecord,
          metadata: {
            ...testData.validRecord.metadata,
            classification: 'INVALID'
          }
        }
      };

      // Act
      await dataController.storeData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockDataService.storeData).not.toHaveBeenCalled();
    });
  });

  describe('deleteData', () => {
    it('should delete data record with proper authorization', async () => {
      // Arrange
      mockReq = {
        params: { id: 'test-123' }
      };

      mockDataService.deleteData.mockResolvedValue(true);

      // Act
      await dataController.deleteData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockRes.statusCode).toBe(204);
      expect(mockDataService.deleteData).toHaveBeenCalledWith('test-123');
    });

    it('should handle deletion of non-existent records', async () => {
      // Arrange
      mockReq = {
        params: { id: 'non-existent' }
      };

      mockDataService.deleteData.mockRejectedValue(new Error('Record not found'));

      // Act
      await dataController.deleteData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Security Controls', () => {
    it('should apply rate limiting on all endpoints', async () => {
      // Arrange
      const requests = Array(101).fill(null).map(() => ({
        query: { filters: {} }
      }));

      // Act & Assert
      for (const req of requests) {
        await dataController.queryData(req as Request, mockRes as any, mockNext);
      }

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Too many requests')
        })
      );
    });

    it('should validate data classification headers', async () => {
      // Arrange
      mockReq = {
        params: { id: 'test-123' },
        headers: {}  // Missing classification header
      };

      // Act
      await dataController.getData(mockReq as Request, mockRes as any, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});