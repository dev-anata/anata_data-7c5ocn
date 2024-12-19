// External Dependencies
import { injectable } from 'inversify'; // v6.0.1
import { retry, RetryConfig } from 'retry-ts'; // v0.1.4
import CircuitBreaker from 'opossum'; // v6.0.0

// Internal Dependencies
import { ScrapingConfig } from '../interfaces/config.interface';
import { ScrapingResult } from '../interfaces/result.interface';
import { BaseError } from '../../../core/utils/error.util';
import { LoggerService } from '../../../core/logging/logger.service';

/**
 * Error types specific to scraping operations
 */
export enum ScrapingErrorType {
  NETWORK = 'NETWORK_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  PARSING = 'PARSING_ERROR',
  TIMEOUT = 'TIMEOUT_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  INTERNAL = 'INTERNAL_ERROR'
}

/**
 * Custom error class for scraping operations
 */
export class ScrapingError extends BaseError {
  constructor(
    public readonly type: ScrapingErrorType,
    message: string,
    public readonly retryable: boolean = false,
    public readonly context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'ScrapingError';
  }
}

/**
 * Interface for scraping metrics
 */
interface ScrapingMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  requestCount: number;
  bytesProcessed: number;
  itemsScraped: number;
  retryCount: number;
  errors: Array<{
    type: ScrapingErrorType;
    timestamp: Date;
    message: string;
  }>;
}

/**
 * Abstract base scraper class implementing template pattern
 * Provides comprehensive error handling and monitoring
 */
@injectable()
export abstract class BaseScraper {
  protected config!: ScrapingConfig;
  protected metrics: ScrapingMetrics;
  protected circuitBreaker: CircuitBreaker;
  
  constructor(protected readonly logger: LoggerService) {
    // Initialize metrics
    this.metrics = {
      startTime: new Date(),
      requestCount: 0,
      bytesProcessed: 0,
      itemsScraped: 0,
      retryCount: 0,
      errors: []
    };

    // Configure circuit breaker
    this.circuitBreaker = new CircuitBreaker(this.executeWithRetry.bind(this), {
      timeout: 30000, // 30 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      rollingCountTimeout: 10000
    });

    this.setupCircuitBreakerEvents();
  }

  /**
   * Initialize scraper with configuration
   * @param config Scraping configuration
   */
  public async initialize(config: ScrapingConfig): Promise<void> {
    try {
      await this.validateConfig(config);
      this.config = config;
      
      this.logger.info('Scraper initialized', {
        jobId: config.jobId,
        source: config.source
      });
    } catch (error) {
      throw new ScrapingError(
        ScrapingErrorType.INTERNAL,
        `Initialization failed: ${error.message}`,
        false,
        { config }
      );
    }
  }

  /**
   * Template method defining the scraping workflow
   */
  public async execute(): Promise<ScrapingResult> {
    this.metrics.startTime = new Date();
    
    try {
      // Execute pre-scraping operations
      await this.beforeScraping();

      // Perform scraping with circuit breaker
      const rawData = await this.circuitBreaker.fire();

      // Process scraped data
      const result = await this.processScrapedData(rawData);

      // Execute post-scraping operations
      await this.afterScraping(result);

      // Update metrics
      this.metrics.endTime = new Date();
      this.metrics.duration = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();

      return this.createResult(result);
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  /**
   * Abstract method for validating prerequisites
   */
  protected abstract validatePrerequisites(): Promise<void>;

  /**
   * Abstract method for performing actual scraping
   */
  protected abstract performScraping(): Promise<any>;

  /**
   * Abstract method for processing scraped data
   */
  protected abstract processScrapedData(rawData: any): Promise<any>;

  /**
   * Pre-scraping operations
   */
  protected async beforeScraping(): Promise<void> {
    await this.validatePrerequisites();
    this.logger.debug('Starting scraping operation', {
      jobId: this.config.jobId,
      source: this.config.source
    });
  }

  /**
   * Post-scraping operations
   */
  protected async afterScraping(result: any): Promise<void> {
    this.logger.debug('Completed scraping operation', {
      jobId: this.config.jobId,
      metrics: this.metrics
    });
  }

  /**
   * Execute scraping with retry mechanism
   */
  private async executeWithRetry(): Promise<any> {
    const retryConfig: RetryConfig = {
      maxTries: this.config.options.retryAttempts,
      delay: this.config.options.retryDelay,
      backoff: 'exponential'
    };

    return retry(async () => {
      this.metrics.requestCount++;
      return await this.performScraping();
    }, retryConfig);
  }

  /**
   * Validate scraping configuration
   */
  private async validateConfig(config: ScrapingConfig): Promise<void> {
    if (!config.jobId) {
      throw new ScrapingError(
        ScrapingErrorType.VALIDATION,
        'Missing job ID',
        false,
        { config }
      );
    }

    if (!config.source || !config.source.url) {
      throw new ScrapingError(
        ScrapingErrorType.VALIDATION,
        'Invalid source configuration',
        false,
        { config }
      );
    }
  }

  /**
   * Setup circuit breaker event handlers
   */
  private setupCircuitBreakerEvents(): void {
    this.circuitBreaker.on('open', () => {
      this.logger.warn('Circuit breaker opened', {
        jobId: this.config?.jobId
      });
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info('Circuit breaker half-open', {
        jobId: this.config?.jobId
      });
    });

    this.circuitBreaker.on('close', () => {
      this.logger.info('Circuit breaker closed', {
        jobId: this.config?.jobId
      });
    });
  }

  /**
   * Enhanced error handling with retry decision logic
   */
  protected async handleError(error: Error): Promise<void> {
    const scrapingError = error instanceof ScrapingError ? error :
      new ScrapingError(
        ScrapingErrorType.INTERNAL,
        error.message,
        false,
        { originalError: error }
      );

    this.metrics.errors.push({
      type: scrapingError.type,
      timestamp: new Date(),
      message: scrapingError.message
    });

    this.logger.error('Scraping error occurred', {
      jobId: this.config?.jobId,
      error: scrapingError,
      metrics: this.metrics
    });

    if (this.metrics.errors.length >= (this.config?.options.retryAttempts || 3)) {
      throw new ScrapingError(
        ScrapingErrorType.INTERNAL,
        'Max retry attempts exceeded',
        false,
        { metrics: this.metrics }
      );
    }
  }

  /**
   * Create final result with metrics
   */
  private createResult(data: any): ScrapingResult {
    return {
      id: `${this.config.jobId}-${Date.now()}`,
      jobId: this.config.jobId,
      sourceType: this.config.source.type,
      sourceUrl: this.config.source.url,
      timestamp: new Date(),
      data,
      metrics: this.metrics
    };
  }
}