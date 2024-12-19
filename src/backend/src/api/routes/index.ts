/**
 * Main router configuration for the Pharmaceutical Data Pipeline Platform
 * Implements comprehensive security, monitoring, and error handling
 * @version 1.0.0
 */

import express, { Router, Request, Response, NextFunction } from 'express'; // ^4.17.1
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^4.6.0
import compression from 'compression'; // ^1.7.4
import { RateLimiterMemory } from 'rate-limiter-flexible'; // ^2.3.1
import { v4 as uuidv4 } from 'uuid'; // ^8.3.2
import { trace } from '@opentelemetry/api'; // ^1.12.0

// Import route modules
import dataRouter from './data.routes';
import documentRouter from './document.routes';
import scrapingRouter from './scraping.routes';

// Import middleware
import { loggingMiddleware } from '../middlewares/logging.middleware';
import { errorMiddleware } from '../middlewares/error.middleware';
import { LoggerService } from '../../core/logging/logger.service';

// Initialize tracer
const tracer = trace.getTracer('api-router');

// Initialize logger
const logger = new LoggerService();

// Configure rate limiter
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of points
  duration: 60, // Per 60 seconds
  blockDuration: 60 * 2 // Block for 2 minutes if exceeded
});

/**
 * Configures and returns the main API router with comprehensive middleware chain
 * @returns Configured Express router instance
 */
export function configureRouter(): Router {
  const router = express.Router();

  // Security middleware
  router.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  router.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Request parsing and optimization
  router.use(compression());
  router.use(express.json({ limit: '1mb' }));
  router.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request correlation
  router.use((req: Request, res: Response, next: NextFunction) => {
    req.context = {
      requestId: uuidv4(),
      timestamp: new Date(),
      correlationId: req.get('x-correlation-id') || uuidv4()
    };
    res.set('X-Request-ID', req.context.requestId);
    next();
  });

  // Rate limiting
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rateLimiter.consume(req.ip);
      next();
    } catch {
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(rateLimiter.blockDuration / 1000)
      });
    }
  });

  // Logging and monitoring
  router.use(loggingMiddleware(logger));

  // API version prefix
  const apiPrefix = '/api/v1';

  // Mount route modules
  router.use(`${apiPrefix}/data`, dataRouter);
  router.use(`${apiPrefix}/documents`, documentRouter);
  router.use(`${apiPrefix}/scraping`, scrapingRouter);

  // Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  });

  // API documentation redirect
  router.get('/docs', (req: Request, res: Response) => {
    res.redirect('/api-docs');
  });

  // Error handling
  router.use(errorMiddleware);

  // 404 handler
  router.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.path} not found`,
      requestId: req.context.requestId
    });
  });

  return router;
}

// Export configured router instance
export default configureRouter();