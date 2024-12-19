// External Dependencies
import { ScrapingConfig } from './config.interface';

/**
 * Enumeration of all possible job execution states
 * Provides comprehensive status tracking for job lifecycle
 */
export enum JobStatus {
  PENDING = 'PENDING',       // Initial state, job created but not yet scheduled
  SCHEDULED = 'SCHEDULED',   // Job is scheduled for future execution
  RUNNING = 'RUNNING',       // Job is currently executing
  COMPLETED = 'COMPLETED',   // Job finished successfully
  FAILED = 'FAILED',        // Job failed with unrecoverable error
  CANCELLED = 'CANCELLED',   // Job was manually cancelled
  RETRYING = 'RETRYING'     // Job failed but will retry
}

/**
 * Enumeration of error categories for job failure classification
 * Enables structured error handling and reporting
 */
export enum ErrorCategory {
  NETWORK = 'NETWORK',           // Network connectivity issues
  TIMEOUT = 'TIMEOUT',           // Operation timeout errors
  VALIDATION = 'VALIDATION',     // Data validation failures
  AUTHENTICATION = 'AUTH',       // Authentication/authorization errors
  RATE_LIMIT = 'RATE_LIMIT',    // Rate limiting violations
  SYSTEM = 'SYSTEM'             // Internal system errors
}

/**
 * Interface for detailed error tracking and categorization
 * Provides comprehensive error context for debugging and monitoring
 */
export interface JobError {
  /** Unique error identifier */
  code: string;
  /** Error classification category */
  category: ErrorCategory;
  /** Human-readable error description */
  message: string;
  /** Error stack trace for debugging */
  stack: string;
  /** Error occurrence timestamp */
  timestamp: Date;
  /** Indicates if error is recoverable */
  retryable: boolean;
  /** Additional error context */
  context: Record<string, unknown>;
}

/**
 * Interface for job performance metrics
 * Tracks comprehensive execution statistics
 */
export interface JobMetrics {
  /** Total number of HTTP requests made */
  requestCount: number;
  /** Total bytes processed */
  bytesProcessed: number;
  /** Number of items successfully scraped */
  itemsScraped: number;
  /** Number of errors encountered */
  errorCount: number;
  /** Average response time in milliseconds */
  avgResponseTime: number;
  /** Percentage of successful operations */
  successRate: number;
  /** Network bandwidth usage in bytes */
  bandwidthUsage: number;
  /** Percentage of operations that required retry */
  retryRate: number;
}

/**
 * Interface for tracking job execution details
 * Provides comprehensive execution context and progress tracking
 */
export interface JobExecutionDetails {
  /** Job execution start time */
  startTime: Date;
  /** Job execution end time */
  endTime: Date;
  /** Total execution duration in milliseconds */
  duration: number;
  /** Number of execution attempts */
  attempts: number;
  /** Latest error information if failed */
  error?: JobError;
  /** Job performance metrics */
  metrics: JobMetrics;
  /** Latest execution checkpoint */
  lastCheckpoint: string;
  /** Job completion percentage (0-100) */
  progress: number;
}

/**
 * Main interface for scraping job management
 * Provides comprehensive job tracking and configuration
 */
export interface ScrapingJob {
  /** Unique job identifier */
  id: string;
  /** Job configuration settings */
  config: ScrapingConfig;
  /** Current job status */
  status: JobStatus;
  /** Job creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Detailed execution information */
  executionDetails: JobExecutionDetails;
  /** Number of retry attempts */
  retryCount: number;
  /** Timestamp of last retry attempt */
  lastRetryAt?: Date;
}