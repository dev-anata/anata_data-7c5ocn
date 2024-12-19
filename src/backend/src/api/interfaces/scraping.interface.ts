// External Dependencies
// None required

// Internal Dependencies
import { ScrapingConfig } from '../../scraping/interfaces/config.interface';
import { ScrapingJob, JobStatus as ScrapingJobStatus } from '../../scraping/interfaces/job.interface';
import { ScrapingResult } from '../../scraping/interfaces/result.interface';

/**
 * Enhanced error response interface for scraping API endpoints
 * Provides standardized error handling with detailed context
 */
export interface ScrapingErrorResponse {
  /** Unique error identifier for tracking */
  errorId: string;
  /** Error classification code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Timestamp when error occurred */
  occurredAt: Date;
  /** Additional error context and details */
  details?: Record<string, unknown>;
  /** Validation error details if applicable */
  validationErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Enhanced pagination parameters interface
 * Provides comprehensive pagination options with sorting support
 */
export interface ScrapingPaginationParams {
  /** Page number (1-based) */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Field to sort by */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Cursor for cursor-based pagination */
  cursor?: string;
  /** Additional filtering options */
  filters?: Record<string, unknown>;
}

/**
 * Interface for creating a new scraping job
 * Provides comprehensive job configuration options
 */
export interface CreateScrapingJobRequest {
  /** Job configuration settings */
  config: ScrapingConfig;
  /** Optional job priority */
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Optional callback URL for job completion notification */
  callbackUrl?: string;
  /** Optional job tags for organization */
  tags?: string[];
}

/**
 * Interface for scraping job creation response
 * Provides immediate job status after creation
 */
export interface CreateScrapingJobResponse {
  /** Unique job identifier */
  jobId: string;
  /** Initial job status */
  status: ScrapingJobStatus;
  /** Job creation timestamp */
  createdAt: Date;
  /** Estimated start time */
  estimatedStartTime?: Date;
}

/**
 * Interface for retrieving job status and results
 * Provides comprehensive job execution details
 */
export interface GetScrapingJobResponse {
  /** Job details */
  job: ScrapingJob;
  /** Scraping results if available */
  results?: ScrapingResult[];
  /** Job execution metrics */
  metrics?: {
    progress: number;
    duration: number;
    resourceUsage: {
      cpu: number;
      memory: number;
      bandwidth: number;
    };
  };
}

/**
 * Interface for listing scraping jobs
 * Provides comprehensive filtering and pagination options
 */
export interface ListScrapingJobsRequest extends ScrapingPaginationParams {
  /** Filter by job status */
  status?: ScrapingJobStatus;
  /** Filter by date range */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** Filter by source type */
  sourceType?: string;
  /** Filter by tags */
  tags?: string[];
}

/**
 * Interface for job listing response
 * Provides paginated results with comprehensive metadata
 */
export interface ListScrapingJobsResponse {
  /** List of jobs matching criteria */
  jobs: ScrapingJob[];
  /** Total number of jobs matching criteria */
  totalCount: number;
  /** Flag indicating more results available */
  hasMore: boolean;
  /** Next page cursor if applicable */
  nextCursor?: string;
  /** Response metadata */
  metadata: {
    /** Query execution time */
    queryTime: number;
    /** Applied filters */
    filters: Record<string, unknown>;
    /** Current page information */
    pagination: {
      currentPage: number;
      pageSize: number;
      totalPages: number;
    };
  };
}

/**
 * Interface for cancelling a scraping job
 * Provides options for graceful shutdown
 */
export interface CancelScrapingJobRequest {
  /** Job identifier to cancel */
  jobId: string;
  /** Optional reason for cancellation */
  reason?: string;
  /** Force immediate cancellation */
  force?: boolean;
}

/**
 * Interface for job cancellation response
 * Provides cancellation confirmation and status
 */
export interface CancelScrapingJobResponse {
  /** Cancelled job identifier */
  jobId: string;
  /** New job status */
  status: ScrapingJobStatus;
  /** Cancellation timestamp */
  cancelledAt: Date;
  /** Resources cleaned up successfully */
  resourcesCleanedUp: boolean;
}