/**
 * Central database export module for the Pharmaceutical Data Pipeline Platform
 * Provides unified access to BigQuery, Firestore, and Redis implementations
 * with comprehensive type safety, monitoring, and error handling capabilities
 * @version 1.0.0
 */

import { BigQueryClientImpl } from './bigquery.client';
import { FirestoreClientImpl } from './firestore.client';
import { RedisClientImpl } from './redis.client';

// Database version constants for compatibility checking
export const DB_VERSION = '1.0.0';
export const DB_COMPATIBILITY_VERSION = '^1.0.0';

// Export database client implementations
export {
  BigQueryClientImpl,
  FirestoreClientImpl,
  RedisClientImpl
};

// Export database client interfaces and types
export {
  DatabaseClient,
  BigQueryClient,
  FirestoreClient,
  RedisClient,
  BigQueryConfig,
  FirestoreConfig,
  RedisConfig
} from '../interfaces/database.interface';

/**
 * Database client factory function to create appropriate client instances
 * with validated configurations
 */
export class DatabaseClientFactory {
  /**
   * Creates a BigQuery client instance
   * @param config - BigQuery configuration
   * @returns Configured BigQuery client
   */
  public static createBigQueryClient(config: BigQueryConfig): BigQueryClientImpl {
    return new BigQueryClientImpl(config);
  }

  /**
   * Creates a Firestore client instance
   * @param config - Firestore configuration
   * @returns Configured Firestore client
   */
  public static createFirestoreClient(config: FirestoreConfig): FirestoreClientImpl {
    return new FirestoreClientImpl(config);
  }

  /**
   * Creates a Redis client instance
   * @param config - Redis configuration
   * @returns Configured Redis client
   */
  public static createRedisClient(config: RedisConfig): RedisClientImpl {
    return new RedisClientImpl(config);
  }
}

/**
 * Database metrics collector for monitoring and performance tracking
 */
export class DatabaseMetrics {
  private static instance: DatabaseMetrics;
  private metrics: Map<string, any> = new Map();

  private constructor() {}

  /**
   * Gets singleton instance of metrics collector
   */
  public static getInstance(): DatabaseMetrics {
    if (!DatabaseMetrics.instance) {
      DatabaseMetrics.instance = new DatabaseMetrics();
    }
    return DatabaseMetrics.instance;
  }

  /**
   * Records a database operation metric
   * @param clientType - Type of database client
   * @param operation - Operation being performed
   * @param duration - Operation duration in milliseconds
   */
  public recordMetric(clientType: string, operation: string, duration: number): void {
    const key = `${clientType}.${operation}`;
    const current = this.metrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.metrics.set(key, {
      count: current.count + 1,
      totalDuration: current.totalDuration + duration,
      avgDuration: (current.totalDuration + duration) / (current.count + 1)
    });
  }

  /**
   * Gets current metrics
   * @returns Map of collected metrics
   */
  public getMetrics(): Map<string, any> {
    return new Map(this.metrics);
  }

  /**
   * Resets all metrics
   */
  public resetMetrics(): void {
    this.metrics.clear();
  }
}

/**
 * Database connection manager for handling connection lifecycle
 */
export class DatabaseConnectionManager {
  private static clients: Map<string, any> = new Map();

  /**
   * Registers a database client
   * @param name - Client identifier
   * @param client - Database client instance
   */
  public static registerClient(name: string, client: any): void {
    this.clients.set(name, client);
  }

  /**
   * Gets a registered client by name
   * @param name - Client identifier
   * @returns Registered client instance
   */
  public static getClient(name: string): any {
    return this.clients.get(name);
  }

  /**
   * Connects all registered clients
   */
  public static async connectAll(): Promise<void> {
    const connections = Array.from(this.clients.values()).map(client => client.connect());
    await Promise.all(connections);
  }

  /**
   * Disconnects all registered clients
   */
  public static async disconnectAll(): Promise<void> {
    const disconnections = Array.from(this.clients.values()).map(client => client.disconnect());
    await Promise.all(disconnections);
  }
}

// Export additional utilities
export {
  DatabaseClientFactory,
  DatabaseMetrics,
  DatabaseConnectionManager
};