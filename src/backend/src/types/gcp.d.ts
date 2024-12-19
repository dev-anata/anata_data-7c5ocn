// GCP Service Type Definitions for Pharmaceutical Data Pipeline Platform
// External Dependencies
import { Storage, Bucket, File } from '@google-cloud/storage'; // v6.0.0
import { BigQuery, Dataset, Table } from '@google-cloud/bigquery'; // v6.0.0
import { KeyManagementServiceClient } from '@google-cloud/kms'; // v3.0.0

/**
 * Base GCP configuration interface
 * Defines core configuration required for GCP service initialization
 */
export interface GCPConfig {
  /** GCP project identifier */
  projectId: string;
  /** GCP region for service deployment */
  region: string;
  /** Service account credentials */
  credentials: {
    /** Service account client email */
    client_email: string;
    /** Service account private key */
    private_key: string;
    /** Service account type */
    type: 'service_account';
  };
}

/**
 * Cloud Storage configuration interface
 * Defines settings for GCS bucket management and data retention
 */
export interface StorageConfig {
  /** Primary storage bucket name */
  bucketName: string;
  /** Archive storage bucket name for long-term retention */
  archiveBucketName: string;
  /** Data retention period in days */
  retentionPeriodDays: number;
  /** Optional versioning configuration */
  versioning?: {
    enabled: boolean;
    retainDeletedVersions?: boolean;
  };
  /** Optional lifecycle rules */
  lifecycle?: {
    /** Age in days for transitioning to archive storage */
    archiveAge?: number;
    /** Age in days for deletion */
    deleteAge?: number;
  };
}

/**
 * BigQuery configuration interface
 * Defines settings for BigQuery dataset and table management
 */
export interface BigQueryConfig {
  /** BigQuery dataset identifier */
  datasetId: string;
  /** Dataset geographic location */
  location: string;
  /** Table data retention period in days */
  retentionDays: number;
  /** Optional partitioning configuration */
  partitioning?: {
    type: 'time' | 'range' | 'ingestion_time';
    field?: string;
  };
  /** Optional clustering configuration */
  clustering?: {
    fields: string[];
  };
}

/**
 * Cloud KMS configuration interface
 * Defines settings for encryption key management
 */
export interface KMSConfig {
  /** KMS key ring identifier */
  keyRingId: string;
  /** Crypto key identifier */
  cryptoKeyId: string;
  /** Key geographic location */
  location: string;
  /** Optional key rotation period in days */
  rotationPeriod?: number;
  /** Optional protection level */
  protectionLevel?: 'SOFTWARE' | 'HSM';
}

/**
 * Cloud Storage file metadata interface
 * Defines structure for file metadata in Cloud Storage
 */
export interface StorageFile {
  /** File name/path in bucket */
  name: string;
  /** Bucket containing the file */
  bucket: string;
  /** File size in bytes */
  size: number;
  /** File MIME type */
  contentType: string;
  /** Custom metadata key-value pairs */
  metadata: Record<string, any>;
  /** Optional file generation number */
  generation?: string;
  /** Optional file metageneration number */
  metageneration?: string;
  /** Optional file creation timestamp */
  timeCreated?: string;
  /** Optional file update timestamp */
  updated?: string;
}

/**
 * BigQuery row data interface
 * Defines structure for data rows in BigQuery tables
 */
export interface BigQueryRow {
  /** Unique insertion identifier */
  insertId: string;
  /** Row data as key-value pairs */
  json: Record<string, any>;
  /** Optional timestamp field */
  timestamp?: string;
  /** Optional partition identifier */
  partitionId?: string;
  /** Optional clustering information */
  clusteringInfo?: Record<string, any>;
}

/**
 * IAM Role type definition
 * Defines available IAM roles for service accounts
 */
export type IAMRole =
  | 'roles/storage.admin'
  | 'roles/storage.objectViewer'
  | 'roles/bigquery.dataViewer'
  | 'roles/bigquery.dataEditor'
  | 'roles/cloudkms.cryptoKeyEncrypterDecrypter';

/**
 * Service Account configuration interface
 * Defines structure for service account settings
 */
export interface ServiceAccountConfig {
  /** Service account email */
  email: string;
  /** Assigned IAM roles */
  roles: IAMRole[];
  /** Optional key rotation settings */
  keyRotation?: {
    enabled: boolean;
    periodDays: number;
  };
}

/**
 * Error types for GCP service operations
 */
export type GCPErrorType =
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'DEADLINE_EXCEEDED'
  | 'ALREADY_EXISTS'
  | 'RESOURCE_EXHAUSTED'
  | 'FAILED_PRECONDITION'
  | 'ABORTED'
  | 'INTERNAL_ERROR';

/**
 * GCP service error interface
 */
export interface GCPError extends Error {
  /** Error type classification */
  type: GCPErrorType;
  /** HTTP status code */
  code: number;
  /** Error details */
  details?: Record<string, any>;
}