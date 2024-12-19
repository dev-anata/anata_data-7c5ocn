/**
 * Main server application entry point for the Pharmaceutical Data Pipeline Platform
 * Implements comprehensive security, monitoring, and performance optimizations
 * @version 1.0.0
 */

import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.17.1
import helmet from 'helmet'; // ^4.6.0
import compression from 'compression'; // ^1.7.4
import cors from 'cors'; // ^2.8.5
import promClient from 'express-prometheus-middleware'; // ^1.2.0
import { v4 as uuidv4 } from 'uuid'; // ^8.3.2
import { trace } from '@opentelemetry/api'; // ^1.12.0

// Internal imports
import router from './api/routes';
import { config } from './config';
import { LoggerService } from './core/logging/logger.service';

// Initialize logger
const logger = new LoggerService();

/**
 * Initializes and configures the Express application server
 * @returns Configured Express application instance
 */
function initializeServer(): Express {
  const app = express();

  // Enhanced security headers
  app.use(helmet({
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
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Response compression
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024
  }));

  // Request parsing
  app.use(express.json({ 
    limit: process.env.MAX_REQUEST_SIZE || '10mb',
    verify: (req: Request, res: Response, buf: Buffer) => {
      (req as any).rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request correlation
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.context = {
      requestId: uuidv4(),
      timestamp: new Date(),
      correlationId: req.get('x-correlation-id') || uuidv4()
    };
    res.set('X-Request-ID', req.context.requestId);
    next();
  });

  // Prometheus metrics
  app.use(promClient({
    metricsPath: '/metrics',
    collectDefaultMetrics: true,
    requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 5],
    requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
    responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400]
  }));

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  });

  // API routes
  app.use(`/api/${process.env.API_VERSION || 'v1'}`, router);

  // Error handling
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', err, {
      path: req.path,
      method: req.method,
      correlationId: req.context.correlationId
    });

    res.status(500).json({
      error: 'Internal Server Error',
      requestId: req.context.requestId,
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
      requestId: req.context.requestId,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

/**
 * Starts the HTTP server with proper error handling and monitoring
 * @param app - Configured Express application
 * @returns Running HTTP server instance
 */
async function startServer(app: Express) {
  const port = process.env.PORT || 3000;

  try {
    // Initialize tracing
    const tracer = trace.getTracer('server');
    const span = tracer.startSpan('server_startup');

    const server = app.listen(port, () => {
      logger.info('Server started', {
        port,
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version
      });
      span.end();
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down server...');
      server.close(() => {
        logger.info('Server shutdown complete');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    return server;
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// Start server if running directly
if (require.main === module) {
  const app = initializeServer();
  startServer(app).catch((error) => {
    logger.error('Server startup failed', error as Error);
    process.exit(1);
  });
}

// Export for testing
export { initializeServer, startServer };