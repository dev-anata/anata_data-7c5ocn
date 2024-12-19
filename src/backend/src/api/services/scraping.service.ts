/**
 * Enhanced API service layer for web scraping operations with comprehensive
 * error handling, monitoring, and security features
 * @version 1.0.0
 */

import { injectable } from 'inversify'; // v6.0.1
import { trace, context, SpanStatusCode } from '@opentelemetry/api'; // v1.12.0
import CircuitBreaker from 'opossum'; // v6.0.0
import { RateLimiter } from '@hokify/ratelimit'; // v1.0.0

import { ScrapingJob, JobStatus, JobError } from '../../../scraping/interfaces/job.interface';
import { ScrapingConfig } from '../../../scraping/interfaces/config.interface';
import { JobService } from '../../../scraping/services/job.service';
import { ResultService } from '../../../scraping/services/result.service';
import { LoggerService } from '../../../core/logging/logger.service';
import { ValidationError, NotFoundError } from '../../../core/utils/error.util';

/**
 * Interface for paginated job response
 */
interface PaginatedJobResponse {
  jobs: ScrapingJob[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Interface for job filter criteria
 */
interface JobFilter {
  status?: JobStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * Enhanced API service for web scraping operations
 */
@injectable()
export class ScrapingService {
  private readonly tracer = trace.getTracer('scraping-service');
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly jobService: JobService,
    private readonly resultService: ResultService,
    private readonly logger: LoggerService
  ) {
    // Initialize circuit breaker for external service calls
    this.circuitBreaker = new CircuitBreaker(async (operation: Function) => operation(), {
      timeout: 30000, // 30 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      name: 'scraping-service'
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      max: 100 // max 100 requests per minute
    });

    this.initializeErrorHandlers();
  }

  /**
   * Starts a new web scraping job with comprehensive validation and monitoring
   * @param config - Scraping configuration
   * @returns Created and started job with monitoring info
   */
  public async startScrapingJob(config: ScrapingConfig): Promise<ScrapingJob> {
    const span = this.tracer.startSpan('startScrapingJob');

    try {
      // Rate limit check
      await this.rateLimiter.checkLimit();

      // Validate configuration
      this.validateScrapingConfig(config);

      // Create and start job with circuit breaker
      const job = await this.circuitBreaker.fire(async () => {
        const newJob = await this.jobService.createJob(config);
        
        this.logger.info('Started new scraping job', {
          jobId: newJob.id,
          config: config,
          timestamp: new Date()
        });

        return newJob;
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return job;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      this.logger.error('Failed to start scraping job', error, {
        config: config,
        timestamp: new Date()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Retrieves detailed job status with metrics and diagnostics
   * @param jobId - Job identifier
   * @returns Detailed job status with metrics
   */
  public async getJobStatus(jobId: string): Promise<ScrapingJob> {
    const span = this.tracer.startSpan('getJobStatus');

    try {
      // Rate limit check
      await this.rateLimiter.checkLimit();

      // Validate job ID
      if (!jobId || typeof jobId !== 'string') {
        throw new ValidationError('Invalid job ID');
      }

      // Get job status with circuit breaker
      const job = await this.circuitBreaker.fire(async () => {
        const jobData = await this.jobService.getJob(jobId);
        if (!jobData) {
          throw new NotFoundError(`Job not found: ${jobId}`);
        }
        return jobData;
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return job;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      this.logger.error('Failed to get job status', error, {
        jobId: jobId,
        timestamp: new Date()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Gracefully stops a running job with proper cleanup
   * @param jobId - Job identifier
   */
  public async stopJob(jobId: string): Promise<void> {
    const span = this.tracer.startSpan('stopJob');

    try {
      // Rate limit check
      await this.rateLimiter.checkLimit();

      // Validate job ID
      if (!jobId || typeof jobId !== 'string') {
        throw new ValidationError('Invalid job ID');
      }

      // Stop job with circuit breaker
      await this.circuitBreaker.fire(async () => {
        const job = await this.jobService.getJob(jobId);
        if (!job) {
          throw new NotFoundError(`Job not found: ${jobId}`);
        }

        if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
          throw new ValidationError(`Cannot stop job in ${job.status} status`);
        }

        await this.jobService.updateJobStatus(jobId, JobStatus.CANCELLED, {
          ...job.executionDetails,
          endTime: new Date()
        });

        this.logger.info('Stopped scraping job', {
          jobId: jobId,
          timestamp: new Date()
        });
      });

      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      this.logger.error('Failed to stop job', error, {
        jobId: jobId,
        timestamp: new Date()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Lists jobs with advanced filtering and pagination
   * @param filter - Filter criteria
   * @returns Filtered and paginated job list
   */
  public async listJobs(filter: JobFilter = {}): Promise<PaginatedJobResponse> {
    const span = this.tracer.startSpan('listJobs');

    try {
      // Rate limit check
      await this.rateLimiter.checkLimit();

      // Validate filter parameters
      this.validateJobFilter(filter);

      // Get jobs with circuit breaker
      const jobs = await this.circuitBreaker.fire(async () => {
        const allJobs = await this.jobService.listJobs(filter);
        
        // Apply pagination
        const page = filter.page || 1;
        const pageSize = filter.pageSize || 10;
        const start = (page - 1) * pageSize;
        const paginatedJobs = allJobs.slice(start, start + pageSize);

        return {
          jobs: paginatedJobs,
          total: allJobs.length,
          page: page,
          pageSize: pageSize
        };
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return jobs;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      this.logger.error('Failed to list jobs', error, {
        filter: filter,
        timestamp: new Date()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Retrieves job results with validation and quality checks
   * @param jobId - Job identifier
   * @returns Validated job results
   */
  public async getJobResult(jobId: string): Promise<any> {
    const span = this.tracer.startSpan('getJobResult');

    try {
      // Rate limit check
      await this.rateLimiter.checkLimit();

      // Validate job ID
      if (!jobId || typeof jobId !== 'string') {
        throw new ValidationError('Invalid job ID');
      }

      // Get results with circuit breaker
      const result = await this.circuitBreaker.fire(async () => {
        const job = await this.jobService.getJob(jobId);
        if (!job) {
          throw new NotFoundError(`Job not found: ${jobId}`);
        }

        if (job.status !== JobStatus.COMPLETED) {
          throw new ValidationError(`Cannot get results for job in ${job.status} status`);
        }

        return await this.resultService.getResult(jobId);
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;

    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });

      this.logger.error('Failed to get job result', error, {
        jobId: jobId,
        timestamp: new Date()
      });

      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Initializes error handlers for circuit breaker
   */
  private initializeErrorHandlers(): void {
    this.circuitBreaker.on('open', () => {
      this.logger.error('Circuit breaker opened', new Error('Circuit breaker opened'), {
        service: 'ScrapingService',
        timestamp: new Date()
      });
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.info('Circuit breaker half-open', {
        service: 'ScrapingService',
        timestamp: new Date()
      });
    });

    this.circuitBreaker.on('close', () => {
      this.logger.info('Circuit breaker closed', {
        service: 'ScrapingService',
        timestamp: new Date()
      });
    });
  }

  /**
   * Validates scraping configuration
   * @param config - Configuration to validate
   * @throws ValidationError if configuration is invalid
   */
  private validateScrapingConfig(config: ScrapingConfig): void {
    if (!config.source || !config.source.url) {
      throw new ValidationError('Invalid source configuration');
    }

    if (!config.options || config.options.retryAttempts < 0) {
      throw new ValidationError('Invalid retry configuration');
    }

    if (config.schedule?.enabled && !config.schedule.cronExpression) {
      throw new ValidationError('Invalid schedule configuration');
    }
  }

  /**
   * Validates job filter parameters
   * @param filter - Filter to validate
   * @throws ValidationError if filter is invalid
   */
  private validateJobFilter(filter: JobFilter): void {
    if (filter.page && filter.page < 1) {
      throw new ValidationError('Invalid page number');
    }

    if (filter.pageSize && (filter.pageSize < 1 || filter.pageSize > 100)) {
      throw new ValidationError('Invalid page size');
    }

    if (filter.startDate && filter.endDate && filter.startDate > filter.endDate) {
      throw new ValidationError('Invalid date range');
    }
  }
}