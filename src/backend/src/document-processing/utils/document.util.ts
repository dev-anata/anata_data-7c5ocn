/**
 * Document Processing Utilities
 * Version: 1.0.0
 * 
 * Provides comprehensive helper functions for document processing operations
 * with enhanced validation, security, and performance optimization features.
 */

import { 
  DocumentMetadata, 
  DocumentContent, 
  DocumentProcessingStatus, 
  DocumentStorageLocation,
  ComplianceFlags 
} from '../interfaces/document.interface';
import { ValidationError } from '../../core/utils/error.util';
import { validateDateRange, validateChecksum } from '../../core/utils/validation.util';
import * as mime from 'mime-types'; // v2.1.35
import * as crypto from 'crypto';
import * as path from 'path';

// Supported document types with security considerations
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

// Configuration constants
const MAX_FILE_SIZE_MB = 100;
const MAX_FILENAME_LENGTH = 255;
const PROCESSING_TIMEOUT_MS = 120000; // 2 minutes as per requirements
const CHECKSUM_ALGORITHM = 'sha256';
const RETENTION_PERIODS = {
  DEFAULT: '90d',
  REGULATORY: '7y',
  ARCHIVED: '1y'
};

/**
 * Validates document metadata with comprehensive checks including compliance requirements
 * @param metadata Document metadata to validate
 * @param complianceFlags Optional compliance requirements
 * @returns boolean indicating validation success
 * @throws ValidationError for invalid metadata
 */
export function validateDocumentMetadata(
  metadata: DocumentMetadata,
  complianceFlags?: ComplianceFlags
): boolean {
  try {
    // Basic metadata validation
    if (!metadata) {
      throw new ValidationError('Document metadata is required');
    }

    // Filename validation with security checks
    if (!metadata.fileName || 
        metadata.fileName.length > MAX_FILENAME_LENGTH ||
        /[<>:"/\\|?*\x00-\x1F]/.test(metadata.fileName)) {
      throw new ValidationError('Invalid filename format or length');
    }

    // MIME type validation
    if (!metadata.mimeType || !SUPPORTED_MIME_TYPES.includes(metadata.mimeType)) {
      throw new ValidationError(`Unsupported file type: ${metadata.mimeType}`);
    }

    // File size validation
    if (!metadata.size || metadata.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new ValidationError(`File size exceeds maximum limit of ${MAX_FILE_SIZE_MB}MB`);
    }

    // Upload date validation
    if (!metadata.uploadedAt || !validateDateRange(metadata.uploadedAt, new Date())) {
      throw new ValidationError('Invalid upload date');
    }

    // Compliance validation if flags are provided
    if (complianceFlags) {
      if (complianceFlags.requiresRetention && !metadata.retentionPolicy) {
        throw new ValidationError('Retention policy required for compliance');
      }

      if (complianceFlags.requiresEncryption && !metadata.complianceFlags.includes('encrypted')) {
        throw new ValidationError('Encryption required for compliance');
      }
    }

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Metadata validation error: ${error.message}`);
  }
}

/**
 * Generates secure storage location with backup and compliance considerations
 * @param metadata Document metadata
 * @param complianceFlags Optional compliance requirements
 * @returns DocumentStorageLocation object
 */
export function generateStorageLocation(
  metadata: DocumentMetadata,
  complianceFlags?: ComplianceFlags
): DocumentStorageLocation {
  // Extract file extension securely
  const ext = path.extname(metadata.fileName).toLowerCase();
  const sanitizedName = crypto
    .createHash('md5')
    .update(metadata.fileName)
    .digest('hex');

  // Generate date-based path components
  const datePath = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  
  // Determine storage class based on compliance
  const storageClass = complianceFlags?.requiresLongTermRetention ? 'ARCHIVE' : 'STANDARD';
  
  // Generate primary storage path
  const primaryPath = `documents/${datePath}/${sanitizedName}${ext}`;
  
  // Generate backup location for disaster recovery
  const backupPath = `backup/${datePath}/${sanitizedName}${ext}`;

  return {
    bucket: process.env.GCS_BUCKET_NAME || 'default-bucket',
    path: primaryPath,
    storageFile: {
      name: primaryPath,
      bucket: process.env.GCS_BUCKET_NAME || 'default-bucket',
      size: metadata.size,
      contentType: metadata.mimeType,
      metadata: {
        originalName: metadata.fileName,
        uploadedAt: metadata.uploadedAt.toISOString(),
        retentionPolicy: metadata.retentionPolicy,
        complianceFlags: metadata.complianceFlags,
        storageClass
      }
    },
    region: process.env.GCP_REGION || 'us-central1',
    backupLocation: backupPath
  };
}

/**
 * Extracts and enhances document metadata with security and compliance features
 * @param content Document content buffer
 * @param fileName Original filename
 * @param complianceFlags Optional compliance requirements
 * @returns Enhanced DocumentMetadata object
 */
export function extractDocumentMetadata(
  content: Buffer,
  fileName: string,
  complianceFlags?: ComplianceFlags
): DocumentMetadata {
  // Generate secure checksum
  const checksum = crypto
    .createHash(CHECKSUM_ALGORITHM)
    .update(content)
    .digest('hex');

  // Detect MIME type
  const mimeType = mime.lookup(fileName) || 'application/octet-stream';
  
  // Calculate retention period based on compliance
  const retentionPolicy = complianceFlags?.requiresLongTermRetention
    ? RETENTION_PERIODS.REGULATORY
    : RETENTION_PERIODS.DEFAULT;

  // Generate compliance flags
  const generatedFlags = [
    'checksum-verified',
    complianceFlags?.requiresEncryption ? 'encrypted' : null,
    complianceFlags?.requiresAudit ? 'audit-enabled' : null
  ].filter(Boolean);

  return {
    fileName,
    mimeType,
    size: content.length,
    uploadedAt: new Date(),
    source: 'document-processing-service',
    version: '1.0',
    retentionPolicy,
    complianceFlags: generatedFlags
  };
}

/**
 * Determines if a document is processable based on enhanced criteria
 * @param metadata Document metadata
 * @param complianceFlags Optional compliance requirements
 * @returns boolean indicating if document can be processed
 */
export function isProcessable(
  metadata: DocumentMetadata,
  complianceFlags?: ComplianceFlags
): boolean {
  try {
    // Validate basic requirements
    if (!validateDocumentMetadata(metadata, complianceFlags)) {
      return false;
    }

    // Check processing timeout constraints
    if (metadata.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return false;
    }

    // Verify format compatibility
    if (!SUPPORTED_MIME_TYPES.includes(metadata.mimeType)) {
      return false;
    }

    // Check compliance requirements
    if (complianceFlags?.requiresEncryption && 
        !metadata.complianceFlags.includes('encrypted')) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking document processability:', error);
    return false;
  }
}