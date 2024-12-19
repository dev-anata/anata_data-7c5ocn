/**
 * Comprehensive test suite for JobScheduler class
 * Tests automated execution of web scraping jobs with reliability features
 * @version 1.0.0
 */

import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { CloudScheduler } from '@google-cloud/scheduler';
import { JobScheduler } from '../../../../src/scraping/jobs/job.scheduler';
import { JobManager } from '../../../../src/scraping/jobs/job.manager';
import { JobService } from '../../../../src/scraping/services/job.service';
import { LoggerService } from '../../../../src/core/logging/logger.service';
import { ValidationError } from '../../../../src/core/utils/error.util';
import { ScrapingJob, JobStatus } from '../../../../src/scraping/interfaces/job.interface';
import { ScrapingConfig } from '../../../../src/scraping/interfaces/config.interface';

// Mock implementations
jest.mock('@google-cloud/scheduler');
jest.mock('../../../../src/scraping/jobs/job.manager');
jest.mock('../../../../src/scraping/services/job.service');
jest.mock('../../../../src/core/logging/logger.service');

describe('JobScheduler', () => {
  // Test fixtures
  let jobScheduler: JobScheduler;
  let mockJobManager: jest.Mocked<JobManager>;
  let mockJobService: jest.Mocked<JobService>;
  let mockLogger: jest.Mocked<LoggerService>;
  let mockCloudScheduler: jest.Mocked<CloudScheduler>;

  // Test data
  const validConfig: ScrapingConfig = {
    jobId: 'test-job-123' as any,
    source: {
      type: 'WEBSITE',
      url: 'https://test.com' as any,
      selectors: {
        title: { selector: 'h1', type: 'css', required: true }
      },
      validation: {
        schema: 'test-schema',
        rules: {}
      }
    },
    schedule: {
      enabled: true,
      cronExpression: '0 * * * *' as any,
      timezone: 'UTC' as any,
      validation: {
        maxFrequency: 3600,
        minInterval: 300
      }
    },
    options: {
      retryAttempts: 3 as any,
      retryDelay: 1000 as any,
      timeout: 30000 as any,
      userAgent: 'test-agent' as any,
      rateLimit: {
        requests: 10,
        period: 60
      }
    },
    gcp: {
      projectId: 'test-project',
      region: 'us-central1',
      credentials: {
        client_email: 'test@test.com',
        private_key: 'test-key',
        type: 'service_account'
      }
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocks
    mockJobManager = {
      executeJob: jest.fn(),
      validateJob: jest.fn(),
      handleFailure: jest.fn()
    } as any;

    mockJobService = {
      createJob: jest.fn(),
      updateJobStatus: jest.fn(),
      listJobs: jest.fn(),
      getJobHistory: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn()
    } as any;

    mockCloudScheduler = {
      createJob: jest.fn(),
      deleteJob: jest.fn(),
      getJob: jest.fn(),
      listJobs: jest.fn()
    } as any;

    // Initialize JobScheduler with mocks
    jobScheduler = new JobScheduler(mockJobManager, mockLogger);
    (jobScheduler as any).scheduler = mockCloudScheduler;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('scheduleJob', () => {
    test('should successfully schedule a job with valid config', async () => {
      // Setup
      const expectedJob: Partial<ScrapingJob> = {
        id: expect.any(String),
        config: validConfig,
        status: JobStatus.SCHEDULED
      };

      mockCloudScheduler.createJob.mockResolvedValueOnce({} as any);

      // Execute
      const result = await jobScheduler.scheduleJob(validConfig);

      // Verify
      expect(result).toMatchObject(expectedJob);
      expect(mockCloudScheduler.createJob).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Job scheduled successfully',
        expect.any(Object)
      );
    });

    test('should handle scheduling conflicts with retry', async () => {
      // Setup
      const conflictError = new Error('Job already exists');
      mockCloudScheduler.createJob
        .mockRejectedValueOnce(conflictError)
        .mockResolvedValueOnce({} as any);

      // Execute
      const result = await jobScheduler.scheduleJob(validConfig);

      // Verify
      expect(result).toBeDefined();
      expect(mockCloudScheduler.createJob).toHaveBeenCalledTimes(2);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Job scheduled successfully',
        expect.any(Object)
      );
    });

    test('should validate schedule configuration', async () => {
      // Setup
      const invalidConfig = {
        ...validConfig,
        schedule: {
          ...validConfig.schedule,
          enabled: false
        }
      };

      // Execute & Verify
      await expect(jobScheduler.scheduleJob(invalidConfig))
        .rejects
        .toThrow(ValidationError);
    });

    test('should handle Cloud Scheduler errors', async () => {
      // Setup
      const schedulerError = new Error('Cloud Scheduler API error');
      mockCloudScheduler.createJob.mockRejectedValue(schedulerError);

      // Execute & Verify
      await expect(jobScheduler.scheduleJob(validConfig))
        .rejects
        .toThrow(schedulerError);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('handleScheduledExecution', () => {
    test('should execute scheduled job successfully', async () => {
      // Setup
      const jobId = 'test-job-123';
      (jobScheduler as any).activeSchedules.set(jobId, {
        jobId,
        cronExpression: '0 * * * *',
        timezone: 'UTC'
      });

      // Execute
      await jobScheduler.handleScheduledExecution(jobId);

      // Verify
      expect(mockJobManager.executeJob).toHaveBeenCalledWith(jobId);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Scheduled execution completed',
        expect.any(Object)
      );
    });

    test('should handle non-existent job', async () => {
      // Execute & Verify
      await expect(jobScheduler.handleScheduledExecution('non-existent'))
        .rejects
        .toThrow(ValidationError);
    });

    test('should handle execution failures', async () => {
      // Setup
      const jobId = 'test-job-123';
      const executionError = new Error('Execution failed');
      (jobScheduler as any).activeSchedules.set(jobId, {
        jobId,
        cronExpression: '0 * * * *',
        timezone: 'UTC'
      });
      mockJobManager.executeJob.mockRejectedValue(executionError);

      // Execute & Verify
      await expect(jobScheduler.handleScheduledExecution(jobId))
        .rejects
        .toThrow(executionError);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('unscheduleJob', () => {
    test('should successfully unschedule job', async () => {
      // Setup
      const jobId = 'test-job-123';
      (jobScheduler as any).activeSchedules.set(jobId, {
        jobId,
        cronExpression: '0 * * * *',
        timezone: 'UTC'
      });

      // Execute
      await jobScheduler.unscheduleJob(jobId);

      // Verify
      expect(mockCloudScheduler.deleteJob).toHaveBeenCalled();
      expect((jobScheduler as any).activeSchedules.has(jobId)).toBeFalsy();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Job unscheduled successfully',
        expect.any(Object)
      );
    });

    test('should handle non-existent job', async () => {
      // Execute & Verify
      await expect(jobScheduler.unscheduleJob('non-existent'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('listScheduledJobs', () => {
    test('should return list of scheduled jobs', async () => {
      // Setup
      const jobs = [
        { jobId: 'job-1', schedule: { cronExpression: '0 * * * *', timezone: 'UTC' } },
        { jobId: 'job-2', schedule: { cronExpression: '0 0 * * *', timezone: 'UTC' } }
      ];

      jobs.forEach(job => {
        (jobScheduler as any).activeSchedules.set(job.jobId, job.schedule);
      });

      // Execute
      const result = await jobScheduler.listScheduledJobs();

      // Verify
      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ jobId: 'job-1' }),
        expect.objectContaining({ jobId: 'job-2' })
      ]));
    });
  });

  describe('Circuit Breaker', () => {
    test('should handle circuit breaker events', async () => {
      // Setup
      const circuitBreaker = (jobScheduler as any).schedulerCircuitBreaker;

      // Execute
      circuitBreaker.emit('open');
      circuitBreaker.emit('halfOpen');
      circuitBreaker.emit('close');

      // Verify
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Scheduler circuit breaker opened',
        expect.any(Error)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduler circuit breaker half-open'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduler circuit breaker closed'
      );
    });
  });

  describe('Concurrent Job Handling', () => {
    test('should handle multiple concurrent job schedules', async () => {
      // Setup
      const configs = Array(5).fill(null).map((_, i) => ({
        ...validConfig,
        jobId: `test-job-${i}` as any
      }));

      // Execute
      const results = await Promise.all(
        configs.map(config => jobScheduler.scheduleJob(config))
      );

      // Verify
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.status).toBe(JobStatus.SCHEDULED);
      });
      expect(mockCloudScheduler.createJob).toHaveBeenCalledTimes(5);
    });
  });
});