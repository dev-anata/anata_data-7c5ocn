/**
 * Comprehensive test suite for JobManager class
 * Tests job execution, lifecycle management, error handling, and monitoring
 * @version 1.0.0
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { faker } from '@faker-js/faker';

import { JobManager } from '../../../src/scraping/jobs/job.manager';
import { JobService } from '../../../src/scraping/services/job.service';
import { LoggerService } from '../../../src/core/logging/logger.service';
import { JobStatus, JobError, JobMetrics, JobExecutionDetails } from '../../../src/scraping/interfaces/job.interface';
import { RetryableError } from 'retry-as-promised';

// Mock implementations
class MockJobService {
  updateJobStatus = jest.fn();
  getJob = jest.fn();
  saveJobMetrics = jest.fn();
  handleJobError = jest.fn();
}

class MockLoggerService {
  info = jest.fn();
  error = jest.fn();
  warn = jest.fn();
  debug = jest.fn();
}

describe('JobManager', () => {
  let jobManager: JobManager;
  let jobService: MockJobService;
  let logger: MockLoggerService;
  let mockMonitoringService: any;

  beforeEach(() => {
    // Initialize mocks
    jobService = new MockJobService();
    logger = new MockLoggerService();
    mockMonitoringService = {
      createTimeSeries: jest.fn(),
      createMetricDescriptor: jest.fn()
    };

    // Initialize JobManager with mocks
    jobManager = new JobManager(
      jobService as unknown as JobService,
      logger as unknown as LoggerService,
      mockMonitoringService
    );

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeJob', () => {
    it('should successfully execute a job and update status', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: JobStatus.PENDING,
        config: { source: 'test' }
      };

      jobService.getJob.mockResolvedValue(mockJob);
      jobService.updateJobStatus.mockResolvedValue(undefined);

      // Act
      await jobManager.executeJob(jobId);

      // Assert
      expect(jobService.updateJobStatus).toHaveBeenCalledWith(
        jobId,
        JobStatus.RUNNING,
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Job execution completed',
        expect.objectContaining({ jobId })
      );
    });

    it('should handle job execution errors properly', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      const mockError = new Error('Execution failed');
      
      jobService.getJob.mockRejectedValue(mockError);

      // Act & Assert
      await expect(jobManager.executeJob(jobId)).rejects.toThrow('Execution failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Job execution failed',
        mockError,
        expect.objectContaining({ jobId })
      );
    });

    it('should respect job cancellation requests', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      
      // Simulate job cancellation during execution
      setTimeout(() => jobManager.stopJob(jobId), 100);

      // Act
      const execution = jobManager.executeJob(jobId);

      // Assert
      await expect(execution).rejects.toThrow('Job cancelled');
      expect(jobService.updateJobStatus).toHaveBeenCalledWith(
        jobId,
        JobStatus.CANCELLED,
        expect.any(Object)
      );
    });

    it('should track job metrics during execution', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: JobStatus.PENDING,
        config: { source: 'test' }
      };

      jobService.getJob.mockResolvedValue(mockJob);

      // Act
      await jobManager.executeJob(jobId);

      // Assert
      expect(mockMonitoringService.createTimeSeries).toHaveBeenCalled();
      const metrics = await jobManager.getJobMetrics(jobId);
      expect(metrics).toMatchObject({
        requestCount: expect.any(Number),
        bytesProcessed: expect.any(Number),
        itemsScraped: expect.any(Number)
      });
    });

    it('should retry failed jobs according to configuration', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      const retryableError = new RetryableError('Temporary failure');
      
      jobService.getJob
        .mockResolvedValueOnce({ id: jobId, status: JobStatus.PENDING })
        .mockResolvedValueOnce({ id: jobId, status: JobStatus.RETRYING });

      // Simulate failure then success
      jest.spyOn(jobManager as any, 'executeJobInternal')
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce(undefined);

      // Act
      await jobManager.executeJob(jobId);

      // Assert
      expect(jobService.updateJobStatus).toHaveBeenCalledWith(
        jobId,
        JobStatus.RETRYING,
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Job retry successful',
        expect.objectContaining({ jobId, attempts: 2 })
      );
    });
  });

  describe('stopJob', () => {
    it('should stop a running job gracefully', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      const mockInstance = {
        scraper: { stop: jest.fn() },
        startTime: new Date(),
        metrics: {} as JobMetrics
      };
      
      // @ts-ignore - accessing private property for test
      jobManager['activeScrapers'].set(jobId, mockInstance);

      // Act
      await jobManager.stopJob(jobId);

      // Assert
      expect(mockInstance.scraper.stop).toHaveBeenCalled();
      expect(jobService.updateJobStatus).toHaveBeenCalledWith(
        jobId,
        JobStatus.CANCELLED,
        expect.any(Object)
      );
    });

    it('should handle non-existent job stop requests', async () => {
      // Arrange
      const jobId = faker.string.uuid();

      // Act & Assert
      await expect(jobManager.stopJob(jobId)).rejects.toThrow(
        `No active scraper found for job ${jobId}`
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return current job status and metrics', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: JobStatus.RUNNING,
        executionDetails: {
          startTime: new Date(),
          metrics: {
            requestCount: 10,
            bytesProcessed: 1000
          }
        }
      };

      jobService.getJob.mockResolvedValue(mockJob);

      // Act
      const status = await jobManager.getJobStatus(jobId);

      // Assert
      expect(status).toMatchObject({
        startTime: expect.any(Date),
        metrics: expect.objectContaining({
          requestCount: expect.any(Number),
          bytesProcessed: expect.any(Number)
        })
      });
    });

    it('should handle non-existent job queries', async () => {
      // Arrange
      const jobId = faker.string.uuid();
      jobService.getJob.mockResolvedValue(null);

      // Act & Assert
      await expect(jobManager.getJobStatus(jobId)).rejects.toThrow(
        `Job ${jobId} not found`
      );
    });
  });
});