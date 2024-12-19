/**
 * Enhanced Tesseract OCR Service Implementation
 * Version: 1.0.0
 * 
 * Provides high-performance OCR text extraction using Tesseract.js with support for
 * worker pool management, chunked processing, and comprehensive error handling.
 */

import { injectable } from 'inversify'; // v6.0.1
import { createWorker, createScheduler, PSM, OEM, Worker, Scheduler } from 'tesseract.js'; // v4.0.0
import { AbstractOCRService } from './ocr.service';
import { OCRConfig, OCRResult, OCRPageSegmentationMode, OCREngineMode } from '../interfaces/ocr.interface';
import { DocumentContent } from '../interfaces/document.interface';
import { LoggerService } from '../../core/logging/logger.service';

@injectable()
export class TesseractService extends AbstractOCRService {
  private scheduler: Scheduler | null = null;
  private workers: Worker[] = [];
  private readonly DEFAULT_WORKER_COUNT = 4;
  private readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor(protected logger: LoggerService) {
    super(logger);
  }

  /**
   * Process document using optimized Tesseract OCR with worker pool
   * @param document Document content to process
   * @param config OCR configuration options
   * @returns Promise resolving to OCR processing result
   */
  public async processDocument(
    document: DocumentContent,
    config: OCRConfig
  ): Promise<OCRResult> {
    const startTime = Date.now();
    let workers: Worker[] = [];

    try {
      // Validate configuration
      this.validateConfig(config);

      // Initialize processing state
      this.initializeProcessing(document.documentId, config);

      // Initialize worker pool
      const workerCount = config.optimizations?.workerThreads || this.DEFAULT_WORKER_COUNT;
      workers = await this.initializeWorkerPool(workerCount, config);
      this.scheduler = createScheduler();
      workers.forEach(worker => this.scheduler!.addWorker(worker));

      // Split document into chunks for parallel processing
      const chunks = this.splitDocumentIntoChunks(document.content, this.DEFAULT_CHUNK_SIZE);
      const totalChunks = chunks.length;

      // Process chunks in parallel
      const chunkResults = await Promise.all(
        chunks.map(async (chunk, index) => {
          try {
            const result = await this.processChunk(chunk, index, totalChunks);
            this.updateProgress(document.documentId, (index + 1) / totalChunks * 100);
            return result;
          } catch (error) {
            await this.logger.error('Chunk processing failed', error as Error, {
              documentId: document.documentId,
              chunkIndex: index
            });
            throw error;
          }
        })
      );

      // Aggregate results
      const aggregatedResult = this.aggregateResults(chunkResults, document.documentId);
      const processingTime = Date.now() - startTime;

      return {
        documentId: document.documentId,
        text: aggregatedResult.text,
        confidence: aggregatedResult.confidence,
        processedAt: new Date(),
        processingTime,
        pageResults: aggregatedResult.pageResults,
        metrics: {
          memoryUsage: process.memoryUsage().heapUsed,
          cpuUtilization: 0, // Would require actual CPU monitoring
          retryCount: 0
        }
      };

    } catch (error) {
      await this.logger.error('Document processing failed', error as Error, {
        documentId: document.documentId
      });
      throw error;

    } finally {
      // Cleanup resources
      await this.cleanupResources(workers);
      this.cleanupProcessingState(document.documentId);
    }
  }

