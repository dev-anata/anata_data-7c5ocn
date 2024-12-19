/**
 * @fileoverview Data handling interfaces for the Pharmaceutical Data Pipeline API
 * Defines TypeScript interfaces and types for data sources, classification,
 * metadata, and query interfaces.
 * @version 1.0.0
 */

import { StorageConfig, BigQueryConfig } from '../../types/gcp';

/**
 * Enumeration of possible data sources in the pipeline
 */
export enum DataSource {
  SCRAPING = 'SCRAPING',
  DOCUMENT = 'DOCUMENT',
  API = 'API'
}

/**
 * Data classification levels based on sensitivity and access requirements
 * Aligned with security specifications in section 7.2.3
 */
export enum DataClassification {
  PUBLIC = 'PUBLIC',         // Open data with basic encryption
  INTERNAL = 'INTERNAL',     // Business data with encryption + IAM
  CONFIDENTIAL = 'CONFIDENTIAL', // Sensitive data with full security stack
  RESTRICTED = 'RESTRICTED'  // Regulated data with maximum security
}

/**
 * Interface for data metadata information
 * Tracks source, classification, retention, and audit information
 */
export interface DataMetadata {
  /** Unique identifier of the data source */
  sourceId: string;
  
  /** Type of data source */
  sourceType: DataSource;
  
  /** Data classification level */
  classification: DataClassification;
  
  /** Timestamp of data creation */
  createdAt: Date;
  
  /** Retention period in days */
  retentionPeriod: number;
  
  /** Indicates if data is encrypted */
  encryptionStatus: boolean;
  
  /** Geographic jurisdiction for data governance */
  jurisdiction: string;
  
  /** Last modification timestamp */
  lastModifiedAt: Date;
  
  /** Identity of last modifier */
  lastModifiedBy: string;
}

/**
 * Interface for individual data records
 * Represents a single data entity with content and metadata
 */
export interface DataRecord {
  /** Unique identifier for the record */
  id: string;
  
  /** Actual data content as key-value pairs */
  content: Record<string, any>;
  
  /** Associated metadata */
  metadata: DataMetadata;
  
  /** Schema version for data compatibility */
  version: string;
  
  /** Data integrity checksum */
  checksum: string;
}

/**
 * Interface for data query parameters
 * Supports filtering, pagination, and sorting of data records
 */
export interface DataQuery {
  /** Query filters as key-value pairs */
  filters: Record<string, any>;
  
  /** Pagination parameters */
  pagination: {
    page: number;
    pageSize: number;
  };
  
  /** Sorting configuration */
  sort: {
    field: string;
    order: 'asc' | 'desc';
  };
  
  /** Flag to include metadata in results */
  includeMetadata: boolean;
  
  /** Filter by classification levels */
  classification: DataClassification[];
}

/**
 * Interface for paginated query results
 * Provides data records with pagination metadata
 */
export interface DataResult {
  /** Array of matching data records */
  data: DataRecord[];
  
  /** Total number of records matching query */
  total: number;
  
  /** Current page number */
  page: number;
  
  /** Number of records per page */
  pageSize: number;
  
  /** Indicates if more pages are available */
  hasNextPage: boolean;
  
  /** Query execution time in milliseconds */
  queryTime: number;
}