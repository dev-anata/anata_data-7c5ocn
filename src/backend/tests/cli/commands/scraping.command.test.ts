import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { ScrapingCommand } from '../../../src/cli/commands/scraping.command';
import { ScrapingService } from '../../../src/api/services/scraping.service';
import { JobStatus } from '../../../src/scraping/interfaces/job.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as displayUtil from '../../../src/cli/utils/display.util';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../../../src/cli/utils/display.util');
jest.mock('../../../src/api/services/scraping.service');

describe('ScrapingCommand', () => {
  let scrapingCommand: ScrapingCommand;
  let mockScrapingService: jest.Mocked<ScrapingService>;
  let mockDisplayProgress: jest.SpyInstance;
  let mockDisplayError: jest.SpyInstance;

  const validJobId = '123e4567-e89b-12d3-a456-426614174000';
  const validConfig = {
    source: {
      url: 'https://example.com',
      type: 'WEBSITE'
    },
    options: {
      retryAttempts: 3
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock ScrapingService
    mockScrapingService = {
      startScrapingJob: jest.fn(),
      getJobStatus: jest.fn(),
      stopJob: jest.fn(),
      listJobs: jest.fn(),
      getJobProgress: jest.fn()
    } as unknown as jest.Mocked<ScrapingService>;

    // Create mock display utilities
    mockDisplayProgress = jest.spyOn(displayUtil, 'displayProgress');
    mockDisplayError = jest.spyOn(displayUtil, 'displayError');

    // Initialize command with mocks
    scrapingCommand = new ScrapingCommand(mockScrapingService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('execute', () => {
    it('should throw error for invalid subcommand', async () => {
      const options = { _: ['invalid'] };
      await scrapingCommand.execute(options);
      expect(mockDisplayError).toHaveBeenCalledWith('Invalid subcommand. Use: start, stop, or status');
    });

    it('should throw error for missing subcommand', async () => {
      const options = { _: [] };
      await scrapingCommand.execute(options);
      expect(mockDisplayError).toHaveBeenCalledWith('Invalid subcommand. Use: start, stop, or status');
    });
  });

  describe('start command', () => {
    it('should successfully start a scraping job with valid config', async () => {
      // Mock file read
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validConfig));

      // Mock job creation
      mockScrapingService.startScrapingJob.mockResolvedValue({
        id: validJobId,
        status: JobStatus.PENDING,
        createdAt: new Date(),
        executionDetails: {
          progress: 0,
          metrics: {}
        }
      });

      const options = {
        _: ['start'],
        config: 'config.json'
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.data.jobId).toBe(validJobId);
      expect(mockScrapingService.startScrapingJob).toHaveBeenCalledWith(validConfig);
      expect(mockDisplayProgress).toHaveBeenCalled();
    });

    it('should handle missing config file path', async () => {
      const options = {
        _: ['start']
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalledWith('Configuration file path is required');
    });

    it('should handle invalid config file format', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('invalid json');

      const options = {
        _: ['start'],
        config: 'config.json'
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalled();
    });

    it('should handle service errors during job start', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validConfig));
      mockScrapingService.startScrapingJob.mockRejectedValue(new Error('Service error'));

      const options = {
        _: ['start'],
        config: 'config.json'
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalled();
    });
  });

  describe('stop command', () => {
    it('should successfully stop a running job', async () => {
      mockScrapingService.stopJob.mockResolvedValue(undefined);

      const options = {
        _: ['stop'],
        jobId: validJobId
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(true);
      expect(mockScrapingService.stopJob).toHaveBeenCalledWith(validJobId);
      expect(mockDisplayProgress).toHaveBeenCalled();
    });

    it('should handle missing job ID', async () => {
      const options = {
        _: ['stop']
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalledWith('Job ID is required');
    });

    it('should handle service errors during job stop', async () => {
      mockScrapingService.stopJob.mockRejectedValue(new Error('Service error'));

      const options = {
        _: ['stop'],
        jobId: validJobId
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalled();
    });
  });

  describe('status command', () => {
    const mockJobStatus = {
      id: validJobId,
      status: JobStatus.RUNNING,
      executionDetails: {
        progress: 50,
        metrics: {
          itemsScraped: 100
        },
        startTime: new Date(),
        duration: 1000
      }
    };

    it('should retrieve status for specific job ID', async () => {
      mockScrapingService.getJobStatus.mockResolvedValue(mockJobStatus);

      const options = {
        _: ['status'],
        jobId: validJobId
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.data.jobId).toBe(validJobId);
      expect(result.data.progress).toBe(50);
      expect(mockScrapingService.getJobStatus).toHaveBeenCalledWith(validJobId);
    });

    it('should list all jobs when no job ID provided', async () => {
      mockScrapingService.listJobs.mockResolvedValue([mockJobStatus]);

      const options = {
        _: ['status']
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data[0].jobId).toBe(validJobId);
      expect(mockScrapingService.listJobs).toHaveBeenCalled();
    });

    it('should handle service errors during status retrieval', async () => {
      mockScrapingService.getJobStatus.mockRejectedValue(new Error('Service error'));

      const options = {
        _: ['status'],
        jobId: validJobId
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalled();
    });

    it('should handle empty job list', async () => {
      mockScrapingService.listJobs.mockResolvedValue([]);

      const options = {
        _: ['status']
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('validation', () => {
    it('should validate job ID format', async () => {
      const options = {
        _: ['status'],
        jobId: 'invalid-id'
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalled();
    });

    it('should validate config structure', async () => {
      const invalidConfig = {
        source: {
          // Missing required url field
          type: 'WEBSITE'
        }
      };

      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(invalidConfig));

      const options = {
        _: ['start'],
        config: 'config.json'
      };

      const result = await scrapingCommand.execute(options);

      expect(result.success).toBe(false);
      expect(mockDisplayError).toHaveBeenCalled();
    });
  });

  describe('progress tracking', () => {
    it('should display progress during job start', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(validConfig));
      mockScrapingService.startScrapingJob.mockResolvedValue({
        id: validJobId,
        status: JobStatus.PENDING,
        executionDetails: { progress: 0 }
      });

      const options = {
        _: ['start'],
        config: 'config.json'
      };

      await scrapingCommand.execute(options);

      expect(mockDisplayProgress).toHaveBeenCalledWith('Starting scraping job', 0);
    });

    it('should display progress during job stop', async () => {
      mockScrapingService.stopJob.mockResolvedValue(undefined);

      const options = {
        _: ['stop'],
        jobId: validJobId
      };

      await scrapingCommand.execute(options);

      expect(mockDisplayProgress).toHaveBeenCalledWith('Stopping scraping job', 0);
    });
  });
});