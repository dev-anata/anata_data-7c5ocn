// External Dependencies
import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { retry } from 'retry-ts';
import CircuitBreaker from 'opossum';
import RateLimiter from 'bottleneck';

// Internal Dependencies
import { ScrapingPipeline } from '../../../../src/scraping/pipelines/scraping.pipeline';
import { JobService } from '../../../../src/scraping/services/job.service';
import { ResultService } from '../../../../src/scraping/services/result.service';
import { SecurityService } from '../../../../src/scraping/services/security.service';
import { MonitoringService } from '../../../../src/scraping/services/monitoring.service';
import { ValidationService } from '../../../../src/scraping/services/validation.service';
import { ScrapingSourceType, ScrapingAuthType } from '../../../../src/scraping/interfaces/config.interface';
import { JobStatus } from '../../../../src/scraping/interfaces/job.interface';
import { GCPError } from '../../../../src/types/gcp';

// Mock implementations
class MockJobService {
  public getJobConfig = jest.fn();
  public executeScraping = jest.fn();
  public updateJobStatus = jest.fn();
  public getJob = jest.fn();
  public createJob = jest.fn();
}

class MockResultService {
  public storeResult = jest.fn();
  public validateResult = jest.fn();
}

class MockSecurityService {
  public validateJobSecurity = jest.fn();
  public encryptResult = jest.fn();
}

class MockMonitoringService {
  public startSpan = jest.fn(() => ({
    end: jest.fn(),
    setStatus: jest.fn()
  }));
  public getLogger = jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }));
  public getMeter = jest.fn(() => ({
    createCounter: jest.fn(() => ({ add: jest.fn() })),
    createHistogram: jest.fn(() => ({ record: jest.fn() }))
  }));
  public triggerAlert = jest.fn();
}

class MockValidationService {
  public validateResult = jest.fn();
}

