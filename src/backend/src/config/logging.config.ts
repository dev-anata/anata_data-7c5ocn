/**
 * @fileoverview Centralized logging configuration for the Pharmaceutical Data Pipeline Platform
 * @version 1.0.0
 */

import winston from 'winston'; // ^3.8.0
import { Logging } from '@google-cloud/logging'; // ^9.0.0
import { GCPConfig } from '../core/interfaces/config.interface';

/**
 * Enhanced interface for Winston logger configuration with retention and error handling
 */
interface LoggingConfig {
  level: string;
  format: winston.Logform.Format;
  transports: winston.transport[];
  exitOnError: boolean;
  silent: boolean;
  retentionPolicy: {
    maxSize: string;
    maxFiles: number;
    archiveAfterDays: number;
  };
  errorHandling: {
    captureStackTrace: boolean;
    maxStackSize: number;
    retryStrategy: {
      retries: number;
      factor: number;
      minTimeout: number;
      maxTimeout: number;
    };
  };
}

/**
 * Enhanced interface for Google Cloud Logging configuration
 */
interface CloudLoggingConfig {
  logName: string;
  resourceType: string;
  labels: Record<string, string>;
  errorReporting: {
    enabled: boolean;
    serviceContext: {
      service: string;
      version: string;
    };
  };
  retention: {
    retentionDays: number;
    archivePolicy: string;
  };
}

/**
 * Creates Winston log format configuration with enhanced formatting options
 */
const createLogFormat = (): winston.Logform.Format => {
  return winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS ZZ'
    }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'stack']
    }),
    winston.format.colorize({ all: process.env.NODE_ENV !== 'production' }),
    winston.format((info) => {
      // Mask sensitive data in logs
      if (info.metadata?.sensitive) {
        info.metadata.sensitive = '[REDACTED]';
      }
      return info;
    })(),
    winston.format.json({
      space: process.env.NODE_ENV !== 'production' ? 2 : 0
    })
  );
};

/**
 * Creates environment-specific logging transports with proper configuration
 */
const createTransports = (gcpConfig: GCPConfig): winston.transport[] => {
  const transports: winston.transport[] = [];

  // Console transport for all environments
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
      handleExceptions: true,
      handleRejections: true
    })
  );

  // File transport for development environment
  if (process.env.NODE_ENV === 'development') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
      })
    );
  }

  // Google Cloud Logging transport for production
  if (process.env.NODE_ENV === 'production') {
    const logging = new Logging({
      projectId: gcpConfig.projectId,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    const cloudLogging = logging.log('pharma-pipeline-logs');

    transports.push(
      new winston.transports.Stream({
        stream: cloudLogging.write.bind(cloudLogging),
        level: 'info'
      })
    );
  }

  return transports;
};

/**
 * Main logging configuration
 */
export const loggingConfig: LoggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: createLogFormat(),
  transports: createTransports({
    projectId: process.env.GCP_PROJECT_ID || '',
    region: 'us-central1',
    credentials: {} as any // Credentials are handled through environment variables
  }),
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test',
  retentionPolicy: {
    maxSize: '1gb',
    maxFiles: 10,
    archiveAfterDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10)
  },
  errorHandling: {
    captureStackTrace: true,
    maxStackSize: 10,
    retryStrategy: {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30000
    }
  }
};

/**
 * Google Cloud Logging specific configuration
 */
export const cloudLoggingConfig: CloudLoggingConfig = {
  logName: 'pharma-pipeline-logs',
  resourceType: 'cloud_run_revision',
  labels: {
    environment: process.env.NODE_ENV || 'development',
    service: 'pharma-pipeline',
    version: process.env.npm_package_version || '1.0.0'
  },
  errorReporting: {
    enabled: process.env.NODE_ENV === 'production',
    serviceContext: {
      service: 'pharma-pipeline',
      version: process.env.npm_package_version || '1.0.0'
    }
  },
  retention: {
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '30', 10),
    archivePolicy: 'archive-after-retention'
  }
};

/**
 * Default export for the logging configuration
 */
export default {
  logging: loggingConfig,
  cloudLogging: cloudLoggingConfig
};