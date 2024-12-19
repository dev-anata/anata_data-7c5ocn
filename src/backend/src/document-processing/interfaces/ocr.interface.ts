/**
 * OCR (Optical Character Recognition) Interfaces
 * Version: 1.0.0
 * 
 * Defines core interfaces for OCR operations in the Pharmaceutical Data Pipeline Platform
 * with comprehensive type safety, performance optimization, and monitoring capabilities.
 */

import { DocumentContent } from '../interfaces/document.interface';
import { Buffer } from 'buffer'; // v1.x.x

/**
 * Enhanced enum for OCR page segmentation modes with optimized accuracy settings
 */
export enum OCRPageSegmentationMode {
  AUTO = 0,                // Automatic page segmentation
  SINGLE_BLOCK = 1,        // Single uniform block of text
  SINGLE_COLUMN = 2,       // Single column of text of variable sizes
  SINGLE_LINE = 3,         // Single line of text
  SPARSE_TEXT = 4,         // Sparse text with no specific arrangement
  DENSE_TEXT = 5          // Dense text with no specific arrangement
}

/**
 * Enhanced enum for OCR engine modes with performance optimizations
 */
export enum OCREngineMode {
  TESSERACT_ONLY = 0,           // Legacy Tesseract engine
  LSTM_ONLY = 1,                // Neural net LSTM engine only
  TESSERACT_LSTM_COMBINED = 2,  // Tesseract + LSTM engines combined
  FAST_LSTM = 3                 // Fast LSTM engine with reduced accuracy
}

/**
 * Interface for OCR preprocessing options to enhance recognition quality
 */
export interface PreprocessingOptions {
  /** Enable image deskewing */
  deskew?: boolean;
  
  /** Noise reduction level (0-100) */
  noiseReduction?: number;
  
  /** Contrast adjustment level (-100 to 100) */
  contrast?: number;
  
  /** Enable automatic rotation correction */
  autoRotate?: boolean;
  
  /** Image scaling factor for better recognition */
  scaleFactor?: number;
}

/**
 * Enhanced interface for OCR configuration with performance tuning options
 */
export interface OCRConfig {
  /** Languages to use for recognition */
  language: string[];
  
  /** Image DPI for processing */
  dpi: number;
  
  /** Page segmentation mode */
  pageSegmentationMode: OCRPageSegmentationMode;
  
  /** OCR engine mode */
  engineMode: OCREngineMode;
  
  /** Processing timeout in milliseconds */
  timeout: number;
  
  /** Preprocessing options for image enhancement */
  preprocessingOptions?: PreprocessingOptions;
  
  /** Performance optimization flags */
  optimizations?: {
    /** Enable parallel processing */
    enableParallel: boolean;
    /** Number of worker threads */
    workerThreads?: number;
    /** Enable GPU acceleration if available */
    enableGpu?: boolean;
  };
}

/**
 * Interface for individual page OCR results
 */
export interface PageResult {
  /** Page number */
  pageNumber: number;
  
  /** Extracted text content */
  text: string;
  
  /** Recognition confidence (0-100) */
  confidence: number;
  
  /** Processing time in milliseconds */
  processingTime: number;
  
  /** Detected text regions */
  regions?: Array<{
    /** Region bounding box coordinates */
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    /** Region text content */
    text: string;
    /** Region confidence score */
    confidence: number;
  }>;
}

/**
 * Enhanced interface for OCR results with detailed metrics
 */
export interface OCRResult {
  /** Document identifier */
  documentId: string;
  
  /** Extracted text content */
  text: string;
  
  /** Overall confidence score (0-100) */
  confidence: number;
  
  /** Processing timestamp */
  processedAt: Date;
  
  /** Total processing time in milliseconds */
  processingTime: number;
  
  /** Individual page results */
  pageResults: Array<PageResult>;
  
  /** Processing metrics */
  metrics?: {
    /** Memory usage in bytes */
    memoryUsage: number;
    /** CPU utilization percentage */
    cpuUtilization: number;
    /** Number of retries */
    retryCount: number;
  };
}

/**
 * Interface for OCR processing progress tracking
 */
export interface OCRProgress {
  /** Document identifier */
  documentId: string;
  
  /** Processing stage */
  stage: 'PREPROCESSING' | 'RECOGNITION' | 'POSTPROCESSING';
  
  /** Progress percentage (0-100) */
  progress: number;
  
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  
  /** Current page being processed */
  currentPage?: number;
  
  /** Total pages to process */
  totalPages?: number;
}

/**
 * Interface for OCR performance metrics
 */
export interface OCRMetrics {
  /** Document identifier */
  documentId: string;
  
  /** Processing timestamps */
  timing: {
    startTime: Date;
    endTime?: Date;
    duration?: number;
  };
  
  /** Resource utilization */
  resources: {
    memoryUsage: number;
    cpuUtilization: number;
    gpuUtilization?: number;
  };
  
  /** Quality metrics */
  quality: {
    averageConfidence: number;
    errorRate: number;
    retryCount: number;
  };
}

/**
 * Enhanced interface for OCR service operations with monitoring capabilities
 */
export interface OCRService {
  /**
   * Process a document using OCR with performance optimization
   * @param document Document content to process
   * @param config OCR configuration options
   * @returns Promise resolving to OCR processing result
   */
  processDocument(
    document: DocumentContent,
    config: OCRConfig
  ): Promise<OCRResult>;
  
  /**
   * Get detailed progress of document processing
   * @param documentId Document identifier
   * @returns Promise resolving to processing progress
   */
  getProgress(
    documentId: string
  ): Promise<OCRProgress>;
  
  /**
   * Cancel ongoing OCR processing with cleanup
   * @param documentId Document identifier
   */
  cancelProcessing(
    documentId: string
  ): Promise<void>;
  
  /**
   * Get performance metrics for OCR processing
   * @param documentId Document identifier
   * @returns Promise resolving to OCR metrics
   */
  getMetrics(
    documentId: string
  ): Promise<OCRMetrics>;
}