import { StatusCodes as HttpStatus } from 'http-status-codes'; // v2.2.0

// Default values for error handling
export const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred';
export const DEFAULT_STATUS_CODE = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Base error class that extends Error for custom error handling
 * Provides common error properties and functionality for all custom errors
 */
export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly timestamp: Date;

  /**
   * Creates a new BaseError instance
   * @param message - Error message describing the error
   * @param statusCode - HTTP status code associated with the error
   */
  constructor(message: string = DEFAULT_ERROR_MESSAGE, statusCode: number = DEFAULT_STATUS_CODE) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error class for validation failures
 * Used when request data fails validation checks
 */
export class ValidationError extends BaseError {
  public readonly validationErrors: any[];

  /**
   * Creates a new ValidationError instance
   * @param message - Error message describing the validation failure
   * @param validationErrors - Array of specific validation errors
   */
  constructor(message: string = 'Validation failed', validationErrors: any[] = []) {
    super(message, HttpStatus.BAD_REQUEST);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Error class for resource not found scenarios
 * Used when requested resources cannot be found
 */
export class NotFoundError extends BaseError {
  /**
   * Creates a new NotFoundError instance
   * @param message - Error message describing what resource was not found
   */
  constructor(message: string = 'Resource not found') {
    super(message, HttpStatus.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/**
 * Error class for authentication failures
 * Used when authentication is required but fails
 */
export class UnauthorizedError extends BaseError {
  /**
   * Creates a new UnauthorizedError instance
   * @param message - Error message describing the authentication failure
   */
  constructor(message: string = 'Authentication required') {
    super(message, HttpStatus.UNAUTHORIZED);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error class for authorization failures
 * Used when authenticated users lack required permissions
 */
export class ForbiddenError extends BaseError {
  /**
   * Creates a new ForbiddenError instance
   * @param message - Error message describing the authorization failure
   */
  constructor(message: string = 'Access forbidden') {
    super(message, HttpStatus.FORBIDDEN);
    this.name = 'ForbiddenError';
  }
}