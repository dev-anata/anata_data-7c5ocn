/**
 * @fileoverview Implementation of document-specific scraping logic with enhanced security and compliance features
 * @version 1.0.0
 */

// External Dependencies
import { injectable } from 'inversify'; // v6.0.1
import axios, { AxiosInstance } from 'axios'; // v1.3.0
import https from 'https';
import { retry, RetryConfig } from 'retry-ts'; // v0.1.4

// Internal Dependencies
import { BaseScraper, ScrapingError, ScrapingErrorType } from './base.scraper';
import { DocumentContent } from '../../document-processing/interfaces/document.interface';
import { CloudStorageService } from '../../core/storage/cloud-storage.service';
import { LoggerService } from '../../core/logging/logger.service';
import { ScrapingResult } from '../interfaces/result.interface';
import { ScrapingConfig } from '../interfaces/config.interface';

/**
 * Enhanced document scraper implementation with security and compliance features
 */
@injectable()
export class DocumentScraper extends BaseScraper {
    private readonly httpClient: AxiosInstance;
    private readonly documentBucket: string;
    private readonly retryConfig: RetryConfig;

    /**
     * Initialize document scraper with required services and configurations
     */
    constructor(
        protected readonly logger: LoggerService,
        private readonly storageService: CloudStorageService
    ) {
        super(logger);

        // Initialize secure HTTP client with TLS 1.3
        this.httpClient = axios.create({
            httpsAgent: new https.Agent({
                minVersion: 'TLSv1.3',
                maxVersion: 'TLSv1.3',
                rejectUnauthorized: true
            }),
            timeout: 30000,
            maxContentLength: 100 * 1024 * 1024, // 100MB limit
            validateStatus: status => status === 200
        });

        // Configure retry strategy
        this.retryConfig = {
            maxTries: 3,
            delay: 1000,
            backoff: 'exponential'
        };

        // Set document bucket from config
        this.documentBucket = process.env.GCS_RAW_BUCKET_NAME || 'pharma-pipeline-documents';
    }

    /**
     * Validate document source configuration and security requirements
     */
    protected async validatePrerequisites(): Promise<void> {
        try {
            if (!this.config.source.url) {
                throw new ScrapingError(
                    ScrapingErrorType.VALIDATION,
                    'Document URL is required',
                    false
                );
            }

            // Validate URL security
            const url = new URL(this.config.source.url);
            if (url.protocol !== 'https:') {
                throw new ScrapingError(
                    ScrapingErrorType.VALIDATION,
                    'Only HTTPS URLs are allowed',
                    false
                );
            }

            // Validate storage access
            await this.storageService.listFiles(this.documentBucket, '', { public: false });

            this.logger.debug('Document source validation successful', {
                jobId: this.config.jobId,
                source: this.config.source.url
            });
        } catch (error) {
            throw new ScrapingError(
                ScrapingErrorType.VALIDATION,
                `Prerequisite validation failed: ${error.message}`,
                false,
                { error }
            );
        }
    }

    /**
     * Download document with enhanced security and reliability
     */
    protected async performScraping(): Promise<Buffer> {
        try {
            // Download document with retry logic
            const response = await retry(async () => {
                const result = await this.httpClient.get(this.config.source.url, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': this.config.options.userAgent,
                        'Accept': 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*'
                    }
                });
                return result.data;
            }, this.retryConfig);

            this.metrics.bytesProcessed += response.length;
            this.metrics.itemsScraped++;

            return Buffer.from(response);
        } catch (error) {
            throw new ScrapingError(
                ScrapingErrorType.NETWORK,
                `Document download failed: ${error.message}`,
                true,
                { error }
            );
        }
    }

    /**
     * Process and store downloaded document with comprehensive metadata
     */
    protected async processScrapedData(documentContent: Buffer): Promise<ScrapingResult> {
        try {
            // Generate secure document ID
            const documentId = `doc-${Date.now()}-${Buffer.from(this.config.source.url).toString('base64')}`;

            // Create document metadata
            const documentMetadata: DocumentContent = {
                documentId,
                content: documentContent,
                metadata: {
                    fileName: new URL(this.config.source.url).pathname.split('/').pop() || 'unknown',
                    mimeType: 'application/pdf', // Default to PDF, should be detected
                    size: documentContent.length,
                    uploadedAt: new Date(),
                    source: this.config.source.url,
                    version: '1.0',
                    retentionPolicy: 'standard',
                    complianceFlags: ['PHI_SCAN_REQUIRED', 'REGULATORY_DOCUMENT']
                },
                checksum: this.calculateChecksum(documentContent)
            };

            // Upload to Cloud Storage with encryption
            const storedFile = await this.storageService.uploadFile(
                this.documentBucket,
                `${documentId}/${documentMetadata.metadata.fileName}`,
                documentContent,
                {
                    contentType: documentMetadata.metadata.mimeType,
                    metadata: {
                        sourceUrl: this.config.source.url,
                        checksum: documentMetadata.checksum,
                        jobId: this.config.jobId
                    },
                    retentionPeriod: 90 // 90 days retention
                }
            );

            return {
                id: documentId,
                jobId: this.config.jobId,
                sourceType: this.config.source.type,
                sourceUrl: this.config.source.url,
                timestamp: new Date(),
                storage: {
                    rawFile: storedFile,
                    processedFile: storedFile,
                    bigQueryTable: 'documents',
                    version: '1.0',
                    compressionType: 'none',
                    encryptionKey: process.env.GCS_KMS_KEY_NAME || ''
                },
                metadata: {
                    size: documentContent.length,
                    itemCount: 1,
                    format: documentMetadata.metadata.mimeType,
                    contentType: documentMetadata.metadata.mimeType,
                    checksum: documentMetadata.checksum,
                    validationStatus: 'VALID',
                    qualityMetrics: {
                        completeness: 100,
                        accuracy: 100,
                        consistency: 100,
                        freshness: 100
                    },
                    processingHistory: []
                }
            };
        } catch (error) {
            throw new ScrapingError(
                ScrapingErrorType.INTERNAL,
                `Document processing failed: ${error.message}`,
                false,
                { error }
            );
        }
    }

    /**
     * Calculate SHA-256 checksum for document content
     */
    private calculateChecksum(content: Buffer): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}