/**
 * Abstract OCR Service Implementation
 * Version: 1.0.0
 * 
 * Provides a comprehensive base implementation for document text extraction
 * with support for multiple OCR engines, progress tracking, cancellation,
 * performance monitoring, and error handling.
 */

import { injectable } from 'inversify'; // v6.0.1
import { OCRService, OCRConfig, OCRResult, OCRProgress, OCRPageSegmentationMode, OCREngineMode } from '../interfaces/ocr.interface';
import { DocumentContent } from '../interfaces/document.interface';
import { LoggerService } from '../../core/logging/logger.service';

@injectable()
export abstract class AbstractOCRService implements OCRService {
  // Processing state maps
  protected processingProgress: Map<string, number> = new Map();
  protected cancelRequests: Map<string, boolean> = new Map();
  protected retryAttempts: Map<string, number> = new Map();
  protected processingStartTime: Map<string, Date> = new Map();
  protected timeoutHandlers: Map<string, NodeJS.Timeout> = new Map();

  // Default configuration values
  private static readonly DEFAULT_TIMEOUT = 120000; // 2 minutes
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY = 1000; // 1 second

  constructor(protected logger: LoggerService) {}

  /**
   * Abstract method to be implemented by specific OCR engine implementations
   * @param document Document content to process
   * @param config OCR configuration options
   */
  public abstract processDocument(
    document: DocumentContent,
    config: OCRConfig
  ): Promise<OCRResult>;

  /**
   * Get detailed progress of document processing
   * @param documentId Document identifier
   * @returns Current processing progress
   */
  public async getProgress(documentId: string): Promise<OCRProgress> {
    try {
      if (!this.processingProgress.has(documentId)) {
        throw new Error(`No processing found for document ID: ${documentId}`);
      }

      const progress = this.processingProgress.get(documentId) || 0;
      const startTime = this.processingStartTime.get(documentId);
      const currentTime = new Date();
      const processingDuration = startTime ? currentTime.getTime() - startTime.getTime() : 0;

      // Calculate estimated time remaining based on current progress
      const estimatedTimeRemaining = progress > 0 
        ? (processingDuration / progress) * (100 - progress)
        : undefined;

      return {
        documentId,
        stage: this.determineProcessingStage(progress),
        progress,
        estimatedTimeRemaining,
        currentPage: Math.floor((progress / 100) * this.getTotalPages(documentId)),
        totalPages: this.getTotalPages(documentId)
      };
    } catch (error) {
      await this.logger.error('Error getting OCR progress', error as Error, {
        documentId,
        component: 'OCRService'
      });
      throw error;
    }
  }

  /**
   * Cancel ongoing OCR processing
   * @param documentId Document identifier
   */
  public async cancelProcessing(documentId: string): Promise<void> {
    try {
      if (!this.processingProgress.has(documentId)) {
        throw new Error(`No processing found for document ID: ${documentId}`);
      }

      this.cancelRequests.set(documentId, true);
      
      // Clear timeout handler if exists
      const timeoutHandler = this.timeoutHandlers.get(documentId);
      if (timeoutHandler) {
        clearTimeout(timeoutHandler);
        this.timeoutHandlers.delete(documentId);
      }

      await this.logger.info('OCR processing cancelled', {
        documentId,
        component: 'OCRService'
      });

      await this.cleanupProcessingState(documentId);
    } catch (error) {
      await this.logger.error('Error cancelling OCR processing', error as Error, {
        documentId,
        component: 'OCRService'
      });
      throw error;
    }
  }

  /**
   * Initialize processing state for a document
   * @param documentId Document identifier
   * @param config OCR configuration
   */
  protected initializeProcessing(documentId: string, config: OCRConfig): void {
    this.processingProgress.set(documentId, 0);
    this.cancelRequests.set(documentId, false);
    this.retryAttempts.set(documentId, 0);
    this.processingStartTime.set(documentId, new Date());

    // Set processing timeout
    const timeout = config.timeoutSeconds 
      ? config.timeoutSeconds * 1000 
      : AbstractOCRService.DEFAULT_TIMEOUT;

    const timeoutHandler = setTimeout(
      () => this.handleProcessingTimeout(documentId),
      timeout
    );
    this.timeoutHandlers.set(documentId, timeoutHandler);
  }

  /**
   * Update processing progress
   * @param documentId Document identifier
   * @param progress Progress percentage
   */
  protected updateProgress(documentId: string, progress: number): void {
    this.processingProgress.set(documentId, Math.min(Math.max(progress, 0), 100));
  }

  /**
   * Check if processing should be cancelled
   * @param documentId Document identifier
   */
  protected shouldCancel(documentId: string): boolean {
    return this.cancelRequests.get(documentId) || false;
  }

  /**
   * Handle processing timeout
   * @param documentId Document identifier
   */
  protected async handleProcessingTimeout(documentId: string): Promise<void> {
    try {
      await this.logger.warn('OCR processing timeout', {
        documentId,
        duration: this.getProcessingDuration(documentId),
        component: 'OCRService'
      });

      await this.cancelProcessing(documentId);
      throw new Error(`OCR processing timeout for document ID: ${documentId}`);
    } catch (error) {
      await this.logger.error('Error handling OCR timeout', error as Error, {
        documentId,
        component: 'OCRService'
      });
      throw error;
    }
  }

  /**
   * Clean up processing state
   * @param documentId Document identifier
   */
  protected cleanupProcessingState(documentId: string): void {
    this.processingProgress.delete(documentId);
    this.cancelRequests.delete(documentId);
    this.retryAttempts.delete(documentId);
    this.processingStartTime.delete(documentId);
    
    const timeoutHandler = this.timeoutHandlers.get(documentId);
    if (timeoutHandler) {
      clearTimeout(timeoutHandler);
      this.timeoutHandlers.delete(documentId);
    }
  }

  /**
   * Get processing duration in milliseconds
   * @param documentId Document identifier
   */
  private getProcessingDuration(documentId: string): number {
    const startTime = this.processingStartTime.get(documentId);
    return startTime ? new Date().getTime() - startTime.getTime() : 0;
  }

  /**
   * Determine current processing stage based on progress
   * @param progress Current progress percentage
   */
  private determineProcessingStage(progress: number): 'PREPROCESSING' | 'RECOGNITION' | 'POSTPROCESSING' {
    if (progress < 20) return 'PREPROCESSING';
    if (progress < 90) return 'RECOGNITION';
    return 'POSTPROCESSING';
  }

  /**
   * Get total pages for a document
   * @param documentId Document identifier
   */
  private getTotalPages(documentId: string): number {
    // This should be implemented based on document metadata
    // Placeholder implementation
    return 1;
  }

  /**
   * Validate OCR configuration
   * @param config OCR configuration to validate
   */
  protected validateConfig(config: OCRConfig): void {
    if (!config.language || config.language.length === 0) {
      throw new Error('OCR configuration must specify at least one language');
    }

    if (!config.dpi || config.dpi < 72) {
      throw new Error('OCR configuration must specify DPI >= 72');
    }

    if (config.pageSegmentationMode === undefined) {
      throw new Error('OCR configuration must specify page segmentation mode');
    }

    if (config.engineMode === undefined) {
      throw new Error('OCR configuration must specify engine mode');
    }
  }
}