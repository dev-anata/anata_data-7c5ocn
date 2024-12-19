/**
 * @fileoverview Scraping configuration module with enhanced security and validation
 * @version 1.0.0
 */

// External Dependencies
import { config as dotenvConfig } from 'dotenv'; // ^16.0.0

// Internal Dependencies
import { 
  ScrapingConfig, 
  ScrapingSourceType, 
  ScrapingAuthType,
  ScrapingSourceConfig,
  ScrapingScheduleConfig,
  ScrapingOptionsConfig 
} from '../../scraping/interfaces/config.interface';
import { StorageConfig, GCSConfig } from '../../core/interfaces/config.interface';
import { GCPConfig } from '../../types/gcp';

// Load environment variables securely
dotenvConfig();

/**
 * Default scraping configuration with comprehensive security settings
 * @const {Partial<ScrapingConfig>}
 */
export const defaultScrapingConfig: Partial<ScrapingConfig> = {
  source: {
    type: ScrapingSourceType.WEBSITE,
    selectors: {
      title: {
        selector: 'h1',
        type: 'css',
        required: true
      }
    },
    validation: {
      schema: 'pharmaceutical-data-schema-v1',
      rules: {
        requiredFields: ['title', 'content', 'date'],
        maxLength: 10000,
        sanitization: true
      }
    },
    authentication: {
      type: ScrapingAuthType.OAUTH,
      credentials: {},
      encryption: {
        algorithm: 'AES-256-GCM',
        keyId: process.env.KMS_KEY_ID || ''
      }
    }
  },
  schedule: {
    enabled: true,
    cronExpression: '0 0 * * *', // Daily at midnight
    timezone: 'UTC',
    validation: {
      maxFrequency: 24, // Maximum runs per day
      minInterval: 3600 // Minimum interval in seconds
    }
  },
  options: {
    retryAttempts: 3,
    retryDelay: 5000,
    timeout: 30000,
    userAgent: 'PharmaDataPipeline/1.0',
    rateLimit: {
      requests: 60,
      period: 60000 // 1 minute
    }
  }
};

/**
 * Storage configuration for scraping data
 * @const {StorageConfig}
 */
const storageConfig: StorageConfig = {
  gcs: {
    rawDataBucket: {
      name: process.env.GCS_RAW_BUCKET || 'pharma-raw-data',
      location: process.env.GCP_REGION || 'us-central1',
      storageClass: 'STANDARD'
    },
    processedDataBucket: {
      name: process.env.GCS_PROCESSED_BUCKET || 'pharma-processed-data',
      location: process.env.GCP_REGION || 'us-central1',
      storageClass: 'STANDARD'
    },
    archiveBucket: {
      name: process.env.GCS_ARCHIVE_BUCKET || 'pharma-archive',
      location: process.env.GCP_REGION || 'us-central1',
      storageClass: 'ARCHIVE'
    },
    lifecycleRules: [
      {
        action: 'SetStorageClass',
        condition: {
          age: 90,
          createdBefore: undefined,
          numNewerVersions: undefined
        }
      }
    ],
    encryption: {
      kmsKeyName: process.env.KMS_KEY_NAME || '',
      enabled: true
    },
    versioning: true
  }
};

/**
 * Validates scraping configuration
 * @param {Partial<ScrapingConfig>} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateScrapingConfig(config: Partial<ScrapingConfig>): void {
  if (!config.source?.type) {
    throw new Error('Source type is required');
  }

  if (!config.schedule?.cronExpression) {
    throw new Error('Schedule cron expression is required');
  }

  if (!config.options?.userAgent) {
    throw new Error('User agent is required');
  }

  // Validate storage configuration
  if (!storageConfig.gcs.encryption.kmsKeyName) {
    throw new Error('KMS key name is required for storage encryption');
  }
}

/**
 * Retrieves environment-specific GCP configuration
 * @returns {GCPConfig}
 * @throws {Error} If required GCP configuration is missing
 */
function getGCPConfig(): GCPConfig {
  const projectId = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION;
  const credentials = {
    client_email: process.env.GCP_CLIENT_EMAIL || '',
    private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    type: 'service_account'
  };

  if (!projectId || !region || !credentials.client_email || !credentials.private_key) {
    throw new Error('Missing required GCP configuration');
  }

  return {
    projectId,
    region,
    credentials
  };
}

/**
 * Retrieves complete scraping configuration with security enhancements
 * @returns {ScrapingConfig}
 * @throws {Error} If configuration is invalid
 */
export function getScrapingConfig(): ScrapingConfig {
  const gcpConfig = getGCPConfig();
  
  // Merge default config with environment-specific values
  const config: ScrapingConfig = {
    jobId: `scraping-job-${Date.now()}`,
    source: {
      ...defaultScrapingConfig.source!,
      url: process.env.SCRAPING_SOURCE_URL || '',
    },
    schedule: {
      ...defaultScrapingConfig.schedule!,
      cronExpression: process.env.SCRAPING_CRON || defaultScrapingConfig.schedule!.cronExpression,
    },
    options: {
      ...defaultScrapingConfig.options!,
      userAgent: process.env.SCRAPING_USER_AGENT || defaultScrapingConfig.options!.userAgent,
    },
    gcp: gcpConfig
  };

  // Validate complete configuration
  validateScrapingConfig(config);

  return config;
}

/**
 * Cache for storing validated configuration
 * @type {Map<string, ScrapingConfig>}
 */
const configCache = new Map<string, ScrapingConfig>();

/**
 * Retrieves cached configuration or generates new one
 * @returns {ScrapingConfig}
 */
export function getCachedScrapingConfig(): ScrapingConfig {
  const cacheKey = process.env.NODE_ENV || 'development';
  
  if (!configCache.has(cacheKey)) {
    configCache.set(cacheKey, getScrapingConfig());
  }
  
  return configCache.get(cacheKey)!;
}