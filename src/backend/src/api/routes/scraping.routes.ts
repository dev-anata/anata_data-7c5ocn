/**
 * Express router configuration for web scraping API endpoints
 * Implements secure, validated, and monitored routes for job management
 * with role-based access control, caching, and comprehensive error handling
 * @version 1.0.0
 */

import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { trace } from '@opentelemetry/api';
import compression from 'compression';

// Import controllers and middleware
import { ScrapingController } from '../controllers/scraping.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateScrapingJob } from '../middlewares/validation.middleware';
import { LoggerService } from '../../core/logging/logger.service';

// Initialize tracer
const tracer = trace.getTracer('scraping-routes');

/**
 * Configures and returns the router with all scraping-related routes
 * @returns Express router with secured and monitored scraping routes
 */
export function configureScrapingRoutes(): Router {
    const router = express.Router();
    const logger = new LoggerService();
    const scrapingController = new ScrapingController();

    // Apply global middleware
    router.use(compression());
    router.use(express.json({ limit: '1mb' }));
    router.use(authenticate);

    // Configure rate limiters
    const createJobLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 requests per minute
        message: 'Too many job creation requests'
    });

    const queryLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100, // 100 requests per minute
        message: 'Too many query requests'
    });

    /**
     * Health check endpoint
     * GET /api/v1/scraping/health
     */
    router.get('/health', async (req, res) => {
        const span = tracer.startSpan('health-check');
        try {
            res.json({ status: 'healthy', timestamp: new Date() });
            span.setStatus({ code: 1 });
        } catch (error) {
            span.setStatus({ code: 2, message: error.message });
            res.status(500).json({ status: 'unhealthy', error: error.message });
        } finally {
            span.end();
        }
    });

    /**
     * Create new scraping job
     * POST /api/v1/scraping/jobs
     * Requires: scraping:create permission
     */
    router.post('/jobs',
        authorize(['scraping:create']),
        createJobLimiter,
        validateScrapingJob,
        async (req, res, next) => {
            const span = tracer.startSpan('create-job');
            try {
                const result = await scrapingController.createJob(req, res);
                span.setStatus({ code: 1 });
                return result;
            } catch (error) {
                span.setStatus({ code: 2, message: error.message });
                next(error);
            } finally {
                span.end();
            }
        }
    );

    /**
     * List scraping jobs with filtering
     * GET /api/v1/scraping/jobs
     * Requires: scraping:read permission
     */
    router.get('/jobs',
        authorize(['scraping:read']),
        queryLimiter,
        async (req, res, next) => {
            const span = tracer.startSpan('list-jobs');
            try {
                const result = await scrapingController.listJobs(req, res);
                span.setStatus({ code: 1 });
                return result;
            } catch (error) {
                span.setStatus({ code: 2, message: error.message });
                next(error);
            } finally {
                span.end();
            }
        }
    );

    /**
     * Get specific job status
     * GET /api/v1/scraping/jobs/:jobId
     * Requires: scraping:read permission
     */
    router.get('/jobs/:jobId',
        authorize(['scraping:read']),
        queryLimiter,
        async (req, res, next) => {
            const span = tracer.startSpan('get-job');
            try {
                const result = await scrapingController.getJob(req, res);
                span.setStatus({ code: 1 });
                return result;
            } catch (error) {
                span.setStatus({ code: 2, message: error.message });
                next(error);
            } finally {
                span.end();
            }
        }
    );

    /**
     * Stop running job
     * POST /api/v1/scraping/jobs/:jobId/stop
     * Requires: scraping:create permission
     */
    router.post('/jobs/:jobId/stop',
        authorize(['scraping:create']),
        createJobLimiter,
        async (req, res, next) => {
            const span = tracer.startSpan('stop-job');
            try {
                const result = await scrapingController.stopJob(req, res);
                span.setStatus({ code: 1 });
                return result;
            } catch (error) {
                span.setStatus({ code: 2, message: error.message });
                next(error);
            } finally {
                span.end();
            }
        }
    );

    /**
     * Get job results
     * GET /api/v1/scraping/jobs/:jobId/result
     * Requires: scraping:read permission
     */
    router.get('/jobs/:jobId/result',
        authorize(['scraping:read']),
        queryLimiter,
        async (req, res, next) => {
            const span = tracer.startSpan('get-job-result');
            try {
                const result = await scrapingController.getJobResult(req, res);
                span.setStatus({ code: 1 });
                return result;
            } catch (error) {
                span.setStatus({ code: 2, message: error.message });
                next(error);
            } finally {
                span.end();
            }
        }
    );

    // Error handling middleware
    router.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        logger.error('Route error', err, {
            path: req.path,
            method: req.method,
            userId: req.user?.userId
        });

        res.status(err.statusCode || 500).json({
            error: {
                message: err.message,
                code: err.code,
                details: err.details
            }
        });
    });

    return router;
}

// Export configured router
export default configureScrapingRoutes();