describe('ScrapingPipeline', () => {
  let scrapingPipeline: ScrapingPipeline;
  let jobService: MockJobService;
  let resultService: MockResultService;
  let securityService: MockSecurityService;
  let monitoringService: MockMonitoringService;
  let validationService: MockValidationService;

  beforeEach(() => {
    // Initialize mocks
    jobService = new MockJobService();
    resultService = new MockResultService();
    securityService = new MockSecurityService();
    monitoringService = new MockMonitoringService();
    validationService = new MockValidationService();

    // Initialize pipeline with mocks
    scrapingPipeline = new ScrapingPipeline(
      jobService as unknown as JobService,
      resultService as unknown as ResultService,
      securityService as unknown as SecurityService,
      monitoringService as unknown as MonitoringService,
      validationService as unknown as ValidationService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeJob', () => {
    const validJobId = 'test-job-123';
    const validConfig = {
      jobId: validJobId,
      source: {
        type: ScrapingSourceType.WEBSITE,
        url: 'https://test.com',
        selectors: {
          title: { selector: 'h1', type: 'css', required: true }
        },
        authentication: {
          type: ScrapingAuthType.NONE
        }
      },
      options: {
        rateLimit: {
          requests: 10,
          period: 60
        }
      }
    };

    it('should successfully execute a scraping job', async () => {
      // Setup mocks
      jobService.getJobConfig.mockResolvedValue(validConfig);
      jobService.executeScraping.mockResolvedValue({ data: 'test data' });
      validationService.validateResult.mockResolvedValue({ data: 'validated data' });
      securityService.encryptResult.mockResolvedValue({ data: 'encrypted data' });
      resultService.storeResult.mockResolvedValue({ id: 'result-123' });

      // Execute test
      const result = await scrapingPipeline.executeJob(validJobId);

      // Verify execution flow
      expect(jobService.getJobConfig).toHaveBeenCalledWith(validJobId);
      expect(jobService.executeScraping).toHaveBeenCalled();
      expect(validationService.validateResult).toHaveBeenCalled();
      expect(securityService.encryptResult).toHaveBeenCalled();
      expect(resultService.storeResult).toHaveBeenCalled();
      expect(result).toEqual({ id: 'result-123' });
    });

    it('should handle validation failures', async () => {
      // Setup mock for validation failure
      jobService.getJobConfig.mockResolvedValue(validConfig);
      validationService.validateResult.mockRejectedValue(new Error('Validation failed'));

      // Execute and verify error handling
      await expect(scrapingPipeline.executeJob(validJobId))
        .rejects.toThrow('Validation failed');

      expect(monitoringService.getLogger().error).toHaveBeenCalled();
      expect(monitoringService.getMeter().createCounter('job_errors')).toHaveBeenCalled();
    });

    it('should implement retry logic for transient failures', async () => {
      // Setup mocks for retry scenario
      jobService.getJobConfig.mockResolvedValue(validConfig);
      let attempts = 0;
      jobService.executeScraping.mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Transient error');
        }
        return { data: 'test data' };
      });

      // Execute test
      const result = await scrapingPipeline.executeJob(validJobId);

      expect(attempts).toBe(2);
      expect(result).toBeDefined();
      expect(monitoringService.getLogger().warn).toHaveBeenCalled();
    });

    it('should handle network timeouts', async () => {
      // Setup mock for timeout
      jobService.getJobConfig.mockResolvedValue(validConfig);
      jobService.executeScraping.mockRejectedValue(new Error('DEADLINE_EXCEEDED'));

      // Execute and verify timeout handling
      await expect(scrapingPipeline.executeJob(validJobId))
        .rejects.toThrow('DEADLINE_EXCEEDED');

      expect(monitoringService.getMeter().createCounter('job_errors')).toHaveBeenCalled();
    });

    it('should respect rate limiting', async () => {
      // Setup mocks
      jobService.getJobConfig.mockResolvedValue(validConfig);
      const startTime = Date.now();

      // Execute multiple requests
      const promises = Array(3).fill(null).map(() => 
        scrapingPipeline.executeJob(validJobId)
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Verify rate limiting
      expect(duration).toBeGreaterThanOrEqual(200); // Minimum delay between requests
    });
  });

  describe('validateJob', () => {
    const validConfig = {
      jobId: 'test-job-123',
      source: {
        type: ScrapingSourceType.WEBSITE,
        url: 'https://test.com',
        selectors: {
          title: { selector: 'h1', type: 'css', required: true }
        }
      },
      options: {
        rateLimit: {
          requests: 10,
          period: 60
        }
      }
    };

    it('should validate complete and valid job configuration', async () => {
      securityService.validateJobSecurity.mockResolvedValue(true);

      const result = await scrapingPipeline['validateJob'](validConfig);

      expect(result).toBe(true);
      expect(securityService.validateJobSecurity).toHaveBeenCalledWith(validConfig);
    });

    it('should reject configuration with missing required fields', async () => {
      const invalidConfig = { ...validConfig, source: {} };

      await expect(scrapingPipeline['validateJob'](invalidConfig))
        .rejects.toThrow('Invalid job configuration');
    });

    it('should validate rate limiting settings', async () => {
      const invalidRateLimit = {
        ...validConfig,
        options: {
          rateLimit: {
            requests: -1,
            period: 0
          }
        }
      };

      await expect(scrapingPipeline['validateJob'](invalidRateLimit))
        .rejects.toThrow('Invalid rate limiting configuration');
    });
  });

  describe('Error Handling', () => {
    it('should handle critical errors with proper alerting', async () => {
      const criticalError = new Error('Critical system failure') as GCPError;
      criticalError.type = 'INTERNAL_ERROR';

      jobService.getJobConfig.mockRejectedValue(criticalError);

      await expect(scrapingPipeline.executeJob('test-job'))
        .rejects.toThrow('Critical system failure');

      expect(monitoringService.triggerAlert).toHaveBeenCalledWith(
        'CRITICAL_JOB_FAILURE',
        expect.any(Object)
      );
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Authentication failed') as GCPError;
      authError.type = 'AUTHENTICATION_ERROR';

      securityService.validateJobSecurity.mockRejectedValue(authError);

      await expect(scrapingPipeline.executeJob('test-job'))
        .rejects.toThrow('Authentication failed');

      expect(monitoringService.getMeter().createCounter('job_errors'))
        .toHaveBeenCalledWith(1, { type: 'AUTHENTICATION_ERROR' });
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker on consecutive failures', async () => {
      const error = new Error('Service unavailable');
      jobService.getJobConfig.mockRejectedValue(error);

      // Generate multiple failures
      const attempts = Array(6).fill(null).map(() => 
        scrapingPipeline.executeJob('test-job').catch(() => {})
      );

      await Promise.all(attempts);

      expect(monitoringService.getLogger().warn)
        .toHaveBeenCalledWith('Circuit breaker opened');
      expect(monitoringService.getMeter().createCounter('circuit_breaker_open'))
        .toHaveBeenCalled();
    });
  });
});