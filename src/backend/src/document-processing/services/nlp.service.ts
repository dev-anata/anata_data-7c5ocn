/**
 * Natural Language Processing Service
 * Version: 1.0.0
 * 
 * Advanced NLP service for pharmaceutical document processing with
 * optimized performance, error handling, and monitoring capabilities.
 */

import { injectable } from 'inversify';
import * as spacy from 'spacy'; // v3.4.0
import { retry } from 'retry-ts'; // v0.1.3
import { OCRResult } from '../interfaces/ocr.interface';
import { DocumentContent } from '../interfaces/document.interface';
import { LoggerService } from '../../core/logging/logger.service';

/**
 * Interface for NLP processing results
 */
interface NLPResult {
  documentId: string;
  entities: Entity[];
  classifications: Classification[];
  confidence: number;
  processedAt: Date;
  processingTime: number;
  piiDetected: boolean;
  modelVersion: string;
}

/**
 * Interface for extracted entities
 */
interface Entity {
  text: string;
  type: string;
  confidence: number;
  position: { start: number; end: number };
  context: string;
  isPII: boolean;
}

/**
 * Interface for content classifications
 */
interface Classification {
  category: string;
  confidence: number;
  subcategories: string[];
  hierarchy: string[];
  rules: string[];
}

/**
 * Interface for NLP processing metrics
 */
interface ProcessingMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  memoryUsage: number;
  modelLoadTime: number;
  entityCount: number;
  textLength: number;
}

/**
 * Enhanced NLP service with optimized performance and error handling
 */
