/**
 * Document Processing Pipeline Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for verifying document processing pipeline functionality
 * including OCR processing, error handling, performance requirements, and resource management.
 */

import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals'; // ^29.0.0
import { mock } from 'jest-mock'; // ^29.0.0

import { DocumentPipeline } from '../../../src/document-processing/pipeline/document.pipeline';
import { 
  DocumentContent, 
  DocumentMetadata,
  DocumentProcessingStatus,
  DocumentProcessingResult,
  DocumentProcessingError
} from '../../../src/document-processing/interfaces/document.interface';
import { 
  OCRService,
  OCRConfig,
  OCRResult,
  OCRProgress,
  OCRPageSegmentationMode,
  OCREngineMode
} from '../../../src/document-processing/interfaces/ocr.interface';
import { LoggerService } from '../../../src/core/logging/logger.service';

// Mock external services
jest.mock('../../../src/document-processing/ocr/ocr.service');
jest.mock('../../../src/document-processing/services/nlp.service');
jest.mock('../../../src/document-processing/services/document.service');
jest.mock('../../../src/core/logging/logger.service');

describe('DocumentPipeline', () => {
  let documentPipeline: DocumentPipeline;
  let mockOCRService: jest.Mocked<OCRService>;
  let mockNLPService: jest.Mocked<any>;
  let mockDocumentService: jest.Mocked<any>;
  let mockLoggerService: jest.Mocked<LoggerService>;

  // Test document data
  const testDocumentId = 'test-doc-123';
  const testDocumentContent: DocumentContent = {
    documentId: testDocumentId,
    content: Buffer.from('test content'),
    metadata: {
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      uploadedAt: new Date(),
      source: 'test',
      version: '1.0.0',
      retentionPolicy: 'standard',
      complianceFlags: []
    },
    checksum: 'test-checksum'
  };

  beforeEach(() => {
    // Initialize mocks
    mockOCRService = {
      processDocument: jest.fn(),
      getProgress: jest.fn(),
      cancelProcessing: jest.fn(),
      getMetrics: jest.fn()
    };

    mockNLPService = {
      analyzeText: jest.fn(),
      performEntityExtraction: jest.fn(),
      performSentimentAnalysis: jest.fn(),
      performKeyPhraseExtraction: jest.fn()
    };

    mockDocumentService = {
      getDocument: jest.fn(),
      exists: jest.fn(),
      storeResults: jest.fn(),
      updateStatus: jest.fn()
    };

    mockLoggerService = {
      debug: jest.fn(),
      error: jest.fn(),
      critical: jest.fn()
    };

    // Initialize pipeline with mocked services
    documentPipeline = new DocumentPipeline(
      mockOCRService,
      mockNLPService,
      mockDocumentService,
      mockLoggerService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Document Processing', () => {
    test('should successfully process document within time limit', async () => {
      // Setup mock responses
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      
      const mockOCRResult: OCRResult = {
        documentId: testDocumentId,
        text: 'extracted text',
        confidence: 95,
        processedAt: new Date(),
        processingTime: 60000, // 1 minute
        pageResults: [{
          pageNumber: 1,
          text: 'extracted text',
          confidence: 95,
          processingTime: 60000
        }]
      };
      
      mockOCRService.processDocument.mockResolvedValue(mockOCRResult);
      mockNLPService.analyzeText.mockResolvedValue({
        entities: ['test'],
        sentiment: 'positive'
      });

      // Start processing timer
      const startTime = Date.now();

      // Process document
      const result = await documentPipeline.processDocument(testDocumentId, {
        priority: 'HIGH',
        timeout: 120000,
        enableParallel: true
      });

      // Verify processing time
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(120000); // Less than 2 minutes

      // Verify result structure
      expect(result).toMatchObject({
        documentId: testDocumentId,
        status: DocumentProcessingStatus.COMPLETED,
        processingDuration: expect.any(Number),
        retryCount: 0
      });

      // Verify service calls
      expect(mockOCRService.processDocument).toHaveBeenCalledWith(
        testDocumentContent,
        expect.objectContaining({
          language: ['eng'],
          dpi: 300,
          pageSegmentationMode: OCRPageSegmentationMode.SINGLE_BLOCK,
          engineMode: OCREngineMode.TESSERACT_LSTM_COMBINED
        })
      );

      expect(mockDocumentService.storeResults).toHaveBeenCalled();
      expect(mockLoggerService.debug).toHaveBeenCalled();
    });

    test('should handle concurrent document processing', async () => {
      // Setup mock responses for multiple documents
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      mockOCRService.processDocument.mockImplementation(() => 
        Promise.resolve({
          documentId: testDocumentId,
          text: 'extracted text',
          confidence: 95,
          processedAt: new Date(),
          processingTime: 30000,
          pageResults: []
        })
      );

      // Process multiple documents concurrently
      const documents = Array(5).fill(null).map((_, i) => 
        documentPipeline.processDocument(`${testDocumentId}-${i}`, {
          enableParallel: true
        })
      );

      const results = await Promise.all(documents);

      // Verify all documents were processed successfully
      results.forEach(result => {
        expect(result.status).toBe(DocumentProcessingStatus.COMPLETED);
        expect(result.processingDuration).toBeLessThan(120000);
      });
    });

    test('should handle OCR processing errors with retries', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      
      // Simulate OCR failure then success
      mockOCRService.processDocument
        .mockRejectedValueOnce(new Error('OCR processing failed'))
        .mockResolvedValueOnce({
          documentId: testDocumentId,
          text: 'extracted text',
          confidence: 95,
          processedAt: new Date(),
          processingTime: 30000,
          pageResults: []
        });

      const result = await documentPipeline.processDocument(testDocumentId);

      expect(result.status).toBe(DocumentProcessingStatus.COMPLETED);
      expect(mockOCRService.processDocument).toHaveBeenCalledTimes(2);
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    test('should handle document processing timeout', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      
      // Simulate processing timeout
      mockOCRService.processDocument.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 3000))
      );

      await expect(documentPipeline.processDocument(testDocumentId, {
        timeout: 1000 // 1 second timeout
      })).rejects.toThrow('Processing timeout');

      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    test('should clean up resources after processing', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      mockOCRService.processDocument.mockResolvedValue({
        documentId: testDocumentId,
        text: 'extracted text',
        confidence: 95,
        processedAt: new Date(),
        processingTime: 30000,
        pageResults: []
      });

      await documentPipeline.processDocument(testDocumentId);

      // Verify resource cleanup
      const metrics = await documentPipeline.getProcessingMetrics(testDocumentId);
      expect(metrics.endTime).toBeDefined();
      expect(metrics.memoryUsage).toBeDefined();
      expect(metrics.status).toBe(DocumentProcessingStatus.COMPLETED);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid document ID', async () => {
      mockDocumentService.exists.mockResolvedValue(false);

      await expect(documentPipeline.processDocument('invalid-id'))
        .rejects.toThrow('Document not found');
    });

    test('should handle OCR service failure', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      mockOCRService.processDocument.mockRejectedValue(
        new Error('OCR service unavailable')
      );

      await expect(documentPipeline.processDocument(testDocumentId))
        .rejects.toThrow('OCR service unavailable');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Document processing error',
        expect.any(Error),
        expect.any(Object)
      );
    });

    test('should handle NLP service failure', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      mockOCRService.processDocument.mockResolvedValue({
        documentId: testDocumentId,
        text: 'extracted text',
        confidence: 95,
        processedAt: new Date(),
        processingTime: 30000,
        pageResults: []
      });
      mockNLPService.analyzeText.mockRejectedValue(
        new Error('NLP service unavailable')
      );

      await expect(documentPipeline.processDocument(testDocumentId))
        .rejects.toThrow('NLP service unavailable');
    });
  });

  describe('Performance Requirements', () => {
    test('should process document under 2 minutes', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      mockOCRService.processDocument.mockResolvedValue({
        documentId: testDocumentId,
        text: 'extracted text',
        confidence: 95,
        processedAt: new Date(),
        processingTime: 60000,
        pageResults: []
      });

      const startTime = Date.now();
      await documentPipeline.processDocument(testDocumentId);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(120000);
    });

    test('should handle high document processing load', async () => {
      mockDocumentService.exists.mockResolvedValue(true);
      mockDocumentService.getDocument.mockResolvedValue(testDocumentContent);
      mockOCRService.processDocument.mockResolvedValue({
        documentId: testDocumentId,
        text: 'extracted text',
        confidence: 95,
        processedAt: new Date(),
        processingTime: 30000,
        pageResults: []
      });

      // Process 10 documents concurrently
      const startTime = Date.now();
      const documents = Array(10).fill(null).map((_, i) => 
        documentPipeline.processDocument(`${testDocumentId}-${i}`)
      );

      const results = await Promise.all(documents);
      const totalTime = Date.now() - startTime;

      // Verify processing time for batch
      expect(totalTime).toBeLessThan(600000); // 10 minutes for 10 documents
      results.forEach(result => {
        expect(result.status).toBe(DocumentProcessingStatus.COMPLETED);
      });
    });
  });
});