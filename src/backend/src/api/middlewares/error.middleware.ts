/**
 * @fileoverview Express middleware for centralized error handling and standardized error responses
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import { BaseError, ValidationError } from '../../core/utils/error.util';
import { LoggerService } from '../../core/logging/logger.service';

// Initialize logger service
const logger = new LoggerService();

/**
 * Interface for standardized error response
 */
interface ErrorResponse {
  status: string;
  code: number;
  message: string;
  correlationId?: string;
  timestamp: string;
  validationErrors?: any[];
  metadata?: Record<string, any>;
}

/**
 * Centralized error handling middleware for Express applications
 * Implements comprehensive error classification, logging, and standardized responses
 */
export const errorHandler = async (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Generate correlation ID for error tracking
    const correlationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare base error response
    const errorResponse: ErrorResponse = {
      status: 'error',
      code: 500,
      message: 'Internal Server Error',
      correlationId,
      timestamp: new Date().toISOString()
    };

    // Enhanced error logging with request context
    await logger.error('Request error occurred', error, {
      correlationId,
      request: {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        query: req.query,
        body: sanitizeBody(req.body)
      }
    });

    // Handle different error types
    if (error instanceof BaseError) {
      errorResponse.code = error.statusCode;
      errorResponse.message = error.message;
      if ('metadata' in error) {
        errorResponse.metadata = error.metadata;
      }
    }

    if (error instanceof ValidationError) {
      errorResponse.code = 400;
      errorResponse.validationErrors = error.validationErrors;
    }

    // Add security headers
    addSecurityHeaders(res);

    // Environment-specific error handling
    if (process.env.NODE_ENV === 'production') {
      // Production: Remove sensitive information
      delete errorResponse.metadata;
      if (errorResponse.code === 500) {
        errorResponse.message = 'An unexpected error occurred';
      }
    } else {
      // Development: Include stack trace
      errorResponse.metadata = {
        ...errorResponse.metadata,
        stack: error.stack
      };
    }

    // Send error response
    res.status(errorResponse.code).json(errorResponse);

  } catch (loggingError) {
    // Fallback error handling if logging fails
    console.error('Error in error handler:', loggingError);
    res.status(500).json({
      status: 'error',
      code: 500,
      message: 'Internal Server Error',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Sanitize request headers to remove sensitive information
 */
function sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeBody(body: Record<string, any>): Record<string, any> {
  if (!body) return {};

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];

  const sanitizeObject = (obj: Record<string, any>): void => {
    Object.keys(obj).forEach(key => {
      if (sensitiveFields.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    });
  };

  sanitizeObject(sanitized);
  return sanitized;
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(res: Response): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}