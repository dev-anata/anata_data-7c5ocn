/**
 * API Document Service Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for validating document processing functionality
 * including upload, processing, status tracking, and error handling.
 */

import { jest } from '@jest/globals'; // v29.0.0
import { mock } from 'jest-mock'; // v29.0.0
import { Buffer } from 'buffer'; // v6.0.3
import {
  APIDocumentService,
  DocumentService,
  DocumentMetadata,
  DocumentProcessingStatus,
  DocumentProcessingResult,
  DocumentValidationError,
  UploadOptions
} from '../../../src/api/services/document.service';
import { LoggerService } from '../../../src/core/logging/logger.service';
import { CacheService } from 'cache-manager';
import { ValidationError, NotFoundError } from '../../../src/core/utils/error.util';

// Mock dependencies
jest.mock('../../../src/core/logging/logger.service');
jest.mock('cache-manager');

describe('APIDocumentService', () => {
  // Test constants
  const TEST_TIMEOUT = 120000; // 2 minutes as per requirements
  const VALID_FILE_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  // Test fixtures
  let documentService: jest.Mocked<DocumentService>;
  let cacheService: jest.Mocked<CacheService>;
  let loggerService: jest.Mocked<LoggerService>;
  let apiDocumentService: APIDocumentService;

  // Sample test data
  const testDocumentId = 'test-doc-123';
  const testFileName = 'test-document.pdf';
  const testContent = Buffer.from('Test document content');
  const testMetadata: DocumentMetadata = {
    fileName: testFileName,
    mimeType: 'application/pdf',
    size: testContent.length,
    uploadedAt: new Date(),
    source: 'test',
    version: '1.0.0',
    retentionPolicy: 'standard',
    complianceFlags: []
  };

  beforeEach(() => {
    // Initialize mocks
    documentService = {
      uploadDocument: jest.fn(),
      getDocument: jest.fn(),
      getProcessingStatus: jest.fn(),
      validateDocument: jest.fn()
    } as unknown as jest.Mocked<DocumentService>;

    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    } as unknown as jest.Mocked<CacheService>;

    loggerService = {
      debug: jest.fn(),
      error: jest.fn()
    } as unknown as jest.Mocked<LoggerService>;

    // Initialize service under test
    apiDocumentService = new APIDocumentService(
      documentService,
      cacheService,
      loggerService
    );
  });

  describe('uploadDocument', () => {
    it('should successfully upload a valid document', async () => {
      // Setup
      const uploadOptions: UploadOptions = {
        customMetadata: {
          source: 'test',
          retentionPolicy: 'standard'
        }
      };

      documentService.uploadDocument.mockResolvedValueOnce({
        documentId: testDocumentId,
        content: testContent,
        metadata: testMetadata,
        checksum: 'test-checksum'
      });

      // Execute
      const result = await apiDocumentService.uploadDocument(
        testContent,
        testFileName,
        'application/pdf',
        uploadOptions
      );

      // Verify
      expect(result).toEqual(testMetadata);
      expect(documentService.uploadDocument).toHaveBeenCalledWith(
        testContent,
        expect.objectContaining({
          fileName: testFileName,
          mimeType: 'application/pdf'
        }),
        uploadOptions
      );
      expect(cacheService.set).toHaveBeenCalled();
      expect(loggerService.debug).toHaveBeenCalled();
    }, TEST_TIMEOUT);

    it('should reject upload of invalid file type', async () => {
      // Execute & Verify
      await expect(
        apiDocumentService.uploadDocument(
          testContent,
          'test.invalid',
          'application/invalid'
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should reject upload exceeding maximum file size', async () => {
      // Setup
      const largeContent = Buffer.alloc(MAX_FILE_SIZE + 1);

      // Execute & Verify
      await expect(
        apiDocumentService.uploadDocument(
          largeContent,
          testFileName,
          'application/pdf'
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should handle upload failures with retry', async () => {
      // Setup
      documentService.uploadDocument
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValueOnce({
          documentId: testDocumentId,
          content: testContent,
          metadata: testMetadata,
          checksum: 'test-checksum'
        });

      // Execute
      const result = await apiDocumentService.uploadDocument(
        testContent,
        testFileName,
        'application/pdf'
      );

      // Verify
      expect(result).toEqual(testMetadata);
      expect(documentService.uploadDocument).toHaveBeenCalledTimes(3);
    }, TEST_TIMEOUT);
  });

  describe('initiateProcessing', () => {
    it('should successfully initiate document processing', async () => {
      // Setup
      const processingResult: DocumentProcessingResult = {
        documentId: testDocumentId,
        status: DocumentProcessingStatus.PROCESSING,
        startTime: new Date(),
        endTime: new Date(),
        retryCount: 0,
        processingDuration: 0,
        traceId: 'test-trace'
      };

      documentService.getProcessingStatus.mockResolvedValueOnce(processingResult);

      // Execute
      const result = await apiDocumentService.initiateProcessing(testDocumentId);

      // Verify
      expect(result).toEqual(processingResult);
      expect(documentService.getProcessingStatus).toHaveBeenCalledWith(testDocumentId);
      expect(loggerService.debug).toHaveBeenCalled();
    }, TEST_TIMEOUT);

    it('should handle non-existent document', async () => {
      // Setup
      documentService.getDocument.mockRejectedValueOnce(
        new NotFoundError(`Document not found: ${testDocumentId}`)
      );

      // Execute & Verify
      await expect(
        apiDocumentService.initiateProcessing(testDocumentId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle processing failures', async () => {
      // Setup
      const errorResult: DocumentProcessingResult = {
        documentId: testDocumentId,
        status: DocumentProcessingStatus.FAILED,
        startTime: new Date(),
        endTime: new Date(),
        error: {
          code: 'PROCESSING_ERROR',
          message: 'Processing failed',
          timestamp: new Date()
        },
        retryCount: 3,
        processingDuration: 1000,
        traceId: 'test-trace'
      };

      documentService.getProcessingStatus.mockResolvedValueOnce(errorResult);

      // Execute & Verify
      await expect(
        apiDocumentService.initiateProcessing(testDocumentId)
      ).rejects.toThrow('Document processing failed');
    });
  });

  describe('getDocumentMetadata', () => {
    it('should return cached metadata if available', async () => {
      // Setup
      cacheService.get.mockResolvedValueOnce(testMetadata);

      // Execute
      const result = await apiDocumentService.getDocumentMetadata(testDocumentId);

      // Verify
      expect(result).toEqual(testMetadata);
      expect(cacheService.get).toHaveBeenCalled();
      expect(documentService.getDocument).not.toHaveBeenCalled();
    });

    it('should fetch and cache metadata if not in cache', async () => {
      // Setup
      cacheService.get.mockResolvedValueOnce(null);
      documentService.getDocument.mockResolvedValueOnce({
        documentId: testDocumentId,
        content: testContent,
        metadata: testMetadata,
        checksum: 'test-checksum'
      });

      // Execute
      const result = await apiDocumentService.getDocumentMetadata(testDocumentId);

      // Verify
      expect(result).toEqual(testMetadata);
      expect(documentService.getDocument).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should handle metadata retrieval errors', async () => {
      // Setup
      cacheService.get.mockResolvedValueOnce(null);
      documentService.getDocument.mockRejectedValueOnce(
        new Error('Metadata retrieval failed')
      );

      // Execute & Verify
      await expect(
        apiDocumentService.getDocumentMetadata(testDocumentId)
      ).rejects.toThrow('Metadata retrieval failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});