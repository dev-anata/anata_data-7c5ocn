import { RedisClientImpl } from '../../../src/core/database/redis.client';
import { RedisConfig } from '../../../src/core/interfaces/database.interface';
import { BaseError } from '../../../src/core/utils/error.util';
import { faker } from '@faker-js/faker'; // v8.0.0
import { describe, it, beforeEach, afterEach, expect, jest } from 'jest'; // v29.0.0

// Test configuration
const mockRedisConfig: RedisConfig = {
  host: 'localhost',
  port: 6379,
  ttl: 3600,
  retryAttempts: 3,
  timeout: 1000
};

// Performance thresholds from technical spec
const PERFORMANCE_THRESHOLD_MS = 500; // API response time < 500ms
const ERROR_RATE_THRESHOLD = 0.001; // Error rate < 0.1%
const CONCURRENT_OPS = 100; // Support for 100+ concurrent users

describe('RedisClientImpl', () => {
  let redisClient: RedisClientImpl;
  let performanceMetrics: { startTime: number; endTime: number; errors: number; }[];

  beforeEach(async () => {
    redisClient = new RedisClientImpl(mockRedisConfig);
    await redisClient.connect();
    performanceMetrics = [];
    jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress error logs in tests
  });

  afterEach(async () => {
    await redisClient.disconnect();
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should successfully connect with valid configuration', async () => {
      expect(redisClient.isConnected()).toBe(true);
    });

    it('should throw error when connecting with invalid host', async () => {
      const invalidConfig = { ...mockRedisConfig, host: 'invalid-host' };
      const invalidClient = new RedisClientImpl(invalidConfig);
      
      await expect(invalidClient.connect()).rejects.toThrow(BaseError);
    });

    it('should handle reconnection attempts on connection failure', async () => {
      // Simulate network failure
      await redisClient.disconnect();
      const connectSpy = jest.spyOn(redisClient as any, 'connect');
      
      await redisClient.connect();
      
      expect(connectSpy).toHaveBeenCalled();
      expect(redisClient.isConnected()).toBe(true);
    });

    it('should properly cleanup resources on disconnect', async () => {
      await redisClient.disconnect();
      expect(redisClient.isConnected()).toBe(false);
    });
  });

  describe('Cache Operations', () => {
    it('should successfully set and get values', async () => {
      const key = faker.string.uuid();
      const value = faker.string.alphanumeric(20);
      
      await redisClient.set(key, value);
      const retrieved = await redisClient.get(key);
      
      expect(retrieved).toBe(value);
    });

    it('should respect TTL settings', async () => {
      const key = faker.string.uuid();
      const value = faker.string.alphanumeric(20);
      const shortTtl = 1; // 1 second
      
      await redisClient.set(key, value, shortTtl);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const retrieved = await redisClient.get(key);
      expect(retrieved).toBeNull();
    });

    it('should successfully delete values', async () => {
      const key = faker.string.uuid();
      const value = faker.string.alphanumeric(20);
      
      await redisClient.set(key, value);
      await redisClient.delete(key);
      
      const retrieved = await redisClient.get(key);
      expect(retrieved).toBeNull();
    });

    it('should handle large values efficiently', async () => {
      const key = faker.string.uuid();
      const largeValue = faker.string.alphanumeric(1000000); // 1MB string
      
      const startTime = Date.now();
      await redisClient.set(key, largeValue);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when operating without connection', async () => {
      await redisClient.disconnect();
      
      await expect(redisClient.get('any-key')).rejects.toThrow(BaseError);
    });

    it('should handle invalid key parameters', async () => {
      await expect(redisClient.get('')).rejects.toThrow(BaseError);
      await expect(redisClient.get(null as any)).rejects.toThrow(BaseError);
    });

    it('should handle invalid value parameters', async () => {
      await expect(redisClient.set('key', '')).rejects.toThrow(BaseError);
      await expect(redisClient.set('key', null as any)).rejects.toThrow(BaseError);
    });

    it('should handle network timeouts', async () => {
      // Simulate slow network
      jest.spyOn(redisClient as any, 'client').mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, mockRedisConfig.timeout + 100));
      });
      
      await expect(redisClient.get('key')).rejects.toThrow(BaseError);
    });
  });

  describe('Performance', () => {
    it('should meet response time requirements', async () => {
      const key = faker.string.uuid();
      const value = faker.string.alphanumeric(100);
      
      const startTime = Date.now();
      await redisClient.set(key, value);
      const getResult = await redisClient.get(key);
      await redisClient.delete(key);
      const endTime = Date.now();
      
      const operationTime = endTime - startTime;
      expect(operationTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      expect(getResult).toBe(value);
    });

    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: CONCURRENT_OPS }).map(async (_, index) => {
        const key = `concurrent-${index}`;
        const value = faker.string.alphanumeric(100);
        
        const startTime = Date.now();
        try {
          await redisClient.set(key, value);
          await redisClient.get(key);
          await redisClient.delete(key);
          performanceMetrics.push({ startTime, endTime: Date.now(), errors: 0 });
        } catch (error) {
          performanceMetrics.push({ startTime, endTime: Date.now(), errors: 1 });
        }
      });
      
      await Promise.all(operations);
      
      // Calculate error rate
      const totalErrors = performanceMetrics.reduce((sum, metric) => sum + metric.errors, 0);
      const errorRate = totalErrors / CONCURRENT_OPS;
      
      // Calculate average response time
      const avgResponseTime = performanceMetrics.reduce((sum, metric) => 
        sum + (metric.endTime - metric.startTime), 0) / CONCURRENT_OPS;
      
      expect(errorRate).toBeLessThan(ERROR_RATE_THRESHOLD);
      expect(avgResponseTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Health Check', () => {
    it('should maintain connection health check', async () => {
      // Wait for health check interval
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(redisClient.isConnected()).toBe(true);
    });

    it('should handle health check failures', async () => {
      // Simulate health check failure
      jest.spyOn(redisClient as any, 'client').mockImplementation(() => {
        throw new Error('Health check failed');
      });
      
      // Wait for health check interval
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Redis health check failed')
      );
    });
  });
});