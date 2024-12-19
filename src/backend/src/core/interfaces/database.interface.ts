/**
 * Core database interfaces for the Pharmaceutical Data Pipeline Platform
 * Defines contracts for BigQuery, Firestore and Redis database clients
 * @version 1.0.0
 */

/**
 * Base interface that all database clients must implement
 * Provides core connection management functionality
 */
export interface DatabaseClient {
  /**
   * Establishes connection to the database
   * @returns Promise that resolves when connected
   * @throws Error if connection fails
   */
  connect(): Promise<void>;

  /**
   * Closes the database connection
   * @returns Promise that resolves when disconnected
   * @throws Error if disconnect fails
   */
  disconnect(): Promise<void>;

  /**
   * Checks if client is currently connected
   * @returns Current connection state
   */
  isConnected(): boolean;
}

/**
 * BigQuery client interface for data warehouse operations
 * Extends base DatabaseClient with BigQuery-specific operations
 */
export interface BigQueryClient extends DatabaseClient {
  /**
   * Executes a BigQuery SQL query
   * @param query - SQL query string
   * @param params - Query parameters for parameterized queries
   * @returns Promise resolving to query results
   * @throws Error if query execution fails
   */
  query(query: string, params: any[]): Promise<any[]>;

  /**
   * Inserts rows into a BigQuery table
   * @param rows - Array of row objects to insert
   * @returns Promise that resolves when insertion completes
   * @throws Error if insertion fails
   */
  insert(rows: any[]): Promise<void>;

  /**
   * Creates a new BigQuery table with specified schema
   * @param schema - Table schema definition
   * @returns Promise that resolves when table is created
   * @throws Error if table creation fails
   */
  createTable(schema: object): Promise<void>;
}

/**
 * Firestore client interface for document operations
 * Extends base DatabaseClient with Firestore-specific operations
 */
export interface FirestoreClient extends DatabaseClient {
  /**
   * Retrieves a document by ID
   * @param id - Document identifier
   * @returns Promise resolving to document data
   * @throws Error if document retrieval fails
   */
  get(id: string): Promise<any>;

  /**
   * Creates or updates a document
   * @param id - Document identifier
   * @param data - Document data to store
   * @returns Promise that resolves when document is saved
   * @throws Error if document save fails
   */
  set(id: string, data: any): Promise<void>;

  /**
   * Deletes a document by ID
   * @param id - Document identifier
   * @returns Promise that resolves when document is deleted
   * @throws Error if deletion fails
   */
  delete(id: string): Promise<void>;

  /**
   * Queries documents based on filter criteria
   * @param filter - Query filter object
   * @returns Promise resolving to array of matching documents
   * @throws Error if query execution fails
   */
  query(filter: object): Promise<any[]>;
}

/**
 * Redis client interface for caching operations
 * Extends base DatabaseClient with Redis-specific operations
 */
export interface RedisClient extends DatabaseClient {
  /**
   * Retrieves cached value by key
   * @param key - Cache key
   * @returns Promise resolving to cached value or null if not found
   * @throws Error if retrieval fails
   */
  get(key: string): Promise<string | null>;

  /**
   * Sets key-value pair in cache with optional TTL
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional Time-To-Live in seconds
   * @returns Promise that resolves when value is set
   * @throws Error if set operation fails
   */
  set(key: string, value: string, ttl?: number): Promise<void>;

  /**
   * Removes key from cache
   * @param key - Cache key to delete
   * @returns Promise that resolves when key is deleted
   * @throws Error if deletion fails
   */
  delete(key: string): Promise<void>;
}

/**
 * Configuration interface for BigQuery client
 */
export interface BigQueryConfig {
  /** GCP project identifier */
  projectId: string;
  /** BigQuery dataset identifier */
  datasetId: string;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Delay between retry attempts in milliseconds */
  retryDelayMs: number;
}

/**
 * Configuration interface for Firestore client
 */
export interface FirestoreConfig {
  /** GCP project identifier */
  projectId: string;
  /** Firestore collection name */
  collectionName: string;
}

/**
 * Configuration interface for Redis client
 */
export interface RedisConfig {
  /** Redis server hostname */
  host: string;
  /** Redis server port */
  port: number;
  /** Default TTL in seconds */
  ttl: number;
}