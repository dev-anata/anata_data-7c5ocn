// External Dependencies
import { describe, beforeEach, test, expect, jest } from '@jest/globals'; // v29.0.0
import { faker } from '@faker-js/faker'; // v8.0.0

// Internal Dependencies
import { ConfigService } from '../../../src/scraping/services/config.service';
import { CloudStorageService } from '../../../src/core/storage/cloud-storage.service';
import { ScrapingConfig, ScrapingSourceType, ScrapingAuthType } from '../../../src/scraping/interfaces/config.interface';
import { ValidationError, NotFoundError } from '../../../src/core/utils/error.util';
import { Logger } from 'winston';

describe('ConfigService', () => {
    let configService: ConfigService;
    let mockStorageService: jest.Mocked<CloudStorageService>;
    let mockLogger: jest.Mocked<Logger>;

    // Test data generators
    const generateValidConfig = (): ScrapingConfig => ({
        jobId: faker.string.uuid() as string & { brand: unique symbol },
        source: {
            type: ScrapingSourceType.WEBSITE,
            url: faker.internet.url() as string & { readonly _brand: 'URL' },
            selectors: {
                title: {
                    selector: 'h1.title',
                    type: 'css',
                    required: true
                }
            },
            authentication: {
                type: ScrapingAuthType.BASIC,
                credentials: {
                    username: faker.internet.userName() as string & { readonly _brand: 'Credential' },
                    password: faker.internet.password() as string & { readonly _brand: 'Credential' }
                },
                encryption: {
                    algorithm: 'AES-256-GCM',
                    keyId: faker.string.uuid()
                }
            },
            validation: {
                schema: 'website-schema-v1',
                rules: {
                    requiredFields: ['title']
                }
            }
        },
        schedule: {
            enabled: true,
            cronExpression: '0 0 * * *' as any,
            timezone: 'UTC' as string & { readonly _brand: 'Timezone' },
            validation: {
                maxFrequency: 24,
                minInterval: 1
            }
        },
        options: {
            retryAttempts: 3 as number & { readonly _brand: 'RetryCount' },
            retryDelay: 1000 as number & { readonly _brand: 'Milliseconds' },
            timeout: 30000 as number & { readonly _brand: 'Milliseconds' },
            userAgent: 'PharmaPipeline/1.0' as string & { readonly _brand: 'UserAgent' },
            rateLimit: {
                requests: 10,
                period: 60
            }
        },
        gcp: {
            projectId: 'test-project',
            region: 'us-central1',
            credentials: {
                type: 'service_account',
                project_id: 'test-project',
                private_key_id: faker.string.uuid(),
                private_key: faker.string.uuid(),
                client_email: faker.internet.email(),
                client_id: faker.string.uuid()
            }
        }
    });

    beforeEach(() => {
        // Mock CloudStorageService
        mockStorageService = {
            uploadFile: jest.fn(),
            downloadFile: jest.fn(),
            listFiles: jest.fn(),
            deleteFile: jest.fn(),
            moveToArchive: jest.fn()
        } as unknown as jest.Mocked<CloudStorageService>;

        // Mock Logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            child: jest.fn().mockReturnThis()
        } as unknown as jest.Mocked<Logger>;

        // Initialize ConfigService with mocks
        configService = new ConfigService(mockStorageService, mockLogger);
    });

    describe('getConfig', () => {
        test('should successfully retrieve and validate configuration', async () => {
            // Arrange
            const validConfig = generateValidConfig();
            const jobId = validConfig.jobId;
            mockStorageService.downloadFile.mockResolvedValueOnce(
                Buffer.from(JSON.stringify(validConfig))
            );

            // Act
            const result = await configService.getConfig(jobId);

            // Assert
            expect(result).toEqual(validConfig);
            expect(mockStorageService.downloadFile).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining(jobId)
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully retrieved configuration')
            );
        });

        test('should throw NotFoundError when configuration does not exist', async () => {
            // Arrange
            const jobId = faker.string.uuid();
            mockStorageService.downloadFile.mockRejectedValueOnce(new NotFoundError());

            // Act & Assert
            await expect(configService.getConfig(jobId)).rejects.toThrow(NotFoundError);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        test('should retry on temporary failures', async () => {
            // Arrange
            const validConfig = generateValidConfig();
            mockStorageService.downloadFile
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce(Buffer.from(JSON.stringify(validConfig)));

            // Act
            const result = await configService.getConfig(validConfig.jobId);

            // Assert
            expect(result).toEqual(validConfig);
            expect(mockStorageService.downloadFile).toHaveBeenCalledTimes(2);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Retry attempt'),
                expect.any(Object)
            );
        });
    });

    describe('saveConfig', () => {
        test('should successfully save valid configuration', async () => {
            // Arrange
            const validConfig = generateValidConfig();
            mockStorageService.uploadFile.mockResolvedValueOnce({} as any);

            // Act
            await configService.saveConfig(validConfig);

            // Assert
            expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining(validConfig.jobId),
                expect.any(Buffer),
                expect.objectContaining({
                    contentType: 'application/json',
                    metadata: expect.objectContaining({
                        jobId: validConfig.jobId,
                        sourceType: validConfig.source.type
                    })
                })
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully saved configuration')
            );
        });

        test('should throw ValidationError for invalid configuration', async () => {
            // Arrange
            const invalidConfig = {
                ...generateValidConfig(),
                source: { type: ScrapingSourceType.WEBSITE }
            } as ScrapingConfig;

            // Act & Assert
            await expect(configService.saveConfig(invalidConfig)).rejects.toThrow(ValidationError);
            expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalled();
        });

        test('should handle concurrent save operations', async () => {
            // Arrange
            const configs = Array(3).fill(null).map(() => generateValidConfig());
            mockStorageService.uploadFile.mockResolvedValue({} as any);

            // Act
            const savePromises = configs.map(config => configService.saveConfig(config));

            // Assert
            await expect(Promise.all(savePromises)).resolves.not.toThrow();
            expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(configs.length);
        });
    });

    describe('listConfigs', () => {
        test('should successfully list and paginate configurations', async () => {
            // Arrange
            const configs = Array(15).fill(null).map(() => generateValidConfig());
            const files = configs.map(config => ({
                name: `scraping-configs/${config.jobId}.json`
            }));
            mockStorageService.listFiles.mockResolvedValueOnce(files);
            mockStorageService.downloadFile.mockImplementation((_, fileName) => {
                const config = configs.find(c => fileName.includes(c.jobId));
                return Promise.resolve(Buffer.from(JSON.stringify(config)));
            });

            // Act
            const result = await configService.listConfigs(1, 10);

            // Assert
            expect(result).toHaveLength(10);
            expect(mockStorageService.listFiles).toHaveBeenCalledWith(
                expect.any(String),
                'scraping-configs/'
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Successfully retrieved'),
                expect.any(Object)
            );
        });

        test('should throw ValidationError for invalid pagination parameters', async () => {
            // Act & Assert
            await expect(configService.listConfigs(0, 0)).rejects.toThrow(ValidationError);
            expect(mockStorageService.listFiles).not.toHaveBeenCalled();
        });
    });

    describe('validateConfig', () => {
        test('should validate all required configuration fields', async () => {
            // Arrange
            const validConfig = generateValidConfig();

            // Act
            await configService['validateConfig'](validConfig);

            // Assert
            expect(mockLogger.error).not.toHaveBeenCalled();
        });

        test('should throw ValidationError for invalid schedule configuration', async () => {
            // Arrange
            const invalidConfig = {
                ...generateValidConfig(),
                schedule: {
                    ...generateValidConfig().schedule,
                    enabled: true,
                    cronExpression: undefined
                }
            } as ScrapingConfig;

            // Act & Assert
            await expect(configService['validateConfig'](invalidConfig)).rejects.toThrow(ValidationError);
        });

        test('should throw ValidationError for invalid options configuration', async () => {
            // Arrange
            const invalidConfig = {
                ...generateValidConfig(),
                options: {
                    ...generateValidConfig().options,
                    retryAttempts: 11 as number & { readonly _brand: 'RetryCount' }
                }
            };

            // Act & Assert
            await expect(configService['validateConfig'](invalidConfig)).rejects.toThrow(ValidationError);
        });
    });
});