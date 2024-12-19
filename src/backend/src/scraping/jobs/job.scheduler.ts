/**
 * Enhanced job scheduler implementation for web scraping operations
 * Provides comprehensive scheduling and execution management with reliability features
 * @version 1.0.0
 */

import { injectable } from 'inversify'; // ^6.0.1
import { CloudScheduler } from '@google-cloud/scheduler'; // ^3.0.0
import { parse as parseCron } from 'cron-parser'; // ^4.0.0
import CircuitBreaker from 'circuit-breaker-ts'; // ^1.0.0

import { JobManager } from './job.manager';
import { ScrapingJob, JobStatus, JobError, JobMetrics } from '../interfaces/job.interface';
import { ScrapingConfig, ScrapingScheduleConfig } from '../interfaces/config.interface';
import { LoggerService } from '../../../core/logging/logger.service';
import { ValidationError } from '../../../core/utils/error.util';

/**
 * Interface for job schedule metadata
 */
interface ScheduleMetadata {
  jobId: string;
  cronExpression: string;
  timezone: string;
  retryConfig: RetryConfig;
}

/**
 * Interface for retry configuration
 */
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Enhanced job scheduler for managing automated execution of web scraping jobs
 */
@injectable()
export class JobScheduler {
  private readonly CLOUD_SCHEDULER_LOCATION = 'us-central1';
  private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2
  };

  private readonly scheduler: CloudScheduler;
  private readonly schedulerCircuitBreaker: CircuitBreaker;
  private readonly activeSchedules: Map<string, ScheduleMetadata>;

  /**
   * Creates a new JobScheduler instance
   * @param jobManager - Service for job execution management
   * @param logger - Logging service for monitoring
   */
  constructor(
    private readonly jobManager: JobManager,
    private readonly logger: LoggerService
  ) {
    this.scheduler = new CloudScheduler({
      projectId: process.env.GCP_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    this.schedulerCircuitBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });

    this.activeSchedules = new Map();
    this.initializeCircuitBreakerHandlers();
  }

  /**
   * Schedules a new scraping job with comprehensive validation
   * @param config - Job configuration
   * @returns Created and scheduled job
   */
  public async scheduleJob(config: ScrapingConfig): Promise<ScrapingJob> {
    try {
      this.validateScheduleConfig(config.schedule);

      const jobId = `scraping-job-${Date.now()}`;
      const scheduleId = `schedule-${jobId}`;

      // Create Cloud Scheduler job
      await this.schedulerCircuitBreaker.fire(async () => {
        const job = {
          name: `projects/${process.env.GCP_PROJECT_ID}/locations/${this.CLOUD_SCHEDULER_LOCATION}/jobs/${scheduleId}`,
          schedule: config.schedule.cronExpression,
          timeZone: config.schedule.timezone,
          httpTarget: {
            uri: `${process.env.API_BASE_URL}/api/v1/jobs/${jobId}/execute`,
            httpMethod: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.INTERNAL_API_KEY
            }
          },
          retryConfig: {
            retryCount: this.DEFAULT_RETRY_CONFIG.maxAttempts,
            minBackoffDuration: { seconds: this.DEFAULT_RETRY_CONFIG.initialDelayMs / 1000 },
            maxBackoffDuration: { seconds: this.DEFAULT_RETRY_CONFIG.maxDelayMs / 1000 },
            maxDoublings: Math.log2(this.DEFAULT_RETRY_CONFIG.backoffMultiplier)
          }
        };

        await this.scheduler.createJob({ parent: job.name, job });
      });

      // Store schedule metadata
      this.activeSchedules.set(jobId, {
        jobId,
        cronExpression: config.schedule.cronExpression,
        timezone: config.schedule.timezone,
        retryConfig: this.DEFAULT_RETRY_CONFIG
      });

      this.logger.debug('Job scheduled successfully', {
        jobId,
        scheduleId,
        cronExpression: config.schedule.cronExpression
      });

      return {
        id: jobId,
        config,
        status: JobStatus.SCHEDULED,
        createdAt: new Date(),
        updatedAt: new Date(),
        executionDetails: {
          startTime: new Date(),
          endTime: new Date(),
          duration: 0,
          attempts: 0,
          metrics: this.initializeMetrics(),
          lastCheckpoint: '',
          progress: 0
        },
        retryCount: 0
      };
    } catch (error) {
      this.logger.error('Failed to schedule job', error as Error, { config });
      throw error;
    }
  }

  /**
   * Handles scheduled job execution with comprehensive error handling
   * @param jobId - Job identifier
   */
  public async handleScheduledExecution(jobId: string): Promise<void> {
    try {
      const schedule = this.activeSchedules.get(jobId);
      if (!schedule) {
        throw new ValidationError(`No schedule found for job ${jobId}`);
      }

      await this.jobManager.executeJob(jobId);

      this.logger.debug('Scheduled execution completed', { jobId });
    } catch (error) {
      this.logger.error('Scheduled execution failed', error as Error, { jobId });
      throw error;
    }
  }

  /**
   * Unschedules a job and cleans up resources
   * @param jobId - Job identifier
   */
  public async unscheduleJob(jobId: string): Promise<void> {
    try {
      const schedule = this.activeSchedules.get(jobId);
      if (!schedule) {
        throw new ValidationError(`No schedule found for job ${jobId}`);
      }

      const scheduleId = `schedule-${jobId}`;
      const name = `projects/${process.env.GCP_PROJECT_ID}/locations/${this.CLOUD_SCHEDULER_LOCATION}/jobs/${scheduleId}`;

      await this.schedulerCircuitBreaker.fire(async () => {
        await this.scheduler.deleteJob({ name });
      });

      this.activeSchedules.delete(jobId);

      this.logger.debug('Job unscheduled successfully', { jobId });
    } catch (error) {
      this.logger.error('Failed to unschedule job', error as Error, { jobId });
      throw error;
    }
  }

  /**
   * Lists all scheduled jobs with their metadata
   * @returns Array of scheduled job information
   */
  public async listScheduledJobs(): Promise<Array<{ jobId: string; schedule: ScheduleMetadata }>> {
    try {
      const scheduledJobs: Array<{ jobId: string; schedule: ScheduleMetadata }> = [];

      for (const [jobId, schedule] of this.activeSchedules.entries()) {
        scheduledJobs.push({ jobId, schedule });
      }

      return scheduledJobs;
    } catch (error) {
      this.logger.error('Failed to list scheduled jobs', error as Error);
      throw error;
    }
  }

  /**
   * Initializes circuit breaker event handlers
   */
  private initializeCircuitBreakerHandlers(): void {
    this.schedulerCircuitBreaker.on('open', () => {
      this.logger.error('Scheduler circuit breaker opened', new Error('Circuit breaker opened'));
    });

    this.schedulerCircuitBreaker.on('halfOpen', () => {
      this.logger.info('Scheduler circuit breaker half-open');
    });

    this.schedulerCircuitBreaker.on('close', () => {
      this.logger.info('Scheduler circuit breaker closed');
    });
  }

  /**
   * Validates job schedule configuration
   * @param schedule - Schedule configuration to validate
   * @throws ValidationError if configuration is invalid
   */
  private validateScheduleConfig(schedule: ScrapingScheduleConfig): void {
    if (!schedule.enabled) {
      throw new ValidationError('Schedule is not enabled');
    }

    try {
      parseCron(schedule.cronExpression);
    } catch (error) {
      throw new ValidationError(`Invalid cron expression: ${error.message}`);
    }

    if (!schedule.timezone) {
      throw new ValidationError('Timezone is required');
    }
  }

  /**
   * Initializes metrics tracking for new job
   */
  private initializeMetrics(): JobMetrics {
    return {
      requestCount: 0,
      bytesProcessed: 0,
      itemsScraped: 0,
      errorCount: 0,
      avgResponseTime: 0,
      successRate: 100,
      bandwidthUsage: 0,
      retryRate: 0
    };
  }
}