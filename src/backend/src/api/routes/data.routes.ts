/**
 * @fileoverview Data API routes implementation for the Pharmaceutical Data Pipeline Platform
 * Provides secure, monitored, and optimized endpoints for data operations
 * @version 1.0.0
 */

import express, { Router } from 'express'; // ^4.17.1
import compression from 'compression'; // ^1.7.4
import helmet from 'helmet'; // ^4.6.0
import rateLimit from 'express-rate-limit'; // ^5.3.0

// Internal imports
import { DataController } from '../controllers/data.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateDataQuery } from '../middlewares/validation.middleware';
import { errorHandler } from '../middlewares/error.middleware';
import { requestLogger } from '../middlewares/logging.middleware';

// Initialize router
const router: Router = express.Router();

// Initialize controller
const dataController = new DataController();

/**
 * Rate limiting configurations based on endpoint sensitivity
 */
const rateLimiters = {
  query: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  }),
  write: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // More restrictive for write operations
    message: 'Too many write requests from this IP, please try again later'
  }),
  delete: rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // Most restrictive for delete operations
    message: 'Too many delete requests from this IP, please try again later'
  })
};

/**
 * Common middleware chain for all routes
 */
router.use([
  helmet(), // Security headers
  compression(), // Response compression
  requestLogger // Request/response logging
]);

/**
 * @route GET /api/v1/data
 * @description Query data with filtering and pagination
 * @access Protected - Requires read:data permission
 */
router.get('/',
  rateLimiters.query,
  authenticate,
  authorize(['read:data']),
  validateDataQuery,
  async (req, res, next) => {
    try {
      const result = await dataController.queryData(req.query);
      
      // Set cache headers for successful responses
      res.set({
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'ETag': `W/"${Buffer.from(JSON.stringify(result)).toString('base64')}"`,
        'Vary': 'Accept-Encoding'
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/data/:id
 * @description Get data by ID
 * @access Protected - Requires read:data permission
 */
router.get('/:id',
  rateLimiters.query,
  authenticate,
  authorize(['read:data']),
  async (req, res, next) => {
    try {
      const data = await dataController.getData(req.params.id);
      
      // Set cache headers
      res.set({
        'Cache-Control': 'public, max-age=300',
        'ETag': `W/"${Buffer.from(JSON.stringify(data)).toString('base64')}"`,
        'Vary': 'Accept-Encoding'
      });

      res.json(data);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/data
 * @description Store new data record
 * @access Protected - Requires write:data permission
 */
router.post('/',
  rateLimiters.write,
  authenticate,
  authorize(['write:data']),
  validateDataQuery,
  async (req, res, next) => {
    try {
      const result = await dataController.storeData(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/v1/data/:id
 * @description Delete data by ID
 * @access Protected - Requires delete:data permission
 */
router.delete('/:id',
  rateLimiters.delete,
  authenticate,
  authorize(['delete:data']),
  async (req, res, next) => {
    try {
      await dataController.deleteData(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);

// Error handling middleware
router.use(errorHandler);

export default router;