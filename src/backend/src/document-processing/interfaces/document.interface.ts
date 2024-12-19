/**
 * Document Processing Interfaces
 * Version: 1.0.0
 * 
 * Defines core interfaces for document processing operations in the 
 * Pharmaceutical Data Pipeline Platform with comprehensive type safety
 * and production-ready features.
 */

import { StorageFile } from '../../types/gcp';
import { Buffer } from 'buffer';

/**
 * Document metadata interface with comprehensive tracking and compliance features
 */
export interface DocumentMetadata {
  /** Original filename of the document */
  readonly fileName: string;
  
  /** MIME type of the document */
  readonly mimeType: string;
  
  /** Size of document in bytes */
  readonly size: number;
  
  /** Timestamp of document upload */
  readonly uploadedAt: Date;
  
  /** Source system or user that uploaded the document */
  readonly source: string;
  
  /** Document schema/format version */
  readonly version: string;
  
  /** Data retention policy identifier */
  readonly retentionPolicy: string;
  
  /** Compliance and regulatory flags */
  readonly complianceFlags: string[];
}

/**
 * Document content interface with integrity verification
 */
export interface DocumentContent {
  /** Unique document identifier */
  readonly documentId: string;
  
  /** Binary content of the document */
  readonly content: Buffer;
  
  /** Document metadata */
  readonly metadata: DocumentMetadata;
  
  /** SHA-256 checksum for content verification */
  readonly checksum: string;
}

/**
 * Enhanced enum for detailed document processing status tracking
 */
export enum DocumentProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  VALIDATING = 'VALIDATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING'
}

/**
 * Interface for document processing errors with detailed classification
 */
export interface DocumentProcessingError {
  /** Error code for classification */
  readonly code: string;
  
  /** Human-readable error message */
  readonly message: string;
  
  /** Detailed error information */
  readonly details?: Record<string, any>;
  
  /** Stack trace for debugging */
  readonly stack?: string;
  
  /** Timestamp when error occurred */
  readonly timestamp: Date;
}

/**
 * Comprehensive interface for document processing results with observability
 */
export interface DocumentProcessingResult {
  /** Document identifier */
  readonly documentId: string;
  
  /** Current processing status */
  readonly status: DocumentProcessingStatus;
  
  /** Processing start timestamp */
  readonly startTime: Date;
  
  /** Processing end timestamp */
  readonly endTime: Date;
  
  /** Processing error details if failed */
  readonly error?: DocumentProcessingError;
  
  /** Number of retry attempts */
  readonly retryCount: number;
  
  /** Processing duration in milliseconds */
  readonly processingDuration: number;
  
  /** Distributed tracing identifier */
  readonly traceId: string;
}

/**
 * Interface for document storage location with disaster recovery support
 */
export interface DocumentStorageLocation {
  /** Storage bucket identifier */
  readonly bucket: string;
  
  /** Document path within bucket */
  readonly path: string;
  
  /** GCP storage file reference */
  readonly storageFile: StorageFile;
  
  /** Geographic region of storage */
  readonly region: string;
  
  /** Backup storage location */
  readonly backupLocation?: string;
}

/**
 * Options for document upload operations
 */
export interface UploadOptions {
  /** Priority level for processing */
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** Custom metadata fields */
  customMetadata?: Record<string, string>;
  
  /** Processing pipeline configuration */
  processingConfig?: {
    /** Enable OCR processing */
    enableOcr?: boolean;
    /** Enable NLP analysis */
    enableNlp?: boolean;
    /** Custom processing parameters */
    parameters?: Record<string, any>;
  };
}

/**
 * Interface for batch document operations
 */
export interface DocumentBatch {
  /** Batch identifier */
  readonly batchId: string;
  
  /** Documents in batch */
  readonly documents: DocumentContent[];
  
  /** Batch metadata */
  readonly metadata: {
    /** Total number of documents */
    readonly totalDocuments: number;
    /** Batch creation timestamp */
    readonly createdAt: Date;
    /** Batch priority */
    readonly priority: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

/**
 * Interface for batch upload results
 */
export interface BatchUploadResult {
  /** Batch identifier */
  readonly batchId: string;
  
  /** Individual document upload results */
  readonly results: Array<{
    /** Document identifier */
    readonly documentId: string;
    /** Upload success status */
    readonly success: boolean;
    /** Error details if failed */
    readonly error?: DocumentProcessingError;
  }>;
  
  /** Batch statistics */
  readonly stats: {
    /** Number of successful uploads */
    readonly successCount: number;
    /** Number of failed uploads */
    readonly failureCount: number;
    /** Total processing time */
    readonly totalDuration: number;
  };
}

/**
 * Options for document retrieval operations
 */
export interface GetOptions {
  /** Include document content */
  includeContent?: boolean;
  
  /** Use cached version if available */
  useCache?: boolean;
  
  /** Maximum age of cached version in seconds */
  maxCacheAge?: number;
}

/**
 * Document service interface for processing operations
 */
export interface DocumentService {
  /**
   * Upload a document for processing
   * @param content Document binary content
   * @param metadata Document metadata
   * @param options Upload options
   * @returns Promise resolving to uploaded document content
   */
  uploadDocument(
    content: Buffer,
    metadata: DocumentMetadata,
    options?: UploadOptions
  ): Promise<DocumentContent>;
  
  /**
   * Upload multiple documents in batch
   * @param documents Batch of documents to upload
   * @returns Promise resolving to batch upload results
   */
  uploadDocumentBatch(
    documents: DocumentBatch[]
  ): Promise<BatchUploadResult>;
  
  /**
   * Retrieve a document by ID
   * @param documentId Document identifier
   * @param options Retrieval options
   * @returns Promise resolving to document content
   */
  getDocument(
    documentId: string,
    options?: GetOptions
  ): Promise<DocumentContent>;
  
  /**
   * Get document processing status
   * @param documentId Document identifier
   * @returns Promise resolving to processing status
   */
  getProcessingStatus(
    documentId: string
  ): Promise<DocumentProcessingResult>;
}