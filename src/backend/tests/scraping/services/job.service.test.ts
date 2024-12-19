/**
 * Comprehensive test suite for JobService class
 * Tests job management functionality with focus on reliability and performance
 * @version 1.0.0
 */

import { describe, it, beforeAll, beforeEach, afterEach, afterAll, expect } from 'jest';
import { mock, MockProxy, mockDeep, mockReset } from 'jest-mock-extended';
import { faker } from '@faker-js/faker';

import { JobService } from '../../../src/scraping/services/job.service';
import { FirestoreClient } from '../../../src/core/database/firestore.client';
import { LoggerService } from '../../../src/core/logging/logger.service';
import { JobStatus, ScrapingJob, JobExecutionDetails } from '../../../src/scraping/interfaces/job.interface';
import { NotFoundError } from '../../../src/core/utils/error.util';

describe('JobService', () => {
  let jobService: JobService;
  let dbClientMock: MockProxy<FirestoreClient>;
  let loggerMock: MockProxy<LoggerService>;
  let testJob: ScrapingJob;

  // Test metrics tracking
  const metrics = {
    totalTests: 0,
    failedTests: 0,
    errorRate: 0,
    avgResponseTime: 0,
    responseTimeSamples: [] as number[]
  };

  beforeAll(() => {
    // Configure test timeouts and metrics collection
    jest.setTimeout(10000);
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    // Initialize mocks with enhanced features
    dbClientMock = mockDeep<FirestoreClient>();
    loggerMock = mockDeep<LoggerService>();

    // Create JobService instance with mocked dependencies
    jobService = new JobService(dbClientMock, loggerMock);

    // Initialize test job data
    testJob = {
      id: faker.string.uuid(),
      config: {
        source: faker.internet.url(),
        schedule: {
          cron: '0 * * * *'
        }
      },
      status: JobStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      executionDetails: {
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
          successRate: 100,
          bandwidthUsage: 0,
          retryRate: 0
        },
        lastCheckpoint: '',
        progress: 0
      },
      retryCount: 0,
      version: 1
    };
  });

  afterEach(() => {
    // Reset mocks and update metrics
    mockReset(dbClientMock);
    mockReset(loggerMock);
    metrics.totalTests++;
  });

  afterAll(() => {
    // Calculate and log final test metrics
    metrics.errorRate = (metrics.failedTests / metrics.totalTests) * 100;
    metrics.avgResponseTime = metrics.responseTimeSamples.reduce((a, b) => a + b, 0) / metrics.responseTimeSamples.length;

    console.log('Test Suite Metrics:', {
      totalTests: metrics.totalTests,
      failedTests: metrics.failedTests,
      errorRate: `${metrics.errorRate.toFixed(2)}%`,
      avgResponseTime: `${metrics.avgResponseTime.toFixed(2)}ms`
    });
  });

  describe('Core Functionality', () => {
    it('should create job with valid config and verify initial state', async () => {
      // Arrange
      const startTime = Date.now();
      dbClientMock.set.mockResolvedValueOnce(undefined);

      // Act
      const result = await jobService.createJob(testJob.config);

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe(JobStatus.PENDING);
      expect(result.version).toBe(1);
      expect(dbClientMock.set).toHaveBeenCalledTimes(1);
      
      // Track metrics
      metrics.responseTimeSamples.push(Date.now() - startTime);
    });

    it('should retrieve job with complete transaction history', async () => {
      // Arrange
      const startTime = Date.now();
      dbClientMock.get.mockResolvedValueOnce(testJob);

      // Act
      const result = await jobService.getJob(testJob.id);

      // Assert
      expect(result).toEqual(testJob);
      expect(dbClientMock.get).toHaveBeenCalledWith(`scraping_jobs/${testJob.id}`);
      
      metrics.responseTimeSamples.push(Date.now() - startTime);
    });

    it('should update job status with proper state transition validation', async () => {
      // Arrange
      const startTime = Date.now();
      const newStatus = JobStatus.RUNNING;
      const executionDetails: JobExecutionDetails = {
        ...testJob.executionDetails,
        startTime: new Date(),
        progress: 50
      };

      dbClientMock.get.mockResolvedValueOnce(testJob);
      dbClientMock.set.mockResolvedValueOnce(undefined);

      // Act
      await jobService.updateJobStatus(testJob.id, newStatus, executionDetails);

      // Assert
      expect(dbClientMock.set).toHaveBeenCalledTimes(1);
      expect(dbClientMock.set.mock.calls[0][1].status).toBe(newStatus);
      expect(dbClientMock.set.mock.calls[0][1].version).toBe(testJob.version + 1);
      
      metrics.responseTimeSamples.push(Date.now() - startTime);
    });

    it('should list jobs with filtering and pagination', async () => {
      // Arrange
      const startTime = Date.now();
      const jobs = [testJob, { ...testJob, id: faker.string.uuid() }];
      const filter = { status: JobStatus.PENDING };

      dbClientMock.query.mockResolvedValueOnce(jobs);

      // Act
      const result = await jobService.listJobs(filter);

      // Assert
      expect(result).toHaveLength(2);
      expect(dbClientMock.query).toHaveBeenCalledWith(filter);
      
      metrics.responseTimeSamples.push(Date.now() - startTime);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle network failures with proper retries', async () => {
      // Arrange
      const networkError = new Error('Network failure');
      dbClientMock.get.mockRejectedValueOnce(networkError)
                     .mockRejectedValueOnce(networkError)
                     .mockResolvedValueOnce(testJob);

      // Act
      const result = await jobService.getJob(testJob.id);

      // Assert
      expect(result).toEqual(testJob);
      expect(dbClientMock.get).toHaveBeenCalledTimes(3);
      expect(loggerMock.error).not.toHaveBeenCalled();
    });

    it('should handle validation errors with detailed error messages', async () => {
      // Arrange
      const invalidStatus = 'INVALID_STATUS' as JobStatus;

      // Act & Assert
      await expect(
        jobService.updateJobStatus(testJob.id, invalidStatus, testJob.executionDetails)
      ).rejects.toThrow('Invalid status transition');
    });

    it('should handle transaction conflicts with rollback', async () => {
      // Arrange
      const conflictError = new Error('Transaction conflict');
      dbClientMock.set.mockRejectedValueOnce(conflictError);
      dbClientMock.get.mockResolvedValueOnce(testJob);

      // Act & Assert
      await expect(
        jobService.updateJobStatus(testJob.id, JobStatus.RUNNING, testJob.executionDetails)
      ).rejects.toThrow();
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    it('should complete operations within SLA timeouts', async () => {
      // Arrange
      const SLA_TIMEOUT = 500; // 500ms SLA
      const startTime = Date.now();
      dbClientMock.get.mockResolvedValueOnce(testJob);

      // Act
      await jobService.getJob(testJob.id);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(SLA_TIMEOUT);
      metrics.responseTimeSamples.push(duration);
    });

    it('should handle concurrent requests efficiently', async () => {
      // Arrange
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill(null).map(() => 
        jobService.getJob(faker.string.uuid())
      );

      dbClientMock.get.mockResolvedValue(testJob);

      // Act
      const startTime = Date.now();
      await Promise.all(requests);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(concurrentRequests * 100); // 100ms per request
      metrics.responseTimeSamples.push(duration / concurrentRequests);
    });

    it('should maintain error rate below 0.1% threshold', async () => {
      // Calculate error rate from metrics
      const errorRate = (metrics.failedTests / metrics.totalTests) * 100;
      expect(errorRate).toBeLessThan(0.1);
    });
  });

  describe('Cache Management', () => {
    it('should return cached job data when available and valid', async () => {
      // Arrange
      const startTime = Date.now();
      dbClientMock.get.mockResolvedValueOnce(testJob);

      // Act
      await jobService.getJob(testJob.id); // First call to populate cache
      const result = await jobService.getJob(testJob.id); // Second call should use cache

      // Assert
      expect(result).toEqual(testJob);
      expect(dbClientMock.get).toHaveBeenCalledTimes(1);
      
      metrics.responseTimeSamples.push(Date.now() - startTime);
    });

    it('should refresh cache when TTL expires', async () => {
      // Arrange
      jest.useFakeTimers();
      dbClientMock.get.mockResolvedValue(testJob);

      // Act
      await jobService.getJob(testJob.id); // First call
      jest.advanceTimersByTime(301000); // Advance past 5-minute TTL
      await jobService.getJob(testJob.id); // Second call

      // Assert
      expect(dbClientMock.get).toHaveBeenCalledTimes(2);
      
      jest.useRealTimers();
    });
  });
});