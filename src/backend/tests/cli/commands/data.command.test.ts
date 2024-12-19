/**
 * @fileoverview Test suite for the DataCommand implementation
 * Verifies data export, query, and validation functionality with security controls
 * @version 1.0.0
 */

import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { DataCommand } from '../../../src/cli/commands/data.command';
import { DataService } from '../../../src/api/services/data.service';
import { displayResult, displayProgress } from '../../../src/cli/utils/display.util';
import { DataClassification } from '../../../src/api/interfaces/data.interface';
import { CommandOptions, CommandResult } from '../../../src/cli/interfaces/command.interface';

// Mock dependencies
jest.mock('../../../src/api/services/data.service');
jest.mock('../../../src/cli/utils/display.util');
jest.mock('winston');
jest.mock('@opentelemetry/metrics');

describe('DataCommand', () => {
  let dataCommand: DataCommand;
  let mockDataService: jest.Mocked<DataService>;
  let mockLogger: any;
  let mockMetrics: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockDataService = {
      queryData: jest.fn(),
      exportData: jest.fn(),
      validateClassification: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockMetrics = {
      createHistogram: jest.fn().mockReturnValue({
        record: jest.fn()
      }),
      createCounter: jest.fn().mockReturnValue({
        add: jest.fn()
      })
    };

    // Initialize command instance
    dataCommand = new DataCommand(mockDataService, mockLogger, mockMetrics);
  });

  describe('execute', () => {
    test('should execute export command with proper security controls', async () => {
      // Arrange
      const options: CommandOptions = {
        subcommand: 'export',
        format: 'json',
        filter: '{"status": "active"}',
        classification: 'PUBLIC,INTERNAL'
      };

      const mockQueryResult = {
        data: [{ id: '1', content: { name: 'Test' } }],
        total: 1,
        page: 1,
        pageSize: 10,
        hasNextPage: false,
        queryTime: 100
      };

      mockDataService.queryData.mockResolvedValue(mockQueryResult);

      // Act
      const result = await dataCommand.execute(options);

      // Assert
      expect(mockDataService.queryData).toHaveBeenCalledWith({
        filters: { status: 'active' },
        pagination: { page: 1, pageSize: 1000 },
        sort: { field: 'createdAt', order: 'desc' },
        includeMetadata: true,
        classification: [DataClassification.PUBLIC, DataClassification.INTERNAL]
      });

      expect(result).toEqual({
        success: true,
        message: 'Successfully exported 1 records',
        data: mockQueryResult.data
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing data command',
        expect.objectContaining({
          subcommand: 'export',
          options
        })
      );
    });

    test('should execute query command with security classification', async () => {
      // Arrange
      const options: CommandOptions = {
        subcommand: 'query',
        filter: '{"type": "report"}',
        classification: 'CONFIDENTIAL'
      };

      const mockQueryResult = {
        data: [{ id: '1', content: { type: 'report' } }],
        total: 1,
        page: 1,
        pageSize: 10,
        hasNextPage: false,
        queryTime: 50
      };

      mockDataService.queryData.mockResolvedValue(mockQueryResult);

      // Act
      const result = await dataCommand.execute(options);

      // Assert
      expect(mockDataService.queryData).toHaveBeenCalledWith({
        filters: { type: 'report' },
        pagination: { page: 1, pageSize: 10 },
        sort: { field: 'createdAt', order: 'desc' },
        includeMetadata: true,
        classification: [DataClassification.CONFIDENTIAL]
      });

      expect(result).toEqual({
        success: true,
        message: 'Found 1 matching records',
        data: mockQueryResult.data
      });
    });

    test('should handle invalid classification levels', async () => {
      // Arrange
      const options: CommandOptions = {
        subcommand: 'export',
        classification: 'INVALID_LEVEL'
      };

      // Act & Assert
      await expect(dataCommand.execute(options)).rejects.toThrow('Invalid classification level: INVALID_LEVEL');
      expect(mockMetrics.createCounter().add).toHaveBeenCalledWith(1);
    });

    test('should validate required options', async () => {
      // Arrange
      const options: CommandOptions = {};

      // Act & Assert
      await expect(dataCommand.execute(options)).rejects.toThrow('Subcommand is required (export, query, or validate)');
    });

    test('should handle invalid format option', async () => {
      // Arrange
      const options: CommandOptions = {
        subcommand: 'export',
        format: 'invalid'
      };

      // Act & Assert
      await expect(dataCommand.execute(options)).rejects.toThrow('Invalid format. Supported formats: json, csv');
    });

    test('should handle service errors with proper logging', async () => {
      // Arrange
      const options: CommandOptions = {
        subcommand: 'query',
        filter: '{"status": "active"}'
      };

      const error = new Error('Service unavailable');
      mockDataService.queryData.mockRejectedValue(error);

      // Act & Assert
      await expect(dataCommand.execute(options)).rejects.toThrow('Service unavailable');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Data command execution failed',
        expect.objectContaining({
          error: error.message
        })
      );
      expect(mockMetrics.createCounter().add).toHaveBeenCalledWith(1);
    });

    test('should handle progress display with accessibility support', async () => {
      // Arrange
      const options: CommandOptions = {
        subcommand: 'export',
        format: 'json',
        classification: 'PUBLIC'
      };

      const mockSpinner = {
        start: jest.fn(),
        succeed: jest.fn(),
        fail: jest.fn()
      };

      (displayProgress as jest.Mock).mockReturnValue(mockSpinner);
      mockDataService.queryData.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        pageSize: 10,
        hasNextPage: false,
        queryTime: 0
      });

      // Act
      await dataCommand.execute(options);

      // Assert
      expect(displayProgress).toHaveBeenCalledWith('Exporting data...', 0);
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Data export completed');
    });
  });
});