  /**
   * Initialize worker pool with configured settings
   * @param workerCount Number of workers to initialize
   * @param config OCR configuration
   */
  private async initializeWorkerPool(workerCount: number, config: OCRConfig): Promise<Worker[]> {
    const workers: Worker[] = [];

    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = await createWorker({
          logger: progress => {
            this.logger.debug('Worker progress', { progress });
          },
          errorHandler: error => {
            this.logger.error('Worker error', error as Error);
          }
        });

        // Initialize worker with configuration
        await worker.loadLanguage(config.language.join('+'));
        await worker.initialize(config.language.join('+'));
        await worker.setParameters({
          tessedit_pageseg_mode: this.mapPageSegmentationMode(config.pageSegmentationMode),
          tessedit_ocr_engine_mode: this.mapEngineMode(config.engineMode)
        });

        workers.push(worker);
      } catch (error) {
        await this.logger.error('Worker initialization failed', error as Error);
        throw error;
      }
    }

    return workers;
  }

  /**
   * Process a single document chunk
   * @param chunk Document chunk to process
   * @param index Chunk index
   * @param totalChunks Total number of chunks
   */
  private async processChunk(
    chunk: Buffer,
    index: number,
    totalChunks: number
  ): Promise<any> {
    let retries = 0;
    
    while (retries < this.MAX_RETRIES) {
      try {
        const result = await this.scheduler!.addJob('recognize', chunk);
        return result;
      } catch (error) {
        retries++;
        if (retries === this.MAX_RETRIES) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }
  }

  /**
   * Split document into processable chunks
   * @param content Document content
   * @param chunkSize Size of each chunk in bytes
   */
  private splitDocumentIntoChunks(content: Buffer, chunkSize: number): Buffer[] {
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < content.length) {
      chunks.push(content.slice(offset, offset + chunkSize));
      offset += chunkSize;
    }

    return chunks;
  }

  /**
   * Aggregate results from multiple chunks
   * @param results Array of chunk processing results
   * @param documentId Document identifier
   */
  private aggregateResults(results: any[], documentId: string): any {
    let totalConfidence = 0;
    let combinedText = '';
    const pageResults = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      combinedText += result.data.text + ' ';
      totalConfidence += result.data.confidence;
      
      pageResults.push({
        pageNumber: i + 1,
        text: result.data.text,
        confidence: result.data.confidence,
        processingTime: result.data.times.total
      });
    }

    return {
      text: combinedText.trim(),
      confidence: totalConfidence / results.length,
      pageResults
    };
  }

  /**
   * Cleanup worker pool and resources
   * @param workers Array of workers to cleanup
   */
  private async cleanupResources(workers: Worker[]): Promise<void> {
    try {
      if (this.scheduler) {
        await this.scheduler.terminate();
        this.scheduler = null;
      }

      await Promise.all(
        workers.map(worker => worker.terminate())
      );
    } catch (error) {
      await this.logger.error('Resource cleanup failed', error as Error);
    }
  }

  /**
   * Map page segmentation mode to Tesseract PSM
   * @param mode OCR page segmentation mode
   */
  private mapPageSegmentationMode(mode: OCRPageSegmentationMode): PSM {
    const mapping: Record<OCRPageSegmentationMode, PSM> = {
      [OCRPageSegmentationMode.AUTO]: PSM.AUTO,
      [OCRPageSegmentationMode.SINGLE_BLOCK]: PSM.SINGLE_BLOCK,
      [OCRPageSegmentationMode.SINGLE_COLUMN]: PSM.SINGLE_COLUMN,
      [OCRPageSegmentationMode.SINGLE_LINE]: PSM.SINGLE_LINE,
      [OCRPageSegmentationMode.SPARSE_TEXT]: PSM.SPARSE_TEXT,
      [OCRPageSegmentationMode.DENSE_TEXT]: PSM.SPARSE_TEXT_OSD
    };
    return mapping[mode] || PSM.AUTO;
  }

  /**
   * Map engine mode to Tesseract OEM
   * @param mode OCR engine mode
   */
  private mapEngineMode(mode: OCREngineMode): OEM {
    const mapping: Record<OCREngineMode, OEM> = {
      [OCREngineMode.TESSERACT_ONLY]: OEM.TESSERACT_ONLY,
      [OCREngineMode.LSTM_ONLY]: OEM.LSTM_ONLY,
      [OCREngineMode.TESSERACT_LSTM_COMBINED]: OEM.DEFAULT,
      [OCREngineMode.FAST_LSTM]: OEM.LSTM_ONLY
    };
    return mapping[mode] || OEM.DEFAULT;
  }
}