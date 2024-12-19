/**
 * @fileoverview Validation utility module for the web scraping subsystem
 * Provides comprehensive validation for scraping configurations, jobs, and results
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.20.0
import { isValid } from 'date-fns'; // v2.29.0
import { validateConfig } from '../../../core/utils/validation.util';
import { ScrapingConfig } from '../interfaces/config.interface';
import { ScrapingJob } from '../interfaces/job.interface';
import { ScrapingResult } from '../interfaces/result.interface';
import { ValidationError } from '../../../core/utils/error.util';

// Constants for validation rules
const VALIDATION_CONSTANTS = {
  URL: {
    MAX_LENGTH: 2048,
    PROTOCOLS: ['http:', 'https:']
  },
  SELECTOR: {
    MAX_LENGTH: 1000,
    TYPES: ['css', 'xpath']
  },
  QUALITY: {
    MIN_SUCCESS_RATE: 0.999,
    MIN_COMPLETENESS: 0.95,
    MIN_ACCURACY: 0.98
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    MIN_DELAY: 1000,
    MAX_DELAY: 30000
  }
};

// Zod schema for scraping configuration validation
const SCRAPING_CONFIG_SCHEMA = z.object({
  jobId: z.string().uuid(),
  source: z.object({
    type: z.enum(['WEBSITE', 'API', 'DOCUMENT']),
    url: z.string().url().max(VALIDATION_CONSTANTS.URL.MAX_LENGTH),
    selectors: z.record(z.object({
      selector: z.string().max(VALIDATION_CONSTANTS.SELECTOR.MAX_LENGTH),
      type: z.enum(VALIDATION_CONSTANTS.SELECTOR.TYPES),
      required: z.boolean()
    })),
    authentication: z.object({
      type: z.enum(['NONE', 'BASIC', 'TOKEN', 'OAUTH']),
      credentials: z.record(z.string()),
      encryption: z.object({
        algorithm: z.string(),
        keyId: z.string()
      })
    }).optional()
  }),
  schedule: z.object({
    enabled: z.boolean(),
    cronExpression: z.string(),
    timezone: z.string(),
    validation: z.object({
      maxFrequency: z.number(),
      minInterval: z.number()
    })
  })
});

// Zod schema for scraping job validation
const SCRAPING_JOB_SCHEMA = z.object({
  id: z.string().uuid(),
  status: z.enum(['PENDING', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING']),
  executionDetails: z.object({
    startTime: z.date().optional(),
    endTime: z.date().optional(),
    duration: z.number().optional(),
    attempts: z.number().max(VALIDATION_CONSTANTS.RETRY.MAX_ATTEMPTS),
    metrics: z.object({
      requestCount: z.number(),
      bytesProcessed: z.number(),
      itemsScraped: z.number(),
      errorCount: z.number(),
      successRate: z.number().min(VALIDATION_CONSTANTS.QUALITY.MIN_SUCCESS_RATE)
    })
  })
});

// Zod schema for scraping result validation
const SCRAPING_RESULT_SCHEMA = z.object({
  id: z.string().uuid(),
  metadata: z.object({
    size: z.number(),
    itemCount: z.number(),
    format: z.string(),
    contentType: z.string(),
    checksum: z.string(),
    qualityMetrics: z.object({
      completeness: z.number().min(VALIDATION_CONSTANTS.QUALITY.MIN_COMPLETENESS),
      accuracy: z.number().min(VALIDATION_CONSTANTS.QUALITY.MIN_ACCURACY),
      consistency: z.number(),
      freshness: z.number()
    })
  }),
  storage: z.object({
    rawFile: z.object({
      name: z.string(),
      bucket: z.string(),
      size: z.number()
    }),
    processedFile: z.object({
      name: z.string(),
      bucket: z.string(),
      size: z.number()
    }),
    bigQueryTable: z.string(),
    encryptionKey: z.string()
  })
});

/**
 * Validates scraping configuration with comprehensive checks
 * @param config - Scraping configuration to validate
 * @returns true if validation passes
 * @throws ValidationError if validation fails
 */
export function validateScrapingConfig(config: ScrapingConfig): boolean {
  try {
    // Validate against schema
    const result = SCRAPING_CONFIG_SCHEMA.safeParse(config);
    if (!result.success) {
      throw new ValidationError('Scraping configuration validation failed', result.error.errors);
    }

    // Validate URL protocol
    const url = new URL(config.source.url);
    if (!VALIDATION_CONSTANTS.URL.PROTOCOLS.includes(url.protocol)) {
      throw new ValidationError(`Invalid URL protocol: ${url.protocol}`);
    }

    // Validate selectors
    for (const [key, selector] of Object.entries(config.source.selectors)) {
      if (selector.required && !selector.selector) {
        throw new ValidationError(`Required selector missing for: ${key}`);
      }
    }

    // Validate schedule if enabled
    if (config.schedule.enabled) {
      if (!config.schedule.cronExpression) {
        throw new ValidationError('Cron expression required when scheduling is enabled');
      }
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Configuration validation error: ${error.message}`);
  }
}

/**
 * Validates scraping job with execution metrics
 * @param job - Scraping job to validate
 * @returns true if validation passes
 * @throws ValidationError if validation fails
 */
export function validateScrapingJob(job: ScrapingJob): boolean {
  try {
    // Validate against schema
    const result = SCRAPING_JOB_SCHEMA.safeParse(job);
    if (!result.success) {
      throw new ValidationError('Scraping job validation failed', result.error.errors);
    }

    // Validate execution timestamps
    if (job.executionDetails.startTime && job.executionDetails.endTime) {
      if (!isValid(job.executionDetails.startTime) || !isValid(job.executionDetails.endTime)) {
        throw new ValidationError('Invalid execution timestamps');
      }
      if (job.executionDetails.startTime >= job.executionDetails.endTime) {
        throw new ValidationError('End time must be after start time');
      }
    }

    // Validate retry attempts
    if (job.executionDetails.attempts > VALIDATION_CONSTANTS.RETRY.MAX_ATTEMPTS) {
      throw new ValidationError(`Exceeded maximum retry attempts: ${VALIDATION_CONSTANTS.RETRY.MAX_ATTEMPTS}`);
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Job validation error: ${error.message}`);
  }
}

/**
 * Validates scraping result with quality metrics
 * @param result - Scraping result to validate
 * @returns true if validation passes
 * @throws ValidationError if validation fails
 */
export function validateScrapingResult(result: ScrapingResult): boolean {
  try {
    // Validate against schema
    const result = SCRAPING_RESULT_SCHEMA.safeParse(result);
    if (!result.success) {
      throw new ValidationError('Scraping result validation failed', result.error.errors);
    }

    // Validate quality metrics
    const { qualityMetrics } = result.metadata;
    if (qualityMetrics.completeness < VALIDATION_CONSTANTS.QUALITY.MIN_COMPLETENESS) {
      throw new ValidationError(`Data completeness below threshold: ${qualityMetrics.completeness}`);
    }
    if (qualityMetrics.accuracy < VALIDATION_CONSTANTS.QUALITY.MIN_ACCURACY) {
      throw new ValidationError(`Data accuracy below threshold: ${qualityMetrics.accuracy}`);
    }

    // Validate storage information
    if (!result.storage.rawFile.size || !result.storage.processedFile.size) {
      throw new ValidationError('Invalid storage file sizes');
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Result validation error: ${error.message}`);
  }
}

export {
  VALIDATION_CONSTANTS,
  SCRAPING_CONFIG_SCHEMA,
  SCRAPING_JOB_SCHEMA,
  SCRAPING_RESULT_SCHEMA
};