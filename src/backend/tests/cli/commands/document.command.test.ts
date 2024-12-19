import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mock } from 'jest-mock';
import { DocumentCommand } from '../../../src/cli/commands/document.command';
import { APIDocumentService } from '../../../src/api/services/document.service';
import { displayResult, displayError, displayProgress } from '../../../src/cli/utils/display.util';
import { CommandOptions, CommandResult } from '../../../src/cli/interfaces/command.interface';
import { ValidationError, NotFoundError } from '../../../src/core/utils/error.util';

// Mock external dependencies
jest.mock('../../../src/cli/utils/display.util');
jest.mock('../../../src/api/services/document.service');

describe('DocumentCommand', () => {
  // Test instance and mocks
  let documentCommand: DocumentCommand;
  let mockDocumentService: jest.Mocked<APIDocumentService>;
  let mockSecurityService: jest.Mock;
  let mockMonitoringService: jest.Mock;

  // Mock file data
  const testFile = {
    path: '/test/document.pdf',
    content: Buffer.from('test content'),
    size: 1024,
    mimeType: 'application/pdf'
  };

  // Mock document IDs
  const testDocumentId = 'test-doc-123';
  const testProcessId = 'test-process-123';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock services
    mockDocumentService = {
      uploadDocument: jest.fn(),
      initiateProcessing: jest.fn(),
      getProcessingStatus: jest.fn(),
      getDocumentMetadata: jest.fn()
    } as unknown as jest.Mocked<APIDocumentService>;

    mockSecurityService = jest.fn().mockImplementation(() => ({
      scanFile: jest.fn().mockResolvedValue({ safe: true })
    }));

    mockMonitoringService = jest.fn().mockImplementation(() => ({
      logError: jest.fn(),
      recordMetric: jest.fn()
    }));

    // Initialize command instance with mocks
    documentCommand = new DocumentCommand(
      mockDocumentService,
      mockSecurityService(),
      mockMonitoringService()
    );
  });

  describe('upload command', () => {
    test('should successfully upload a valid document', async () => {
      // Mock successful upload
      mockDocumentService.uploadDocument.mockResolvedValue({
        documentId: testDocumentId,
        fileName: 'document.pdf',
        size: testFile.size,
        mimeType: testFile.mimeType
      });

      const options: CommandOptions = {
        file: testFile.path,
        jobId: 'upload'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(true);
      expect(mockDocumentService.uploadDocument).toHaveBeenCalledWith(
        expect.any(Buffer),
        'document.pdf',
        'application/pdf'
      );
      expect(displayProgress).toHaveBeenCalledWith('Uploading document', 0);
      expect(displayResult).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('Document uploaded successfully')
      }));
    });

    test('should handle upload validation errors', async () => {
      const options: CommandOptions = {
        file: '/invalid/path.xyz',
        jobId: 'upload'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid file path or file does not exist');
      expect(displayError).toHaveBeenCalled();
    });

    test('should handle malware detection', async () => {
      const mockScanFile = jest.fn().mockResolvedValue({ safe: false });
      mockSecurityService.mockImplementation(() => ({
        scanFile: mockScanFile
      }));

      const options: CommandOptions = {
        file: testFile.path,
        jobId: 'upload'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Security scan failed');
      expect(displayError).toHaveBeenCalled();
    });
  });

  describe('process command', () => {
    test('should successfully initiate document processing', async () => {
      mockDocumentService.initiateProcessing.mockResolvedValue({
        processId: testProcessId,
        status: 'PROCESSING',
        startTime: new Date(),
        endTime: new Date(),
        retryCount: 0,
        processingDuration: 0,
        traceId: 'test-trace'
      });

      const options: CommandOptions = {
        file: testDocumentId,
        jobId: 'process'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(true);
      expect(mockDocumentService.initiateProcessing).toHaveBeenCalledWith(testDocumentId);
      expect(displayProgress).toHaveBeenCalledWith('Processing document', 0);
      expect(displayResult).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('Document processing completed')
      }));
    });

    test('should handle document not found error', async () => {
      mockDocumentService.initiateProcessing.mockRejectedValue(
        new NotFoundError('Document not found')
      );

      const options: CommandOptions = {
        file: 'non-existent-id',
        jobId: 'process'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Document not found');
      expect(displayError).toHaveBeenCalled();
    });
  });

  describe('status command', () => {
    test('should successfully retrieve processing status', async () => {
      const mockStatus = {
        documentId: testDocumentId,
        status: 'COMPLETED',
        startTime: new Date(),
        endTime: new Date(),
        retryCount: 0,
        processingDuration: 1000,
        traceId: 'test-trace'
      };

      mockDocumentService.getProcessingStatus.mockResolvedValue(mockStatus);

      const options: CommandOptions = {
        file: testDocumentId,
        jobId: 'status'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(true);
      expect(mockDocumentService.getProcessingStatus).toHaveBeenCalledWith(testDocumentId);
      expect(displayResult).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.stringContaining('Document status retrieved'),
        data: mockStatus
      }));
    });

    test('should handle status retrieval errors', async () => {
      mockDocumentService.getProcessingStatus.mockRejectedValue(
        new Error('Failed to retrieve status')
      );

      const options: CommandOptions = {
        file: testDocumentId,
        jobId: 'status'
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to retrieve status');
      expect(displayError).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('should handle invalid command options', async () => {
      const result = await documentCommand.execute({} as CommandOptions);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid command options');
      expect(displayError).toHaveBeenCalled();
    });

    test('should handle invalid subcommands', async () => {
      const options: CommandOptions = {
        file: testFile.path,
        jobId: 'invalid' as any
      };

      const result = await documentCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid subcommand');
      expect(displayError).toHaveBeenCalled();
    });

    test('should log errors to monitoring service', async () => {
      const mockError = new Error('Test error');
      mockDocumentService.uploadDocument.mockRejectedValue(mockError);

      const options: CommandOptions = {
        file: testFile.path,
        jobId: 'upload'
      };

      await documentCommand.execute(options);

      expect(mockMonitoringService().logError).toHaveBeenCalledWith(
        'DocumentCommand',
        mockError
      );
    });
  });
});