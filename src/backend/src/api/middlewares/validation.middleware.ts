/**
 * @fileoverview Express middleware for request validation using Joi schemas
 * Implements comprehensive validation for data queries, document uploads, and scraping jobs
 * with detailed error handling and performance optimization.
 * @version 1.0.0
 */

import { Request, Response, NextFunction, RequestHandler } from 'express'; // v4.17.1
import * as Joi from 'joi'; // v17.6.0
import { LRUCache } from 'lru-cache'; // v7.14.1

// Internal imports
import { ValidationError } from '../../core/utils/error.util';
import { dataQuerySchema } from '../schemas/data.schema';
import { documentUploadSchema } from '../schemas/document.schema';
import { createScrapingJobSchema } from '../schemas/scraping.schema';

// Constants for validation configuration
const VALIDATION_TYPES = ['body', 'query', 'params'] as const;
const VALIDATION_TIMEOUT_MS = 5000;
const MAX_REQUEST_SIZE_MB = 10;
const VALIDATION_CACHE_SIZE = 1000;

// Initialize validation result cache
const validationCache = new LRUCache<string, boolean>({
  max: VALIDATION_CACHE_SIZE,
  ttl: 1000 * 60 * 5 // 5 minutes
});

/**
 * Type guard for validation types
 * @param type - Type to check
 */
const isValidationType = (type: string): type is typeof VALIDATION_TYPES[number] => {
  return VALIDATION_TYPES.includes(type as typeof VALIDATION_TYPES[number]);
};

/**
 * Creates a validation key for caching
 * @param schema - Validation schema
 * @param data - Data to validate
 */
const createValidationKey = (schema: Joi.ObjectSchema, data: unknown): string => {
  return `${schema._id}_${JSON.stringify(data)}`;
};

/**
 * Enhanced higher-order function that creates a validation middleware
 * @param schema - Joi validation schema
 * @param validationType - Type of request data to validate
 */
export const validateRequest = (
  schema: Joi.ObjectSchema,
  validationType: typeof VALIDATION_TYPES[number]
): RequestHandler => {
  if (!isValidationType(validationType)) {
    throw new Error(`Invalid validation type: ${validationType}`);
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dataToValidate = req[validationType];
      const validationKey = createValidationKey(schema, dataToValidate);

      // Check cache first
      if (validationCache.get(validationKey)) {
        return next();
      }

      // Set validation timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new ValidationError('Validation timeout exceeded'));
        }, VALIDATION_TIMEOUT_MS);
      });

      // Perform validation with timeout
      const validationPromise = schema.validateAsync(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        presence: 'required'
      });

      const result = await Promise.race([validationPromise, timeoutPromise]);
      
      // Update request with validated data
      req[validationType] = result;
      
      // Cache successful validation
      validationCache.set(validationKey, true);
      
      next();
    } catch (error) {
      if (error instanceof Joi.ValidationError) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));
        next(new ValidationError('Validation failed', validationErrors));
      } else {
        next(error);
      }
    }
  };
};

/**
 * Specialized middleware for validating data query requests
 * Implements comprehensive query validation with performance optimization
 */
export const validateDataQuery = validateRequest(dataQuerySchema, 'query');

/**
 * Enhanced middleware for validating document upload requests
 * Implements comprehensive file validation with security checks
 */
export const validateDocumentUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate file presence
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    // Validate file size
    const maxSize = MAX_REQUEST_SIZE_MB * 1024 * 1024;
    if (req.file.size > maxSize) {
      throw new ValidationError(`File size exceeds maximum limit of ${MAX_REQUEST_SIZE_MB}MB`);
    }

    // Validate request body
    await documentUploadSchema.validateAsync(
      { file: req.file, ...req.body },
      { abortEarly: false }
    );

    next();
  } catch (error) {
    if (error instanceof Joi.ValidationError) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      next(new ValidationError('Document validation failed', validationErrors));
    } else {
      next(error);
    }
  }
};

/**
 * Security-enhanced middleware for validating scraping job creation requests
 * Implements comprehensive security checks and validation
 */
export const validateScrapingJob = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate request body against schema
    const validatedData = await createScrapingJobSchema.validateAsync(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    // Additional security checks for scraping configuration
    const { config } = validatedData;
    
    // Validate URLs against allowlist
    if (!isValidUrl(config.source.url)) {
      throw new ValidationError('Invalid or unauthorized URL');
    }

    // Validate rate limiting configuration
    if (!isValidRateLimit(config.source.rateLimit)) {
      throw new ValidationError('Invalid rate limiting configuration');
    }

    // Update request with validated data
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof Joi.ValidationError) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      next(new ValidationError('Scraping job validation failed', validationErrors));
    } else {
      next(error);
    }
  }
};

/**
 * Helper function to validate URLs against security rules
 * @param url - URL to validate
 */
const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // Check for allowed protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    // Check for blocked domains/IPs
    if (isBlockedDomain(urlObj.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Helper function to validate rate limiting configuration
 * @param rateLimit - Rate limiting configuration
 */
const isValidRateLimit = (rateLimit: { requests: number; period: number }): boolean => {
  const { requests, period } = rateLimit;
  const maxRequestsPerSecond = 10;
  const minPeriodMs = 1000;

  return (
    requests > 0 &&
    requests <= maxRequestsPerSecond &&
    period >= minPeriodMs &&
    period <= 60000 // Max 1 minute
  );
};

/**
 * Helper function to check for blocked domains
 * @param hostname - Hostname to check
 */
const isBlockedDomain = (hostname: string): boolean => {
  const blockedPatterns = [
    /^localhost$/,
    /^127\./,
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./
  ];

  return blockedPatterns.some(pattern => pattern.test(hostname));
};