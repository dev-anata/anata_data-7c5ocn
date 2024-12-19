/**
 * Document Processing Validation Utility
 * Version: 1.0.0
 * 
 * Provides comprehensive validation for document processing operations including
 * metadata validation, content verification, and quality assurance checks.
 * Implements strict type checking and detailed error reporting to maintain
 * error rates below 0.1%.
 */

import { z } from 'zod'; // v3.20.0
import * as mime from 'mime-types'; // v2.1.35
import { DocumentMetadata } from '../interfaces/document.interface';
import { OCRConfig, OCRPageSegmentationMode, OCREngineMode } from '../interfaces/ocr.interface';
import { ValidationError } from '../../core/utils/error.util';

// Constants for validation rules
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] as const;

export const SUPPORTED_LANGUAGES = [
  'eng', 'fra', 'deu', 'spa', 'ita', 'por', 
  'rus', 'chi_sim', 'chi_tra', 'jpn', 'kor'
] as const;

export const MAX_FILE_SIZE_MB = 50;
export const MIN_DPI = 150;
export const MAX_DPI = 1200;
export const MIN_CONFIDENCE_SCORE = 0.6;

// Zod schemas for validation
const documentMetadataSchema = z.object({
  fileName: z.string()
    .min(1)
    .max(255)
    .regex(/^[\w\-. ]+$/, 'Invalid filename format'),
  mimeType: z.enum(SUPPORTED_MIME_TYPES),
  size: z.number()
    .positive()
    .max(MAX_FILE_SIZE_MB * 1024 * 1024),
  uploadedAt: z.date()
    .max(new Date(), 'Upload date cannot be in the future'),
  source: z.string(),
  version: z.string(),
  retentionPolicy: z.string(),
  complianceFlags: z.array(z.string())
});

const ocrConfigSchema = z.object({
  language: z.array(z.enum(SUPPORTED_LANGUAGES))
    .min(1)
    .max(3),
  dpi: z.number()
    .min(MIN_DPI)
    .max(MAX_DPI),
  pageSegmentationMode: z.nativeEnum(OCRPageSegmentationMode),
  engineMode: z.nativeEnum(OCREngineMode),
  timeout: z.number()
    .positive()
    .max(300000), // 5 minutes max
  preprocessingOptions: z.object({
    deskew: z.boolean().optional(),
    noiseReduction: z.number().min(0).max(100).optional(),
    contrast: z.number().min(-100).max(100).optional(),
    autoRotate: z.boolean().optional(),
    scaleFactor: z.number().positive().max(2).optional()
  }).optional(),
  optimizations: z.object({
    enableParallel: z.boolean(),
    workerThreads: z.number().positive().max(8).optional(),
    enableGpu: z.boolean().optional()
  }).optional()
});

const processingResultSchema = z.object({
  documentId: z.string().uuid(),
  text: z.string().min(1),
  confidence: z.number()
    .min(MIN_CONFIDENCE_SCORE)
    .max(1),
  processedAt: z.date(),
  processingTime: z.number().positive(),
  pageResults: z.array(z.object({
    pageNumber: z.number().positive(),
    text: z.string(),
    confidence: z.number().min(0).max(1),
    processingTime: z.number().positive()
  })).min(1),
  metrics: z.object({
    memoryUsage: z.number().positive(),
    cpuUtilization: z.number().min(0).max(100),
    retryCount: z.number().min(0)
  }).optional()
});

/**
 * Validates document metadata for processing operations
 * @param metadata Document metadata to validate
 * @returns true if validation passes, throws ValidationError otherwise
 */
export function validateDocumentMetadata(metadata: DocumentMetadata): boolean {
  try {
    // Validate schema
    documentMetadataSchema.parse(metadata);

    // Validate file extension matches MIME type
    const extension = metadata.fileName.split('.').pop()?.toLowerCase();
    const expectedExtension = mime.extension(metadata.mimeType);
    if (extension !== expectedExtension) {
      throw new ValidationError(
        `File extension does not match MIME type: expected ${expectedExtension}, got ${extension}`
      );
    }

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Document metadata validation failed', error.errors);
    }
    throw error;
  }
}

/**
 * Validates OCR configuration settings
 * @param config OCR configuration to validate
 * @returns true if validation passes, throws ValidationError otherwise
 */
export function validateOCRConfig(config: OCRConfig): boolean {
  try {
    // Validate schema
    ocrConfigSchema.parse(config);

    // Additional validation for optimization settings
    if (config.optimizations?.enableParallel && !config.optimizations.workerThreads) {
      config.optimizations.workerThreads = Math.min(4, navigator.hardwareConcurrency || 2);
    }

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('OCR configuration validation failed', error.errors);
    }
    throw error;
  }
}

/**
 * Validates document content integrity and format
 * @param content Document content buffer
 * @param mimeType Expected MIME type
 * @returns true if validation passes, throws ValidationError otherwise
 */
export function validateDocumentContent(content: Buffer, mimeType: string): boolean {
  if (!content || content.length === 0) {
    throw new ValidationError('Document content cannot be empty');
  }

  // Validate content size
  if (content.length > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new ValidationError(`Document size exceeds maximum limit of ${MAX_FILE_SIZE_MB}MB`);
  }

  // Validate file signature based on MIME type
  const signatures: Record<string, number[]> = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/tiff': [0x49, 0x49, 0x2A, 0x00] // Little-endian TIFF
  };

  const signature = signatures[mimeType];
  if (signature) {
    const contentSignature = Array.from(content.slice(0, signature.length));
    if (!signature.every((byte, index) => byte === contentSignature[index])) {
      throw new ValidationError(`Invalid file signature for MIME type: ${mimeType}`);
    }
  }

  return true;
}

/**
 * Validates document processing results
 * @param result Processing result to validate
 * @returns true if validation passes, throws ValidationError otherwise
 */
export function validateProcessingResult(result: any): boolean {
  try {
    // Validate schema
    processingResultSchema.parse(result);

    // Validate processing timestamps
    if (result.processedAt > new Date()) {
      throw new ValidationError('Processing timestamp cannot be in the future');
    }

    // Validate processing metrics
    if (result.metrics) {
      if (result.metrics.cpuUtilization > 95) {
        throw new ValidationError('CPU utilization exceeded threshold');
      }
      if (result.metrics.retryCount > 3) {
        throw new ValidationError('Maximum retry attempts exceeded');
      }
    }

    // Validate page results consistency
    const pageNumbers = new Set(result.pageResults.map((p: any) => p.pageNumber));
    if (pageNumbers.size !== result.pageResults.length) {
      throw new ValidationError('Duplicate page numbers detected in results');
    }

    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Processing result validation failed', error.errors);
    }
    throw error;
  }
}