/**
 * Central Configuration Module for Pharmaceutical Data Pipeline Platform
 * Aggregates and exports all configuration settings with enhanced validation and security
 * @version 1.0.0
 */

import { config as dotenv } from 'dotenv'; // v16.0.0
import { authConfig } from './auth.config';
import { databaseConfig } from './database.config';
import { gcpConfig, configVersion as gcpConfigVersion } from './gcp.config';
import { loggingConfig, cloudLoggingConfig } from './logging.config';

// Initialize environment variables
dotenv();

// Configuration version for compatibility checking
export const CONFIG_VERSION = '1.0.0';

// Valid environments based on technical specifications
export const ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type Environment = typeof ENVIRONMENTS[number];

// Default environment fallback
export const DEFAULT_ENV: Environment = 'development';

// Configuration validation interval (5 minutes)
export const VALIDATION_INTERVAL = 300000;

/**
 * Validates the current environment setting
 * @throws Error if environment is invalid
 */
function validateEnvironment(): Environment {
  const env = process.env.NODE_ENV as Environment;
  if (!env || !ENVIRONMENTS.includes(env)) {
    console.warn(`Invalid NODE_ENV: ${env}, falling back to ${DEFAULT_ENV}`);
    return DEFAULT_ENV;
  }
  return env;
}

/**
 * Validates all configuration settings for consistency and security
 * @returns Validation result with detailed status
 */
export function validateConfigurations() {
  const validationResults = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[]
  };

  try {
    // Validate environment
    const currentEnv = validateEnvironment();
    const isProduction = currentEnv === 'production';

    // GCP Configuration Validation
    if (!gcpConfig.projectId || !gcpConfig.region) {
      validationResults.errors.push('Invalid GCP configuration: missing required fields');
    }

    // Authentication Configuration Validation
    if (isProduction) {
      if (!authConfig.jwt.secret || authConfig.jwt.secret.length < 32) {
        validationResults.errors.push('Production JWT secret must be at least 32 characters');
      }
      if (!authConfig.session.cookieName || !authConfig.session.domain) {
        validationResults.errors.push('Production session configuration incomplete');
      }
    }

    // Database Configuration Validation
    if (!databaseConfig.bigquery.datasetId || !databaseConfig.bigquery.location) {
      validationResults.errors.push('Invalid BigQuery configuration');
    }
    if (!databaseConfig.firestore.collectionName) {
      validationResults.errors.push('Invalid Firestore configuration');
    }
    if (!databaseConfig.redis.host || !databaseConfig.redis.port) {
      validationResults.errors.push('Invalid Redis configuration');
    }

    // Logging Configuration Validation
    if (!loggingConfig.level || !loggingConfig.format) {
      validationResults.errors.push('Invalid logging configuration');
    }

    // Update validation status
    validationResults.isValid = validationResults.errors.length === 0;

  } catch (error) {
    validationResults.isValid = false;
    validationResults.errors.push(`Configuration validation failed: ${error.message}`);
  }

  return validationResults;
}

/**
 * Loads environment-specific configuration with secure defaults
 * @returns Environment-specific configuration object
 */
export function loadEnvironmentConfig() {
  const env = validateEnvironment();
  const isProduction = env === 'production';

  return {
    environment: env,
    isProduction,
    isDevelopment: env === 'development',
    isStaging: env === 'staging',
    timestamp: new Date().toISOString(),
    version: CONFIG_VERSION
  };
}

/**
 * Central configuration object that aggregates all system configurations
 * with enhanced validation and security measures
 */
export const config = Object.freeze({
  // Environment Configuration
  env: loadEnvironmentConfig(),

  // Authentication Configuration
  auth: authConfig,

  // Database Configuration
  database: databaseConfig,

  // GCP Configuration
  gcp: gcpConfig,

  // Logging Configuration
  logging: loggingConfig,
  cloudLogging: cloudLoggingConfig,

  // System Configuration
  system: {
    version: CONFIG_VERSION,
    gcpConfigVersion,
    validationInterval: VALIDATION_INTERVAL,
    startTime: new Date().toISOString()
  }
});

// Perform initial configuration validation
const initialValidation = validateConfigurations();
if (!initialValidation.isValid) {
  console.error('Configuration validation failed:', initialValidation.errors);
  throw new Error('Invalid configuration detected during initialization');
}

// Set up periodic configuration validation for production
if (config.env.isProduction) {
  setInterval(() => {
    const validation = validateConfigurations();
    if (!validation.isValid) {
      console.error('Configuration validation failed:', validation.errors);
      // Log to Cloud Logging in production
      if (cloudLoggingConfig.errorReporting.enabled) {
        // Error reporting logic here
      }
    }
  }, VALIDATION_INTERVAL);
}

// Default export of the configuration object
export default config;