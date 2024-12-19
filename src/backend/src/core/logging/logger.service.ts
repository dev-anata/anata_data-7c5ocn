/**
 * @fileoverview Enhanced logging service with comprehensive error handling, cloud integration, and retention management
 * @version 1.0.0
 */

import { injectable } from 'inversify';
import winston from 'winston'; // ^3.8.0
import { Logging } from '@google-cloud/logging'; // ^9.0.0
import { loggingConfig, cloudLoggingConfig } from '../../config/logging.config';

/**
 * Interface for structured metadata
 */
interface LogMetadata {
  correlationId?: string;
  timestamp?: string;
  source?: string;
  [key: string]: any;
}

/**
 * Interface for retry options
 */
interface RetryOptions {
  attempts: number;
  delay: number;
  factor: number;
  maxDelay: number;
}

/**
 * Enhanced logging service with comprehensive error handling and cloud integration
 */
@injectable()
export class LoggerService {
  private logger: winston.Logger;
  private cloudLogging: Logging;
  private retryManager: RetryManager;
  private metadataFormatter: MetadataFormatter;
  private retentionManager: RetentionManager;

  constructor() {
    this.initializeLogger();
    this.initializeCloudLogging();
    this.initializeManagers();
  }

  /**
   * Initialize Winston logger with configured options
   */
  private initializeLogger(): void {
    this.logger = winston.createLogger({
      level: loggingConfig.level,
      format: loggingConfig.format,
      transports: loggingConfig.transports,
      exitOnError: false
    });
  }

  /**
   * Initialize Google Cloud Logging client
   */
  private initializeCloudLogging(): void {
    if (process.env.NODE_ENV === 'production') {
      this.cloudLogging = new Logging({
        projectId: process.env.GCP_PROJECT_ID,
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
      });
    }
  }

  /**
   * Initialize service managers
   */
  private initializeManagers(): void {
    this.retryManager = new RetryManager(loggingConfig.errorHandling.retryStrategy);
    this.metadataFormatter = new MetadataFormatter();
    this.retentionManager = new RetentionManager(loggingConfig.retentionPolicy);
  }

  /**
   * Enhanced debug level logging with metadata formatting
   */
  public async debug(message: string, meta: LogMetadata = {}): Promise<void> {
    try {
      const formattedMeta = this.metadataFormatter.format(meta);
      await this.retryManager.withRetry(() => 
        this.logger.debug(message, formattedMeta)
      );
      await this.retentionManager.manage('debug');
    } catch (error) {
      await this.handleLoggingError(error, 'debug', message, meta);
    }
  }

  /**
   * Enhanced error logging with comprehensive error details
   */
  public async error(message: string, error: Error, meta: LogMetadata = {}): Promise<void> {
    try {
      const errorMeta = this.formatErrorMetadata(error, meta);
      await this.retryManager.withRetry(() => 
        this.logger.error(message, errorMeta)
      );

      if (this.shouldReportToCloudError(error)) {
        await this.reportToCloudError(message, error, errorMeta);
      }

      await this.retentionManager.manage('error');
    } catch (loggingError) {
      await this.handleLoggingError(loggingError, 'error', message, meta);
    }
  }

  /**
   * Critical error logging with immediate alerts
   */
  public async critical(message: string, error: Error, meta: LogMetadata = {}): Promise<void> {
    try {
      const criticalMeta = this.formatCriticalMetadata(error, meta);
      
      // Immediate cloud logging for critical errors
      if (this.cloudLogging) {
        await this.cloudLogging.entry({
          severity: 'CRITICAL',
          resource: {
            type: cloudLoggingConfig.resourceType,
            labels: cloudLoggingConfig.labels
          }
        }).write(message);
      }

      await this.retryManager.withRetry(() => 
        this.logger.error(message, criticalMeta)
      );

      await this.triggerCriticalAlert(message, error, criticalMeta);
      await this.retentionManager.manage('critical');
    } catch (loggingError) {
      await this.handleLoggingError(loggingError, 'critical', message, meta);
    }
  }

