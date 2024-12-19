/**
 * @fileoverview CLI Validation Utility Module for the Pharmaceutical Data Pipeline Platform
 * Provides comprehensive validation functions for CLI command inputs, options, and configurations
 * with enhanced security and error reporting capabilities.
 * @version 1.0.0
 */

import * as Joi from 'joi'; // v17.6.0
import { CommandOptions } from '../interfaces/command.interface';
import { validateString, validateNumber, validateObject } from '../../core/utils/validation.util';
import { validateInputFormat, normalizeInput } from './input.util';
import { ValidationError } from '../../core/utils/error.util';

/**
 * Interface defining validation schemas for different command types
 */
interface ValidationSchema {
  scrapeCommand: Joi.ObjectSchema;
  docsCommand: Joi.ObjectSchema;
  dataCommand: Joi.ObjectSchema;
  configCommand: Joi.ObjectSchema;
}

/**
 * Interface for validation results with detailed error reporting
 */
interface ValidationResult {
  isValid: boolean;
  error?: string;
  context?: string;
  metadata?: Record<string, any>;
}

/**
 * Interface for validation context options
 */
interface ValidationContext {
  strict?: boolean;
  allowUnknown?: boolean;
  securityLevel?: 'standard' | 'enhanced';
}

// Command validation schemas with enhanced security rules
const validationSchemas: ValidationSchema = {
  scrapeCommand: Joi.object({
    config: Joi.string().required().pattern(/^[\w\-./]+$/)
      .custom((value, helpers) => {
        if (value.includes('..')) {
          return helpers.error('Path traversal not allowed');
        }
        return value;
      }),
    jobId: Joi.string().pattern(/^[a-zA-Z0-9\-]+$/),
    format: Joi.string().valid('json', 'csv')
  }).required(),

  docsCommand: Joi.object({
    file: Joi.string().required().pattern(/^[\w\-./]+$/)
      .custom((value, helpers) => {
        if (value.includes('..')) {
          return helpers.error('Path traversal not allowed');
        }
        return value;
      }),
    jobId: Joi.string().pattern(/^[a-zA-Z0-9\-]+$/),
    format: Joi.string().valid('json', 'csv')
  }).required(),

  dataCommand: Joi.object({
    format: Joi.string().valid('json', 'csv').required(),
    filter: Joi.string().pattern(/^[\w\s\-=><]+$/),
    jobId: Joi.string().pattern(/^[a-zA-Z0-9\-]+$/)
  }).required(),

  configCommand: Joi.object({
    config: Joi.string().required().pattern(/^[\w\-./]+$/),
    format: Joi.string().valid('json', 'yaml')
  }).required()
};

/**
 * Validates command options with enhanced security checks and detailed error reporting
 * @param options - Command options to validate
 * @param commandType - Type of command being validated
 * @param context - Optional validation context
 * @returns Validation result with detailed information
 */
export function validateCommandOptions(
  options: CommandOptions,
  commandType: string,
  context?: ValidationContext
): ValidationResult {
  try {
    // Normalize and sanitize input options
    const normalizedOptions = normalizeCommandOptions(options);

    // Get appropriate validation schema
    const schema = validationSchemas[`${commandType}Command`];
    if (!schema) {
      throw new ValidationError(`Unknown command type: ${commandType}`);
    }

    // Validate against schema with context options
    const validationOptions = {
      abortEarly: false,
      allowUnknown: context?.allowUnknown ?? false,
      strict: context?.strict ?? true
    };

    const { error } = schema.validate(normalizedOptions, validationOptions);
    if (error) {
      return {
        isValid: false,
        error: error.details.map(detail => detail.message).join('; '),
        context: commandType,
        metadata: { validationDetails: error.details }
      };
    }

    // Perform additional security validations
    const securityResult = validateSecurityConstraints(
      normalizedOptions,
      commandType,
      context?.securityLevel ?? 'standard'
    );

    if (!securityResult.isValid) {
      return securityResult;
    }

    return {
      isValid: true,
      context: commandType,
      metadata: { validatedOptions: normalizedOptions }
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      context: commandType,
      metadata: { errorType: error.name }
    };
  }
}

/**
 * Validates configuration file options with enhanced format detection and security checks
 * @param configPath - Path to configuration file
 * @param options - Optional validation options
 * @returns Validation result for configuration
 */
