import { BigQuery, Table, Dataset } from '@google-cloud/bigquery'; // v6.0.0
import { retry } from 'retry'; // v0.13.0
import { trace, context, SpanStatusCode } from '@opentelemetry/api'; // v1.12.0
import { Logger } from 'winston'; // v3.8.0

import { BigQueryClient, BigQueryConfig } from '../interfaces/database.interface';
import { databaseConfig } from '../../config/database.config';
import { BaseError } from '../utils/error.util';

// Constants for configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const POOL_SIZE = 10;
const HEALTH_CHECK_INTERVAL = 30000;
const BATCH_SIZE = 1000;

/**
 * Custom error class for BigQuery-specific errors
 */
class BigQueryError extends BaseError {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'BigQueryError';
  }
}

/**
 * Enhanced BigQuery client implementation with retry mechanisms,
 * connection pooling, monitoring, and comprehensive error handling
 */
export class BigQueryClientImpl implements BigQueryClient {
  private client: BigQuery;
  private connected: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly tracer = trace.getTracer('bigquery-client');
  private connectionPool: BigQuery[] = [];

  constructor(private readonly config: BigQueryConfig) {
    this.validateConfig();
    this.client = new BigQuery({
      projectId: config.projectId,
      maxRetries: config.maxRetries || MAX_RETRIES,
      retryDelayMs: config.retryDelayMs || RETRY_DELAY_MS
    });
  }

  /**
   * Validates client configuration
   * @throws {BigQueryError} if configuration is invalid
   */
  private validateConfig(): void {
    if (!this.config.projectId || !this.config.datasetId) {
      throw new BigQueryError('Invalid BigQuery configuration', 'INVALID_CONFIG');
    }
  }

  /**
   * Establishes connection to BigQuery with retry mechanism
   */
  public async connect(): Promise<void> {
    const span = this.tracer.startSpan('bigquery.connect');
    
    try {
      const operation = retry.operation({
        retries: this.config.maxRetries,
        factor: 2,
        minTimeout: this.config.retryDelayMs
      });

      await new Promise<void>((resolve, reject) => {
        operation.attempt(async () => {
          try {
            // Initialize connection pool
            for (let i = 0; i < POOL_SIZE; i++) {
              const connection = new BigQuery({
                projectId: this.config.projectId
              });
              await connection.dataset(this.config.datasetId).get();
              this.connectionPool.push(connection);
            }
            
            this.connected = true;
            this.initializeHealthCheck();
            resolve();
          } catch (error) {
            if (operation.retry(error)) {
              return;
            }
            reject(operation.mainError());
          }
        });
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw new BigQueryError(`Failed to connect: ${error.message}`, 'CONNECTION_ERROR');
    } finally {
      span.end();
    }
  }

  /**
   * Safely disconnects from BigQuery and cleans up resources
   */
  public async disconnect(): Promise<void> {
    const span = this.tracer.startSpan('bigquery.disconnect');
    
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Close all pool connections
      await Promise.all(
        this.connectionPool.map(async (connection) => {
          try {
            await connection.dataset(this.config.datasetId).get();
          } catch (error) {
            span.addEvent('connection_close_error', { error: error.message });
          }
        })
      );

      this.connectionPool = [];
      this.connected = false;
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw new BigQueryError(`Failed to disconnect: ${error.message}`, 'DISCONNECT_ERROR');
    } finally {
      span.end();
    }
  }

  /**
   * Executes a BigQuery SQL query with retry and monitoring
   */
  public async query<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const span = this.tracer.startSpan('bigquery.query');
    span.setAttribute('query', query);
    
    try {
      if (!this.connected) {
        throw new BigQueryError('Client not connected', 'NOT_CONNECTED');
      }

      const operation = retry.operation({
        retries: this.config.maxRetries,
        factor: 2,
        minTimeout: this.config.retryDelayMs
      });

      return await new Promise((resolve, reject) => {
        operation.attempt(async () => {
          try {
            const [rows] = await this.getConnection().query({
              query,
              params,
              location: this.config.location
            });
            
            span.setStatus({ code: SpanStatusCode.OK });
            resolve(rows as T[]);
          } catch (error) {
            if (operation.retry(this.isRetryableError(error))) {
              return;
            }
            reject(operation.mainError());
          }
        });
      });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw new BigQueryError(`Query failed: ${error.message}`, 'QUERY_ERROR');
    } finally {
      span.end();
    }
  }

  /**
   * Inserts data into BigQuery table with batching and retry
   */
  public async insert(tableId: string, rows: any[]): Promise<void> {
    const span = this.tracer.startSpan('bigquery.insert');
    span.setAttribute('table', tableId);
    span.setAttribute('rows', rows.length);

    try {
      if (!this.connected) {
        throw new BigQueryError('Client not connected', 'NOT_CONNECTED');
      }

      // Process in batches
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        
        const operation = retry.operation({
          retries: this.config.maxRetries,
          factor: 2,
          minTimeout: this.config.retryDelayMs
        });

        await new Promise((resolve, reject) => {
          operation.attempt(async () => {
            try {
              const table = this.getConnection().dataset(this.config.datasetId).table(tableId);
              await table.insert(batch);
              resolve(undefined);
            } catch (error) {
              if (operation.retry(this.isRetryableError(error))) {
                return;
              }
              reject(operation.mainError());
            }
          });
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw new BigQueryError(`Insert failed: ${error.message}`, 'INSERT_ERROR');
    } finally {
      span.end();
    }
  }

  /**
   * Creates a new BigQuery table with schema validation
   */
  public async createTable(tableId: string, schema: any): Promise<void> {
    const span = this.tracer.startSpan('bigquery.createTable');
    span.setAttribute('table', tableId);

    try {
      if (!this.connected) {
        throw new BigQueryError('Client not connected', 'NOT_CONNECTED');
      }

      const operation = retry.operation({
        retries: this.config.maxRetries,
        factor: 2,
        minTimeout: this.config.retryDelayMs
      });

      await new Promise((resolve, reject) => {
        operation.attempt(async () => {
          try {
            const dataset = this.getConnection().dataset(this.config.datasetId);
            await dataset.createTable(tableId, { schema });
            resolve(undefined);
          } catch (error) {
            if (operation.retry(this.isRetryableError(error))) {
              return;
            }
            reject(operation.mainError());
          }
        });
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw new BigQueryError(`Table creation failed: ${error.message}`, 'CREATE_TABLE_ERROR');
    } finally {
      span.end();
    }
  }

  /**
   * Gets a connection from the pool
   */
  private getConnection(): BigQuery {
    if (this.connectionPool.length === 0) {
      throw new BigQueryError('No available connections', 'NO_CONNECTIONS');
    }
    return this.connectionPool[Math.floor(Math.random() * this.connectionPool.length)];
  }

  /**
   * Initializes health check interval
   */
  private initializeHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.getConnection().dataset(this.config.datasetId).get();
      } catch (error) {
        // Log health check failure
        console.error('BigQuery health check failed:', error);
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'DEADLINE_EXCEEDED',
      'INTERNAL',
      'RESOURCE_EXHAUSTED',
      'SERVICE_UNAVAILABLE'
    ];
    return retryableCodes.includes(error.code);
  }
}