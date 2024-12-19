/**
 * NLP Service Test Suite
 * Version: 1.0.0
 * 
 * Comprehensive test suite for validating NLP service functionality including
 * text analysis, entity extraction, content classification, and performance metrics.
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { Container } from 'inversify';
import { performance } from 'perf_hooks';
import { NLPService } from '../../../../src/document-processing/services/nlp.service';
import { OCRResult } from '../../../../src/document-processing/interfaces/ocr.interface';
import { LoggerService } from '../../../../src/core/logging/logger.service';

// Mock implementations
jest.mock('../../../../src/core/logging/logger.service');

describe('NLPService', () => {
  let container: Container;
  let nlpService: NLPService;
  let loggerService: jest.Mocked<LoggerService>;
  let mockOCRResult: OCRResult;

  beforeEach(() => {
    // Initialize container and bindings
    container = new Container();
    loggerService = {
      debug: jest.fn(),
      error: jest.fn(),
      metric: jest.fn()
    } as any;

    container.bind<LoggerService>('LoggerService').toConstantValue(loggerService);
    container.bind<NLPService>('NLPService').to(NLPService);

    nlpService = container.get<NLPService>('NLPService');

    // Setup mock OCR result
    mockOCRResult = {
      documentId: 'test-doc-123',
      text: 'Patient was prescribed 500mg of Aspirin daily for chronic pain management. Clinical trial NCT123456 showed positive results.',
      confidence: 0.95,
      processedAt: new Date(),
      processingTime: 1000,
      pageResults: []
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processText', () => {
    it('should process text within 2 minute SLA', async () => {
      const startTime = performance.now();
      
      await nlpService.processText(mockOCRResult);
      
      const processingTime = performance.now() - startTime;
      expect(processingTime).toBeLessThan(120000); // 2 minutes in milliseconds
      expect(loggerService.debug).toHaveBeenCalledWith(
        'NLP processing completed',
        expect.any(Object)
      );
    });

    it('should achieve minimum 95% confidence for valid pharmaceutical text', async () => {
      const result = await nlpService.processText(mockOCRResult);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.classifications.length).toBeGreaterThan(0);
    });

    it('should handle various document types with appropriate classification', async () => {
      const documentTypes = [
        { text: 'Clinical trial results for Drug XYZ...', expectedClass: 'CLINICAL_TRIALS' },
        { text: 'Drug interaction study between...', expectedClass: 'DRUG_INFORMATION' },
        { text: 'Patient reported adverse effects...', expectedClass: 'ADVERSE_EVENTS' }
      ];

      for (const doc of documentTypes) {
        const result = await nlpService.processText({
          ...mockOCRResult,
          text: doc.text
        });

        expect(result.classifications).toContainEqual(
          expect.objectContaining({ category: doc.expectedClass })
        );
      }
    });

    it('should validate PII detection and handling', async () => {
      const textWithPII = {
        ...mockOCRResult,
        text: 'Patient email: test@example.com, SSN: 123-45-6789'
      };

      const result = await nlpService.processText(textWithPII);
      
      expect(result.piiDetected).toBe(true);
      expect(loggerService.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ piiDetected: true })
      );
    });

    it('should retry on recoverable errors with exponential backoff', async () => {
      // Mock temporary failure
      const tempError = new Error('Temporary processing error');
      jest.spyOn(nlpService as any, 'extractEntities')
        .mockRejectedValueOnce(tempError)
        .mockResolvedValueOnce([]);

      await nlpService.processText(mockOCRResult);

      expect(loggerService.error).toHaveBeenCalledWith(
        'NLP processing failed',
        tempError,
        expect.any(Object)
      );
      expect(loggerService.debug).toHaveBeenCalledWith(
        'NLP processing completed',
        expect.any(Object)
      );
    });
  });

  describe('extractEntities', () => {
    it('should extract entities with minimum 90% accuracy', async () => {
      const result = await nlpService.processText(mockOCRResult);
      
      result.entities.forEach(entity => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should properly classify pharmaceutical entity types', async () => {
      const result = await nlpService.processText(mockOCRResult);
      
      const entityTypes = result.entities.map(e => e.type);
      expect(entityTypes).toEqual(
        expect.arrayContaining(['DRUG', 'DOSAGE', 'CLINICAL_TRIAL'])
      );
    });

    it('should handle complex entity relationships', async () => {
      const complexText = {
        ...mockOCRResult,
        text: 'Drug A (500mg) interacts with Drug B (250mg) causing increased absorption.'
      };

      const result = await nlpService.processText(complexText);
      
      expect(result.entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'DRUG', text: expect.stringContaining('Drug A') }),
          expect.objectContaining({ type: 'DRUG', text: expect.stringContaining('Drug B') }),
          expect.objectContaining({ type: 'INTERACTION', text: expect.stringContaining('interacts') })
        ])
      );
    });

    it('should validate entity positions in text', async () => {
      const result = await nlpService.processText(mockOCRResult);
      
      result.entities.forEach(entity => {
        expect(entity.position).toEqual(
          expect.objectContaining({
            start: expect.any(Number),
            end: expect.any(Number)
          })
        );
        expect(entity.position.start).toBeLessThan(entity.position.end);
        expect(mockOCRResult.text.substring(
          entity.position.start,
          entity.position.end
        )).toBe(entity.text);
      });
    });

    it('should filter low confidence entities', async () => {
      const result = await nlpService.processText(mockOCRResult);
      
      result.entities.forEach(entity => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.75);
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid input gracefully', async () => {
      const invalidInput = {
        ...mockOCRResult,
        text: '',
        confidence: 0.5
      };

      await expect(nlpService.processText(invalidInput))
        .rejects.toThrow('Invalid OCR input or low confidence score');
    });

    it('should handle model initialization failures', async () => {
      // Force model initialization error
      jest.spyOn(nlpService as any, 'initializeModel')
        .mockRejectedValueOnce(new Error('Model initialization failed'));

      await expect(nlpService.processText(mockOCRResult))
        .rejects.toThrow('Model initialization failed');
      
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to initialize NLP model',
        expect.any(Error)
      );
    });
  });

  describe('performance monitoring', () => {
    it('should track and log processing metrics', async () => {
      await nlpService.processText(mockOCRResult);

      expect(loggerService.debug).toHaveBeenCalledWith(
        'NLP processing completed',
        expect.objectContaining({
          metrics: expect.objectContaining({
            startTime: expect.any(Date),
            endTime: expect.any(Date),
            duration: expect.any(Number),
            entityCount: expect.any(Number)
          })
        })
      );
    });

    it('should monitor memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      await nlpService.processText(mockOCRResult);
      const finalMemory = process.memoryUsage().heapUsed;

      expect(finalMemory - initialMemory).toBeLessThan(100 * 1024 * 1024); // 100MB limit
    });
  });
});