export function validateConfigOption(
  configPath: string,
  options?: ValidationContext
): ValidationResult {
  try {
    // Validate and normalize path
    const normalizedPath = normalizeInput(configPath, 'string');
    if (!normalizedPath) {
      throw new ValidationError('Configuration path is required');
    }

    // Security checks for file path
    if (normalizedPath.includes('..') || /[;&|`$]/.test(normalizedPath)) {
      return {
        isValid: false,
        error: 'Invalid configuration path - security violation detected',
        context: 'config',
        metadata: { path: configPath }
      };
    }

    // Validate file extension
    const validExtensions = ['.json', '.yaml', '.yml'];
    const hasValidExtension = validExtensions.some(ext => 
      normalizedPath.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return {
        isValid: false,
        error: 'Invalid configuration file format',
        context: 'config',
        metadata: { supportedFormats: validExtensions }
      };
    }

    return {
      isValid: true,
      context: 'config',
      metadata: { normalizedPath }
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      context: 'config'
    };
  }
}

/**
 * Validates job ID with enhanced format and security checks
 * @param jobId - Job ID to validate
 * @param options - Optional validation options
 * @returns Validation result for job ID
 */
export function validateJobId(
  jobId: string,
  options?: ValidationContext
): ValidationResult {
  try {
    // Normalize job ID
    const normalizedJobId = normalizeInput(jobId, 'string');
    if (!normalizedJobId) {
      throw new ValidationError('Job ID is required');
    }

    // Validate job ID format
    const jobIdPattern = /^[a-zA-Z0-9\-]+$/;
    if (!jobIdPattern.test(normalizedJobId)) {
      return {
        isValid: false,
        error: 'Invalid job ID format',
        context: 'jobId',
        metadata: { pattern: jobIdPattern.toString() }
      };
    }

    // Additional security checks for enhanced mode
    if (options?.securityLevel === 'enhanced') {
      if (normalizedJobId.length > 64) {
        return {
          isValid: false,
          error: 'Job ID exceeds maximum length',
          context: 'jobId',
          metadata: { maxLength: 64 }
        };
      }
    }

    return {
      isValid: true,
      context: 'jobId',
      metadata: { normalizedJobId }
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      context: 'jobId'
    };
  }
}

/**
 * Validates file option with enhanced format detection and security scanning
 * @param filePath - File path to validate
 * @param options - Optional validation options
 * @returns Validation result for file option
 */
export function validateFileOption(
  filePath: string,
  options?: ValidationContext
): ValidationResult {
  try {
    // Normalize file path
    const normalizedPath = normalizeInput(filePath, 'string');
    if (!normalizedPath) {
      throw new ValidationError('File path is required');
    }

    // Security checks for file path
    if (normalizedPath.includes('..') || /[;&|`$]/.test(normalizedPath)) {
      return {
        isValid: false,
        error: 'Invalid file path - security violation detected',
        context: 'file',
        metadata: { path: filePath }
      };
    }

    // Validate file extension based on command context
    const validExtensions = ['.json', '.csv', '.txt', '.pdf'];
    const hasValidExtension = validExtensions.some(ext => 
      normalizedPath.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      return {
        isValid: false,
        error: 'Invalid file format',
        context: 'file',
        metadata: { supportedFormats: validExtensions }
      };
    }

    return {
      isValid: true,
      context: 'file',
      metadata: { normalizedPath }
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      context: 'file'
    };
  }
}

/**
 * Normalizes command options for validation
 * @param options - Command options to normalize
 * @returns Normalized command options
 */
function normalizeCommandOptions(options: CommandOptions): CommandOptions {
  return {
    config: options.config ? normalizeInput(options.config, 'string') : undefined,
    jobId: options.jobId ? normalizeInput(options.jobId, 'string') : undefined,
    file: options.file ? normalizeInput(options.file, 'string') : undefined,
    format: options.format ? normalizeInput(options.format, 'string') : undefined,
    filter: options.filter ? normalizeInput(options.filter, 'string') : undefined
  };
}

/**
 * Performs additional security validations on command options
 * @param options - Normalized command options
 * @param commandType - Type of command being validated
 * @param securityLevel - Security level for validation
 * @returns Validation result with security context
 */
function validateSecurityConstraints(
  options: CommandOptions,
  commandType: string,
  securityLevel: 'standard' | 'enhanced'
): ValidationResult {
  // Common security checks
  for (const [key, value] of Object.entries(options)) {
    if (value && typeof value === 'string') {
      // Check for potential injection patterns
      if (/[;&|`$]/.test(value)) {
        return {
          isValid: false,
          error: `Security violation detected in ${key}`,
          context: 'security',
          metadata: { field: key }
        };
      }
    }
  }

  // Enhanced security checks
  if (securityLevel === 'enhanced') {
    // Additional checks for sensitive commands
    if (commandType === 'configCommand' && options.config) {
      if (!/^[a-zA-Z0-9\-_.\/]+$/.test(options.config)) {
        return {
          isValid: false,
          error: 'Configuration path contains invalid characters',
          context: 'security',
          metadata: { field: 'config' }
        };
      }
    }
  }

  return { isValid: true, context: 'security' };
}