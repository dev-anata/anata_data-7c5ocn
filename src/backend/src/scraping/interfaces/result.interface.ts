// External Dependencies
// None required

// Internal Dependencies
import { StorageFile } from '../../../types/gcp';
import { ScrapingJob } from './job.interface';
import { ScrapingSourceType } from './config.interface';

/**
 * Interface for tracking processing steps in the data pipeline
 * Provides detailed history of data transformations and validations
 */
interface ProcessingStep {
  /** Step identifier */
  stepId: string;
  /** Processing operation type */
  operation: 'EXTRACT' | 'TRANSFORM' | 'VALIDATE' | 'LOAD';
  /** Timestamp of step execution */
  timestamp: Date;
  /** Processing duration in milliseconds */
  duration: number;
  /** Step status */
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  /** Optional error information */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Interface for tracking result storage locations and metadata
 * Provides comprehensive storage tracking with versioning and security
 */
export interface ResultStorage {
  /** Raw data storage file information */
  rawFile: StorageFile;
  /** Processed data storage file information */
  processedFile: StorageFile;
  /** BigQuery table identifier for structured data */
  bigQueryTable: string;
  /** Data schema version */
  version: string;
  /** Compression algorithm used */
  compressionType: string;
  /** KMS encryption key identifier */
  encryptionKey: string;
}

/**
 * Interface for comprehensive result metadata tracking
 * Includes data quality metrics and processing history
 */
export interface ResultMetadata {
  /** Total size in bytes */
  size: number;
  /** Number of items in result */
  itemCount: number;
  /** Data format (JSON, CSV, etc.) */
  format: string;
  /** Content MIME type */
  contentType: string;
  /** Data integrity checksum */
  checksum: string;
  /** Data validation status */
  validationStatus: 'VALID' | 'INVALID' | 'PARTIAL';
  /** Data quality metrics */
  qualityMetrics: {
    /** Percentage of complete records */
    completeness: number;
    /** Percentage of accurate data */
    accuracy: number;
    /** Data consistency score */
    consistency: number;
    /** Data freshness score */
    freshness: number;
    /** Custom quality metrics */
    [key: string]: number;
  };
  /** Processing step history */
  processingHistory: ProcessingStep[];
}

/**
 * Main interface for scraping result data
 * Provides comprehensive tracking of scraped data with enhanced validation
 */
export interface ScrapingResult {
  /** Unique result identifier */
  id: string;
  /** Reference to parent scraping job */
  jobId: ScrapingJob['id'];
  /** Type of data source */
  sourceType: ScrapingSourceType;
  /** Source URL or identifier */
  sourceUrl: string;
  /** Result creation timestamp */
  timestamp: Date;
  /** Storage location information */
  storage: ResultStorage;
  /** Comprehensive result metadata */
  metadata: ResultMetadata;
}