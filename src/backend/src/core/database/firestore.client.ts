/**
 * Advanced Firestore client implementation for the Pharmaceutical Data Pipeline Platform
 * Provides secure, scalable document storage operations with comprehensive monitoring
 * @version 1.0.0
 */

import { Firestore, DocumentSnapshot, QuerySnapshot } from '@google-cloud/firestore'; // v6.5.0
import { operation } from 'retry'; // v0.13.1
import { createLogger, Logger, format, transports } from 'winston'; // v3.8.2
import { FirestoreClient, FirestoreConfig } from '../interfaces/database.interface';
import { NotFoundError } from '../utils/error.util';

/**
 * Configuration interface for retry operations
 */
interface RetryConfig {
  retries: number;
  factor: number;
  minTimeout: number;
  maxTimeout: number;
}

/**
 * Connection pool configuration
 */
interface ConnectionPool {
  maxConnections: number;
  minConnections: number;
  acquireTimeout: number;
  connections: Set<Firestore>;
}

/**
 * Implementation of FirestoreClient interface with advanced features
 * Provides connection pooling, retry logic, monitoring, and error handling
 */
export class FirestoreClientImpl implements FirestoreClient {
  private readonly client: Firestore;
  private readonly collectionName: string;
  private connected: boolean = false;
  private readonly retryConfig: RetryConfig;
  private readonly timeoutMs: number;
  private readonly logger: Logger;
  private readonly connectionPool: ConnectionPool;

  /**
   * Creates a new FirestoreClientImpl instance
   * @param config - Configuration options for Firestore client
   * @throws Error if configuration is invalid
   */
  constructor(config: FirestoreConfig) {
    // Validate configuration
    if (!config.projectId || !config.collectionName) {
      throw new Error('Invalid Firestore configuration: projectId and collectionName are required');
    }

    // Initialize client
    this.client = new Firestore({
      projectId: config.projectId,
      maxIdleConnections: 10,
      keepAliveTimeout: 30000
    });

    this.collectionName = config.collectionName;

    // Configure retry policy
    this.retryConfig = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 5000
    };

    // Configure connection pool
    this.connectionPool = {
      maxConnections: 10,
      minConnections: 2,
      acquireTimeout: 5000,
      connections: new Set()
    };

