// External Dependencies
import { CronExpression } from 'cron-parser'; // v4.0.0

// Internal Dependencies
import { GCPConfig } from '../../../types/gcp';

/**
 * Enumeration of supported scraping source types
 */
export enum ScrapingSourceType {
  WEBSITE = 'WEBSITE',
  API = 'API',
  DOCUMENT = 'DOCUMENT'
}

/**
 * Enumeration of supported authentication types
 */
export enum ScrapingAuthType {
  NONE = 'NONE',
  BASIC = 'BASIC',
  TOKEN = 'TOKEN',
  OAUTH = 'OAUTH'
}

/**
 * Interface for scraping source authentication configuration
 * Provides comprehensive security options for different auth methods
 */
export interface ScrapingAuthConfig {
  /** Authentication type */
  type: ScrapingAuthType;
  /** Encrypted credentials with branded type for additional type safety */
  credentials: Record<string, string & { readonly _brand: 'Credential' }>;
  /** OAuth specific configuration */
  oauth?: {
    tokenUrl: string;
    scopes: string[];
    grantType: string;
  };
  /** Encryption configuration for sensitive data */
  encryption: {
    algorithm: string;
    keyId: string;
  };
}

/**
 * Interface for scraping source configuration
 * Defines the structure and validation rules for data sources
 */
export interface ScrapingSourceConfig {
  /** Source type identifier */
  type: ScrapingSourceType;
  /** Validated URL with branded type */
  url: string & { readonly _brand: 'URL' };
  /** Data extraction selectors with type and requirement specifications */
  selectors: Record<string, {
    selector: string;
    type: 'css' | 'xpath';
    required: boolean;
  }>;
  /** Optional authentication configuration */
  authentication?: ScrapingAuthConfig;
  /** Data validation rules */
  validation: {
    schema: string;
    rules: Record<string, unknown>;
  };
}

/**
 * Interface for job scheduling configuration
 * Provides comprehensive scheduling options with validation
 */
export interface ScrapingScheduleConfig {
  /** Schedule activation flag */
  enabled: boolean;
  /** Validated cron expression with branded type */
  cronExpression: CronExpression & { readonly _brand: 'ValidCron' };
  /** Validated timezone with branded type */
  timezone: string & { readonly _brand: 'Timezone' };
  /** Schedule validation constraints */
  validation: {
    maxFrequency: number;
    minInterval: number;
  };
}

/**
 * Interface for scraping behavior configuration
 * Defines operational parameters with enhanced type safety
 */
export interface ScrapingOptionsConfig {
  /** Validated retry attempts count */
  retryAttempts: number & { readonly _brand: 'RetryCount' };
  /** Retry delay in milliseconds */
  retryDelay: number & { readonly _brand: 'Milliseconds' };
  /** Operation timeout in milliseconds */
  timeout: number & { readonly _brand: 'Milliseconds' };
  /** Validated user agent string */
  userAgent: string & { readonly _brand: 'UserAgent' };
  /** Rate limiting configuration */
  rateLimit: {
    requests: number;
    period: number;
  };
}

/**
 * Main interface for scraping job configuration
 * Provides comprehensive configuration options with enhanced type safety
 */
export interface ScrapingConfig {
  /** Unique job identifier with branded type for additional type safety */
  jobId: string & { readonly brand: unique symbol };
  /** Source configuration */
  source: ScrapingSourceConfig;
  /** Schedule configuration */
  schedule: ScrapingScheduleConfig;
  /** Scraping options */
  options: ScrapingOptionsConfig;
  /** GCP-specific configuration */
  gcp: GCPConfig;
}