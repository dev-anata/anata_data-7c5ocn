/**
 * Natural Language Processing Pipeline
 * Version: 1.0.0
 * 
 * Implements a comprehensive NLP pipeline for document processing with
 * optimized performance, error handling, and monitoring capabilities.
 */

import { injectable } from 'inversify'; // v6.0.1
import { Logger } from 'winston'; // v3.8.0
import { retry } from 'retry-ts'; // v0.1.3
import { metrics } from '@opentelemetry/metrics'; // v1.0.0

import { NLPService } from '../services/nlp.service';
import { DocumentValidationPipeline } from './validation.pipeline';
import { 
  DocumentContent, 
  DocumentProcessingStatus, 
  DocumentProcessingResult,
  ProcessingMetrics 
} from '../interfaces/document.interface';
import { ValidationError } from '../../core/utils/error.util';

/**
 * Interface for NLP pipeline metrics
 */
interface NLPPipelineMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  memoryUsage: number;
  processingSteps: string[];
  retryCount: number;
  confidence: number;
}

/**
 * Enhanced NLP pipeline with comprehensive processing capabilities
 */
@injectable()
@metrics()
export class NLPPipeline {
  private readonly metrics: Map<string, NLPPipelineMetrics>;
  private static readonly PROCESSING_TIMEOUT = 120000; // 2 minutes
  private static readonly MIN_CONFIDENCE = 0.8;
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly nlpService: NLPService,
    private readonly validationPipeline: DocumentValidationPipeline,
    private readonly logger: Logger,
    private readonly metricsCollector: any
  ) {
    this.metrics = new Map();
  }

  /**
   * Process document content through NLP pipeline with comprehensive validation
   * @param document Document content to process
   * @returns Promise resolving to processing result
   */
  public async processDocument(
    document: DocumentContent
  ): Promise<DocumentProcessingResult> {
    const processingId = `nlp_${document.documentId}_${Date.now()}`;

    try {
      // Initialize processing metrics
      this.initializeMetrics(processingId);
      this.logger.info('Starting NLP processing', {
        documentId: document.documentId,
        processingId
      });

      // Validate input document
      await this.validationPipeline.validatePreProcessing(
        document.content,
        document.metadata
      );

      // Process with timeout and retry
      const result = await this.executeWithTimeout(
        async () => this.executeProcessing(document, processingId),
        NLPPipeline.PROCESSING_TIMEOUT
      );

      // Validate processing result
      await this.validationPipeline.validatePostProcessing(
        document.documentId,
        result
      );

      // Update and log metrics
      this.finalizeMetrics(processingId, result);
      return result;

    } catch (error) {
      await this.handleProcessingError(error, document.documentId, processingId);
      throw error;
    } finally {
      // Cleanup metrics
      this.cleanupMetrics(processingId);
    }
  }

  /**
   * Execute NLP processing with retry mechanism
   */
  private async executeProcessing(
    document: DocumentContent,
    processingId: string
  ): Promise<DocumentProcessingResult> {
    const metrics = this.metrics.get(processingId)!;

    return retry(
      async (attempt) => {
        metrics.retryCount = attempt - 1;
        
        // Extract and process text content
        const [entities, classifications] = await Promise.all([
          this.nlpService.extractEntities(document.content.toString()),
          this.nlpService.classifyContent(document.content.toString())
        ]);

        // Calculate confidence score
        const confidence = this.calculateConfidence(entities, classifications);
        if (confidence < NLPPipeline.MIN_CONFIDENCE) {
          throw new ValidationError(`Low confidence score: ${confidence}`);
        }

        metrics.confidence = confidence;
        metrics.processingSteps.push(`attempt_${attempt}_success`);

        return {
          documentId: document.documentId,
          status: DocumentProcessingStatus.COMPLETED,
          startTime: metrics.startTime,
          endTime: new Date(),
          processingDuration: Date.now() - metrics.startTime.getTime(),
          traceId: processingId,
          retryCount: metrics.retryCount,
          entities,
          classifications,
          confidence
        };
      },
      {
        retries: NLPPipeline.MAX_RETRIES,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000
      }
    );
  }

  /**
   * Initialize processing metrics
   */
  private initializeMetrics(processingId: string): void {
    this.metrics.set(processingId, {
      startTime: new Date(),
      memoryUsage: process.memoryUsage().heapUsed,
      processingSteps: [],
      retryCount: 0,
      confidence: 0
    });

    // Record start metric
    this.metricsCollector.recordMetric('nlp_processing_started', {
      processingId,
      timestamp: Date.now()
    });
  }

  /**
   * Finalize and record processing metrics
   */
  private finalizeMetrics(
    processingId: string,
    result: DocumentProcessingResult
  ): void {
    const metrics = this.metrics.get(processingId)!;
    metrics.endTime = new Date();
    metrics.duration = Date.now() - metrics.startTime.getTime();

    this.logger.info('NLP processing completed', {
      processingId,
      documentId: result.documentId,
      duration: metrics.duration,
      retryCount: metrics.retryCount,
      confidence: metrics.confidence,
      steps: metrics.processingSteps
    });

    // Record completion metrics
    this.metricsCollector.recordMetric('nlp_processing_completed', {
      processingId,
      duration: metrics.duration,
      confidence: metrics.confidence,
      retryCount: metrics.retryCount
    });
  }

  /**
   * Handle processing errors with detailed logging
   */
  private async handleProcessingError(
    error: Error,
    documentId: string,
    processingId: string
  ): Promise<void> {
    const metrics = this.metrics.get(processingId);
    
    this.logger.error('NLP processing failed', {
      documentId,
      processingId,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics
    });

    // Record error metrics
    this.metricsCollector.recordMetric('nlp_processing_error', {
      processingId,
      errorType: error.constructor.name,
      retryCount: metrics?.retryCount || 0
    });
  }

  /**
   * Execute processing with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Processing timeout after ${timeout}ms`));
        }, timeout);
      })
    ]);
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(entities: any[], classifications: any[]): number {
    if (entities.length === 0 && classifications.length === 0) {
      return 0;
    }

    const entityConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / 
      (entities.length || 1);
    const classConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0) / 
      (classifications.length || 1);

    return (entityConfidence + classConfidence) / 2;
  }

  /**
   * Cleanup processing metrics
   */
  private cleanupMetrics(processingId: string): void {
    this.metrics.delete(processingId);
  }
}