    // Initialize logger
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console(),
        new transports.File({ filename: 'firestore-error.log', level: 'error' })
      ]
    });

    this.timeoutMs = 30000; // 30 second timeout
  }

  /**
   * Establishes connection to Firestore with retry logic
   * @throws Error if connection fails after retries
   */
  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      const op = operation(this.retryConfig);
      
      await op.attempt(async (currentAttempt) => {
        try {
          await this.client.collection(this.collectionName).limit(1).get();
          
          // Initialize connection pool
          for (let i = 0; i < this.connectionPool.minConnections; i++) {
            const conn = new Firestore({
              projectId: this.client.projectId,
              maxIdleConnections: 1
            });
            this.connectionPool.connections.add(conn);
          }

          this.connected = true;
          this.logger.info('Successfully connected to Firestore', {
            collection: this.collectionName,
            attempt: currentAttempt
          });
        } catch (err) {
          this.logger.error('Failed to connect to Firestore', {
            error: err,
            attempt: currentAttempt
          });
          if (!op.retry(err as Error)) {
            throw err;
          }
        }
      });
    } catch (err) {
      this.logger.error('Failed to establish Firestore connection after retries', { error: err });
      throw new Error('Failed to connect to Firestore after multiple attempts');
    }
  }

  /**
   * Safely disconnects from Firestore and cleans up resources
   */
  public async disconnect(): Promise<void> {
    try {
      // Close all connections in the pool
      for (const conn of this.connectionPool.connections) {
        await conn.terminate();
      }
      this.connectionPool.connections.clear();

      await this.client.terminate();
      this.connected = false;
      
      this.logger.info('Successfully disconnected from Firestore');
    } catch (err) {
      this.logger.error('Error during Firestore disconnect', { error: err });
      throw err;
    }
  }

  /**
   * Retrieves document by ID with retry logic
   * @param id - Document identifier
   * @returns Promise resolving to document data
   * @throws NotFoundError if document doesn't exist
   */
  public async get(id: string): Promise<any> {
    this.validateConnection();
    this.validateId(id);

    const startTime = Date.now();
    
    try {
      const op = operation(this.retryConfig);
      
      return await op.attempt(async (currentAttempt) => {
        try {
          const docRef = this.client.collection(this.collectionName).doc(id);
          const doc = await docRef.get();

          if (!doc.exists) {
            throw new NotFoundError(`Document with id ${id} not found`);
          }

          const duration = Date.now() - startTime;
          this.logger.info('Document retrieved successfully', {
            id,
            duration,
            attempt: currentAttempt
          });

          return doc.data();
        } catch (err) {
          this.logger.error('Error retrieving document', {
            id,
            error: err,
            attempt: currentAttempt
          });
          if (!op.retry(err as Error)) {
            throw err;
          }
        }
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to retrieve document after retries', {
        id,
        error: err,
        duration
      });
      throw err;
    }
  }

  /**
   * Creates or updates a document with retry logic
   * @param id - Document identifier
   * @param data - Document data
   * @throws Error if operation fails
   */
  public async set(id: string, data: any): Promise<void> {
    this.validateConnection();
    this.validateId(id);
    this.validateData(data);

    const startTime = Date.now();

    try {
      const op = operation(this.retryConfig);
      
      await op.attempt(async (currentAttempt) => {
        try {
          const docRef = this.client.collection(this.collectionName).doc(id);
          await docRef.set({
            ...data,
            updatedAt: Firestore.Timestamp.now()
          });

          const duration = Date.now() - startTime;
          this.logger.info('Document saved successfully', {
            id,
            duration,
            attempt: currentAttempt
          });
        } catch (err) {
          this.logger.error('Error saving document', {
            id,
            error: err,
            attempt: currentAttempt
          });
          if (!op.retry(err as Error)) {
            throw err;
          }
        }
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to save document after retries', {
        id,
        error: err,
        duration
      });
      throw err;
    }
  }

  /**
   * Deletes a document by ID with retry logic
   * @param id - Document identifier
   * @throws Error if deletion fails
   */
  public async delete(id: string): Promise<void> {
    this.validateConnection();
    this.validateId(id);

    const startTime = Date.now();

    try {
      const op = operation(this.retryConfig);
      
      await op.attempt(async (currentAttempt) => {
        try {
          const docRef = this.client.collection(this.collectionName).doc(id);
          await docRef.delete();

          const duration = Date.now() - startTime;
          this.logger.info('Document deleted successfully', {
            id,
            duration,
            attempt: currentAttempt
          });
        } catch (err) {
          this.logger.error('Error deleting document', {
            id,
            error: err,
            attempt: currentAttempt
          });
          if (!op.retry(err as Error)) {
            throw err;
          }
        }
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to delete document after retries', {
        id,
        error: err,
        duration
      });
      throw err;
    }
  }

  /**
   * Queries documents based on filter criteria
   * @param filter - Query filter object
   * @returns Promise resolving to array of matching documents
   * @throws Error if query fails
   */
  public async query(filter: object): Promise<any[]> {
    this.validateConnection();
    this.validateFilter(filter);

    const startTime = Date.now();

    try {
      const op = operation(this.retryConfig);
      
      return await op.attempt(async (currentAttempt) => {
        try {
          let query = this.client.collection(this.collectionName);

          // Apply filters
          Object.entries(filter).forEach(([field, value]) => {
            query = query.where(field, '==', value);
          });

          const snapshot = await query.get();
          const documents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          const duration = Date.now() - startTime;
          this.logger.info('Query executed successfully', {
            filterCount: Object.keys(filter).length,
            resultCount: documents.length,
            duration,
            attempt: currentAttempt
          });

          return documents;
        } catch (err) {
          this.logger.error('Error executing query', {
            filter,
            error: err,
            attempt: currentAttempt
          });
          if (!op.retry(err as Error)) {
            throw err;
          }
        }
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to execute query after retries', {
        filter,
        error: err,
        duration
      });
      throw err;
    }
  }

  /**
   * Checks if client is currently connected
   * @returns Current connection state
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Validates connection state
   * @throws Error if not connected
   */
  private validateConnection(): void {
    if (!this.connected) {
      throw new Error('Not connected to Firestore');
    }
  }

  /**
   * Validates document ID
   * @param id - Document identifier to validate
   * @throws Error if ID is invalid
   */
  private validateId(id: string): void {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('Invalid document ID');
    }
  }

  /**
   * Validates document data
   * @param data - Document data to validate
   * @throws Error if data is invalid
   */
  private validateData(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid document data');
    }
  }

  /**
   * Validates query filter
   * @param filter - Query filter to validate
   * @throws Error if filter is invalid
   */
  private validateFilter(filter: object): void {
    if (!filter || typeof filter !== 'object') {
      throw new Error('Invalid query filter');
    }
  }
}