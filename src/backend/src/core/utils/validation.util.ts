/**
 * @fileoverview Core validation utility module for the Pharmaceutical Data Pipeline Platform
 * Provides comprehensive validation functions for configurations, database inputs, and data structures
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.20.0
import { isValid, isWithinInterval, parseISO } from 'date-fns'; // v2.29.0
import { ValidationError } from '../utils/error.util';
import {
  GCPConfig,
  AuthConfig,
  DatabaseConfig,
  StorageConfig,
  BigQueryConfig,
  GCSConfig
} from '../interfaces/config.interface';

// Configuration Schemas
const CONFIG_SCHEMAS = {
  gcpConfig: z.object({
    projectId: z.string().min(1),
    region: z.string().min(1),
    credentials: z.object({
      type: z.string(),
      project_id: z.string(),
      private_key_id: z.string(),
      private_key: z.string(),
      client_email: z.string().email(),
      client_id: z.string()
    })
  }),

  authConfig: z.object({
    jwt: z.object({
      secret: z.string().min(64),
      expiresIn: z.string(),
      algorithm: z.enum(['HS256', 'RS256']),
      issuer: z.string(),
      audience: z.string()
    }),
    apiKey: z.object({
      headerName: z.string(),
      prefix: z.string(),
      maxAge: z.number().positive(),
      rateLimit: z.object({
        maxRequests: z.number().positive(),
        windowMs: z.number().positive(),
        enabled: z.boolean()
      }),
      rotationPolicy: z.object({
        intervalDays: z.number().positive(),
        enabled: z.boolean()
      }),
      allowedIPs: z.array(z.string())
    }),
    session: z.object({
      cookieName: z.string(),
      maxAge: z.number().positive(),
      secure: z.boolean(),
      sameSite: z.enum(['strict', 'lax', 'none'])
    })
  }),

  databaseConfig: z.object({
    bigquery: z.object({
      datasetId: z.string(),
      tableId: z.string(),
      location: z.string()
    }),
    firestore: z.object({
      collectionName: z.string(),
      gcpProjectId: z.string()
    }),
    redis: z.object({
      host: z.string(),
      port: z.number().positive(),
      ttl: z.number().positive()
    })
  })
};

// Database Input Schemas
const DATABASE_SCHEMAS = {
  scrapingJob: z.object({
    jobId: z.string().uuid(),
    source: z.string().url(),
    config: z.record(z.any()),
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    createdAt: z.date(),
    updatedAt: z.date()
  }),

  documentProcess: z.object({
    docId: z.string().uuid(),
    content: z.string(),
    metadata: z.record(z.any()),
    processingStatus: z.enum(['queued', 'processing', 'completed', 'error']),
    createdAt: z.date(),
    processingTime: z.number().optional()
  }),

  processedData: z.object({
    dataId: z.string().uuid(),
    sourceId: z.string(),
    content: z.record(z.any()),
    timestamp: z.date(),
    quality: z.number().min(0).max(1)
  })
};

// Constants
const MAX_DATE_RANGE_DAYS = 365;
const BUSINESS_HOURS = {
  start: '09:00',
  end: '17:00',
  timezone: 'UTC'
};
const STORAGE_REQUIREMENTS = {
  minBucketNameLength: 3,
  maxBucketNameLength: 63,
  allowedRegions: ['US-CENTRAL1', 'US-EAST1', 'EU-WEST1'],
  requiredPermissions: ['storage.buckets.get', 'bigquery.datasets.get']
};

/**
 * Validates system configuration objects against their respective schemas
 * @param config - Configuration object to validate
 * @param configType - Type of configuration ('gcpConfig' | 'authConfig' | 'databaseConfig')
 * @returns true if validation passes
 * @throws ValidationError if validation fails
 */
