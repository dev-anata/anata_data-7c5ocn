/**
 * NLP Pipeline Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for verifying NLP pipeline functionality including
 * performance requirements, error rates, and processing capabilities.
 */

import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { NLPPipeline } from '../../../src/document-processing/pipeline/nlp.pipeline';
import { NLPService } from '../../../src/document-processing/services/nlp.service';
import { DocumentValidationPipeline } from '../../../src/document-processing/pipeline/validation.pipeline';
import { 
  DocumentContent, 
  DocumentProcessingResult, 
  DocumentProcessingStatus,
  DocumentMetadata 
} from '../../../src/document-processing/interfaces/document.interface';

// Constants for test configuration
const TEST_TIMEOUT = 180000; // 3 minutes
const PERFORMANCE_THRESHOLD = 120000; // 2 minutes
const MIN_CONFIDENCE = 0.8;
const ERROR_RATE_THRESHOLD = 0.001; // 0.1%

// Mock implementations
jest.mock('../../../src/document-processing/services/nlp.service');
jest.mock('../../../src/document-processing/pipeline/validation.pipeline');

describe('NLPPipeline', () => {
  let nlpPipeline: NLPPipeline;
  let mockNLPService: jest.Mocked<NLPService>;
  let mockValidationPipeline: jest.Mocked<DocumentValidationPipeline>;
  let mockLogger: any;
  let mockMetricsCollector: any;
  let testDocument: DocumentContent;

  beforeEach(() => {
    // Initialize mocks
    mockNLPService = {
      processText: jest.fn(),
      extractEntities: jest.fn(),
      classifyContent: jest.fn(),
      validateLanguage: jest.fn()
    } as any;

    mockValidationPipeline = {
      validateDocument: jest.fn(),
      validateProcessingResult: jest.fn(),
      validateBatchResults: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockMetricsCollector = {
      recordMetric: jest.fn()
    };

    // Initialize test document
    testDocument = {
      documentId: 'test-doc-001',
      content: Buffer.from('Test pharmaceutical document content'),
      metadata: {
        fileName: 'test-doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedAt: new Date(),
        source: 'test',
        version: '1.0',
        retentionPolicy: 'standard',
        complianceFlags: ['GDPR']
      },
      checksum: 'test-checksum'
    };

    // Initialize NLP pipeline
    nlpPipeline = new NLPPipeline(
      mockNLPService,
      mockValidationPipeline,
      mockLogger,
      mockMetricsCollector
    );
  });

  test('processDocument should complete within performance threshold', async () => {
    // Configure mock responses
    const mockEntities = [
      { text: 'Aspirin', type: 'DRUG', confidence: 0.95 },
      { text: 'headache', type: 'CONDITION', confidence: 0.90 }
    ];

    const mockClassifications = [
      { category: 'DRUG_INFORMATION', confidence: 0.92 }
    ];

    mockNLPService.extractEntities.mockResolvedValue(mockEntities);
    mockNLPService.classifyContent.mockResolvedValue(mockClassifications);
    mockValidationPipeline.validateDocument.mockResolvedValue(true);

    // Start performance timer
    const startTime = Date.now();

    // Process document
    const result = await nlpPipeline.processDocument(testDocument);

    // Verify performance
    const processingTime = Date.now() - startTime;
    expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLD);

    // Verify result structure
    expect(result).toEqual(expect.objectContaining({
      documentId: testDocument.documentId,
      status: DocumentProcessingStatus.COMPLETED,
      confidence: expect.any(Number),
      processingDuration: expect.any(Number)
    }));

    // Verify confidence threshold
    expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);

    // Verify service calls
    expect(mockNLPService.extractEntities).toHaveBeenCalledWith(
      testDocument.content.toString()
    );
    expect(mockNLPService.classifyContent).toHaveBeenCalledWith(
      testDocument.content.toString()
    );
  }, TEST_TIMEOUT);

  test('processDocument should handle errors and maintain error rate', async () => {
    const totalIterations = 1000;
    let errorCount = 0;

    // Configure mock to occasionally fail
    mockNLPService.extractEntities.mockImplementation(() => {
      if (Math.random() < 0.001) { // 0.1% error rate
        throw new Error('Simulated processing error');
      }
      return Promise.resolve([]);
    });

    // Process multiple documents to verify error rate
    for (let i = 0; i < totalIterations; i++) {
      try {
        await nlpPipeline.processDocument({
          ...testDocument,
          documentId: `test-doc-${i}`
        });
      } catch (error) {
        errorCount++;
      }
    }

    // Verify error rate
    const errorRate = errorCount / totalIterations;
    expect(errorRate).toBeLessThanOrEqual(ERROR_RATE_THRESHOLD);
  });

  test('processDocumentBatch should handle parallel processing efficiently', async () => {
    const batchSize = 10;
    const documents = Array.from({ length: batchSize }, (_, i) => ({
      ...testDocument,
      documentId: `test-doc-batch-${i}`
    }));

    // Configure mock responses
    mockNLPService.extractEntities.mockResolvedValue([]);
    mockNLPService.classifyContent.mockResolvedValue([]);
    mockValidationPipeline.validateBatchResults.mockResolvedValue(true);

    // Start performance timer
    const startTime = Date.now();

    // Process batch
    const results = await Promise.all(
      documents.map(doc => nlpPipeline.processDocument(doc))
    );

    // Verify batch processing time
    const processingTime = Date.now() - startTime;
    expect(processingTime).toBeLessThan(PERFORMANCE_THRESHOLD);

    // Verify batch results
    expect(results).toHaveLength(batchSize);
    results.forEach(result => {
      expect(result.status).toBe(DocumentProcessingStatus.COMPLETED);
      expect(result.processingDuration).toBeLessThan(PERFORMANCE_THRESHOLD);
    });
  });

  test('should validate processing results and handle validation errors', async () => {
    // Configure validation pipeline to fail
    mockValidationPipeline.validateProcessingResult.mockRejectedValue(
      new Error('Validation failed')
    );

    // Attempt to process document
    await expect(nlpPipeline.processDocument(testDocument))
      .rejects
      .toThrow('Validation failed');

    // Verify validation was called
    expect(mockValidationPipeline.validateProcessingResult).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('should track and report processing metrics', async () => {
    // Process document
    await nlpPipeline.processDocument(testDocument);

    // Verify metrics collection
    expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
      'nlp_processing_started',
      expect.any(Object)
    );

    expect(mockMetricsCollector.recordMetric).toHaveBeenCalledWith(
      'nlp_processing_completed',
      expect.objectContaining({
        processingId: expect.any(String),
        duration: expect.any(Number),
        confidence: expect.any(Number)
      })
    );
  });
});