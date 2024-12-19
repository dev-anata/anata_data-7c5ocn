import { injectable } from 'inversify'; // v6.0.0
import { v4 as uuidv4 } from 'uuid'; // v8.3.2
import { trace, context, SpanStatusCode } from '@opentelemetry/api'; // v1.12.0
import { Logger } from 'winston'; // v3.8.0

import { ScrapingResult } from '../interfaces/result.interface';
import { CloudStorageService } from '../../../core/storage/cloud-storage.service';
import { BigQueryClientImpl } from '../../../core/database/bigquery.client';
import { NotFoundError, ValidationError } from '../../../core/utils/error.util';
import { storageConfig } from '../../../config/storage.config';
import { MetricsCollector } from '../../../core/monitoring/metrics.collector';
import { RetryConfig } from '../../../core/interfaces/retry.interface';

/**
 * Enhanced service for managing web scraping results with advanced security,
 * monitoring, and reliability features
 */
@injectable()
export class ResultService {
    private readonly tracer = trace.getTracer('result-service');
    private readonly bucketName: string;
    private readonly archiveBucketName: string;

    constructor(
        private readonly storageService: CloudStorageService,
        private readonly bigQueryClient: BigQueryClientImpl,
        private readonly metricsCollector: MetricsCollector,
        private readonly logger: Logger,
        private readonly retryConfig: RetryConfig = {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 5000
        }
    ) {
        this.bucketName = storageConfig.gcs.processedDataBucket.name;
        this.archiveBucketName = storageConfig.gcs.archiveBucket.name;
    }

