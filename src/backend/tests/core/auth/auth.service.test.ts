/**
 * @fileoverview Comprehensive test suite for AuthService class including KMS integration,
 * token management, role-based access control, and security features.
 * @version 1.0.0
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { KMSClient } from '@google-cloud/kms';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

import { AuthService } from '../../../src/core/auth/auth.service';
import { AuthToken, UserRole, JWTPayload } from '../../../src/core/interfaces/auth.interface';

// Mock KMS responses
const mockKmsResponses = {
  publicKey: { pem: '-----BEGIN PUBLIC KEY-----\nMOCK_KEY\n-----END PUBLIC KEY-----' },
  encryptedData: { ciphertext: 'encrypted-data' },
  decryptedData: { plaintext: Buffer.from(JSON.stringify({ userId: 'test-user' })).toString('base64') }
};

// Mock configurations
const mockConfig = {
  keyPath: 'projects/test/locations/global/keyRings/test/cryptoKeys/auth-key/cryptoKeyVersions/1',
  tokenVersion: '1.0'
};

describe('AuthService', () => {
  let authService: AuthService;
  let mockKmsClient: jest.Mocked<KMSClient>;
  let mockLogger: jest.Mocked<Logger>;
  let jwtSignSpy: jest.SpyInstance;
  let jwtVerifySpy: jest.SpyInstance;

  beforeEach(() => {
    // Initialize mocks
    mockKmsClient = {
      listCryptoKeyVersions: jest.fn().mockResolvedValue([[{ name: mockConfig.keyPath }]]),
      getPublicKey: jest.fn().mockResolvedValue([mockKmsResponses.publicKey]),
      encrypt: jest.fn().mockResolvedValue([mockKmsResponses.encryptedData]),
      decrypt: jest.fn().mockResolvedValue([mockKmsResponses.decryptedData])
    } as unknown as jest.Mocked<KMSClient>;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    // Initialize JWT spies
    jwtSignSpy = jest.spyOn(jwt, 'sign');
    jwtVerifySpy = jest.spyOn(jwt, 'verify');

    // Create AuthService instance
    authService = new AuthService(mockKmsClient, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Generation', () => {
    const mockPayload = {
      userId: 'test-user',
      email: 'test@example.com',
      role: UserRole.API_CONSUMER
    };

    it('should generate valid JWT token with KMS encryption', async () => {
      const result = await authService.generateToken(mockPayload);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(mockKmsClient.encrypt).toHaveBeenCalled();
      expect(jwtSignSpy).toHaveBeenCalled();
    });

    it('should handle KMS encryption failures gracefully', async () => {
      mockKmsClient.encrypt.mockRejectedValueOnce(new Error('KMS Error'));

      await expect(authService.generateToken(mockPayload))
        .rejects
        .toThrow(UnauthorizedException);
      
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should generate unique token versions for each user', async () => {
      const result1 = await authService.generateToken(mockPayload);
      const result2 = await authService.generateToken(mockPayload);

      const decoded1 = jwt.decode(result1.token) as JWTPayload;
      const decoded2 = jwt.decode(result2.token) as JWTPayload;

      expect(decoded1.version).not.toBe(decoded2.version);
    });
  });

  describe('Token Validation', () => {
    const mockToken = 'valid.jwt.token';

    it('should validate tokens with KMS decryption', async () => {
      jwtVerifySpy.mockImplementationOnce(() => ({
        userId: 'test-user',
        version: '1.0-timestamp'
      }));

      const result = await authService.validateToken(mockToken);

      expect(result).toBeDefined();
      expect(mockKmsClient.decrypt).toHaveBeenCalled();
    });

    it('should reject blacklisted tokens', async () => {
      await authService.revokeToken(mockToken);

      await expect(authService.validateToken(mockToken))
        .rejects
        .toThrow('Token has been revoked');
    });

    it('should validate token versions', async () => {
      jwtVerifySpy.mockImplementationOnce(() => ({
        userId: 'test-user',
        version: 'invalid-version'
      }));

      await expect(authService.validateToken(mockToken))
        .rejects
        .toThrow('Token version is invalid');
    });
  });

  describe('Role-Based Access Control', () => {
    const mockAdminPayload = {
      userId: 'admin-user',
      email: 'admin@example.com',
      role: UserRole.ADMIN
    };

    const mockConsumerPayload = {
      userId: 'consumer-user',
      email: 'consumer@example.com',
      role: UserRole.API_CONSUMER
    };

    it('should generate tokens with correct role permissions', async () => {
      const adminToken = await authService.generateToken(mockAdminPayload);
      const consumerToken = await authService.generateToken(mockConsumerPayload);

      const decodedAdmin = jwt.decode(adminToken.token) as JWTPayload;
      const decodedConsumer = jwt.decode(consumerToken.token) as JWTPayload;

      expect(decodedAdmin.role).toBe(UserRole.ADMIN);
      expect(decodedConsumer.role).toBe(UserRole.API_CONSUMER);
    });

    it('should validate role-based permissions', async () => {
      jwtVerifySpy.mockImplementationOnce(() => ({
        ...mockConsumerPayload,
        version: '1.0-timestamp'
      }));

      const result = await authService.validateToken('consumer.token.here');
      expect(result.role).toBe(UserRole.API_CONSUMER);
    });
  });

  describe('Refresh Token Management', () => {
    const mockRefreshToken = 'valid.refresh.token';

    it('should generate new token pair with refresh token', async () => {
      jwtVerifySpy.mockImplementationOnce(() => ({
        userId: 'test-user',
        type: 'refresh'
      }));

      const result = await authService.refreshToken(mockRefreshToken);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('refreshToken');
      expect(result.expiresIn).toBe(3600);
    });

    it('should reject invalid refresh tokens', async () => {
      jwtVerifySpy.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken('invalid.refresh.token'))
        .rejects
        .toThrow(UnauthorizedException);
    });
  });

  describe('Security Controls', () => {
    it('should handle token revocation', async () => {
      const mockToken = 'valid.token.here';
      jwtVerifySpy.mockImplementationOnce(() => ({
        userId: 'test-user',
        version: '1.0-timestamp'
      }));

      await authService.revokeToken(mockToken);

      await expect(authService.validateToken(mockToken))
        .rejects
        .toThrow('Token has been revoked');
    });

    it('should maintain token blacklist size', async () => {
      jest.useFakeTimers();
      
      // Fill blacklist
      for (let i = 0; i < 10001; i++) {
        await authService.revokeToken(`token-${i}`);
      }

      jest.advanceTimersByTime(3600000); // 1 hour

      expect(mockLogger.log).toHaveBeenCalledWith('Token blacklist cleared');
      
      jest.useRealTimers();
    });
  });
});