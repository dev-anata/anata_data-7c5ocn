// External Dependencies
import { z } from 'zod'; // v3.20.0

// Internal Dependencies
import { CreateScrapingJobRequest, ListScrapingJobsRequest } from '../interfaces/scraping.interface';
import { ScrapingConfig } from '../../scraping/interfaces/config.interface';

/**
 * Validation schema for scraping job status
 * Maps to JobStatus enum from job.interface.ts
 */
export const scrapingJobStatusEnum = z.enum([
  'PENDING',
  'SCHEDULED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'RETRYING'
]);

/**
 * Validation schema for scraping source configuration
 * Implements comprehensive security and validation checks
 */
export const scrapingSourceSchema = z.object({
  // Source type validation with strict enumeration
  type: z.enum(['WEBSITE', 'API', 'DOCUMENT']),

  // URL validation with security constraints
  url: z.string()
    .url()
    .max(2048)
    .regex(/^https?:\/\//i, 'URL must use HTTP/HTTPS protocol')
    .refine(url => !url.includes('localhost'), 'Local URLs not allowed')
    .refine(url => !url.match(/\b(?:10\.0\.0\.0\/8|172\.16\.0\.0\/12|192\.168\.0\.0\/16)\b/), 'Private IP ranges not allowed'),

  // Selector validation with security checks
  selectors: z.record(
    z.string().min(1).max(100),
    z.object({
      selector: z.string()
        .min(1)
        .max(1000)
        .refine(s => !s.includes('<script>'), 'Script tags not allowed in selectors'),
      type: z.enum(['css', 'xpath']),
      required: z.boolean()
    })
  ),

  // Authentication configuration validation
  authentication: z.object({
    type: z.enum(['NONE', 'BASIC', 'TOKEN', 'OAUTH']),
    credentials: z.record(z.string().min(1).max(1000)),
    oauth: z.object({
      tokenUrl: z.string().url(),
      scopes: z.array(z.string()),
      grantType: z.string()
    }).optional()
  }).optional(),

  // Request headers validation
  headers: z.record(
    z.string().min(1).max(100),
    z.string().min(1).max(1000)
      .refine(h => !h.match(/[<>]/), 'Invalid characters in header value')
  ).optional(),

  // Timeout and retry configuration
  timeout: z.number()
    .min(1000)
    .max(30000),
  
  // Rate limiting configuration
  rateLimit: z.object({
    requests: z.number().min(1).max(100),
    period: z.number().min(1000).max(60000)
  })
});

/**
 * Validation schema for scraping schedule configuration
 * Implements comprehensive schedule validation with security checks
 */
export const scrapingScheduleSchema = z.object({
  enabled: z.boolean(),
  
  // Cron expression validation
  cronExpression: z.string()
    .regex(/^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/, 'Invalid cron expression'),
  
  // Timezone validation
  timezone: z.string()
    .regex(/^[A-Za-z_/]+\/[A-Za-z_]+$/, 'Invalid timezone format'),
  
  // Retry configuration
  retryConfig: z.object({
    maxRetries: z.number().min(0).max(10),
    retryDelayMs: z.number().min(1000).max(300000),
    backoffMultiplier: z.number().min(1).max(5)
  })
});

/**
 * Validation schema for creating a new scraping job
 * Implements comprehensive request validation with security measures
 */
export const createScrapingJobSchema = z.object({
  config: z.object({
    source: scrapingSourceSchema,
    schedule: scrapingScheduleSchema,
    options: z.object({
      userAgent: z.string()
        .min(1)
        .max(500)
        .regex(/^[\w\s\/.()-]+$/, 'Invalid user agent format'),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      tags: z.array(z.string().min(1).max(50)).max(10).optional()
    })
  }),
  callbackUrl: z.string()
    .url()
    .max(2048)
    .regex(/^https:\/\//, 'Callback URL must use HTTPS')
    .optional()
});

/**
 * Validation schema for listing scraping jobs
 * Implements pagination and filtering validation
 */
export const listScrapingJobsSchema = z.object({
  // Status filter validation
  status: scrapingJobStatusEnum.optional(),
  
  // Date range validation
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
  }).optional(),
  
  // Pagination validation
  page: z.number().min(1).max(1000),
  pageSize: z.number().min(1).max(100),
  
  // Sorting validation
  sortBy: z.enum(['createdAt', 'status', 'priority']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  
  // Tag filtering
  tags: z.array(z.string().min(1).max(50)).max(10).optional()
});

/**
 * Validation schema for job cancellation request
 * Implements cancellation options validation
 */
export const cancelScrapingJobSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().min(1).max(500).optional(),
  force: z.boolean().optional()
});

/**
 * Helper function to validate scraping configuration
 * Provides detailed error messages for validation failures
 */
export const validateScrapingConfig = async (config: unknown): Promise<boolean> => {
  try {
    await createScrapingJobSchema.parseAsync(config);
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorDetails = error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      console.error('Validation failed:', errorDetails);
    }
    return false;
  }
};