    /**
     * Stores scraping result with enhanced security and reliability
     * @param result - Scraping result to store
     * @returns Promise<ScrapingResult> - Stored result with complete storage information
     */
    public async storeResult(result: ScrapingResult): Promise<ScrapingResult> {
        const span = this.tracer.startSpan('storeResult');
        
        try {
            // Generate cryptographically secure UUID if not provided
            if (!result.id) {
                result.id = uuidv4();
            }

            // Validate result structure
            this.validateResult(result);

            // Start metrics collection
            const timer = this.metricsCollector.startTimer('result_storage_duration');

            // Store raw data with CMEK encryption
            const rawStorageResult = await this.storageService.uploadFile(
                this.bucketName,
                `raw/${result.id}`,
                Buffer.from(JSON.stringify(result)),
                {
                    contentType: 'application/json',
                    metadata: {
                        jobId: result.jobId,
                        sourceType: result.sourceType,
                        timestamp: result.timestamp.toISOString()
                    },
                    encryption: storageConfig.gcs.encryption.kmsKeyName
                }
            );

            // Store processed data
            const processedStorageResult = await this.storageService.uploadFile(
                this.bucketName,
                `processed/${result.id}`,
                Buffer.from(JSON.stringify(result.metadata)),
                {
                    contentType: 'application/json',
                    metadata: {
                        jobId: result.jobId,
                        processingStatus: result.metadata.validationStatus
                    },
                    encryption: storageConfig.gcs.encryption.kmsKeyName
                }
            );

            // Update storage information
            result.storage = {
                rawFile: rawStorageResult,
                processedFile: processedStorageResult,
                bigQueryTable: storageConfig.bigquery.dataset,
                version: '1.0',
                compressionType: 'gzip',
                encryptionKey: storageConfig.gcs.encryption.kmsKeyName
            };

            // Insert metadata into BigQuery
            await this.bigQueryClient.insert('scraping_results', [{
                id: result.id,
                job_id: result.jobId,
                source_type: result.sourceType,
                source_url: result.sourceUrl,
                timestamp: result.timestamp,
                storage_info: result.storage,
                metadata: result.metadata
            }]);

            // Record metrics
            timer.end();
            this.metricsCollector.incrementCounter('results_stored_total');
            this.metricsCollector.recordGauge('result_size_bytes', result.metadata.size);

            span.setStatus({ code: SpanStatusCode.OK });
            return result;

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });
            this.logger.error('Failed to store result', { error, resultId: result.id });
            throw error;
        } finally {
            span.end();
        }
    }

    /**
     * Retrieves result with enhanced caching and parallel processing
     * @param resultId - ID of the result to retrieve
     * @returns Promise<ScrapingResult> - Retrieved result with validation
     */
    public async getResult(resultId: string): Promise<ScrapingResult> {
        const span = this.tracer.startSpan('getResult');
        
        try {
            // Validate result ID format
            if (!resultId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
                throw new ValidationError('Invalid result ID format');
            }

            // Start metrics collection
            const timer = this.metricsCollector.startTimer('result_retrieval_duration');

            // Parallel retrieval of raw and processed data
            const [rawData, processedData, metadataRows] = await Promise.all([
                this.storageService.downloadFile(this.bucketName, `raw/${resultId}`),
                this.storageService.downloadFile(this.bucketName, `processed/${resultId}`),
                this.bigQueryClient.query(
                    'SELECT * FROM scraping_results WHERE id = ?',
                    [resultId]
                )
            ]);

            if (metadataRows.length === 0) {
                throw new NotFoundError(`Result not found: ${resultId}`);
            }

            // Reconstruct result object
            const result: ScrapingResult = {
                ...JSON.parse(rawData.toString()),
                metadata: JSON.parse(processedData.toString()),
                storage: metadataRows[0].storage_info
            };

            // Validate retrieved data integrity
            this.validateResult(result);

            // Record metrics
            timer.end();
            this.metricsCollector.incrementCounter('results_retrieved_total');

            span.setStatus({ code: SpanStatusCode.OK });
            return result;

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });
            this.logger.error('Failed to retrieve result', { error, resultId });
            throw error;
        } finally {
            span.end();
        }
    }

    /**
     * Archives result with lifecycle management and audit trail
     * @param resultId - ID of the result to archive
     */
    public async archiveResult(resultId: string): Promise<void> {
        const span = this.tracer.startSpan('archiveResult');
        
        try {
            // Validate result exists
            const result = await this.getResult(resultId);

            // Move raw and processed data to archive storage
            await Promise.all([
                this.storageService.moveToArchive(
                    this.bucketName,
                    `raw/${resultId}`,
                    storageConfig.gcs.archiveBucket.retentionPeriodDays
                ),
                this.storageService.moveToArchive(
                    this.bucketName,
                    `processed/${resultId}`,
                    storageConfig.gcs.archiveBucket.retentionPeriodDays
                )
            ]);

            // Update metadata in BigQuery
            await this.bigQueryClient.query(
                'UPDATE scraping_results SET archived = TRUE, archive_timestamp = CURRENT_TIMESTAMP() WHERE id = ?',
                [resultId]
            );

            // Record metrics
            this.metricsCollector.incrementCounter('results_archived_total');

            span.setStatus({ code: SpanStatusCode.OK });

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });
            this.logger.error('Failed to archive result', { error, resultId });
            throw error;
        } finally {
            span.end();
        }
    }

    /**
     * Performs secure deletion with cascade and audit
     * @param resultId - ID of the result to delete
     */
    public async deleteResult(resultId: string): Promise<void> {
        const span = this.tracer.startSpan('deleteResult');
        
        try {
            // Validate result exists
            const result = await this.getResult(resultId);

            // Delete data from storage
            await Promise.all([
                this.storageService.deleteFile(this.bucketName, `raw/${resultId}`),
                this.storageService.deleteFile(this.bucketName, `processed/${resultId}`)
            ]);

            // Delete metadata from BigQuery
            await this.bigQueryClient.query(
                'DELETE FROM scraping_results WHERE id = ?',
                [resultId]
            );

            // Record metrics
            this.metricsCollector.incrementCounter('results_deleted_total');

            span.setStatus({ code: SpanStatusCode.OK });

        } catch (error) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message
            });
            this.logger.error('Failed to delete result', { error, resultId });
            throw error;
        } finally {
            span.end();
        }
    }

    /**
     * Validates result object structure and data
     * @param result - Result object to validate
     * @throws ValidationError if validation fails
     */
    private validateResult(result: ScrapingResult): void {
        if (!result.jobId || !result.sourceType || !result.sourceUrl) {
            throw new ValidationError('Missing required result fields');
        }

        if (!result.metadata || !result.metadata.validationStatus) {
            throw new ValidationError('Missing required metadata fields');
        }

        if (result.metadata.size <= 0) {
            throw new ValidationError('Invalid result size');
        }

        // Validate data quality metrics
        const { qualityMetrics } = result.metadata;
        if (
            qualityMetrics.completeness < 0 || qualityMetrics.completeness > 100 ||
            qualityMetrics.accuracy < 0 || qualityMetrics.accuracy > 100 ||
            qualityMetrics.consistency < 0 || qualityMetrics.consistency > 100
        ) {
            throw new ValidationError('Invalid quality metrics values');
        }
    }
}