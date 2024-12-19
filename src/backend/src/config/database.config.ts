/**
 * Database Configuration Module for Pharmaceutical Data Pipeline Platform
 * Manages configurations for BigQuery, Firestore, and Redis instances
 * @version 1.0.0
 */

import * as dotenv from 'dotenv'; // v16.0.0
import { DatabaseConfig, BigQueryConfig, FirestoreConfig, RedisConfig } from '../core/interfaces/database.interface';
import { GCPConfig } from '../types/gcp';

// Initialize environment variables
dotenv.config();

/**
 * Validates numeric environment variable
 * @param value - Value to validate
 * @param defaultValue - Default value if invalid
 * @param minValue - Minimum allowed value
 * @returns Validated numeric value
 */
const validateNumericEnv = (value: string | undefined, defaultValue: number, minValue: number = 0): number => {
  const parsed = parseInt(value || String(defaultValue));
  return isNaN(parsed) || parsed < minValue ? defaultValue : parsed;
};

/**
 * Validates required environment variable
 * @param value - Environment variable value
 * @param name - Variable name for error message
 * @throws Error if required variable is missing
 */
const validateRequiredEnv = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
};

/**
 * Validates the complete database configuration
 * @param config - Database configuration object
 * @throws Error if configuration is invalid
 */
const validateDatabaseConfig = (config: DatabaseConfig): void => {
  // Validate BigQuery configuration
  if (!config.bigquery.datasetId || !config.bigquery.tableId || !config.bigquery.location) {
    throw new Error('Invalid BigQuery configuration: missing required fields');
  }

  // Validate Firestore configuration
  if (!config.firestore.collectionName || !config.firestore.gcpProjectId) {
    throw new Error('Invalid Firestore configuration: missing required fields');
  }

  // Validate Redis configuration
  if (!config.redis.host || !config.redis.port || !config.redis.ttl) {
    throw new Error('Invalid Redis configuration: missing required fields');
  }

  // Validate numeric ranges
  if (config.redis.port < 1 || config.redis.port > 65535) {
    throw new Error('Invalid Redis port number');
  }

  if (config.redis.ttl < 0) {
    throw new Error('Invalid Redis TTL value');
  }
};

/**
 * Database configuration object with enhanced validation and monitoring capabilities
 */
export const databaseConfig: DatabaseConfig = {
  bigquery: {
    datasetId: validateRequiredEnv(process.env.BIGQUERY_DATASET_ID, 'BIGQUERY_DATASET_ID'),
    tableId: validateRequiredEnv(process.env.BIGQUERY_TABLE_ID, 'BIGQUERY_TABLE_ID'),
    location: validateRequiredEnv(process.env.BIGQUERY_LOCATION, 'BIGQUERY_LOCATION'),
    retryOptions: {
      maxRetries: validateNumericEnv(process.env.BQ_MAX_RETRIES, 3, 0),
      retryDelayMs: validateNumericEnv(process.env.BQ_RETRY_DELAY, 1000, 100)
    },
    queryTimeout: validateNumericEnv(process.env.BQ_QUERY_TIMEOUT, 30000, 1000)
  },
  
  firestore: {
    collectionName: validateRequiredEnv(process.env.FIRESTORE_COLLECTION, 'FIRESTORE_COLLECTION'),
    gcpProjectId: validateRequiredEnv(process.env.GCP_PROJECT_ID, 'GCP_PROJECT_ID'),
    timeout: validateNumericEnv(process.env.FIRESTORE_TIMEOUT, 5000, 1000),
    retryConfig: {
      maxAttempts: validateNumericEnv(process.env.FS_MAX_RETRIES, 3, 0),
      retryDelay: validateNumericEnv(process.env.FS_RETRY_DELAY, 1000, 100)
    }
  },
  
  redis: {
    host: validateRequiredEnv(process.env.REDIS_HOST, 'REDIS_HOST'),
    port: validateNumericEnv(process.env.REDIS_PORT, 6379, 1),
    ttl: validateNumericEnv(process.env.REDIS_TTL, 3600, 0),
    password: process.env.REDIS_PASSWORD,
    maxRetries: validateNumericEnv(process.env.REDIS_MAX_RETRIES, 3, 0),
    connectTimeout: validateNumericEnv(process.env.REDIS_CONNECT_TIMEOUT, 5000, 1000)
  }
};

// Validate the complete configuration
validateDatabaseConfig(databaseConfig);

/**
 * Initialize database configuration with monitoring hooks
 * @returns Validated database configuration
 */
export const initializeDatabaseConfig = (): DatabaseConfig => {
  try {
    validateDatabaseConfig(databaseConfig);
    
    // Add configuration change monitoring
    Object.defineProperty(databaseConfig, 'onChange', {
      value: (callback: (config: DatabaseConfig) => void) => {
        process.on('SIGHUP', () => {
          // Reload configuration on SIGHUP signal
          dotenv.config();
          validateDatabaseConfig(databaseConfig);
          callback(databaseConfig);
        });
      },
      writable: false
    });

    return databaseConfig;
  } catch (error) {
    throw new Error(`Database configuration initialization failed: ${error.message}`);
  }
};

// Export validated configuration
export default databaseConfig;