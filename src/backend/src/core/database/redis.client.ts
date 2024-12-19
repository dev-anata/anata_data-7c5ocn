import Redis from 'ioredis'; // v5.3.0
import { RedisClient, RedisConfig } from '../interfaces/database.interface';
import { BaseError } from '../utils/error.util';
import { StatusCodes as HttpStatus } from 'http-status-codes'; // v2.2.0

/**
 * Custom error class for Redis-specific errors
 */
class RedisError extends BaseError {
  constructor(message: string) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
    this.name = 'RedisError';
  }
}

/**
 * Redis client implementation providing high-performance caching capabilities
 * with robust error handling, connection management, and type safety
 */
export class RedisClientImpl implements RedisClient {
  private client: Redis | null = null;
  private readonly config: RedisConfig;
  private connected: boolean = false;
  private retryAttempts: number = 0;
  private healthCheck: NodeJS.Timer | null = null;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly OPERATION_TIMEOUT = 5000; // 5 seconds

  /**
   * Creates a new Redis client instance with the provided configuration
   * @param config - Redis configuration options
   * @throws {RedisError} If configuration is invalid
   */
  constructor(config: RedisConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates Redis configuration parameters
   * @param config - Configuration to validate
   * @throws {RedisError} If configuration is invalid
   */
  private validateConfig(config: RedisConfig): void {
    if (!config.host) {
      throw new RedisError('Redis host is required');
    }
    if (!config.port || config.port < 1 || config.port > 65535) {
      throw new RedisError('Invalid Redis port');
    }
    if (config.ttl && (config.ttl < 0 || !Number.isInteger(config.ttl))) {
      throw new RedisError('Invalid TTL value');
    }
  }

  /**
   * Establishes connection to Redis server with retry logic
   * @throws {RedisError} If connection fails after max retries
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        tls: this.config.tls,
        retryStrategy: (times: number) => {
          if (times > this.MAX_RETRY_ATTEMPTS) {
            return null; // Stop retrying
          }
          return Math.min(times * 1000, 3000); // Exponential backoff
        },
        commandTimeout: this.OPERATION_TIMEOUT,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
      });

      // Set up event handlers
      this.client.on('error', (error: Error) => {
        console.error('Redis error:', error);
        this.handleConnectionError(error);
      });

      this.client.on('connect', () => {
        this.connected = true;
        this.retryAttempts = 0;
        console.log('Redis connected successfully');
      });

      this.client.on('disconnect', () => {
        this.connected = false;
        console.log('Redis disconnected');
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        if (!this.client) {
          reject(new RedisError('Redis client not initialized'));
          return;
        }

        this.client.once('ready', () => {
          this.setupHealthCheck();
          resolve();
        });

        this.client.once('error', reject);
      });

    } catch (error) {
      throw new RedisError(`Failed to connect to Redis: ${error.message}`);
    }
  }

  /**
   * Sets up periodic health check monitoring
   */
  private setupHealthCheck(): void {
    this.healthCheck = setInterval(async () => {
      try {
        if (this.client) {
          await this.client.ping();
        }
      } catch (error) {
        console.error('Redis health check failed:', error);
        this.handleConnectionError(error);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Handles connection errors and implements retry logic
   * @param error - Error that occurred
   */
  private async handleConnectionError(error: Error): Promise<void> {
    this.connected = false;
    this.retryAttempts++;

    if (this.retryAttempts <= this.MAX_RETRY_ATTEMPTS) {
      console.log(`Attempting to reconnect (${this.retryAttempts}/${this.MAX_RETRY_ATTEMPTS})`);
      try {
        await this.connect();
      } catch (reconnectError) {
        console.error('Reconnection attempt failed:', reconnectError);
      }
    } else {
      console.error('Max retry attempts reached');
    }
  }

  /**
   * Safely closes Redis connection and cleans up resources
   */
  public async disconnect(): Promise<void> {
    if (this.healthCheck) {
      clearInterval(this.healthCheck);
      this.healthCheck = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    this.connected = false;
    this.retryAttempts = 0;
  }

  /**
   * Retrieves value by key from Redis cache
   * @param key - Cache key
   * @returns Cached value or null if not found
   * @throws {RedisError} If operation fails
   */
  public async get(key: string): Promise<string | null> {
    this.validateConnection();
    this.validateKey(key);

    try {
      const value = await this.client!.get(key);
      return value;
    } catch (error) {
      throw new RedisError(`Failed to get value for key ${key}: ${error.message}`);
    }
  }

  /**
   * Sets key-value pair in Redis cache with optional TTL
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional Time-To-Live in seconds
   * @throws {RedisError} If operation fails
   */
  public async set(key: string, value: string, ttl?: number): Promise<void> {
    this.validateConnection();
    this.validateKey(key);
    this.validateValue(value);

    try {
      const effectiveTtl = ttl || this.config.ttl;
      
      if (effectiveTtl) {
        await this.client!.set(key, value, 'EX', effectiveTtl);
      } else {
        await this.client!.set(key, value);
      }
    } catch (error) {
      throw new RedisError(`Failed to set value for key ${key}: ${error.message}`);
    }
  }

  /**
   * Removes key from Redis cache
   * @param key - Cache key to delete
   * @throws {RedisError} If operation fails
   */
  public async delete(key: string): Promise<void> {
    this.validateConnection();
    this.validateKey(key);

    try {
      await this.client!.del(key);
    } catch (error) {
      throw new RedisError(`Failed to delete key ${key}: ${error.message}`);
    }
  }

  /**
   * Validates current connection status
   * @throws {RedisError} If not connected
   */
  private validateConnection(): void {
    if (!this.connected || !this.client) {
      throw new RedisError('Redis client is not connected');
    }
  }

  /**
   * Validates cache key
   * @param key - Key to validate
   * @throws {RedisError} If key is invalid
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new RedisError('Invalid key: must be a non-empty string');
    }
  }

  /**
   * Validates cache value
   * @param value - Value to validate
   * @throws {RedisError} If value is invalid
   */
  private validateValue(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new RedisError('Invalid value: must be a non-empty string');
    }
  }

  /**
   * Checks if client is currently connected
   * @returns Current connection state
   */
  public isConnected(): boolean {
    return this.connected;
  }
}