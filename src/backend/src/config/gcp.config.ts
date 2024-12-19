/**
 * GCP Configuration Module
 * Version: 1.0.0
 * 
 * Manages core GCP settings, credentials, and service-specific configurations
 * for the Pharmaceutical Data Pipeline Platform with secure environment
 * variable handling and validation.
 */

import { config as dotenvConfig } from 'dotenv'; // ^16.0.0
import { GCPConfig } from '../types/gcp';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenvConfig();

// Constants
const DEFAULT_REGION = 'us-central1';
const CONFIG_VERSION = '1.0.0';

const REQUIRED_ENV_VARS = [
  'GCP_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GCP_STORAGE_BUCKET',
  'GCP_BIGQUERY_DATASET'
] as const;

const PROJECT_ID_REGEX = /^[a-z][-a-z0-9]{4,28}[a-z0-9]$/;
const REGION_REGEX = /^[a-z]+-[a-z]+\d+$/;

/**
 * Validates the GCP configuration values and environment variables
 * @param config - Partial GCP configuration object
 * @returns boolean indicating validation success
 * @throws Error if validation fails
 */
function validateConfig(config: Partial<GCPConfig>): boolean {
  // Check required environment variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Validate project ID format
  if (config.projectId && !PROJECT_ID_REGEX.test(config.projectId)) {
    throw new Error('Invalid GCP project ID format');
  }

  // Validate credentials file existence
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!fs.existsSync(credentialsPath!)) {
    throw new Error(`Credentials file not found at: ${credentialsPath}`);
  }

  // Validate region format if provided
  if (config.region && !REGION_REGEX.test(config.region)) {
    throw new Error('Invalid GCP region format');
  }

  return true;
}

/**
 * Loads and validates the GCP service account credentials
 * @returns Validated credentials object
 * @throws Error if credentials are invalid
 */
function loadCredentials(): GCPConfig['credentials'] {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
  
  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8');
    const credentials = JSON.parse(credentialsFile);

    // Validate credential structure
    if (
      !credentials.type ||
      credentials.type !== 'service_account' ||
      !credentials.client_email ||
      !credentials.private_key
    ) {
      throw new Error('Invalid service account credentials structure');
    }

    return {
      type: 'service_account',
      client_email: credentials.client_email,
      private_key: credentials.private_key
    };
  } catch (error) {
    throw new Error(`Failed to load credentials: ${error.message}`);
  }
}

/**
 * Loads and validates the GCP configuration from environment variables
 * @returns Validated GCP configuration object
 * @throws Error if configuration is invalid
 */
function loadGCPConfig(): GCPConfig {
  const config: GCPConfig = {
    projectId: process.env.GCP_PROJECT_ID!,
    region: process.env.GCP_REGION || DEFAULT_REGION,
    credentials: loadCredentials()
  };

  // Validate the configuration
  validateConfig(config);

  return config;
}

/**
 * Validated GCP configuration singleton
 * @throws Error if configuration initialization fails
 */
export const gcpConfig: Readonly<GCPConfig> = Object.freeze(loadGCPConfig());

/**
 * Export configuration version for compatibility checking
 */
export const configVersion = CONFIG_VERSION;

/**
 * Export individual configuration properties
 */
export const {
  projectId,
  region,
  credentials
} = gcpConfig;

/**
 * Export environment variable validation function
 */
export const validateGCPConfig = validateConfig;