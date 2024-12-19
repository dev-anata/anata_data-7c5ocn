/**
 * @fileoverview Enhanced JWT strategy implementation for secure authentication in the pharmaceutical data pipeline platform.
 * Implements comprehensive token validation, audit logging, and security features.
 * @version 1.0.0
 */

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWTPayload } from '../interfaces/auth.interface';
import { authConfig } from '../../config/auth.config';
import { AuthService } from './auth.service';

/**
 * Enhanced JWT strategy with comprehensive security features and audit logging
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authConfig.jwt.secret,
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
      algorithms: [authConfig.jwt.algorithm],
      passReqToCallback: true,
    });

    this.logger.log('JWT Strategy initialized with enhanced security configuration');
  }

  /**
   * Validates JWT token with comprehensive security checks and audit logging
   * @param payload - JWT payload to validate
   * @returns Promise resolving to validated user payload
   * @throws UnauthorizedException for invalid tokens
   */
  async validate(payload: JWTPayload): Promise<JWTPayload> {
    try {
      this.logger.debug(`Validating token for user: ${payload.userId}`);

      // Verify payload structure
      if (!this.validatePayloadStructure(payload)) {
        throw new UnauthorizedException('Invalid token structure');
      }

      // Verify token with auth service
      await this.authService.validateToken(payload);

      // Check token blacklist
      await this.authService.checkTokenBlacklist(payload);

      // Verify token fingerprint
      await this.authService.verifyTokenFingerprint(payload);

      this.logger.log(`Token validated successfully for user: ${payload.userId}`);

      return {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        iat: payload.iat,
        exp: payload.exp
      };
    } catch (error) {
      this.logger.error(
        `Token validation failed: ${error.message}`,
        error.stack
      );
      throw new UnauthorizedException(
        `Authentication failed: ${error.message}`
      );
    }
  }

  /**
   * Validates the structure of the JWT payload
   * @private
   * @param payload - JWT payload to validate
   * @returns Boolean indicating if payload structure is valid
   */
  private validatePayloadStructure(payload: any): boolean {
    return !!(
      payload &&
      payload.userId &&
      payload.email &&
      payload.role &&
      payload.iat &&
      payload.exp
    );
  }
}