/**
 * @fileoverview Storage configuration module for GCS and BigQuery services
 * @version 1.0.0
 */

import { config } from 'dotenv'; // v16.0.0
import { StorageConfig, GCPConfig } from '../core/interfaces/config.interface';

// Load environment variables
config();

/**
 * Validates storage configuration settings
 * @param config Storage configuration object to validate
 * @throws Error if configuration is invalid
 */
function validateStorageConfig(config: StorageConfig): boolean {
  // Validate GCS bucket configurations
  const requiredEnvVars = [
    'GCS_RAW_BUCKET_NAME',
    'GCS_PROCESSED_BUCKET_NAME',
    'GCS_ARCHIVE_BUCKET_NAME',
    'GCP_REGION',
    'GCS_KMS_KEY_NAME',
    'BQ_KMS_KEY_NAME',
    'BIGQUERY_DATASET'
  ];

  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  });

  // Validate bucket names follow GCS naming conventions
  const bucketNameRegex = /^[a-z0-9][-_.a-z0-9]*[a-z0-9]$/;
  [
    process.env.GCS_RAW_BUCKET_NAME,
    process.env.GCS_PROCESSED_BUCKET_NAME,
    process.env.GCS_ARCHIVE_BUCKET_NAME
  ].forEach(bucketName => {
    if (!bucketNameRegex.test(bucketName!)) {
      throw new Error(`Invalid bucket name format: ${bucketName}`);
    }
  });

  // Validate retention periods
  if (config.gcs.rawDataBucket.retentionPeriodDays < 1 || 
      config.gcs.rawDataBucket.retentionPeriodDays > 365) {
    throw new Error('Invalid retention period for raw data bucket');
  }

  return true;
}

/**
 * Storage configuration object implementing StorageConfig interface
 * Includes comprehensive settings for GCS and BigQuery with security features
 */
export const storageConfig: StorageConfig = {
  gcs: {
    rawDataBucket: {
      name: process.env.GCS_RAW_BUCKET_NAME!,
      location: process.env.GCP_REGION!,
      storageClass: 'STANDARD',
      retentionPeriodDays: 90,
      versioningEnabled: true,
      uniformAccess: true,
      encryption: {
        type: 'CMEK',
        kmsKeyName: process.env.GCS_KMS_KEY_NAME!
      },
      lifecycle: {
        deleteAfterDays: 90,
        transitionToArchiveAfterDays: null
      }
    },
    processedDataBucket: {
      name: process.env.GCS_PROCESSED_BUCKET_NAME!,
      location: process.env.GCP_REGION!,
      storageClass: 'STANDARD',
      retentionPeriodDays: 180,
      versioningEnabled: true,
      uniformAccess: true,
      encryption: {
        type: 'CMEK',
        kmsKeyName: process.env.GCS_KMS_KEY_NAME!
      },
      lifecycle: {
        deleteAfterDays: 180,
        transitionToArchiveAfterDays: null
      }
    },
    archiveBucket: {
      name: process.env.GCS_ARCHIVE_BUCKET_NAME!,
      location: process.env.GCP_REGION!,
      storageClass: 'ARCHIVE',
      retentionPeriodDays: 2555, // 7 years
      versioningEnabled: true,
      uniformAccess: true,
      encryption: {
        type: 'CMEK',
        kmsKeyName: process.env.GCS_KMS_KEY_NAME!
      },
      lifecycle: {
        deleteAfterDays: 2555,
        transitionToArchiveAfterDays: 365
      }
    },
    lifecycleRules: [
      {
        action: 'Delete',
        condition: {
          age: 90,
          numNewerVersions: 3
        }
      },
      {
        action: 'SetStorageClass',
        condition: {
          age: 365,
          createdBefore: new Date().toISOString()
        }
      }
    ],
    encryption: {
      kmsKeyName: process.env.GCS_KMS_KEY_NAME!,
      enabled: true
    },
    versioning: true
  },
  bigquery: {
    dataset: process.env.BIGQUERY_DATASET!,
    location: process.env.GCP_REGION!,
    maxRetries: 3,
    retryDelayMs: 1000,
    partitioningField: 'created_at',
    clusteringFields: ['source_type', 'data_type'],
    scopes: [
      'https://www.googleapis.com/auth/bigquery',
      'https://www.googleapis.com/auth/bigquery.data'
    ],
    encryptionConfig: {
      kmsKeyName: process.env.BQ_KMS_KEY_NAME!,
      enabled: true
    }
  }
};

// Validate configuration on module load
validateStorageConfig(storageConfig);

// Export validated configuration
export default storageConfig;