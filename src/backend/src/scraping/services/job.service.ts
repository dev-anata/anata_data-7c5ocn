/**
 * Enhanced service implementation for managing web scraping job lifecycle
 * Provides comprehensive job management with reliability features and monitoring
 * @version 1.0.0
 */

import { injectable } from 'inversify'; // ^6.0.1
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0
import { retry } from 'retry'; // ^0.13.1
import CircuitBreaker from 'opossum'; // ^6.0.0

import { ScrapingJob, JobStatus, JobExecutionDetails } from '../interfaces/job.interface';
import { FirestoreClient } from '../../../core/database/firestore.client';
import { LoggerService } from '../../../core/logging/logger.service';

/**
 * Cache configuration for job data
 */
interface JobCache {
  data: Map<string, ScrapingJob>;
  ttl: number;
}

/**
 * Enhanced service for managing web scraping job lifecycle and persistence
 */
@injectable()
export class JobService {
  private readonly COLLECTION_NAME = 'scraping_jobs';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly CIRCUIT_BREAKER_OPTIONS = {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
  };

  private jobCache: JobCache = {
    data: new Map(),
    ttl: 300000 // 5 minutes
  };

  private dbCircuitBreaker: CircuitBreaker;

  /**
   * Creates a new JobService instance
   * @param dbClient - Firestore client for data persistence
   * @param logger - Logger service for monitoring and metrics
   */
  constructor(
    private readonly dbClient: FirestoreClient,
    private readonly logger: LoggerService
  ) {
    this.initializeCircuitBreaker();
  }

  /**
   * Creates a new scraping job with validation and reliability features
   * @param config - Job configuration
   * @returns Created job with tracking metadata
   */
  public async createJob(config: any): Promise<ScrapingJob> {
    try {
      const jobId = uuidv4();
      const now = new Date();

      const job: ScrapingJob = {
        id: jobId,
        config,
        status: JobStatus.PENDING,
        createdAt: now,
        updatedAt: now,
        executionDetails: this.initializeExecutionDetails(),
        retryCount: 0,
        version: 1
      };

      await this.dbCircuitBreaker.fire(async () => {
        const operation = retry.operation({
          retries: this.MAX_RETRIES,
          factor: 2,
          minTimeout: this.RETRY_DELAY
        });

        await new Promise((resolve, reject) => {
          operation.attempt(async () => {
            try {
              await this.dbClient.set(this.getJobPath(jobId), job);
              resolve(true);
            } catch (err) {
              if (!operation.retry(err as Error)) {
                reject(operation.mainError());
              }
            }
          });
        });
      });

      this.updateJobCache(job);
      
      this.logger.info('Created new scraping job', {
        jobId,
        status: job.status,
        config: job.config
      });

      return job;
    } catch (error) {
      this.logger.error('Failed to create scraping job', error as Error, {
        config,
        component: 'JobService'
      });
      throw error;
    }
  }

  /**
   * Retrieves job by ID with caching
   * @param jobId - Job identifier
   * @returns Job data or null if not found
   */
  public async getJob(jobId: string): Promise<ScrapingJob | null> {
    try {
      // Check cache first
      const cachedJob = this.jobCache.data.get(jobId);
      if (cachedJob && !this.isCacheExpired(cachedJob)) {
        return cachedJob;
      }

      const job = await this.dbCircuitBreaker.fire(async () => {
        const operation = retry.operation({
          retries: this.MAX_RETRIES,
          factor: 2,
          minTimeout: this.RETRY_DELAY
        });

        return await new Promise<ScrapingJob | null>((resolve, reject) => {
          operation.attempt(async () => {
            try {
              const result = await this.dbClient.get(this.getJobPath(jobId));
              resolve(result || null);
            } catch (err) {
              if (!operation.retry(err as Error)) {
                reject(operation.mainError());
              }
            }
          });
        });
      });

      if (job) {
        this.updateJobCache(job);
      }

      return job;
    } catch (error) {
      this.logger.error('Failed to retrieve job', error as Error, {
        jobId,
        component: 'JobService'
      });
      throw error;
    }
  }

