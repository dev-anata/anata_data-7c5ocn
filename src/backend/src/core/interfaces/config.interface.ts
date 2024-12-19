/**
 * @fileoverview Core configuration interfaces for the Pharmaceutical Data Pipeline Platform
 * @version 1.0.0
 */

/**
 * JWT Authentication Configuration Interface
 * Defines settings for JSON Web Token authentication
 */
export interface JWTConfig {
  /** Secret key for JWT signing */
  secret: string;
  /** Token expiration time */
  expiresIn: string;
  /** JWT signing algorithm (e.g., 'HS256', 'RS256') */
  algorithm: string;
  /** Token issuer identifier */
  issuer: string;
  /** Token audience identifier */
  audience: string;
}

/**
 * API Key Configuration Interface
 * Defines settings for API key authentication with enhanced security
 */
export interface APIKeyConfig {
  /** Custom header name for API key */
  headerName: string;
  /** API key prefix for additional security */
  prefix: string;
  /** Maximum age of API keys in seconds */
  maxAge: number;
  /** Rate limiting configuration */
  rateLimit: {
    /** Maximum requests per window */
    maxRequests: number;
    /** Time window in seconds */
    windowMs: number;
    /** Enable/disable rate limiting */
    enabled: boolean;
  };
  /** API key rotation policy */
  rotationPolicy: {
    /** Auto rotation interval in days */
    intervalDays: number;
    /** Enable/disable auto rotation */
    enabled: boolean;
  };
  /** Allowed IP addresses for API key usage */
  allowedIPs: string[];
}

/**
 * Session Configuration Interface
 * Defines settings for session management
 */
export interface SessionConfig {
  /** Session cookie name */
  cookieName: string;
  /** Session maximum age in seconds */
  maxAge: number;
  /** Secure cookie flag */
  secure: boolean;
  /** SameSite cookie policy */
  sameSite: 'strict' | 'lax' | 'none';
}

/**
 * Authentication Configuration Interface
 * Aggregates all authentication-related configurations
 */
export interface AuthConfig {
  /** JWT authentication settings */
  jwt: JWTConfig;
  /** API key authentication settings */
  apiKey: APIKeyConfig;
  /** Session management settings */
  session: SessionConfig;
}

/**
 * BigQuery Database Configuration Interface
 * Defines settings for BigQuery database connection
 */
export interface BigQueryConfig {
  /** BigQuery dataset identifier */
  datasetId: string;
  /** BigQuery table identifier */
  tableId: string;
  /** BigQuery location/region */
  location: string;
}

/**
 * Firestore Database Configuration Interface
 * Defines settings for Firestore database connection
 */
export interface FirestoreConfig {
  /** Firestore collection name */
  collectionName: string;
  /** GCP project identifier */
  gcpProjectId: string;
}

/**
 * Redis Cache Configuration Interface
 * Defines settings for Redis cache connection
 */
export interface RedisConfig {
  /** Redis host address */
  host: string;
  /** Redis port number */
  port: number;
  /** Default TTL in seconds */
  ttl: number;
}

/**
 * Database Configuration Interface
 * Aggregates all database-related configurations
 */
export interface DatabaseConfig {
  /** BigQuery settings */
  bigquery: BigQueryConfig;
  /** Firestore settings */
  firestore: FirestoreConfig;
  /** Redis cache settings */
  redis: RedisConfig;
}

/**
 * Google Cloud Storage Bucket Configuration Interface
 * Defines settings for GCS bucket configuration
 */
export interface GCSBucketConfig {
  /** Bucket name */
  name: string;
  /** Bucket location */
  location: string;
  /** Storage class */
  storageClass: 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE';
}

/**
 * Google Cloud Storage Configuration Interface
 * Defines settings for GCS with enhanced features
 */
export interface GCSConfig {
  /** Raw data bucket configuration */
  rawDataBucket: GCSBucketConfig;
  /** Processed data bucket configuration */
  processedDataBucket: GCSBucketConfig;
  /** Archive bucket configuration */
  archiveBucket: GCSBucketConfig;
  /** Lifecycle management rules */
  lifecycleRules: {
    /** Action to take */
    action: 'Delete' | 'SetStorageClass';
    /** Condition for the rule */
    condition: {
      /** Age in days */
      age: number;
      /** Created before date */
      createdBefore?: string;
      /** Number of newer versions */
      numNewerVersions?: number;
    };
  }[];
  /** Encryption configuration */
  encryption: {
    /** KMS key name */
    kmsKeyName: string;
    /** Enable/disable encryption */
    enabled: boolean;
  };
  /** Enable/disable versioning */
  versioning: boolean;
}

/**
 * BigQuery Storage Configuration Interface
 * Defines enhanced settings for BigQuery storage
 */
export interface BigQueryStorageConfig {
  /** Dataset identifier */
  dataset: string;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
  /** Dataset location */
  location: string;
  /** OAuth scopes */
  scopes: string[];
  /** Table partitioning field */
  partitioningField: string;
  /** Table clustering fields */
  clusteringFields: string[];
  /** Encryption configuration */
  encryptionConfig: {
    /** KMS key name */
    kmsKeyName: string;
    /** Enable/disable encryption */
    enabled: boolean;
  };
}

/**
 * Storage Configuration Interface
 * Aggregates all storage-related configurations
 */
export interface StorageConfig {
  /** Google Cloud Storage settings */
  gcs: GCSConfig;
  /** BigQuery storage settings */
  bigquery: BigQueryStorageConfig;
}

/**
 * GCP Configuration Interface
 * Defines core GCP infrastructure settings
 */
export interface GCPConfig {
  /** GCP project identifier */
  projectId: string;
  /** GCP region */
  region: string;
  /** GCP service account credentials */
  credentials: {
    /** Service account type */
    type: string;
    /** Project identifier */
    project_id: string;
    /** Private key identifier */
    private_key_id: string;
    /** Private key */
    private_key: string;
    /** Client email */
    client_email: string;
    /** Client identifier */
    client_id: string;
  };
}