// External Dependencies
import { injectable } from 'inversify'; // v6.0.0
import { validate } from 'class-validator'; // v0.14.0
import { retry } from 'retry-ts'; // v0.1.3
import { Logger } from 'winston'; // v3.8.0

// Internal Dependencies
import { ScrapingConfig } from '../interfaces/config.interface';
import { CloudStorageService } from '../../../core/storage/cloud-storage.service';
import { ValidationError, NotFoundError } from '../../../core/utils/error.util';
import { storageConfig } from '../../../config/storage.config';

/**
 * Service responsible for managing web scraping configurations
 * Handles secure storage, validation, and retrieval of scraping job configurations
 */
@injectable()
export class ConfigService {
    private readonly configBucketName: string;
    private readonly maxRetries: number = 3;
    private readonly retryDelay: number = 1000;
    private readonly configPrefix: string = 'scraping-configs/';
    private readonly logger: Logger;

    /**
     * Initializes the configuration service
     * @param storageService - Cloud Storage service instance
     * @param logger - Winston logger instance
     */
    constructor(
        private readonly storageService: CloudStorageService,
        logger: Logger
    ) {
        this.configBucketName = storageConfig.gcs.processedDataBucket.name;
        this.logger = logger.child({ service: 'ConfigService' });
        this.validateServiceInitialization();
    }

    /**
     * Validates service initialization parameters
     * @throws Error if initialization fails
     */
    private validateServiceInitialization(): void {
        if (!this.configBucketName) {
            throw new Error('Configuration bucket name not set');
        }
        if (!storageConfig.gcs.encryption.enabled) {
            throw new Error('Storage encryption must be enabled for configuration management');
        }
    }

    /**
     * Constructs the storage path for a configuration file
     * @param jobId - Unique job identifier
     * @returns Full storage path
     */
    private getConfigPath(jobId: string): string {
        return `${this.configPrefix}${jobId}.json`;
    }

    /**
     * Retrieves a scraping configuration by job ID
     * @param jobId - Unique job identifier
     * @returns Promise resolving to job configuration
     * @throws NotFoundError if configuration doesn't exist
     * @throws ValidationError if configuration is invalid
     */
    public async getConfig(jobId: string): Promise<ScrapingConfig> {
        this.logger.info(`Retrieving configuration for job: ${jobId}`);

        try {
            const configPath = this.getConfigPath(jobId);
            const configBuffer = await retry(
                async () => this.storageService.downloadFile(this.configBucketName, configPath),
                {
                    retries: this.maxRetries,
                    delay: this.retryDelay,
                    onRetry: (error, attempt) => {
                        this.logger.warn(`Retry attempt ${attempt} for config retrieval: ${jobId}`, { error });
                    }
                }
            );

            const config = JSON.parse(configBuffer.toString()) as ScrapingConfig;
            await this.validateConfig(config);

            this.logger.info(`Successfully retrieved configuration for job: ${jobId}`);
            return config;
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw new NotFoundError(`Configuration not found for job: ${jobId}`);
            }
            this.logger.error(`Error retrieving configuration for job: ${jobId}`, { error });
            throw error;
        }
    }

    /**
     * Saves a scraping configuration with validation and encryption
     * @param config - Scraping configuration to save
     * @returns Promise resolving when save is complete
     * @throws ValidationError if configuration is invalid
     */
    public async saveConfig(config: ScrapingConfig): Promise<void> {
        this.logger.info(`Saving configuration for job: ${config.jobId}`);

        try {
            await this.validateConfig(config);
            const configPath = this.getConfigPath(config.jobId);
            const configBuffer = Buffer.from(JSON.stringify(config));

            await retry(
                async () => this.storageService.uploadFile(
                    this.configBucketName,
                    configPath,
                    configBuffer,
                    {
                        contentType: 'application/json',
                        metadata: {
                            jobId: config.jobId,
                            sourceType: config.source.type,
                            createdAt: new Date().toISOString()
                        }
                    }
                ),
                {
                    retries: this.maxRetries,
                    delay: this.retryDelay,
                    onRetry: (error, attempt) => {
                        this.logger.warn(`Retry attempt ${attempt} for config save: ${config.jobId}`, { error });
                    }
                }
            );

            this.logger.info(`Successfully saved configuration for job: ${config.jobId}`);
        } catch (error) {
            this.logger.error(`Error saving configuration for job: ${config.jobId}`, { error });
            throw error;
        }
    }

    /**
     * Lists all available scraping configurations with pagination
     * @param page - Page number (1-based)
     * @param pageSize - Number of items per page
     * @returns Promise resolving to array of configurations
     */
    public async listConfigs(page: number = 1, pageSize: number = 10): Promise<ScrapingConfig[]> {
        this.logger.info('Listing scraping configurations', { page, pageSize });

        try {
            if (page < 1 || pageSize < 1) {
                throw new ValidationError('Invalid pagination parameters');
            }

            const files = await this.storageService.listFiles(
                this.configBucketName,
                this.configPrefix
            );

            const start = (page - 1) * pageSize;
            const paginatedFiles = files.slice(start, start + pageSize);

            const configs = await Promise.all(
                paginatedFiles.map(async (file) => {
                    const configBuffer = await this.storageService.downloadFile(
                        this.configBucketName,
                        file.name
                    );
                    return JSON.parse(configBuffer.toString()) as ScrapingConfig;
                })
            );

            this.logger.info(`Successfully retrieved ${configs.length} configurations`);
            return configs;
        } catch (error) {
            this.logger.error('Error listing configurations', { error });
            throw error;
        }
    }

    /**
     * Validates a scraping configuration against schema and business rules
     * @param config - Configuration to validate
     * @throws ValidationError if configuration is invalid
     */
    private async validateConfig(config: ScrapingConfig): Promise<void> {
        const errors = await validate(config);

        if (errors.length > 0) {
            throw new ValidationError('Invalid configuration', errors);
        }

        // Validate source configuration
        if (!config.source || !config.source.url) {
            throw new ValidationError('Invalid source configuration');
        }

        // Validate schedule configuration
        if (config.schedule) {
            if (config.schedule.enabled && !config.schedule.cronExpression) {
                throw new ValidationError('Cron expression required for enabled schedule');
            }
        }

        // Validate options
        if (config.options) {
            if (config.options.retryAttempts < 0 || config.options.retryAttempts > 10) {
                throw new ValidationError('Invalid retry attempts range (0-10)');
            }
            if (config.options.timeout < 1000 || config.options.timeout > 300000) {
                throw new ValidationError('Invalid timeout range (1000-300000ms)');
            }
        }
    }
}