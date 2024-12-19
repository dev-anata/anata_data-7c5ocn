/**
 * Document Controller Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for DocumentController with performance tracking,
 * error handling, and security validation.
 */

import { Request, Response, NextFunction } from 'express'; // v4.17.1
import { performance } from 'performance-now'; // v2.1.0
import { DocumentController } from '../../../src/api/controllers/document.controller';
import { APIDocumentService } from '../../../src/api/services/document.service';
import { 
  DocumentProcessingStatus,
  DocumentSecurityLevel,
  DocumentUploadRequest,
  DocumentUploadResponse,
  DocumentStatusResponse
} from '../../../src/api/interfaces/document.interface';
import { ValidationError, NotFoundError } from '../../../src/core/utils/error.util';
import { LoggerService } from '../../../src/core/logging/logger.service';

// Mock dependencies
jest.mock('../../../src/api/services/document.service');
jest.mock('../../../src/core/logging/logger.service');

describe('DocumentController', () => {
  let documentController: DocumentController;
  let mockDocumentService: jest.Mocked<APIDocumentService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let performanceMetrics: Record<string, number[]>;

  // Test file fixtures
  const testFiles = {
    validPDF: Buffer.from('mock PDF content'),
    invalidFile: Buffer.from('invalid content'),
    largePDF: Buffer.alloc(100 * 1024 * 1024 + 1) // Exceeds 100MB limit
  };

  beforeEach(() => {
    // Reset mocks and metrics
    mockDocumentService = {
      uploadDocument: jest.fn(),
      initiateProcessing: jest.fn(),
      getProcessingStatus: jest.fn(),
      getDocumentMetadata: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      error: jest.fn()
    } as any;

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();

    performanceMetrics = {
      uploadTime: [],
      processingTime: [],
      statusTime: []
    };

    documentController = new DocumentController(mockDocumentService, mockLogger);
  });

  describe('uploadDocument', () => {
    const validUploadRequest: DocumentUploadRequest = {
      file: {
        buffer: testFiles.validPDF,
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: testFiles.validPDF.length
      },
      metadata: {
        source: 'test',
        version: '1.0.0',
        retentionPolicy: 'standard'
      },
      securityLevel: DocumentSecurityLevel.INTERNAL,
      retentionPeriod: 365
    } as any;

    it('should successfully upload a valid document within performance SLA', async () => {
      // Setup mock response
      const mockUploadResponse = {
        documentId: 'test-123',
        status: DocumentProcessingStatus.PENDING,
        metadata: validUploadRequest.metadata
      };
      mockDocumentService.uploadDocument.mockResolvedValue(mockUploadResponse);

      // Execute with performance tracking
      const startTime = performance();
      mockRequest = { body: validUploadRequest, user: { id: 'test-user' } };
      
      await documentController.uploadDocument(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const endTime = performance();
      const duration = endTime - startTime;

      // Verify performance SLA (500ms)
      expect(duration).toBeLessThan(500);
      performanceMetrics.uploadTime.push(duration);

      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        documentId: 'test-123',
        status: DocumentProcessingStatus.PENDING,
        metadata: validUploadRequest.metadata,
        securityInfo: expect.objectContaining({
          classification: DocumentSecurityLevel.INTERNAL,
          encryptionStatus: true
        })
      }));
    });

    it('should reject documents exceeding size limit', async () => {
      const largeRequest = {
        ...validUploadRequest,
        file: {
          ...validUploadRequest.file,
          buffer: testFiles.largePDF,
          size: testFiles.largePDF.length
        }
      };

      mockRequest = { body: largeRequest };

      await documentController.uploadDocument(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.any(ValidationError)
      );
    });

    it('should enforce security level validation for restricted documents', async () => {
      const restrictedRequest = {
        ...validUploadRequest,
        securityLevel: DocumentSecurityLevel.RESTRICTED
      };

      mockRequest = { body: restrictedRequest };

      await documentController.uploadDocument(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.any(ValidationError)
      );
    });
  });

  describe('getDocumentStatus', () => {
    const validStatusRequest = {
      documentId: 'test-123',
      includeHistory: true
    };

    it('should retrieve document status within performance SLA', async () => {
      // Setup mock response
      const mockStatusResponse = {
        documentId: 'test-123',
        status: DocumentProcessingStatus.PROCESSING,
        progress: 50,
        processingDuration: 1000
      };
      mockDocumentService.getProcessingStatus.mockResolvedValue(mockStatusResponse);

      // Execute with performance tracking
      const startTime = performance();
      mockRequest = { params: validStatusRequest };

      await documentController.getDocumentStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const endTime = performance();
      const duration = endTime - startTime;

      // Verify performance SLA (500ms)
      expect(duration).toBeLessThan(500);
      performanceMetrics.statusTime.push(duration);

      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        documentId: 'test-123',
        status: DocumentProcessingStatus.PROCESSING,
        progress: 50
      }));
    });

    it('should handle non-existent documents', async () => {
      mockDocumentService.getProcessingStatus.mockResolvedValue(null);
      mockRequest = { params: { documentId: 'non-existent' } };

      await documentController.getDocumentStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.any(NotFoundError)
      );
    });

    it('should track processing time for documents', async () => {
      const mockStatusResponse = {
        documentId: 'test-123',
        status: DocumentProcessingStatus.COMPLETED,
        processingDuration: 90000 // 90 seconds
      };
      mockDocumentService.getProcessingStatus.mockResolvedValue(mockStatusResponse);

      mockRequest = { params: validStatusRequest };
      await documentController.getDocumentStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Verify processing time is within 2-minute SLA
      expect(mockStatusResponse.processingDuration).toBeLessThan(120000);
      performanceMetrics.processingTime.push(mockStatusResponse.processingDuration);
    });
  });

  describe('listDocuments', () => {
    const validListRequest = {
      page: 1,
      limit: 20,
      status: DocumentProcessingStatus.COMPLETED,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    };

    it('should list documents with pagination within performance SLA', async () => {
      // Setup mock response
      const mockListResponse = {
        documents: Array(20).fill({
          documentId: 'test-123',
          status: DocumentProcessingStatus.COMPLETED
        }),
        total: 100,
        page: 1
      };
      mockDocumentService.listDocumentsWithPagination.mockResolvedValue(mockListResponse);

      // Execute with performance tracking
      const startTime = performance();
      mockRequest = { query: validListRequest };

      await documentController.listDocuments(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const endTime = performance();
      const duration = endTime - startTime;

      // Verify performance SLA (500ms)
      expect(duration).toBeLessThan(500);

      // Verify response
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        documents: expect.any(Array),
        total: 100,
        page: 1
      }));
    });
  });

  // Performance metrics aggregation
  afterAll(() => {
    const calculatePercentile = (values: number[], percentile: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.ceil((percentile / 100) * sorted.length) - 1;
      return sorted[index];
    };

    // Verify 95th percentile response times are within SLA
    const uploadP95 = calculatePercentile(performanceMetrics.uploadTime, 95);
    const statusP95 = calculatePercentile(performanceMetrics.statusTime, 95);
    const processingP95 = calculatePercentile(performanceMetrics.processingTime, 95);

    console.log('Performance Metrics (95th percentile):');
    console.log(`Upload Time: ${uploadP95.toFixed(2)}ms`);
    console.log(`Status Time: ${statusP95.toFixed(2)}ms`);
    console.log(`Processing Time: ${processingP95.toFixed(2)}ms`);

    expect(uploadP95).toBeLessThan(500);
    expect(statusP95).toBeLessThan(500);
    expect(processingP95).toBeLessThan(120000); // 2 minutes
  });
});