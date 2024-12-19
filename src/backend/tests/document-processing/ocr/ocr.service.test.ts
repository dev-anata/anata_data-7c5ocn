/**
 * OCR Service Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for OCR service implementations with extensive coverage
 * of worker pool management, error handling, and performance requirements.
 */

import { jest } from '@jest/globals'; // ^29.0.0
import { createWorker, createScheduler, PSM, OEM } from 'tesseract.js'; // ^4.0.0
import { AbstractOCRService } from '../../../src/document-processing/ocr/ocr.service';
import { TesseractService } from '../../../src/document-processing/ocr/tesseract.service';
import { LoggerService } from '../../../src/core/logging/logger.service';
import { 
  OCRConfig, 
  OCRResult, 
  OCRProgress,
  OCRPageSegmentationMode,
  OCREngineMode 
} from '../../../src/document-processing/interfaces/ocr.interface';
import { DocumentContent } from '../../../src/document-processing/interfaces/document.interface';

// Mock implementations
jest.mock('tesseract.js');
jest.mock('../../../src/core/logging/logger.service');

describe('OCR Service Tests', () => {
  let loggerService: jest.Mocked<LoggerService>;
  let mockWorker: any;
  let mockScheduler: any;
  let tesseractService: TesseractService;
  let testDocument: DocumentContent;
  let defaultConfig: OCRConfig;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup logger mock
    loggerService = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as any;

    // Setup Tesseract worker mock
    mockWorker = {
      loadLanguage: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      setParameters: jest.fn().mockResolvedValue(undefined),
      terminate: jest.fn().mockResolvedValue(undefined)
    };

    // Setup Tesseract scheduler mock
    mockScheduler = {
      addWorker: jest.fn(),
      addJob: jest.fn(),
      terminate: jest.fn()
    };

    (createWorker as jest.Mock).mockResolvedValue(mockWorker);
    (createScheduler as jest.Mock).mockReturnValue(mockScheduler);

    // Initialize service
    tesseractService = new TesseractService(loggerService);

    // Setup test document
    testDocument = {
      documentId: 'test-doc-001',
      content: Buffer.from('Test document content'),
      metadata: {
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedAt: new Date(),
        source: 'test',
        version: '1.0',
        retentionPolicy: 'standard',
        complianceFlags: []
      },
      checksum: 'test-checksum'
    };

    // Setup default config
    defaultConfig = {
      language: ['eng'],
      dpi: 300,
      pageSegmentationMode: OCRPageSegmentationMode.AUTO,
      engineMode: OCREngineMode.TESSERACT_LSTM_COMBINED,
      timeout: 120000,
      optimizations: {
        enableParallel: true,
        workerThreads: 4,
        enableGpu: false
      }
    };
  });

  afterEach(async () => {
    // Cleanup resources
    await tesseractService['cleanupResources']([]);
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', () => {
      expect(() => {
        tesseractService['validateConfig'](defaultConfig);
      }).not.toThrow();
    });

    it('should throw error for missing language', () => {
      const invalidConfig = { ...defaultConfig, language: [] };
      expect(() => {
        tesseractService['validateConfig'](invalidConfig);
      }).toThrow('OCR configuration must specify at least one language');
    });

    it('should throw error for invalid DPI', () => {
      const invalidConfig = { ...defaultConfig, dpi: 50 };
      expect(() => {
        tesseractService['validateConfig'](invalidConfig);
      }).toThrow('OCR configuration must specify DPI >= 72');
    });
  });

  describe('Worker Pool Management', () => {
    it('should initialize worker pool with correct size', async () => {
      const workerCount = 4;
      const workers = await tesseractService['initializeWorkerPool'](workerCount, defaultConfig);
      
      expect(workers.length).toBe(workerCount);
      expect(createWorker).toHaveBeenCalledTimes(workerCount);
      expect(mockWorker.loadLanguage).toHaveBeenCalledTimes(workerCount);
      expect(mockWorker.initialize).toHaveBeenCalledTimes(workerCount);
    });

    it('should handle worker initialization failure', async () => {
      const error = new Error('Worker initialization failed');
      (createWorker as jest.Mock).mockRejectedValueOnce(error);

      await expect(
        tesseractService['initializeWorkerPool'](1, defaultConfig)
      ).rejects.toThrow(error);

      expect(loggerService.error).toHaveBeenCalledWith(
        'Worker initialization failed',
        error,
        expect.any(Object)
      );
    });
  });

  describe('Document Processing', () => {
    it('should process document successfully', async () => {
      mockScheduler.addJob.mockResolvedValue({
        data: {
          text: 'Processed text',
          confidence: 95,
          times: { total: 1000 }
        }
      });

      const result = await tesseractService.processDocument(testDocument, defaultConfig);

      expect(result).toMatchObject({
        documentId: testDocument.documentId,
        text: expect.any(String),
        confidence: expect.any(Number),
        processedAt: expect.any(Date),
        processingTime: expect.any(Number)
      });
    });

    it('should handle processing timeout', async () => {
      const timeoutConfig = { ...defaultConfig, timeout: 1 };
      
      await expect(
        tesseractService.processDocument(testDocument, timeoutConfig)
      ).rejects.toThrow(/timeout/i);
    });

    it('should handle processing cancellation', async () => {
      const processingPromise = tesseractService.processDocument(testDocument, defaultConfig);
      await tesseractService.cancelProcessing(testDocument.documentId);

      await expect(processingPromise).rejects.toThrow(/cancelled/i);
    });
  });

  describe('Progress Tracking', () => {
    it('should track processing progress', async () => {
      const processingPromise = tesseractService.processDocument(testDocument, defaultConfig);
      
      const progress = await tesseractService.getProgress(testDocument.documentId);
      expect(progress).toMatchObject({
        documentId: testDocument.documentId,
        progress: expect.any(Number),
        stage: expect.stringMatching(/PREPROCESSING|RECOGNITION|POSTPROCESSING/)
      });

      await processingPromise.catch(() => {}); // Clean up
    });

    it('should handle invalid document ID for progress check', async () => {
      await expect(
        tesseractService.getProgress('invalid-id')
      ).rejects.toThrow(/No processing found/);
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources after processing', async () => {
      mockScheduler.addJob.mockResolvedValue({
        data: {
          text: 'Test',
          confidence: 95,
          times: { total: 100 }
        }
      });

      await tesseractService.processDocument(testDocument, defaultConfig);

      expect(mockScheduler.terminate).toHaveBeenCalled();
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should handle cleanup failures gracefully', async () => {
      mockScheduler.terminate.mockRejectedValue(new Error('Cleanup failed'));

      await tesseractService.processDocument(testDocument, defaultConfig);

      expect(loggerService.error).toHaveBeenCalledWith(
        'Resource cleanup failed',
        expect.any(Error)
      );
    });
  });

  describe('Performance Requirements', () => {
    it('should process document within time limit', async () => {
      mockScheduler.addJob.mockResolvedValue({
        data: {
          text: 'Test',
          confidence: 95,
          times: { total: 100 }
        }
      });

      const startTime = Date.now();
      await tesseractService.processDocument(testDocument, defaultConfig);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(120000); // 2 minutes
    });

    it('should handle concurrent processing efficiently', async () => {
      const documents = Array(5).fill(null).map((_, i) => ({
        ...testDocument,
        documentId: `test-doc-${i}`
      }));

      const startTime = Date.now();
      await Promise.all(
        documents.map(doc => tesseractService.processDocument(doc, defaultConfig))
      );
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(300000); // 5 minutes for 5 documents
    });
  });
});