export function validateConfig(
  config: GCPConfig | AuthConfig | DatabaseConfig,
  configType: string
): boolean {
  try {
    const schema = CONFIG_SCHEMAS[configType];
    if (!schema) {
      throw new ValidationError(`Unknown configuration type: ${configType}`);
    }

    const result = schema.safeParse(config);
    if (!result.success) {
      throw new ValidationError(
        `Configuration validation failed for ${configType}`,
        result.error.errors
      );
    }

    // Additional security checks for sensitive configurations
    if (configType === 'authConfig') {
      const authConfig = config as AuthConfig;
      if (authConfig.jwt.secret.length < 64) {
        throw new ValidationError('JWT secret must be at least 64 characters long');
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
 * Validates database input data against defined schemas
 * @param data - Data object to validate
 * @param schemaType - Type of schema ('scrapingJob' | 'documentProcess' | 'processedData')
 * @returns true if validation passes
 * @throws ValidationError if validation fails
 */
export function validateDatabaseInput(data: any, schemaType: string): boolean {
  try {
    const schema = DATABASE_SCHEMAS[schemaType];
    if (!schema) {
      throw new ValidationError(`Unknown schema type: ${schemaType}`);
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      throw new ValidationError(
        `Database input validation failed for ${schemaType}`,
        result.error.errors
      );
    }

    // Additional data quality checks
    if (schemaType === 'processedData') {
      if (!data.content || Object.keys(data.content).length === 0) {
        throw new ValidationError('Processed data content cannot be empty');
      }
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Database input validation error: ${error.message}`);
  }
}

/**
 * Validates date range inputs with business hours and timezone handling
 * @param startDate - Start date of the range
 * @param endDate - End date of the range
 * @returns true if date range is valid
 * @throws ValidationError if validation fails
 */
export function validateDateRange(startDate: Date, endDate: Date): boolean {
  try {
    // Validate date objects
    if (!isValid(startDate) || !isValid(endDate)) {
      throw new ValidationError('Invalid date objects provided');
    }

    // Check date order
    if (startDate >= endDate) {
      throw new ValidationError('Start date must be before end date');
    }

    // Check maximum date range
    const daysDifference = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > MAX_DATE_RANGE_DAYS) {
      throw new ValidationError(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
    }

    // Validate business hours
    const startTime = startDate.getHours() + ':' + startDate.getMinutes();
    const endTime = endDate.getHours() + ':' + endDate.getMinutes();
    
    if (startTime < BUSINESS_HOURS.start || endTime > BUSINESS_HOURS.end) {
      throw new ValidationError('Dates must be within business hours');
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Date range validation error: ${error.message}`);
  }
}

/**
 * Validates storage configuration with enhanced GCP-specific checks
 * @param config - Storage configuration object
 * @returns true if storage configuration is valid
 * @throws ValidationError if validation fails
 */
export function validateStorageConfig(config: StorageConfig): boolean {
  try {
    // Validate GCS bucket names
    const bucketNamePattern = /^[a-z0-9][-a-z0-9]*[a-z0-9]$/;
    const { gcs } = config;

    for (const bucket of [gcs.rawDataBucket, gcs.processedDataBucket, gcs.archiveBucket]) {
      if (!bucketNamePattern.test(bucket.name)) {
        throw new ValidationError(`Invalid bucket name: ${bucket.name}`);
      }

      if (bucket.name.length < STORAGE_REQUIREMENTS.minBucketNameLength ||
          bucket.name.length > STORAGE_REQUIREMENTS.maxBucketNameLength) {
        throw new ValidationError(
          `Bucket name length must be between ${STORAGE_REQUIREMENTS.minBucketNameLength} and ${STORAGE_REQUIREMENTS.maxBucketNameLength} characters`
        );
      }

      if (!STORAGE_REQUIREMENTS.allowedRegions.includes(bucket.location.toUpperCase())) {
        throw new ValidationError(
          `Invalid bucket location. Allowed regions: ${STORAGE_REQUIREMENTS.allowedRegions.join(', ')}`
        );
      }
    }

    // Validate BigQuery storage configuration
    const { bigquery } = config;
    if (!STORAGE_REQUIREMENTS.allowedRegions.includes(bigquery.location.toUpperCase())) {
      throw new ValidationError(
        `Invalid BigQuery location. Allowed regions: ${STORAGE_REQUIREMENTS.allowedRegions.join(', ')}`
      );
    }

    // Validate encryption configuration
    if (gcs.encryption.enabled && !gcs.encryption.kmsKeyName) {
      throw new ValidationError('KMS key name is required when encryption is enabled');
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Storage configuration validation error: ${error.message}`);
  }
}