  /**
   * Format error metadata with enhanced details
   */
  private formatErrorMetadata(error: Error, meta: LogMetadata): LogMetadata {
    return {
      ...meta,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      },
      system: {
        nodeEnv: process.env.NODE_ENV,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    };
  }

  /**
   * Format critical error metadata with additional system state
   */
  private formatCriticalMetadata(error: Error, meta: LogMetadata): LogMetadata {
    return {
      ...this.formatErrorMetadata(error, meta),
      critical: {
        processId: process.pid,
        hostname: require('os').hostname(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };
  }

  /**
   * Handle errors that occur during logging
   */
  private async handleLoggingError(
    error: Error,
    level: string,
    originalMessage: string,
    originalMeta: LogMetadata
  ): Promise<void> {
    const fallbackLogger = winston.createLogger({
      transports: [new winston.transports.Console()]
    });

    fallbackLogger.error('Logging error occurred', {
      error: error.message,
      level,
      originalMessage,
      originalMeta
    });
  }

  /**
   * Determine if error should be reported to Cloud Error Reporting
   */
  private shouldReportToCloudError(error: Error): boolean {
    return process.env.NODE_ENV === 'production' &&
           cloudLoggingConfig.errorReporting.enabled &&
           error.stack !== undefined;
  }

  /**
   * Report error to Google Cloud Error Reporting
   */
  private async reportToCloudError(
    message: string,
    error: Error,
    meta: LogMetadata
  ): Promise<void> {
    if (this.cloudLogging) {
      const errorEvent = {
        serviceContext: cloudLoggingConfig.errorReporting.serviceContext,
        message: `${message}: ${error.message}`,
        context: {
          httpRequest: meta.request,
          user: meta.user,
          reportLocation: {
            filePath: error.stack?.split('\n')[1]?.trim() || 'unknown',
            lineNumber: parseInt(error.stack?.split('\n')[1]?.split(':')[1] || '0', 10),
            functionName: error.stack?.split('\n')[0]?.split(':')[0] || 'unknown'
          }
        }
      };

      await this.cloudLogging.error(errorEvent);
    }
  }

  /**
   * Trigger alert for critical errors
   */
  private async triggerCriticalAlert(
    message: string,
    error: Error,
    meta: LogMetadata
  ): Promise<void> {
    const alertThreshold = parseInt(process.env.ALERT_THRESHOLD || '3', 10);
    
    // Implementation would connect to alert management system
    // This is a placeholder for the actual implementation
    console.error('CRITICAL ALERT:', {
      message,
      error: error.message,
      meta,
      threshold: alertThreshold
    });
  }
}

/**
 * Retry manager for handling logging retries
 */
class RetryManager {
  constructor(private options: RetryOptions) {}

  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    for (let attempt = 1; attempt <= this.options.attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.attempts) {
          await this.delay(attempt);
        }
      }
    }
    throw lastError!;
  }

  private delay(attempt: number): Promise<void> {
    const delayMs = Math.min(
      this.options.delay * Math.pow(this.options.factor, attempt - 1),
      this.options.maxDelay
    );
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

/**
 * Metadata formatter for consistent log formatting
 */
class MetadataFormatter {
  format(meta: LogMetadata): LogMetadata {
    return {
      ...meta,
      timestamp: new Date().toISOString(),
      correlationId: meta.correlationId || this.generateCorrelationId(),
      source: meta.source || 'pharma-pipeline'
    };
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Retention manager for log retention policies
 */
class RetentionManager {
  constructor(private policy: any) {}

  async manage(level: string): Promise<void> {
    // Implementation would handle log rotation and archival
    // This is a placeholder for the actual implementation
    if (this.policy.archiveAfterDays > 0) {
      // Archive logs older than archiveAfterDays
    }
    
    if (this.policy.maxFiles > 0) {
      // Rotate logs when maxFiles is reached
    }
    
    if (this.policy.maxSize) {
      // Rotate logs when maxSize is reached
    }
  }
}