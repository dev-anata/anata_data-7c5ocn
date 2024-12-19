/**
 * @fileoverview TypeScript type definitions for environment variables used throughout the application.
 * Extends the NodeJS ProcessEnv interface to provide type safety and intellisense.
 * @version 1.0.0
 */

declare namespace NodeJS {
  /**
   * Extended ProcessEnv interface with strongly-typed environment variables
   * for cloud infrastructure, storage, security, and scaling configuration.
   */
  interface ProcessEnv {
    // Application Environment
    /** Runtime environment - development, staging, or production */
    NODE_ENV: 'development' | 'staging' | 'production';
    /** Port number for the application to listen on */
    PORT: string;

    // GCP Infrastructure Configuration
    /** Google Cloud Project identifier */
    GCP_PROJECT_ID: string;
    /** Primary GCP region for service deployment */
    GCP_REGION: string;
    /** Base64 encoded service account credentials */
    GCP_CREDENTIALS: string;

    // Storage Configuration
    /** GCS bucket name for raw data storage */
    STORAGE_BUCKET: string;
    /** BigQuery dataset identifier for processed data */
    BIGQUERY_DATASET: string;
    /** Redis host for caching layer */
    REDIS_HOST: string;
    /** Redis port number */
    REDIS_PORT: string;

    // Security Configuration
    /** Cloud KMS keyring identifier */
    KMS_KEYRING_ID: string;
    /** Cloud KMS crypto key identifier */
    KMS_CRYPTOKEY_ID: string;
    /** Secret key for JWT token signing */
    JWT_SECRET: string;
    /** Custom header name for API key authentication */
    API_KEY_HEADER: string;

    // Logging Configuration
    /** Application logging level */
    LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

    // Cloud Run Configuration
    /** Cloud Run service identifier */
    CLOUD_RUN_SERVICE_NAME: string;
    /** Minimum number of service instances */
    MIN_INSTANCES: string;
    /** Maximum number of service instances */
    MAX_INSTANCES: string;

    // Optional Development Configuration
    /** Local emulator host for development (optional) */
    EMULATOR_HOST?: string;
    /** Skip production security checks in development (optional) */
    SKIP_SECURITY_CHECKS?: 'true' | 'false';
  }
}

/**
 * Type guard to check if all required environment variables are set
 * @param env NodeJS.ProcessEnv object to validate
 * @returns boolean indicating if all required variables are present
 */
export function isValidEnvironment(env: NodeJS.ProcessEnv): boolean {
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'GCP_PROJECT_ID',
    'GCP_REGION',
    'GCP_CREDENTIALS',
    'STORAGE_BUCKET',
    'BIGQUERY_DATASET',
    'KMS_KEYRING_ID',
    'KMS_CRYPTOKEY_ID',
    'REDIS_HOST',
    'REDIS_PORT',
    'JWT_SECRET',
    'API_KEY_HEADER',
    'LOG_LEVEL',
    'CLOUD_RUN_SERVICE_NAME',
    'MIN_INSTANCES',
    'MAX_INSTANCES'
  ];

  return requiredVars.every(varName => env[varName] !== undefined);
}

/**
 * Type guard to check if environment is production
 * @param env NodeJS.ProcessEnv object to check
 * @returns boolean indicating if environment is production
 */
export function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production';
}