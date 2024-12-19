/**
 * Document API Interface Definitions
 * Version: 1.0.0
 * 
 * Defines comprehensive TypeScript interfaces for document-related API operations
 * in the Pharmaceutical Data Pipeline Platform with full type safety and 
 * production-ready features.
 */

import { Request } from 'express'; // ^4.17.1
import { DocumentMetadata, DocumentProcessingStatus } from '../../document-processing/interfaces/document.interface';
import { StorageConfig } from '../../types/gcp';

/**
 * Security classification levels for document handling
 */
export enum DocumentSecurityLevel {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  RESTRICTED = 'RESTRICTED'
}

/**
 * Date range filter for document queries
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Processing event for document history tracking
 */
export interface ProcessingEvent {
  timestamp: Date;
  status: DocumentProcessingStatus;
  message: string;
  duration?: number;
  error?: string;
}

/**
 * Summary statistics for document list operations
 */
export interface DocumentListSummary {
  totalDocuments: number;
  statusBreakdown: Record<DocumentProcessingStatus, number>;
  averageProcessingTime: number;
  failureRate: number;
}

/**
 * Enhanced document upload request with security and compliance metadata
 */
export interface DocumentUploadRequest extends Request {
  file: Express.Multer.File;
  metadata: Partial<DocumentMetadata>;
  retentionPeriod: number;
  securityLevel: DocumentSecurityLevel;
  complianceFlags?: string[];
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  customMetadata?: Record<string, string>;
}

/**
 * Comprehensive document upload response with validation and audit information
 */
export interface DocumentUploadResponse {
  documentId: string;
  status: DocumentProcessingStatus;
  metadata: DocumentMetadata;
  validationErrors: string[];
  storageLocation?: {
    bucket: string;
    path: string;
    region: string;
  };
  auditTrail: {
    uploadedBy: string;
    uploadedAt: Date;
    clientIp: string;
    userAgent: string;
  };
  securityInfo: {
    classification: DocumentSecurityLevel;
    encryptionStatus: boolean;
    retentionPeriod: number;
  };
}

/**
 * Document status request with history tracking option
 */
export interface DocumentStatusRequest {
  documentId: string;
  includeHistory: boolean;
  includeAuditTrail?: boolean;
}

/**
 * Enhanced document status response with detailed processing information
 */
export interface DocumentStatusResponse {
  documentId: string;
  status: DocumentProcessingStatus;
  progress: number;
  error: string | null;
  processingHistory: ProcessingEvent[];
  estimatedTimeRemaining: number;
  performance: {
    processingTime: number;
    queueTime: number;
    retryCount: number;
  };
  compliance: {
    retentionExpiryDate: Date;
    securityLevel: DocumentSecurityLevel;
    encryptionStatus: boolean;
  };
}

/**
 * Advanced document list request with filtering and sorting
 */
export interface DocumentListRequest {
  page: number;
  limit: number;
  status?: DocumentProcessingStatus;
  sortBy: 'uploadedAt' | 'fileName' | 'fileSize' | 'status';
  sortOrder: 'asc' | 'desc';
  dateRange?: DateRange;
  securityLevel?: DocumentSecurityLevel;
  searchQuery?: string;
  includeMetadata?: boolean;
}

/**
 * Comprehensive document list response with pagination and statistics
 */
export interface DocumentListResponse {
  documents: Array<DocumentUploadResponse>;
  total: number;
  page: number;
  pages: number;
  hasMore: boolean;
  summary: DocumentListSummary;
  filters: {
    appliedFilters: Record<string, any>;
    availableFilters: Record<string, any[]>;
  };
}

/**
 * Document deletion request with compliance verification
 */
export interface DocumentDeleteRequest {
  documentId: string;
  securityLevel: DocumentSecurityLevel;
  retentionOverride?: boolean;
  deletionReason: string;
  approverEmail?: string;
}

/**
 * Document deletion response with audit trail
 */
export interface DocumentDeleteResponse {
  success: boolean;
  documentId: string;
  deletionTimestamp: Date;
  auditTrail: {
    requestedBy: string;
    approvedBy?: string;
    reason: string;
    clientIp: string;
  };
}

/**
 * Batch document operation request
 */
export interface BatchDocumentRequest {
  documents: Array<{
    documentId: string;
    operation: 'PROCESS' | 'DELETE' | 'ARCHIVE';
  }>;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  notifyOnCompletion?: boolean;
  batchMetadata?: Record<string, any>;
}

/**
 * Batch operation response with detailed results
 */
export interface BatchDocumentResponse {
  batchId: string;
  totalDocuments: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    documentId: string;
    success: boolean;
    error?: string;
    status: DocumentProcessingStatus;
  }>;
  performance: {
    totalDuration: number;
    averageTimePerDocument: number;
  };
}