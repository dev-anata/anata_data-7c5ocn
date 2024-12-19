import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals'; // v29.0.0
import { BigQuery, Dataset, Table } from '@google-cloud/bigquery'; // v6.0.0
import { mock, mockReset, MockProxy } from 'jest-mock-extended'; // v3.0.0

import { BigQueryClientImpl } from '../../../src/core/database/bigquery.client';
import { BigQueryConfig } from '../../../src/core/interfaces/database.interface';
import { BigQueryError } from '../../../src/core/utils/error.util';

describe('BigQueryClientImpl', () => {
  let bigQueryClient: BigQueryClientImpl;
  let mockBigQuery: MockProxy<BigQuery>;
  let mockDataset: MockProxy<Dataset>;
  let mockTable: MockProxy<Table>;
  let config: BigQueryConfig;

  // Test configuration
  const testConfig: BigQueryConfig = {
    projectId: 'test-project',
    datasetId: 'test-dataset',
    maxRetries: 3,
    retryDelayMs: 1000
  };

  // Test data
  const testData = {
    rows: [
      { id: 1, name: 'test1' },
      { id: 2, name: 'test2' }
    ],
    schema: {
      fields: [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'STRING' }
      ]
    }
  };

  beforeEach(() => {
    // Reset all mocks
    mockReset();

    // Initialize mocks
    mockBigQuery = mock<BigQuery>();
    mockDataset = mock<Dataset>();
    mockTable = mock<Table>();

    // Setup mock chain
    mockBigQuery.dataset.mockReturnValue(mockDataset);
    mockDataset.table.mockReturnValue(mockTable);
    mockDataset.get.mockResolvedValue([{}]);
    mockTable.get.mockResolvedValue([{}]);

    // Initialize client with test config
    bigQueryClient = new BigQueryClientImpl(testConfig);
    (bigQueryClient as any).client = mockBigQuery;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid configuration', () => {
      expect(bigQueryClient).toBeInstanceOf(BigQueryClientImpl);
    });

    it('should throw error with invalid configuration', () => {
      expect(() => new BigQueryClientImpl({} as BigQueryConfig))
        .toThrow('Invalid BigQuery configuration');
    });

    it('should initialize with correct retry settings', () => {
      const client = new BigQueryClientImpl(testConfig);
      expect((client as any).config.maxRetries).toBe(testConfig.maxRetries);
      expect((client as any).config.retryDelayMs).toBe(testConfig.retryDelayMs);
    });
  });

  describe('connect', () => {
    it('should connect successfully with valid credentials', async () => {
      mockDataset.get.mockResolvedValueOnce([{}]);
      await expect(bigQueryClient.connect()).resolves.not.toThrow();
      expect(mockBigQuery.dataset).toHaveBeenCalledWith(testConfig.datasetId);
    });

    it('should handle connection failures with retry', async () => {
      mockDataset.get
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce([{}]);

      await expect(bigQueryClient.connect()).resolves.not.toThrow();
      expect(mockDataset.get).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      mockDataset.get.mockRejectedValue(new Error('Connection failed'));

      await expect(bigQueryClient.connect())
        .rejects
        .toThrow('Failed to connect: Connection failed');
    });

    it('should initialize connection pool correctly', async () => {
      await bigQueryClient.connect();
      expect((bigQueryClient as any).connectionPool.length).toBe(10);
    });
  });

  describe('query', () => {
    const testQuery = 'SELECT * FROM test_table';
    const testParams = ['param1', 'param2'];

    beforeEach(async () => {
      await bigQueryClient.connect();
    });

    it('should execute query successfully', async () => {
      mockBigQuery.query.mockResolvedValueOnce([testData.rows]);

      const result = await bigQueryClient.query(testQuery, testParams);
      expect(result).toEqual(testData.rows);
      expect(mockBigQuery.query).toHaveBeenCalledWith({
        query: testQuery,
        params: testParams,
        location: undefined
      });
    });

    it('should handle query failures with retry', async () => {
      mockBigQuery.query
        .mockRejectedValueOnce({ code: 'RESOURCE_EXHAUSTED' })
        .mockResolvedValueOnce([testData.rows]);

      const result = await bigQueryClient.query(testQuery);
      expect(result).toEqual(testData.rows);
      expect(mockBigQuery.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error for non-retryable failures', async () => {
      mockBigQuery.query.mockRejectedValueOnce({ code: 'INVALID_ARGUMENT' });

      await expect(bigQueryClient.query(testQuery))
        .rejects
        .toThrow('Query failed');
    });

    it('should throw error when not connected', async () => {
      await bigQueryClient.disconnect();
      await expect(bigQueryClient.query(testQuery))
        .rejects
        .toThrow('Client not connected');
    });
  });

  describe('insert', () => {
    const testTableId = 'test_table';

    beforeEach(async () => {
      await bigQueryClient.connect();
    });

    it('should insert rows successfully', async () => {
      mockTable.insert.mockResolvedValueOnce([]);

      await expect(bigQueryClient.insert(testTableId, testData.rows))
        .resolves.not.toThrow();
      expect(mockTable.insert).toHaveBeenCalledWith(testData.rows);
    });

    it('should handle batch insertions correctly', async () => {
      const largeDataset = Array(2000).fill(testData.rows[0]);
      mockTable.insert.mockResolvedValue([]);

      await expect(bigQueryClient.insert(testTableId, largeDataset))
        .resolves.not.toThrow();
      expect(mockTable.insert).toHaveBeenCalledTimes(2);
    });

    it('should handle insertion failures with retry', async () => {
      mockTable.insert
        .mockRejectedValueOnce({ code: 'RESOURCE_EXHAUSTED' })
        .mockResolvedValueOnce([]);

      await expect(bigQueryClient.insert(testTableId, testData.rows))
        .resolves.not.toThrow();
      expect(mockTable.insert).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      mockTable.insert.mockRejectedValue({ code: 'RESOURCE_EXHAUSTED' });

      await expect(bigQueryClient.insert(testTableId, testData.rows))
        .rejects
        .toThrow('Insert failed');
    });
  });

  describe('createTable', () => {
    const testTableId = 'new_test_table';

    beforeEach(async () => {
      await bigQueryClient.connect();
    });

    it('should create table successfully', async () => {
      mockDataset.createTable.mockResolvedValueOnce([{} as Table]);

      await expect(bigQueryClient.createTable(testTableId, testData.schema))
        .resolves.not.toThrow();
      expect(mockDataset.createTable).toHaveBeenCalledWith(
        testTableId,
        { schema: testData.schema }
      );
    });

    it('should handle table creation failures with retry', async () => {
      mockDataset.createTable
        .mockRejectedValueOnce({ code: 'RESOURCE_EXHAUSTED' })
        .mockResolvedValueOnce([{} as Table]);

      await expect(bigQueryClient.createTable(testTableId, testData.schema))
        .resolves.not.toThrow();
      expect(mockDataset.createTable).toHaveBeenCalledTimes(2);
    });

    it('should throw error for table already exists', async () => {
      mockDataset.createTable.mockRejectedValueOnce({ code: 'ALREADY_EXISTS' });

      await expect(bigQueryClient.createTable(testTableId, testData.schema))
        .rejects
        .toThrow('Table creation failed');
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await bigQueryClient.connect();
    });

    it('should disconnect successfully', async () => {
      await expect(bigQueryClient.disconnect()).resolves.not.toThrow();
      expect((bigQueryClient as any).connected).toBe(false);
      expect((bigQueryClient as any).connectionPool).toHaveLength(0);
    });

    it('should clear health check interval', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      await bigQueryClient.disconnect();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      mockDataset.get.mockRejectedValue(new Error('Disconnect failed'));
      await expect(bigQueryClient.disconnect()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should identify retryable errors correctly', () => {
      const retryableErrors = [
        'DEADLINE_EXCEEDED',
        'INTERNAL',
        'RESOURCE_EXHAUSTED',
        'SERVICE_UNAVAILABLE'
      ];

      retryableErrors.forEach(code => {
        expect((bigQueryClient as any).isRetryableError({ code })).toBe(true);
      });

      expect((bigQueryClient as any).isRetryableError({ code: 'INVALID_ARGUMENT' }))
        .toBe(false);
    });

    it('should handle connection pool exhaustion', async () => {
      (bigQueryClient as any).connectionPool = [];
      await expect(bigQueryClient.query('SELECT 1'))
        .rejects
        .toThrow('No available connections');
    });
  });
});