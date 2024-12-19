/**
 * @fileoverview Data controller implementation for the Pharmaceutical Data Pipeline API
 * Provides REST endpoints for data operations with comprehensive validation,
 * security controls, and performance monitoring.
 * @version 1.0.0
 */

import { injectable, inject } from 'inversify';
import { 
  controller, 
  httpGet, 
  httpPost, 
  httpDelete,
  request,
  response,
  next,
  BaseHttpController
} from 'inversify-express-utils';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { validate } from '../middleware/validation';
import { authorize } from '../middleware/authorization';
import { monitor } from '../middleware/monitoring';

import { DataService } from '../services/data.service';
import { 
  DataRecord, 
  DataQuery, 
  DataClassification 
} from '../interfaces/data.interface';
import { 
  dataQuerySchema, 
  dataRecordSchema 
} from '../schemas/data.schema';

/**
 * Rate limiting configuration - 100 requests per 15 minutes
 */
const rateLimitConfig = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

/**
 * CORS configuration
 */
const corsConfig = cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
});

@injectable()
@controller('/api/v1/data')
@monitor() // Custom monitoring decorator for metrics collection
export class DataController extends BaseHttpController {
  constructor(
    @inject('DataService') private readonly dataService: DataService
  ) {
    super();
  }

  /**
   * Query data with pagination, filtering, and security controls
   * @route GET /api/v1/data
   */
  @httpGet('/')
  @validate(dataQuerySchema)
  @authorize(['DATA_READ'])
  async queryData(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<Response> {
    try {
      const query: DataQuery = req.query as any;

      // Apply rate limiting
      await rateLimitConfig(req, res, next);

      // Execute query with security context
      const results = await this.dataService.queryData(query);

      // Set cache control headers
      res.set({
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'ETag': `W/"${Buffer.from(JSON.stringify(results)).toString('base64')}"`,
        'Vary': 'Accept-Encoding'
      });

      return this.json(results, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve single data record by ID
   * @route GET /api/v1/data/:id
   */
  @httpGet('/:id')
  @authorize(['DATA_READ'])
  async getData(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<Response> {
    try {
      const { id } = req.params;
      const classification = req.headers['x-data-classification'] as DataClassification;

      // Apply rate limiting
      await rateLimitConfig(req, res, next);

      const data = await this.dataService.getData(id, classification);

      // Set cache control headers
      res.set({
        'Cache-Control': 'public, max-age=300',
        'ETag': `W/"${Buffer.from(JSON.stringify(data)).toString('base64')}"`,
        'Vary': 'Accept-Encoding'
      });

      return this.json(data, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Store new data record with validation and security controls
   * @route POST /api/v1/data
   */
  @httpPost('/')
  @validate(dataRecordSchema)
  @authorize(['DATA_WRITE'])
  async storeData(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<Response> {
    try {
      const data: DataRecord = req.body;

      // Apply rate limiting
      await rateLimitConfig(req, res, next);

      // Store data with security context
      const id = await this.dataService.storeData(data);

      return this.json({ id }, 201);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete data record by ID with security validation
   * @route DELETE /api/v1/data/:id
   */
  @httpDelete('/:id')
  @authorize(['DATA_DELETE'])
  async deleteData(
    @request() req: Request,
    @response() res: Response,
    @next() next: NextFunction
  ): Promise<Response> {
    try {
      const { id } = req.params;

      // Apply rate limiting
      await rateLimitConfig(req, res, next);

      await this.dataService.deleteData(id);

      return this.json(null, 204);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply common middleware to all routes
   */
  private static commonMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Apply security headers
    helmet()(req, res, next);

    // Enable compression
    compression()(req, res, next);

    // Apply CORS
    corsConfig(req, res, next);
  }
}