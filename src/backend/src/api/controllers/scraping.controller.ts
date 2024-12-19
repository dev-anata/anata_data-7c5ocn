/**
 * REST API controller for web scraping operations
 * Implements secure, validated, and performant HTTP endpoints with comprehensive monitoring
 * @version 1.0.0
 */

import { injectable } from 'inversify';
import { controller, httpPost, httpGet, httpDelete } from 'inversify-express-utils';
import { Request, Response } from 'express';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { rateLimit } from 'express-rate-limit';

import { ScrapingService } from '../services/scraping.service';
import { CreateScrapingJobRequest, ListScrapingJobsRequest } from '../interfaces/scraping.interface';
import { validateScrapingJob } from '../middlewares/validation.middleware';
import { ValidationError } from '../../core/utils/error.util';
import { LoggerService } from '../../core/logging/logger.service';

/**
 * Enhanced controller for web scraping operations with comprehensive security,
 * monitoring, and error handling capabilities
 */
@controller('/api/v1/scraping')
@injectable()
export class ScrapingController {
    private readonly tracer = trace.getTracer('scraping-controller');

    constructor(
        private readonly scrapingService: ScrapingService,
        private readonly logger: LoggerService
    ) {}

    /**
     * Creates a new web scraping job with validation and security checks
     * @route POST /api/v1/scraping/jobs
     */
    @httpPost('/jobs')
    @validateScrapingJob()
    @rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 requests per minute
        message: 'Too many job creation requests'
    })
    public async createJob(req: Request, res: Response): Promise<Response> {
        const span = this.tracer.startSpan('createJob');
        const startTime = Date.now();

        try {
            const jobRequest = req.body as CreateScrapingJobRequest;

            // Additional security validation
            this.validateJobRequest(jobRequest);

            // Create job with monitoring
            const job = await this.scrapingService.startScrapingJob(jobRequest.config);

            // Log success
            this.logger.info('Scraping job created', {
                jobId: job.id,
                source: jobRequest.config.source.url,
                duration: Date.now() - startTime
            });

            span.setStatus({ code: SpanStatusCode.OK });

            return res.status(201).json({
                jobId: job.id,
                status: job.status,
                createdAt: job.createdAt,
                _links: {
                    self: `/api/v1/scraping/jobs/${job.id}`,
                    status: `/api/v1/scraping/jobs/${job.id}/status`,
                    results: `/api/v1/scraping/jobs/${job.id}/results`
                }
            });

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });

            this.logger.error('Failed to create scraping job', error, {
                requestBody: req.body,
                duration: Date.now() - startTime
            });

            return this.handleError(res, error);
        } finally {
            span.end();
        }
    }

    /**
     * Retrieves job status with comprehensive monitoring
     * @route GET /api/v1/scraping/jobs/:jobId
     */
    @httpGet('/jobs/:jobId')
    @rateLimit({
        windowMs: 60 * 1000,
        max: 100
    })
    public async getJob(req: Request, res: Response): Promise<Response> {
        const span = this.tracer.startSpan('getJob');
        const startTime = Date.now();

        try {
            const { jobId } = req.params;

            // Validate job ID format
            if (!this.isValidJobId(jobId)) {
                throw new ValidationError('Invalid job ID format');
            }

            const job = await this.scrapingService.getJobStatus(jobId);

            this.logger.info('Job status retrieved', {
                jobId,
                status: job.status,
                duration: Date.now() - startTime
            });

            span.setStatus({ code: SpanStatusCode.OK });

            return res.json({
                job,
                _links: {
                    results: `/api/v1/scraping/jobs/${jobId}/results`
                }
            });

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });

            this.logger.error('Failed to retrieve job status', error, {
                jobId: req.params.jobId,
                duration: Date.now() - startTime
            });

            return this.handleError(res, error);
        } finally {
            span.end();
        }
    }

    /**
     * Lists jobs with filtering and pagination
     * @route GET /api/v1/scraping/jobs
     */
    @httpGet('/jobs')
    @rateLimit({
        windowMs: 60 * 1000,
        max: 50
    })
    public async listJobs(req: Request, res: Response): Promise<Response> {
        const span = this.tracer.startSpan('listJobs');
        const startTime = Date.now();

        try {
            const filter: ListScrapingJobsRequest = {
                status: req.query.status as any,
                page: parseInt(req.query.page as string) || 1,
                pageSize: parseInt(req.query.pageSize as string) || 20,
                dateRange: req.query.dateRange ? JSON.parse(req.query.dateRange as string) : undefined
            };

            const jobs = await this.scrapingService.listJobs(filter);

            this.logger.info('Jobs listed successfully', {
                filter,
                count: jobs.jobs.length,
                duration: Date.now() - startTime
            });

            span.setStatus({ code: SpanStatusCode.OK });

            return res.json({
                ...jobs,
                _links: {
                    self: '/api/v1/scraping/jobs',
                    next: jobs.hasMore ? `/api/v1/scraping/jobs?page=${filter.page + 1}` : undefined
                }
            });

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });

            this.logger.error('Failed to list jobs', error, {
                query: req.query,
                duration: Date.now() - startTime
            });

            return this.handleError(res, error);
        } finally {
            span.end();
        }
    }

    /**
     * Stops a running job with graceful shutdown
     * @route DELETE /api/v1/scraping/jobs/:jobId
     */
    @httpDelete('/jobs/:jobId')
    @rateLimit({
        windowMs: 60 * 1000,
        max: 20
    })
    public async stopJob(req: Request, res: Response): Promise<Response> {
        const span = this.tracer.startSpan('stopJob');
        const startTime = Date.now();

        try {
            const { jobId } = req.params;

            // Validate job ID format
            if (!this.isValidJobId(jobId)) {
                throw new ValidationError('Invalid job ID format');
            }

            await this.scrapingService.stopJob(jobId);

            this.logger.info('Job stopped successfully', {
                jobId,
                duration: Date.now() - startTime
            });

            span.setStatus({ code: SpanStatusCode.OK });

            return res.status(204).send();

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });

            this.logger.error('Failed to stop job', error, {
                jobId: req.params.jobId,
                duration: Date.now() - startTime
            });

            return this.handleError(res, error);
        } finally {
            span.end();
        }
    }

    /**
     * Retrieves job results with caching and pagination
     * @route GET /api/v1/scraping/jobs/:jobId/results
     */
    @httpGet('/jobs/:jobId/results')
    @rateLimit({
        windowMs: 60 * 1000,
        max: 50
    })
    public async getJobResult(req: Request, res: Response): Promise<Response> {
        const span = this.tracer.startSpan('getJobResult');
        const startTime = Date.now();

        try {
            const { jobId } = req.params;

            // Validate job ID format
            if (!this.isValidJobId(jobId)) {
                throw new ValidationError('Invalid job ID format');
            }

            const result = await this.scrapingService.getJobResult(jobId);

            this.logger.info('Job results retrieved', {
                jobId,
                duration: Date.now() - startTime
            });

            span.setStatus({ code: SpanStatusCode.OK });

            return res.json(result);

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });

            this.logger.error('Failed to retrieve job results', error, {
                jobId: req.params.jobId,
                duration: Date.now() - startTime
            });

            return this.handleError(res, error);
        } finally {
            span.end();
        }
    }

    /**
     * Validates job creation request
     * @throws ValidationError if request is invalid
     */
    private validateJobRequest(request: CreateScrapingJobRequest): void {
        if (!request.config?.source?.url) {
            throw new ValidationError('Missing required source URL');
        }

        // Validate URL format and security
        const url = new URL(request.config.source.url);
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new ValidationError('Invalid URL protocol');
        }

        // Validate rate limiting configuration
        const { rateLimit } = request.config.options;
        if (rateLimit.requests > 100 || rateLimit.period < 1000) {
            throw new ValidationError('Invalid rate limiting configuration');
        }
    }

    /**
     * Validates job ID format
     */
    private isValidJobId(jobId: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId);
    }

    /**
     * Handles errors with appropriate status codes and logging
     */
    private handleError(res: Response, error: any): Response {
        if (error instanceof ValidationError) {
            return res.status(400).json({
                error: 'Validation Error',
                message: error.message,
                details: error.validationErrors
            });
        }

        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred'
        });
    }
}