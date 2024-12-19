/**
 * @fileoverview Enhanced authentication service implementing JWT-based authentication
 * with Cloud KMS integration, role-based access control, and comprehensive security features.
 * @version 1.0.0
 */

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { KMSClient, CryptoKeyVersion } from '@google-cloud/kms';
import * as jwt from 'jsonwebtoken';
import { AuthToken, JWTPayload, UserRole, DEFAULT_ROLE_PERMISSIONS } from '../interfaces/auth.interface';

/**
 * Configuration constants for authentication service
 */
const AUTH_CONFIG = {
  JWT_EXPIRES_IN: '1h',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  KMS_KEY_PATH: process.env.KMS_KEY_PATH || 'projects/*/locations/*/keyRings/*/cryptoKeys/*',
  TOKEN_VERSION: '1.0',
  MAX_BLACKLIST_SIZE: 10000,
  CLEANUP_INTERVAL: 3600000, // 1 hour
};

/**
 * Enhanced authentication service with Cloud KMS integration and comprehensive security features
 */
@Injectable()
export class AuthService {
  private readonly tokenBlacklist: Set<string> = new Set();
  private readonly tokenVersions: Map<string, string> = new Map();
  private kmsKeyVersion: CryptoKeyVersion;

  constructor(
    private readonly kmsClient: KMSClient,
    private readonly logger: Logger
  ) {
    this.initializeKMS();
    this.startBlacklistCleanup();
  }

  /**
   * Initializes Cloud KMS connection and validates key configuration
   * @private
   */
  private async initializeKMS(): Promise<void> {
    try {
      const [version] = await this.kmsClient.listCryptoKeyVersions({
        parent: AUTH_CONFIG.KMS_KEY_PATH,
        filter: 'state=ENABLED',
      });
      this.kmsKeyVersion = version[0];
      this.logger.log('KMS initialization successful');
    } catch (error) {
      this.logger.error('Failed to initialize KMS', error.stack);
      throw new Error('Authentication service initialization failed');
    }
  }

  /**
   * Generates secure JWT token with KMS encryption and refresh token
   * @param payload - User authentication payload
   * @returns Promise resolving to authentication tokens
   */
  public async generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<AuthToken> {
    try {
      // Encrypt sensitive payload data
      const encryptedPayload = await this.encryptPayload(payload);

      // Generate token version
      const tokenVersion = this.generateTokenVersion(payload.userId);

      const tokenPayload: JWTPayload = {
        ...encryptedPayload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        version: tokenVersion,
      };

      const token = jwt.sign(tokenPayload, await this.getSigningKey(), {
        algorithm: 'RS256',
      });

      const refreshToken = await this.generateRefreshToken(payload.userId);

      this.logger.log(`Token generated for user: ${payload.userId}`);

      return {
        token,
        expiresIn: 3600,
        refreshToken,
      };
    } catch (error) {
      this.logger.error('Token generation failed', error.stack);
      throw new UnauthorizedException('Failed to generate authentication token');
    }
  }

  /**
   * Validates JWT token with comprehensive security checks
   * @param token - JWT token string
   * @returns Promise resolving to decoded payload
   */
  public async validateToken(token: string): Promise<JWTPayload> {
    try {
      // Check token blacklist
      if (this.tokenBlacklist.has(token)) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Verify token signature and decode payload
      const decoded = jwt.verify(token, await this.getPublicKey(), {
        algorithms: ['RS256'],
      }) as JWTPayload;

      // Validate token version
      if (!this.validateTokenVersion(decoded.userId, decoded.version)) {
        throw new UnauthorizedException('Token version is invalid');
      }

      // Decrypt sensitive payload data
      const decryptedPayload = await this.decryptPayload(decoded);

      this.logger.log(`Token validated for user: ${decoded.userId}`);

      return decryptedPayload;
    } catch (error) {
      this.logger.error('Token validation failed', error.stack);
      throw new UnauthorizedException('Invalid authentication token');
    }
  }