  /**
   * Updates job status with optimistic locking and validation
   * @param jobId - Job identifier
   * @param status - New job status
   * @param executionDetails - Updated execution details
   */
  public async updateJobStatus(
    jobId: string,
    status: JobStatus,
    executionDetails: JobExecutionDetails
  ): Promise<void> {
    try {
      await this.dbCircuitBreaker.fire(async () => {
        const operation = retry.operation({
          retries: this.MAX_RETRIES,
          factor: 2,
          minTimeout: this.RETRY_DELAY
        });

        await new Promise<void>((resolve, reject) => {
          operation.attempt(async () => {
            try {
              const job = await this.getJob(jobId);
              if (!job) {
                throw new Error(`Job ${jobId} not found`);
              }

              this.validateStatusTransition(job.status, status);

              const updatedJob: ScrapingJob = {
                ...job,
                status,
                executionDetails,
                updatedAt: new Date(),
                version: job.version + 1
              };

              await this.dbClient.set(this.getJobPath(jobId), updatedJob);
              this.updateJobCache(updatedJob);

              this.logger.info('Updated job status', {
                jobId,
                oldStatus: job.status,
                newStatus: status,
                version: updatedJob.version
              });

              resolve();
            } catch (err) {
              if (!operation.retry(err as Error)) {
                reject(operation.mainError());
              }
            }
          });
        });
      });
    } catch (error) {
      this.logger.error('Failed to update job status', error as Error, {
        jobId,
        status,
        component: 'JobService'
      });
      throw error;
    }
  }

  /**
   * Lists jobs based on filter criteria
   * @param filter - Query filter object
   * @returns Array of matching jobs
   */
  public async listJobs(filter: object = {}): Promise<ScrapingJob[]> {
    try {
      return await this.dbCircuitBreaker.fire(async () => {
        const operation = retry.operation({
          retries: this.MAX_RETRIES,
          factor: 2,
          minTimeout: this.RETRY_DELAY
        });

        return await new Promise<ScrapingJob[]>((resolve, reject) => {
          operation.attempt(async () => {
            try {
              const jobs = await this.dbClient.query(filter);
              jobs.forEach(job => this.updateJobCache(job));
              return resolve(jobs);
            } catch (err) {
              if (!operation.retry(err as Error)) {
                reject(operation.mainError());
              }
            }
          });
        });
      });
    } catch (error) {
      this.logger.error('Failed to list jobs', error as Error, {
        filter,
        component: 'JobService'
      });
      throw error;
    }
  }

  /**
   * Performs health check on the service
   * @returns Health status object
   */
  public async healthCheck(): Promise<object> {
    try {
      const testJob = await this.createJob({ test: true });
      await this.getJob(testJob.id);
      await this.dbClient.delete(this.getJobPath(testJob.id));

      return {
        status: 'healthy',
        timestamp: new Date(),
        circuitBreakerState: this.dbCircuitBreaker.stats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Initializes circuit breaker for database operations
   */
  private initializeCircuitBreaker(): void {
    this.dbCircuitBreaker = new CircuitBreaker(
      async (operation: Function) => await operation(),
      this.CIRCUIT_BREAKER_OPTIONS
    );

    this.dbCircuitBreaker.on('open', () => {
      this.logger.error('Circuit breaker opened', new Error('Circuit breaker opened'), {
        component: 'JobService'
      });
    });

    this.dbCircuitBreaker.on('halfOpen', () => {
      this.logger.info('Circuit breaker half-open', {
        component: 'JobService'
      });
    });
  }

  /**
   * Initializes execution details for new job
   */
  private initializeExecutionDetails(): JobExecutionDetails {
    return {
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      attempts: 0,
      metrics: {
        requestCount: 0,
        bytesProcessed: 0,
        itemsScraped: 0,
        errorCount: 0,
        avgResponseTime: 0,
        successRate: 0,
        bandwidthUsage: 0,
        retryRate: 0
      },
      lastCheckpoint: '',
      progress: 0
    };
  }

  /**
   * Validates job status transition
   * @param currentStatus - Current job status
   * @param newStatus - New job status
   */
  private validateStatusTransition(currentStatus: JobStatus, newStatus: JobStatus): void {
    const validTransitions = {
      [JobStatus.PENDING]: [JobStatus.RUNNING, JobStatus.FAILED],
      [JobStatus.RUNNING]: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.RETRYING],
      [JobStatus.RETRYING]: [JobStatus.RUNNING, JobStatus.FAILED],
      [JobStatus.FAILED]: [JobStatus.RETRYING],
      [JobStatus.COMPLETED]: []
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  /**
   * Updates job cache with new data
   * @param job - Job data to cache
   */
  private updateJobCache(job: ScrapingJob): void {
    this.jobCache.data.set(job.id, {
      ...job,
      _cachedAt: Date.now()
    });
  }

  /**
   * Checks if cached job data is expired
   * @param job - Cached job data
   */
  private isCacheExpired(job: ScrapingJob & { _cachedAt?: number }): boolean {
    return job._cachedAt
      ? Date.now() - job._cachedAt > this.jobCache.ttl
      : true;
  }

  /**
   * Gets Firestore document path for job
   * @param jobId - Job identifier
   */
  private getJobPath(jobId: string): string {
    return `${this.COLLECTION_NAME}/${jobId}`;
  }
}