@injectable()
export class NLPService {
  private nlpModel: any;
  private readonly modelCache: Map<string, any>;
  private readonly metrics: ProcessingMetrics;
  private static readonly MODEL_VERSION = '3.4.0';
  private static readonly CONFIDENCE_THRESHOLD = 0.75;
  private static readonly PII_PATTERNS = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,  // Email
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,                // Phone
    /\b\d{3}[-]?\d{2}[-]?\d{4}\b/,                  // SSN
  ];

  constructor(
    private readonly logger: LoggerService
  ) {
    this.modelCache = new Map();
    this.metrics = this.initializeMetrics();
    this.initializeModel();
  }

  /**
   * Initialize NLP metrics tracking
   */
  private initializeMetrics(): ProcessingMetrics {
    return {
      startTime: new Date(),
      memoryUsage: process.memoryUsage().heapUsed,
      modelLoadTime: 0,
      entityCount: 0,
      textLength: 0
    };
  }

  /**
   * Initialize and cache NLP model
   */
  private async initializeModel(): Promise<void> {
    try {
      const modelLoadStart = Date.now();
      this.nlpModel = await spacy.load('en_core_web_lg');
      this.metrics.modelLoadTime = Date.now() - modelLoadStart;
      
      this.logger.debug('NLP model initialized', {
        modelVersion: NLPService.MODEL_VERSION,
        loadTime: this.metrics.modelLoadTime
      });
    } catch (error) {
      this.logger.error('Failed to initialize NLP model', error as Error);
      throw error;
    }
  }

  /**
   * Process OCR result text using optimized NLP pipeline
   */
  public async processText(ocrResult: OCRResult): Promise<NLPResult> {
    const startTime = Date.now();
    this.logger.debug('Starting NLP processing', { documentId: ocrResult.documentId });

    try {
      // Validate input
      if (!ocrResult.text || ocrResult.confidence < NLPService.CONFIDENCE_THRESHOLD) {
        throw new Error('Invalid OCR input or low confidence score');
      }

      // Process text in parallel
      const [entities, classifications] = await Promise.all([
        this.extractEntities(ocrResult.text),
        this.classifyContent(ocrResult.text)
      ]);

      // Detect PII information
      const piiDetected = this.detectPII(ocrResult.text);

      const processingTime = Date.now() - startTime;
      const result: NLPResult = {
        documentId: ocrResult.documentId,
        entities,
        classifications,
        confidence: this.calculateConfidence(entities, classifications),
        processedAt: new Date(),
        processingTime,
        piiDetected,
        modelVersion: NLPService.MODEL_VERSION
      };

      this.logProcessingMetrics(result);
      return result;

    } catch (error) {
      this.logger.error('NLP processing failed', error as Error, {
        documentId: ocrResult.documentId
      });
      throw error;
    }
  }

  /**
   * Extract and validate named entities with confidence scoring
   */
  private async extractEntities(text: string): Promise<Entity[]> {
    const doc = await this.nlpModel(text);
    const entities: Entity[] = [];

    for (const ent of doc.ents) {
      const confidence = this.calculateEntityConfidence(ent);
      
      if (confidence >= NLPService.CONFIDENCE_THRESHOLD) {
        entities.push({
          text: ent.text,
          type: ent.label_,
          confidence,
          position: {
            start: ent.start_char,
            end: ent.end_char
          },
          context: this.extractContext(text, ent.start_char, ent.end_char),
          isPII: this.isPIIEntity(ent.text)
        });
      }
    }

    this.metrics.entityCount = entities.length;
    return entities;
  }

  /**
   * Classify content with hierarchical categories
   */
  private async classifyContent(text: string): Promise<Classification[]> {
    const doc = await this.nlpModel(text);
    const classifications: Classification[] = [];

    // Implement pharmaceutical-specific classification rules
    const categories = this.analyzePharmaCategories(doc);
    
    for (const category of categories) {
      classifications.push({
        category: category.name,
        confidence: category.confidence,
        subcategories: category.subcategories,
        hierarchy: category.hierarchy,
        rules: category.rules
      });
    }

    return classifications;
  }

  /**
   * Analyze pharmaceutical-specific categories
   */
  private analyzePharmaCategories(doc: any): any[] {
    // Implement pharmaceutical domain-specific categorization
    const categories = [];
    
    // Example categories (extend based on requirements)
    if (this.containsDrugReferences(doc)) {
      categories.push({
        name: 'DRUG_INFORMATION',
        confidence: 0.95,
        subcategories: ['DOSAGE', 'INTERACTIONS'],
        hierarchy: ['PHARMACEUTICAL', 'DRUG'],
        rules: ['DRUG_PATTERN_MATCH']
      });
    }

    if (this.containsClinicalTrials(doc)) {
      categories.push({
        name: 'CLINICAL_TRIALS',
        confidence: 0.90,
        subcategories: ['METHODOLOGY', 'RESULTS'],
        hierarchy: ['RESEARCH', 'TRIALS'],
        rules: ['TRIAL_PATTERN_MATCH']
      });
    }

    return categories;
  }

  /**
   * Detect PII information in text
   */
  private detectPII(text: string): boolean {
    return NLPService.PII_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Calculate entity confidence score
   */
  private calculateEntityConfidence(entity: any): number {
    // Implement confidence scoring logic
    const baseConfidence = entity.score || 0.8;
    const lengthFactor = Math.min(entity.text.length / 20, 1);
    return baseConfidence * lengthFactor;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(entities: Entity[], classifications: Classification[]): number {
    if (entities.length === 0 && classifications.length === 0) {
      return 0;
    }

    const entityConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / (entities.length || 1);
    const classConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0) / (classifications.length || 1);
    
    return (entityConfidence + classConfidence) / 2;
  }

  /**
   * Extract context around entity
   */
  private extractContext(text: string, start: number, end: number, windowSize: number = 50): string {
    const contextStart = Math.max(0, start - windowSize);
    const contextEnd = Math.min(text.length, end + windowSize);
    return text.slice(contextStart, contextEnd);
  }

  /**
   * Check if entity contains PII
   */
  private isPIIEntity(text: string): boolean {
    return NLPService.PII_PATTERNS.some(pattern => pattern.test(text));
  }

  /**
   * Check for drug references in document
   */
  private containsDrugReferences(doc: any): boolean {
    // Implement drug reference detection logic
    return doc.text.toLowerCase().includes('mg') || 
           doc.text.toLowerCase().includes('dosage');
  }

  /**
   * Check for clinical trial references
   */
  private containsClinicalTrials(doc: any): boolean {
    // Implement clinical trial detection logic
    return doc.text.toLowerCase().includes('trial') || 
           doc.text.toLowerCase().includes('study');
  }

  /**
   * Log processing metrics
   */
  private logProcessingMetrics(result: NLPResult): void {
    this.metrics.endTime = new Date();
    this.metrics.duration = result.processingTime;
    this.metrics.textLength = result.entities.reduce((sum, e) => sum + e.text.length, 0);

    this.logger.debug('NLP processing completed', {
      documentId: result.documentId,
      metrics: this.metrics,
      entityCount: result.entities.length,
      classificationCount: result.classifications.length,
      confidence: result.confidence,
      piiDetected: result.piiDetected
    });
  }
}

export { NLPService, NLPResult, Entity, Classification };