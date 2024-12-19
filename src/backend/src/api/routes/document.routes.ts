/**
 * Document Routes Configuration
 * Version: 1.0.0
 * 
 * Implements secure document management endpoints with comprehensive validation,
 * authentication, and error handling for the Pharmaceutical Data Pipeline Platform.
 */

import { Router } from 'express'; // ^4.17.1
import multer from 'multer'; // ^1.4.5-lts.1
import { DocumentController } from '../controllers/document.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateDocumentUpload } from '../middlewares/validation.middleware';
import { DocumentSecurityLevel } from '../interfaces/document.interface';

// Initialize router
const documentRouter = Router();

// Configure multer for secure file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload only
  },
  fileFilter: (req, file, cb) => {
    // Validate file types
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/tiff',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`));
      return;
    }

    cb(null, true);
  }
});

/**
 * Document upload endpoint
 * POST /api/documents/upload
 * Requires authentication and appropriate permissions
 */
documentRouter.post(
  '/upload',
  authenticate,
  authorize(['documents:create']),
  upload.single('file'),
  validateDocumentUpload,
  async (req, res, next) => {
    try {
      const controller = new DocumentController();
      const response = await controller.uploadDocument(req, res, next);
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Document processing initiation endpoint
 * POST /api/documents/:id/process
 * Requires authentication and appropriate permissions
 */
documentRouter.post(
  '/:id/process',
  authenticate,
  authorize(['documents:create']),
  async (req, res, next) => {
    try {
      const controller = new DocumentController();
      const { id } = req.params;
      const { processingOptions } = req.body;

      const response = await controller.initiateProcessing(id, {
        enableOcr: true,
        enableNlp: req.body.securityLevel !== DocumentSecurityLevel.RESTRICTED,
        ...processingOptions
      });

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Document status retrieval endpoint
 * GET /api/documents/:id/status
 * Requires authentication and appropriate permissions
 */
documentRouter.get(
  '/:id/status',
  authenticate,
  authorize(['documents:read']),
  async (req, res, next) => {
    try {
      const controller = new DocumentController();
      const { id } = req.params;
      const includeHistory = req.query.includeHistory === 'true';

      const response = await controller.getDocumentStatus(
        { documentId: id, includeHistory },
        res,
        next
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Document listing endpoint
 * GET /api/documents
 * Requires authentication and appropriate permissions
 */
documentRouter.get(
  '/',
  authenticate,
  authorize(['documents:read']),
  async (req, res, next) => {
    try {
      const controller = new DocumentController();
      const {
        page = 1,
        limit = 20,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        securityLevel,
        dateRange
      } = req.query;

      const response = await controller.listDocuments(
        {
          query: {
            page: Number(page),
            limit: Number(limit),
            status: status as string,
            sortBy: sortBy as string,
            sortOrder: sortOrder as 'asc' | 'desc',
            securityLevel: securityLevel as DocumentSecurityLevel,
            dateRange: dateRange ? JSON.parse(dateRange as string) : undefined
          }
        },
        res,
        next
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Document deletion endpoint
 * DELETE /api/documents/:id
 * Requires authentication and elevated permissions
 */
documentRouter.delete(
  '/:id',
  authenticate,
  authorize(['documents:delete']),
  async (req, res, next) => {
    try {
      const controller = new DocumentController();
      const { id } = req.params;
      const { force, reason } = req.body;

      // Additional security check for restricted documents
      if (req.body.securityLevel === DocumentSecurityLevel.RESTRICTED) {
        if (!req.user?.permissions.includes('documents:delete:restricted')) {
          res.status(403).json({
            error: 'Insufficient permissions to delete restricted documents'
          });
          return;
        }
      }

      await controller.deleteDocument(id, {
        force: Boolean(force),
        reason,
        userId: req.user!.userId
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Batch document processing endpoint
 * POST /api/documents/batch
 * Requires authentication and appropriate permissions
 */
documentRouter.post(
  '/batch',
  authenticate,
  authorize(['documents:create']),
  async (req, res, next) => {
    try {
      const controller = new DocumentController();
      const { documents, operation, priority } = req.body;

      const response = await controller.processBatch({
        documents,
        operation,
        priority,
        userId: req.user!.userId
      });

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default documentRouter;