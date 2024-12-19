/**
 * @fileoverview Authentication configuration module for the Pharmaceutical Data Pipeline Platform.
 * Implements comprehensive security settings based on technical specifications.
 * @version 1.0.0
 */

import { config as dotenvConfig } from 'dotenv'; // v16.0.0
import { AuthConfig } from '../core/interfaces/config.interface';
import { UserRole } from '../core/interfaces/auth.interface';

// Load environment variables
dotenvConfig();

/**
 * Validates and loads authentication configuration from environment variables
 * with enhanced security checks and production-ready defaults
 */
function loadAuthConfig(): AuthConfig {
  // Validate required JWT environment variables
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  // Production environment checks
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.COOKIE_DOMAIN) {
    throw new Error('COOKIE_DOMAIN is required in production environment');
  }

  return {
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER || 'pharma-pipeline',
      audience: process.env.JWT_AUDIENCE || 'api-users',
      refreshToken: {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        maxRotations: parseInt(process.env.JWT_REFRESH_MAX_ROTATIONS || '3', 10)
      }
    },
    apiKey: {
      headerName: 'X-API-Key',
      prefix: 'Bearer',
      maxAge: parseInt(process.env.API_KEY_MAX_AGE || '86400', 10), // 24 hours
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
        enabled: true,
        skipFailedRequests: false,
        standardHeaders: true
      },
      rotationPolicy: {
        intervalDays: parseInt(process.env.API_KEY_ROTATION_DAYS || '90', 10),
        enabled: isProduction
      },
      validation: {
        minLength: 32,
        requireSpecialChars: true,
        requireNumbers: true
      },
      allowedIPs: process.env.API_KEY_ALLOWED_IPS ? 
        process.env.API_KEY_ALLOWED_IPS.split(',') : []
    },
    session: {
      cookieName: 'pharma-pipeline-session',
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // 24 hours
      secure: isProduction,
      sameSite: 'strict' as const,
      domain: process.env.COOKIE_DOMAIN,
      path: '/api',
      httpOnly: true,
      rolling: true,
      saveUninitialized: false
    }
  };
}

/**
 * Production-ready authentication configuration with comprehensive security settings
 * Implements the authentication flow and security architecture from technical specifications
 */
export const authConfig: AuthConfig = loadAuthConfig();

/**
 * Role-based access control configuration mapping
 * Based on the authorization matrix from technical specifications
 */
export const rolePermissions = {
  [UserRole.ADMIN]: {
    allowedOperations: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    maxRequests: 1000,
    allowConfigAccess: true
  },
  [UserRole.DEVELOPER]: {
    allowedOperations: ['CREATE', 'READ'],
    maxRequests: 500,
    allowConfigAccess: false
  },
  [UserRole.DATA_ENGINEER]: {
    allowedOperations: ['READ', 'EXPORT'],
    maxRequests: 300,
    allowConfigAccess: false
  },
  [UserRole.API_CONSUMER]: {
    allowedOperations: ['READ'],
    maxRequests: 100,
    allowConfigAccess: false
  }
};

/**
 * Security enhancement configurations for production environment
 */
export const securityEnhancements = {
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxAge: 90 // days
  },
  bruteForceProtection: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDuration: 60 * 60 * 1000 // 1 hour
  },
  mfaPolicy: {
    enabled: isProduction,
    requiredForRoles: [UserRole.ADMIN, UserRole.DEVELOPER],
    allowedMethods: ['TOTP', 'SMS']
  }
};

export default authConfig;