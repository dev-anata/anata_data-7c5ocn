/**
 * Document API Validation Schemas
 * Version: 1.0.0
 * 
 * Implements comprehensive Joi validation schemas for document-related API operations
 * with enhanced security features and detailed error handling.
 */

import Joi from 'joi'; // v17.6.0
import { DocumentProcessingStatus } from '../../document-processing/interfaces/document.interface';

/**
 * Constants for document validation rules
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff'
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const VALID_SORT_FIELDS = ['createdAt', 'updatedAt', 'fileName', 'status'] as const;
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Schema for document upload request validation
 * Implements comprehensive security checks and content validation
 */
export const documentUploadSchema = Joi.object({
  file: Joi.object({
    buffer: Joi.binary()
      .max(MAX_FILE_SIZE)
      .required()
      .messages({
        'binary.max': `File size cannot exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        'any.required': 'File content is required'
      }),
    mimetype: Joi.string()
      .valid(...ALLOWED_MIME_TYPES)
      .required()
      .messages({
        'any.only': `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
        'any.required': 'File type is required'
      }),
    originalname: Joi.string()
      .max(255)
      .pattern(/^[a-zA-Z0-9-_. ]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Filename contains invalid characters',
        'string.max': 'Filename is too long'
      })
  }).required(),

  metadata: Joi.object({
    source: Joi.string()
      .max(100)
      .required(),
    version: Joi.string()
      .pattern(/^\d+\.\d+\.\d+$/)
      .required(),
    retentionPolicy: Joi.string()
      .valid('standard', 'extended', 'compliance')
      .required(),
    complianceFlags: Joi.array()
      .items(Joi.string().max(50))
      .max(10)
      .optional(),
    customMetadata: Joi.object()
      .pattern(/^[a-zA-Z0-9-_]+$/, Joi.string().max(1000))
      .max(20)
      .optional()
  }).required(),

  checksum: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid SHA-256 checksum format'
    })
}).options({ stripUnknown: true, abortEarly: false });

/**
 * Schema for document status request validation
 * Implements strict UUID validation
 */
export const documentStatusSchema = Joi.object({
  documentId: Joi.string()
    .pattern(UUID_REGEX)
    .required()
    .messages({
      'string.pattern.base': 'Invalid document ID format',
      'any.required': 'Document ID is required'
    })
}).options({ stripUnknown: true });

/**
 * Schema for document list request validation
 * Implements comprehensive pagination and filtering validation
 */
export const documentListSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.min': 'Page must be greater than 0'
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .messages({
      'number.max': `Cannot request more than ${MAX_PAGE_SIZE} items per page`
    }),

  status: Joi.string()
    .valid(...Object.values(DocumentProcessingStatus))
    .optional(),

  sortBy: Joi.string()
    .valid(...VALID_SORT_FIELDS)
    .default('createdAt'),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc'),

  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
  }).optional(),

  search: Joi.string()
    .max(100)
    .pattern(/^[a-zA-Z0-9-_. ]+$/)
    .optional()
    .messages({
      'string.pattern.base': 'Search query contains invalid characters'
    })
}).options({ 
  stripUnknown: true,
  abortEarly: false,
  messages: {
    'object.unknown': 'Invalid filter parameter provided'
  }
});

/**
 * Schema for batch document operation validation
 * Implements validation for bulk document processing requests
 */
export const documentBatchSchema = Joi.object({
  documents: Joi.array()
    .items(Joi.string().pattern(UUID_REGEX))
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'At least one document ID is required',
      'array.max': 'Cannot process more than 100 documents in a batch'
    }),

  operation: Joi.string()
    .valid('process', 'delete', 'archive')
    .required(),

  priority: Joi.string()
    .valid('HIGH', 'MEDIUM', 'LOW')
    .default('MEDIUM')
}).options({ stripUnknown: true });