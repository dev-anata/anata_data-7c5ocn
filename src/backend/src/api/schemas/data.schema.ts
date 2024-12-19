/**
 * @fileoverview Data validation schemas for the Pharmaceutical Data Pipeline API
 * Implements Joi validation schemas for data-related API requests and responses
 * @version 1.0.0
 */

import * as Joi from 'joi'; // v17.6.0
import { DataSource, DataClassification } from '../interfaces/data.interface';

/**
 * Schema for validating data metadata
 * Enforces data classification and source validation requirements
 */
export const dataMetadataSchema = Joi.object({
  sourceId: Joi.string()
    .required()
    .min(1)
    .max(255)
    .description('Unique identifier of the data source'),

  sourceType: Joi.string()
    .valid(...Object.values(DataSource))
    .required()
    .description('Type of data source'),

  classification: Joi.string()
    .valid(...Object.values(DataClassification))
    .required()
    .description('Data classification level'),

  createdAt: Joi.date()
    .iso()
    .required()
    .description('Timestamp of data creation'),

  retentionPeriod: Joi.number()
    .integer()
    .min(1)
    .required()
    .description('Retention period in days'),

  encryptionStatus: Joi.boolean()
    .required()
    .description('Indicates if data is encrypted'),

  jurisdiction: Joi.string()
    .required()
    .description('Geographic jurisdiction for data governance'),

  lastModifiedAt: Joi.date()
    .iso()
    .required()
    .description('Last modification timestamp'),

  lastModifiedBy: Joi.string()
    .required()
    .description('Identity of last modifier')
}).label('DataMetadata');

/**
 * Schema for validating complete data records
 * Includes content validation and metadata requirements
 */
export const dataRecordSchema = Joi.object({
  id: Joi.string()
    .required()
    .pattern(/^[a-zA-Z0-9-_]+$/)
    .description('Unique identifier for the record'),

  content: Joi.object()
    .required()
    .min(1)
    .description('Actual data content'),

  metadata: dataMetadataSchema.required()
    .description('Associated metadata'),

  version: Joi.string()
    .required()
    .pattern(/^\d+\.\d+\.\d+$/)
    .description('Schema version for data compatibility'),

  checksum: Joi.string()
    .required()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .description('SHA-256 data integrity checksum')
}).label('DataRecord');

/**
 * Schema for validating data query parameters
 * Supports filtering, pagination, and access control
 */
export const dataQuerySchema = Joi.object({
  filters: Joi.object()
    .pattern(
      Joi.string(),
      Joi.alternatives().try(
        Joi.string(),
        Joi.number(),
        Joi.boolean(),
        Joi.array().items(Joi.string(), Joi.number(), Joi.boolean())
      )
    )
    .default({})
    .description('Query filters'),

  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .description('Page number'),
    
    pageSize: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(20)
      .description('Number of records per page')
  }).default({ page: 1, pageSize: 20 })
    .description('Pagination parameters'),

  sort: Joi.object({
    field: Joi.string()
      .required()
      .description('Field to sort by'),
    
    order: Joi.string()
      .valid('asc', 'desc')
      .default('asc')
      .description('Sort order')
  }).default({ field: 'createdAt', order: 'desc' })
    .description('Sorting configuration'),

  classification: Joi.array()
    .items(Joi.string().valid(...Object.values(DataClassification)))
    .default([DataClassification.PUBLIC])
    .description('Filter by classification levels'),

  includeMetadata: Joi.boolean()
    .default(true)
    .description('Flag to include metadata in results')
}).label('DataQuery');

/**
 * Schema for validating query result metadata
 * Provides pagination and performance information
 */
export const dataResultMetadataSchema = Joi.object({
  total: Joi.number()
    .integer()
    .min(0)
    .required()
    .description('Total number of matching records'),

  page: Joi.number()
    .integer()
    .min(1)
    .required()
    .description('Current page number'),

  pageSize: Joi.number()
    .integer()
    .min(1)
    .required()
    .description('Number of records per page'),

  hasNextPage: Joi.boolean()
    .required()
    .description('Indicates if more pages are available'),

  queryTime: Joi.number()
    .positive()
    .required()
    .description('Query execution time in milliseconds')
}).label('DataResultMetadata');

/**
 * Schema for validating complete query results
 * Combines data records with result metadata
 */
export const dataResultSchema = Joi.object({
  data: Joi.array()
    .items(dataRecordSchema)
    .required()
    .description('Array of matching data records'),

  metadata: dataResultMetadataSchema
    .required()
    .description('Query result metadata')
}).label('DataResult');

/**
 * Validation options configuration
 * Defines common validation settings
 */
export const validationOptions = {
  abortEarly: false,
  stripUnknown: true,
  presence: 'required' as const
};