  /**
   * Refreshes access token using refresh token
   * @param refreshToken - Refresh token string
   * @returns Promise resolving to new authentication tokens
   */
  public async refreshToken(refreshToken: string): Promise<AuthToken> {
    try {
      const decoded = jwt.verify(refreshToken, await this.getPublicKey(), {
        algorithms: ['RS256'],
      }) as { userId: string };

      // Generate new token version
      const tokenVersion = this.generateTokenVersion(decoded.userId);

      // Get user details for new token
      const userPayload = await this.getUserPayload(decoded.userId);

      return this.generateToken({
        ...userPayload,
        version: tokenVersion,
      });
    } catch (error) {
      this.logger.error('Token refresh failed', error.stack);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Revokes active token for security
   * @param token - JWT token string
   */
  public async revokeToken(token: string): Promise<void> {
    try {
      const decoded = await this.validateToken(token);
      this.tokenBlacklist.add(token);
      this.tokenVersions.delete(decoded.userId);
      this.logger.log(`Token revoked for user: ${decoded.userId}`);
    } catch (error) {
      this.logger.error('Token revocation failed', error.stack);
      throw new UnauthorizedException('Failed to revoke token');
    }
  }

  /**
   * Generates unique token version for user
   * @private
   * @param userId - User identifier
   * @returns Token version string
   */
  private generateTokenVersion(userId: string): string {
    const version = `${AUTH_CONFIG.TOKEN_VERSION}-${Date.now()}`;
    this.tokenVersions.set(userId, version);
    return version;
  }

  /**
   * Validates token version for user
   * @private
   * @param userId - User identifier
   * @param version - Token version
   * @returns Boolean indicating version validity
   */
  private validateTokenVersion(userId: string, version: string): boolean {
    return this.tokenVersions.get(userId) === version;
  }

  /**
   * Encrypts sensitive payload data using Cloud KMS
   * @private
   * @param payload - Token payload
   * @returns Encrypted payload
   */
  private async encryptPayload(payload: Partial<JWTPayload>): Promise<Partial<JWTPayload>> {
    const [encryptResponse] = await this.kmsClient.encrypt({
      name: this.kmsKeyVersion.name,
      plaintext: Buffer.from(JSON.stringify(payload)).toString('base64'),
    });

    return {
      ...payload,
      encrypted: encryptResponse.ciphertext,
    };
  }

  /**
   * Decrypts sensitive payload data using Cloud KMS
   * @private
   * @param payload - Encrypted payload
   * @returns Decrypted payload
   */
  private async decryptPayload(payload: any): Promise<JWTPayload> {
    const [decryptResponse] = await this.kmsClient.decrypt({
      name: this.kmsKeyVersion.name,
      ciphertext: payload.encrypted,
    });

    return JSON.parse(Buffer.from(decryptResponse.plaintext, 'base64').toString());
  }

  /**
   * Generates refresh token for user
   * @private
   * @param userId - User identifier
   * @returns Promise resolving to refresh token
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    return jwt.sign(
      { userId, type: 'refresh' },
      await this.getSigningKey(),
      {
        algorithm: 'RS256',
        expiresIn: AUTH_CONFIG.REFRESH_TOKEN_EXPIRES_IN,
      }
    );
  }

  /**
   * Retrieves signing key from Cloud KMS
   * @private
   * @returns Promise resolving to signing key
   */
  private async getSigningKey(): Promise<string> {
    const [key] = await this.kmsClient.getPublicKey({
      name: this.kmsKeyVersion.name,
    });
    return key.pem;
  }

  /**
   * Retrieves public key for token verification
   * @private
   * @returns Promise resolving to public key
   */
  private async getPublicKey(): Promise<string> {
    const [key] = await this.kmsClient.getPublicKey({
      name: this.kmsKeyVersion.name,
    });
    return key.pem;
  }

  /**
   * Starts periodic cleanup of token blacklist
   * @private
   */
  private startBlacklistCleanup(): void {
    setInterval(() => {
      if (this.tokenBlacklist.size > AUTH_CONFIG.MAX_BLACKLIST_SIZE) {
        this.tokenBlacklist.clear();
        this.logger.log('Token blacklist cleared');
      }
    }, AUTH_CONFIG.CLEANUP_INTERVAL);
  }

  /**
   * Retrieves user payload for token generation
   * @private
   * @param userId - User identifier
   * @returns Promise resolving to user payload
   */
  private async getUserPayload(userId: string): Promise<Omit<JWTPayload, 'iat' | 'exp'>> {
    // Implementation would typically fetch user details from database
    // Placeholder implementation for demonstration
    return {
      userId,
      email: `user-${userId}@example.com`,
      role: UserRole.API_CONSUMER,
    };
  }
}