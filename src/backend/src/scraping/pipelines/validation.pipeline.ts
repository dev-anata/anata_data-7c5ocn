/**
 * @fileoverview Validation pipeline for web scraping operations
 * Implements multi-stage validation to ensure data quality and integrity
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.20.0
import { ScrapingResult } from '../../interfaces/result.interface';
import { validateScrapingResult } from '../../utils/validation.util';
import { ValidationError } from '../../../core/utils/error.util';

/**
 * Constants for validation error messages
 */
const VALIDATION_ERROR_MESSAGES = {
  SCHEMA_VALIDATION_FAILED: 'Schema validation failed for scraping result',
  METADATA_VALIDATION_FAILED: 'Metadata validation failed for scraping result',
  STORAGE_VALIDATION_FAILED: 'Storage validation failed for scraping result',
  CHECKSUM_VALIDATION_FAILED: 'Checksum validation failed for scraping result',
  STORAGE_ACCESS_FAILED: 'Storage access validation failed for scraping result'
} as const;

/**
 * Constants for validation stages
 */
const VALIDATION_STAGES = {
  SCHEMA: 'schema_validation',
  METADATA: 'metadata_validation',
  STORAGE: 'storage_validation'
} as const;

/**
 * Interface for validation context tracking
 */
interface ValidationContext {
  currentStage: string;
  startTime: Date;
  completedStages: string[];
  validationErrors: Array<{
    stage: string;
    error: string;
    context?: Record<string, unknown>;
  }>;
}

/**
 * Schema for metadata validation
 */
const metadataSchema = z.object({
  size: z.number().positive(),
  itemCount: z.number().positive(),
  format: z.string(),
  contentType: z.string(),
  checksum: z.string(),
  validationStatus: z.enum(['VALID', 'INVALID', 'PARTIAL']),
  qualityMetrics: z.object({
    completeness: z.number().min(0).max(1),
    accuracy: z.number().min(0).max(1),
    consistency: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1)
  })
});

/**
 * Schema for storage validation
 */
const storageSchema = z.object({
  rawFile: z.object({
    name: z.string(),
    bucket: z.string(),
    size: z.number().positive()
  }),
  processedFile: z.object({
    name: z.string(),
    bucket: z.string(),
    size: z.number().positive()
  }),
  bigQueryTable: z.string(),
  version: z.string(),
  compressionType: z.string(),
  encryptionKey: z.string()
});

/**
 * ValidationPipeline class implements multi-stage validation for scraping results
 */
export class ValidationPipeline {
  private result: ScrapingResult;
  private errors: ValidationError[] = [];
  private context: ValidationContext;

  /**
   * Creates a new validation pipeline instance
   * @param result - Scraping result to validate
   */
  constructor(result: ScrapingResult) {
    this.result = result;
    this.context = {
      currentStage: '',
      startTime: new Date(),
      completedStages: [],
      validationErrors: []
    };
  }

  /**
   * Validates result schema
   * @returns boolean indicating validation success
   */
  private validateSchema(): boolean {
    try {
      this.context.currentStage = VALIDATION_STAGES.SCHEMA;
      
      // Use core validation utility
      const isValid = validateScrapingResult(this.result);
      
      if (!isValid) {
        throw new ValidationError(
          VALIDATION_ERROR_MESSAGES.SCHEMA_VALIDATION_FAILED,
          this.context.validationErrors
        );
      }

      this.context.completedStages.push(VALIDATION_STAGES.SCHEMA);
      return true;
    } catch (error) {
      this.context.validationErrors.push({
        stage: VALIDATION_STAGES.SCHEMA,
        error: error.message,
        context: { result: this.result }
      });
      throw error;
    }
  }

  /**
   * Validates result metadata
   * @returns boolean indicating validation success
   */
  private validateMetadata(): boolean {
    try {
      this.context.currentStage = VALIDATION_STAGES.METADATA;
      
      const result = metadataSchema.safeParse(this.result.metadata);
      
      if (!result.success) {
        throw new ValidationError(
          VALIDATION_ERROR_MESSAGES.METADATA_VALIDATION_FAILED,
          result.error.errors
        );
      }

      // Additional metadata quality checks
      const { qualityMetrics } = this.result.metadata;
      if (qualityMetrics.completeness < 0.95) {
        throw new ValidationError('Data completeness below required threshold');
      }
      if (qualityMetrics.accuracy < 0.98) {
        throw new ValidationError('Data accuracy below required threshold');
      }

      this.context.completedStages.push(VALIDATION_STAGES.METADATA);
      return true;
    } catch (error) {
      this.context.validationErrors.push({
        stage: VALIDATION_STAGES.METADATA,
        error: error.message,
        context: { metadata: this.result.metadata }
      });
      throw error;
    }
  }

  /**
   * Validates storage configuration and accessibility
   * @returns boolean indicating validation success
   */
  private validateStorage(): boolean {
    try {
      this.context.currentStage = VALIDATION_STAGES.STORAGE;
      
      const result = storageSchema.safeParse(this.result.storage);
      
      if (!result.success) {
        throw new ValidationError(
          VALIDATION_ERROR_MESSAGES.STORAGE_VALIDATION_FAILED,
          result.error.errors
        );
      }

      // Validate file sizes
      if (this.result.storage.rawFile.size === 0) {
        throw new ValidationError('Raw file size cannot be zero');
      }
      if (this.result.storage.processedFile.size === 0) {
        throw new ValidationError('Processed file size cannot be zero');
      }

      this.context.completedStages.push(VALIDATION_STAGES.STORAGE);
      return true;
    } catch (error) {
      this.context.validationErrors.push({
        stage: VALIDATION_STAGES.STORAGE,
        error: error.message,
        context: { storage: this.result.storage }
      });
      throw error;
    }
  }

  /**
   * Executes the complete validation pipeline
   * @returns boolean indicating overall validation success
   * @throws ValidationError if any validation stage fails
   */
  public execute(): boolean {
    try {
      // Execute validation stages
      const schemaValid = this.validateSchema();
      const metadataValid = this.validateMetadata();
      const storageValid = this.validateStorage();

      // All stages must pass for successful validation
      const isValid = schemaValid && metadataValid && storageValid;

      if (!isValid) {
        throw new ValidationError(
          'Validation pipeline failed',
          this.context.validationErrors
        );
      }

      return true;
    } catch (error) {
      // Add execution context to error
      if (error instanceof ValidationError) {
        error.context = {
          ...error.context,
          executionContext: this.context
        };
      }
      throw error;
    }
  }

  /**
   * Gets the current validation errors
   * @returns Array of validation errors
   */
  public getErrors(): ValidationError[] {
    return this.errors;
  }

  /**
   * Gets the validation context
   * @returns Current validation context
   */
  public getContext(): ValidationContext {
    return this.context;
  }
}