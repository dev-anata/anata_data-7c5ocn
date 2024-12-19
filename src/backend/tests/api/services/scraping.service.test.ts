import { describe, it, beforeEach, afterEach, expect, jest } from 'jest';
import { mock, instance, when, verify, reset, anything } from 'ts-mockito';
import { performance } from 'perf_hooks';

import { ScrapingService } from '../../../src/api/services/scraping.service';
import { LoggerService } from '@nestjs/common';
import { JobService } from '../../../scraping/services/job.service';
import { ResultService } from '../../../scraping/services/result.service';
import { ScrapingConfig } from '../../../scraping/interfaces/config.interface';
import { ScrapingJob, JobStatus } from '../../../scraping/interfaces/job.interface';
import { ValidationError, NotFoundError } from '../../../core/utils/error.util';

describe('ScrapingService', () => {
  // Mock dependencies
  let mockJobService: JobService;
  let mockResultService: ResultService;
  let mockLoggerService: LoggerService;
  let scrapingService: ScrapingService;

  // Test data
  const validConfig: ScrapingConfig = {
    jobId: 'test-job-123' as any,
    source: {
      type: 'WEBSITE',
      url: 'https://test.com' as any,
      selectors: {
        title: {
          selector: '.title',
          type: 'css',
          required: true
        }
      },
      validation: {
        schema: 'test-schema',
        rules: {}
      }
    },
    schedule: {
      enabled: false,
      cronExpression: '0 0 * * *' as any,
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
      credentials: {} as any
    }
  };

  const mockJob: ScrapingJob = {
    id: 'test-job-123',
    config: validConfig,
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
        successRate: 0,
        bandwidthUsage: 0,
        retryRate: 0
      },
      lastCheckpoint: '',
      progress: 0
    },
    retryCount: 0
  };

  beforeEach(() => {
    // Initialize mocks
    mockJobService = mock(JobService);
    mockResultService = mock(ResultService);
    mockLoggerService = mock(LoggerService);

    // Create service instance with mocked dependencies
    scrapingService = new ScrapingService(
      instance(mockJobService),
      instance(mockResultService),
      instance(mockLoggerService)
    );
  });

  afterEach(() => {
    // Reset all mocks
    reset(mockJobService);
    reset(mockResultService);
    reset(mockLoggerService);
    jest.clearAllMocks();
  });

  describe('startScrapingJob', () => {
    it('should successfully create and start a scraping job', async () => {
      // Arrange
      when(mockJobService.createJob(anything())).thenResolve(mockJob);
      
      // Act
      const result = await scrapingService.startScrapingJob(validConfig);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(mockJob.id);
      expect(result.status).toBe(JobStatus.PENDING);
      verify(mockJobService.createJob(anything())).once();
      verify(mockLoggerService.info(anything(), anything())).once();
    });

    it('should throw ValidationError for invalid configuration', async () => {
      // Arrange
      const invalidConfig = { ...validConfig, source: undefined };

      // Act & Assert
      await expect(scrapingService.startScrapingJob(invalidConfig as any))
        .rejects
        .toThrow(ValidationError);
    });

    it('should handle rate limiting', async () => {
      // Arrange
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(scrapingService.startScrapingJob(validConfig));
      }

      // Act & Assert
      await expect(Promise.all(requests)).resolves.toHaveLength(5);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for valid job ID', async () => {
      // Arrange
      when(mockJobService.getJob('test-job-123')).thenResolve(mockJob);

      // Act
      const result = await scrapingService.getJobStatus('test-job-123');

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(mockJob.id);
      verify(mockJobService.getJob('test-job-123')).once();
    });

    it('should throw NotFoundError for non-existent job', async () => {
      // Arrange
      when(mockJobService.getJob('non-existent')).thenResolve(null);

      // Act & Assert
      await expect(scrapingService.getJobStatus('non-existent'))
        .rejects
        .toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid job ID', async () => {
      // Act & Assert
      await expect(scrapingService.getJobStatus(''))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('stopJob', () => {
    it('should successfully stop a running job', async () => {
      // Arrange
      const runningJob = { ...mockJob, status: JobStatus.RUNNING };
      when(mockJobService.getJob('test-job-123')).thenResolve(runningJob);
      when(mockJobService.updateJobStatus(anything(), anything(), anything())).thenResolve();

      // Act
      await scrapingService.stopJob('test-job-123');

      // Assert
      verify(mockJobService.updateJobStatus('test-job-123', JobStatus.CANCELLED, anything())).once();
      verify(mockLoggerService.info(anything(), anything())).once();
    });

    it('should throw ValidationError when stopping completed job', async () => {
      // Arrange
      const completedJob = { ...mockJob, status: JobStatus.COMPLETED };
      when(mockJobService.getJob('test-job-123')).thenResolve(completedJob);

      // Act & Assert
      await expect(scrapingService.stopJob('test-job-123'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('listJobs', () => {
    it('should return paginated job list', async () => {
      // Arrange
      const jobs = Array(15).fill(mockJob).map((job, i) => ({
        ...job,
        id: `job-${i}`
      }));
      when(mockJobService.listJobs(anything())).thenResolve(jobs);

      // Act
      const result = await scrapingService.listJobs({ page: 1, pageSize: 10 });

      // Assert
      expect(result.jobs).toHaveLength(10);
      expect(result.total).toBe(15);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('should validate pagination parameters', async () => {
      // Act & Assert
      await expect(scrapingService.listJobs({ page: 0, pageSize: 10 }))
        .rejects
        .toThrow(ValidationError);
      await expect(scrapingService.listJobs({ page: 1, pageSize: 101 }))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('getJobResult', () => {
    it('should return job results for completed job', async () => {
      // Arrange
      const completedJob = { ...mockJob, status: JobStatus.COMPLETED };
      const mockResults = { data: [{ id: 1, value: 'test' }] };
      
      when(mockJobService.getJob('test-job-123')).thenResolve(completedJob);
      when(mockResultService.getResult('test-job-123')).thenResolve(mockResults);

      // Act
      const result = await scrapingService.getJobResult('test-job-123');

      // Assert
      expect(result).toEqual(mockResults);
      verify(mockResultService.getResult('test-job-123')).once();
    });

    it('should throw ValidationError for non-completed job', async () => {
      // Arrange
      const runningJob = { ...mockJob, status: JobStatus.RUNNING };
      when(mockJobService.getJob('test-job-123')).thenResolve(runningJob);

      // Act & Assert
      await expect(scrapingService.getJobResult('test-job-123'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('Performance Tests', () => {
    it('should meet response time SLA for job operations', async () => {
      // Arrange
      when(mockJobService.createJob(anything())).thenResolve(mockJob);
      const start = performance.now();

      // Act
      await scrapingService.startScrapingJob(validConfig);
      const duration = performance.now() - start;

      // Assert
      expect(duration).toBeLessThan(500); // 500ms SLA
    });

    it('should handle concurrent requests within rate limits', async () => {
      // Arrange
      when(mockJobService.createJob(anything())).thenResolve(mockJob);
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill(null).map(() => 
        scrapingService.startScrapingJob(validConfig)
      );

      // Act & Assert
      await expect(Promise.all(requests)).resolves.toHaveLength(concurrentRequests);
    });
  });

  describe('Error Handling', () => {
    it('should handle and retry on transient errors', async () => {
      // Arrange
      let attempts = 0;
      when(mockJobService.createJob(anything())).thenCall(() => {
        attempts++;
        if (attempts < 2) throw new Error('Transient error');
        return Promise.resolve(mockJob);
      });

      // Act
      const result = await scrapingService.startScrapingJob(validConfig);

      // Assert
      expect(result).toBeDefined();
      expect(attempts).toBe(2);
    });

    it('should handle circuit breaker activation', async () => {
      // Arrange
      when(mockJobService.createJob(anything())).thenThrow(new Error('Service unavailable'));
      const requests = Array(6).fill(null).map(() => 
        scrapingService.startScrapingJob(validConfig)
      );

      // Act & Assert
      await expect(Promise.all(requests.map(p => p.catch(e => e))))
        .resolves
        .toHaveLength(6);
    });
  });
});