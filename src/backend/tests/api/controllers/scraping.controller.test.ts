import { Request, Response } from 'express';
import { performance } from 'performance-now';
import { ScrapingController } from '../../../src/api/controllers/scraping.controller';
import { ScrapingService } from '../../../src/api/services/scraping.service';
import { ValidationError } from '../../../core/utils/error.util';
import { JobStatus } from '../../../scraping/interfaces/job.interface';

// Mock ScrapingService
jest.mock('../../../src/api/services/scraping.service');

describe('ScrapingController', () => {
  let controller: ScrapingController;
  let mockScrapingService: jest.Mocked<ScrapingService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  // Performance tracking
  const responseTimes: number[] = [];
  const PERFORMANCE_THRESHOLD_MS = 500; // 500ms as per requirements

  beforeEach(() => {
    // Reset mocks
    mockScrapingService = {
      startScrapingJob: jest.fn(),
      getJobStatus: jest.fn(),
      stopJob: jest.fn(),
      listJobs: jest.fn(),
      getJobResult: jest.fn()
    } as any;

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    controller = new ScrapingController(mockScrapingService);
  });

  describe('Performance Tests', () => {
    it('should respond within 500ms for job creation', async () => {
      // Arrange
      const validJobConfig = {
        config: {
          source: {
            url: 'https://example.com',
            type: 'WEBSITE'
          },
          options: {
            rateLimit: {
              requests: 10,
              period: 1000
            }
          }
        }
      };

      mockRequest = {
        body: validJobConfig
      };

      mockScrapingService.startScrapingJob.mockResolvedValue({
        id: '123',
        status: JobStatus.PENDING,
        createdAt: new Date()
      });

      // Act
      const start = performance();
      await controller.createJob(mockRequest as Request, mockResponse as Response);
      const end = performance();
      const duration = end - start;
      responseTimes.push(duration);

      // Assert
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });

    it('should maintain performance under concurrent load', async () => {
      // Arrange
      const concurrentRequests = 10;
      const validJobConfig = {
        config: {
          source: { url: 'https://example.com' },
          options: { rateLimit: { requests: 10, period: 1000 } }
        }
      };

      mockRequest = { body: validJobConfig };
      mockScrapingService.startScrapingJob.mockResolvedValue({
        id: '123',
        status: JobStatus.PENDING,
        createdAt: new Date()
      });

      // Act
      const requests = Array(concurrentRequests).fill(null).map(() =>
        controller.createJob(mockRequest as Request, mockResponse as Response)
      );

      const start = performance();
      await Promise.all(requests);
      const end = performance();

      // Assert
      const avgDuration = (end - start) / concurrentRequests;
      expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Security Tests', () => {
    it('should validate URL protocol security', async () => {
      // Arrange
      const insecureConfig = {
        config: {
          source: {
            url: 'ftp://example.com',
            type: 'WEBSITE'
          },
          options: {
            rateLimit: { requests: 10, period: 1000 }
          }
        }
      };

      mockRequest = { body: insecureConfig };

      // Act & Assert
      await expect(
        controller.createJob(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should prevent access to internal networks', async () => {
      // Arrange
      const internalConfig = {
        config: {
          source: {
            url: 'http://192.168.1.1',
            type: 'WEBSITE'
          },
          options: {
            rateLimit: { requests: 10, period: 1000 }
          }
        }
      };

      mockRequest = { body: internalConfig };

      // Act & Assert
      await expect(
        controller.createJob(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should validate rate limiting configuration', async () => {
      // Arrange
      const invalidRateLimit = {
        config: {
          source: {
            url: 'https://example.com',
            type: 'WEBSITE'
          },
          options: {
            rateLimit: {
              requests: 1000, // Exceeds maximum allowed
              period: 100 // Too aggressive
            }
          }
        }
      };

      mockRequest = { body: invalidRateLimit };

      // Act & Assert
      await expect(
        controller.createJob(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('API Endpoint Tests', () => {
    it('should successfully create a scraping job', async () => {
      // Arrange
      const validConfig = {
        config: {
          source: {
            url: 'https://example.com',
            type: 'WEBSITE'
          },
          options: {
            rateLimit: { requests: 10, period: 1000 }
          }
        }
      };

      mockRequest = { body: validConfig };
      const mockJob = {
        id: '123',
        status: JobStatus.PENDING,
        createdAt: new Date()
      };

      mockScrapingService.startScrapingJob.mockResolvedValue(mockJob);

      // Act
      await controller.createJob(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        jobId: mockJob.id,
        status: mockJob.status
      }));
    });

    it('should retrieve job status', async () => {
      // Arrange
      const jobId = '123';
      mockRequest = {
        params: { jobId }
      };

      const mockJob = {
        id: jobId,
        status: JobStatus.RUNNING
      };

      mockScrapingService.getJobStatus.mockResolvedValue(mockJob);

      // Act
      await controller.getJob(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockScrapingService.getJobStatus).toHaveBeenCalledWith(jobId);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        job: mockJob
      }));
    });

    it('should list jobs with pagination', async () => {
      // Arrange
      mockRequest = {
        query: {
          page: '1',
          pageSize: '20'
        }
      };

      const mockJobs = {
        jobs: [{ id: '123', status: JobStatus.COMPLETED }],
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false
      };

      mockScrapingService.listJobs.mockResolvedValue(mockJobs);

      // Act
      await controller.listJobs(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockScrapingService.listJobs).toHaveBeenCalledWith(expect.objectContaining({
        page: 1,
        pageSize: 20
      }));
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        ...mockJobs
      }));
    });

    it('should stop a running job', async () => {
      // Arrange
      const jobId = '123';
      mockRequest = {
        params: { jobId }
      };

      // Act
      await controller.stopJob(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockScrapingService.stopJob).toHaveBeenCalledWith(jobId);
      expect(mockResponse.status).toHaveBeenCalledWith(204);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle validation errors gracefully', async () => {
      // Arrange
      const invalidConfig = {
        config: {
          // Missing required fields
        }
      };

      mockRequest = { body: invalidConfig };

      // Act & Assert
      await expect(
        controller.createJob(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle service errors appropriately', async () => {
      // Arrange
      mockRequest = {
        params: { jobId: '123' }
      };

      mockScrapingService.getJobStatus.mockRejectedValue(new Error('Service error'));

      // Act
      await controller.getJob(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal Server Error'
      }));
    });
  });

  afterAll(() => {
    // Log performance metrics
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    console.log(`Average response time: ${avgResponseTime}ms`);
    
    const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];
    console.log(`95th percentile response time: ${p95ResponseTime}ms`);
  });
});