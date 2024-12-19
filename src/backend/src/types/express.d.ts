/**
 * @fileoverview TypeScript declaration file extending Express Request and Response interfaces
 * for the pharmaceutical data pipeline application.
 * @version 1.0.0
 */

import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { JwtPayload } from 'jsonwebtoken'; // v9.0.0
import { GCPServiceError } from './gcp';

/**
 * Request context interface for tracking and correlation
 */
export interface RequestContext {
  /** Unique request identifier */
  requestId: string;
  /** Request timestamp */
  timestamp: Date;
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Optional user agent information */
  userAgent?: string;
  /** Optional source IP address */
  sourceIp?: string;
}

/**
 * Standardized API response format
 */
export interface ApiResponse<T = any> {
  /** Response status indicator */
  status: 'success' | 'error' | 'progress';
  /** Response payload data */
  data?: T;
  /** Optional status message */
  message?: string;
  /** Optional error details */
  error?: GCPServiceError;
  /** Optional progress percentage */
  percent?: number;
  /** Response timestamp */
  timestamp: string;
  /** Request correlation ID */
  correlationId: string;
}

/**
 * Extended Express Request interface with custom properties
 */
declare global {
  namespace Express {
    export interface Request {
      /** Authenticated user information from JWT */
      user?: JwtPayload;
      /** API key from request header */
      apiKey?: string;
      /** Request context for tracking */
      context: RequestContext;
      /** Original raw request body */
      rawBody?: Buffer;
      /** Environment information */
      env?: {
        /** Current node environment */
        nodeEnv: 'development' | 'staging' | 'production';
        /** GCP project ID */
        projectId: string;
        /** GCP region */
        region: string;
      };
    }

    export interface Response<ResBody = any> {
      /**
       * Send success response with standardized format
       * @param data Response payload
       * @param message Optional success message
       */
      success: <T = any>(data?: T, message?: string) => Response<ApiResponse<T>>;

      /**
       * Send error response with standardized format
       * @param error Error details
       * @param message Optional error message
       * @param code Optional HTTP status code
       */
      error: (error: GCPServiceError, message?: string, code?: number) => Response<ApiResponse>;

      /**
       * Send progress response with standardized format
       * @param percent Progress percentage
       * @param message Optional progress message
       */
      progress: (percent: number, message?: string) => Response<ApiResponse>;

      /**
       * Send paginated response with standardized format
       * @param data Response payload
       * @param pagination Pagination details
       */
      paginated: <T = any>(
        data: T[],
        pagination: {
          page: number;
          limit: number;
          total: number;
          hasMore: boolean;
        }
      ) => Response<ApiResponse<T>>;
    }
  }
}

/**
 * Pagination parameters interface
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter parameters interface
 */
export interface FilterParams {
  /** Search query string */
  query?: string;
  /** Date range start */
  startDate?: string;
  /** Date range end */
  endDate?: string;
  /** Status filter */
  status?: string[];
  /** Type filter */
  type?: string[];
  /** Custom filters */
  [key: string]: any;
}

/**
 * Type guard to check if response is an API error
 * @param response API response object
 */
export function isApiError(response: ApiResponse): response is ApiResponse & { error: GCPServiceError } {
  return response.status === 'error' && !!response.error;
}

/**
 * Type guard to check if response is a progress update
 * @param response API response object
 */
export function isProgressResponse(response: ApiResponse): response is ApiResponse & { percent: number } {
  return response.status === 'progress' && typeof response.percent === 'number';
}