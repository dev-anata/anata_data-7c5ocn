/**
 * @fileoverview Express middleware for comprehensive request/response logging
 * Implements structured logging with error handling, PII detection, and cloud-specific metadata
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid'; // ^8.3.2
import { LoggerService } from '../../core/logging/logger.service';
import { AuthUser } from '../../core/interfaces/auth.interface';

// Interface for request timing metadata
interface RequestTiming {
  startTime: [number, number];
  endTime?: [number, number];
  duration?: number;
}

// Interface for enhanced request metadata
interface RequestMetadata {
  requestId: string;
  method: string;
  path: string;
  query: Record<string, any>;
  headers: Record<string, any>;
  userAgent?: string;
  ip?: string;
  user?: Partial<AuthUser>;
  timing: RequestTiming;
  correlationId?: string;
}

// PII patterns for masking sensitive data
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+\d{1,3}[- ]?)?\d{10}/g,
  ssn: /\d{3}-\d{2}-\d{4}/g,
  creditCard: /\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}/g
};

/**
 * Express middleware that provides comprehensive request/response logging
 * Implements request tracking, performance monitoring, and audit logging
 */
export default function loggingMiddleware(
  logger: LoggerService
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate unique request ID and timing info
      const requestId = uuidv4();
      const timing: RequestTiming = {
        startTime: process.hrtime()
      };

      // Extract user context from authenticated request
      const user = req.user as AuthUser | undefined;

      // Create request metadata
      const metadata: RequestMetadata = {
        requestId,
        method: req.method,
        path: req.path,
        query: maskPII(req.query),
        headers: maskSensitiveHeaders(req.headers),
        userAgent: req.get('user-agent'),
        ip: req.ip,
        user: user ? {
          userId: user.userId,
          role: user.role,
          email: user.email
        } : undefined,
        timing,
        correlationId: req.get('x-correlation-id')
      };

      // Log incoming request
      await logger.info('Incoming request', {
        ...metadata,
        environment: process.env.NODE_ENV,
        service: 'api-gateway'
      });

      // Capture response data
      const originalSend = res.send;
      res.send = function(body: any): Response {
        res.locals.body = body;
        return originalSend.call(this, body);
      };

      // Handle response completion
      res.on('finish', async () => {
        timing.endTime = process.hrtime();
        timing.duration = calculateDuration(timing.startTime, timing.endTime);

        const responseMetadata = {
          ...metadata,
          statusCode: res.statusCode,
          responseTime: timing.duration,
          responseSize: res.get('content-length'),
          responseType: res.get('content-type')
        };

        // Log based on response status
        if (res.statusCode >= 500) {
          await logger.error('Request error', new Error(`${res.statusCode} response`), responseMetadata);
        } else if (res.statusCode >= 400) {
          await logger.warn('Request warning', responseMetadata);
        } else {
          await logger.info('Request completed', responseMetadata);
        }

        // Generate audit log for sensitive operations
        if (shouldAudit(req)) {
          await logger.audit('API operation audit', {
            ...responseMetadata,
            requestBody: maskPII(req.body),
            responseBody: maskPII(res.locals.body)
          });
        }
      });

      // Handle response errors
      res.on('error', async (error: Error) => {
        await logger.error('Response error', error, metadata);
      });

      next();
    } catch (error) {
      logger.error('Logging middleware error', error as Error, {
        path: req.path,
        method: req.method
      });
      next();
    }
  };
}

/**
 * Calculates request duration in milliseconds
 */
function calculateDuration(start: [number, number], end: [number, number]): number {
  const durationNs = (end[0] - start[0]) * 1e9 + (end[1] - start[1]);
  return durationNs / 1e6; // Convert to milliseconds
}

/**
 * Masks sensitive data in request/response bodies
 */
function maskPII(data: any): any {
  if (!data) return data;
  
  const maskedData = JSON.parse(JSON.stringify(data));
  
  const maskValue = (value: string): string => {
    for (const [key, pattern] of Object.entries(PII_PATTERNS)) {
      if (pattern.test(value)) {
        return `[REDACTED ${key}]`;
      }
    }
    return value;
  };

  const traverse = (obj: any): any => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = maskValue(obj[key]);
      } else if (typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
    return obj;
  };

  return traverse(maskedData);
}

/**
 * Masks sensitive headers while preserving required ones
 */
function maskSensitiveHeaders(headers: Record<string, any>): Record<string, any> {
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  const maskedHeaders: Record<string, any> = {};

  for (const [key, value] of Object.entries(headers)) {
    maskedHeaders[key] = sensitiveHeaders.includes(key.toLowerCase())
      ? '[REDACTED]'
      : value;
  }

  return maskedHeaders;
}

/**
 * Determines if request should generate audit log
 */
function shouldAudit(req: Request): boolean {
  // Audit all write operations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return true;
  }

  // Audit sensitive data access
  if (req.path.includes('/api/v1/data')) {
    return true;
  }

  // Audit authentication operations
  if (req.path.includes('/auth')) {
    return true;
  }

  return false;
}