/**
 * @fileoverview Authentication and authorization middleware with comprehensive security controls
 * Implements JWT validation, role-based access control, and performance optimization
 * @version 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // ^4.17.1
import { AuthService } from '../../core/auth/auth.service';
import { 
  AuthUser, 
  JWTPayload, 
  UserRole, 
  PermissionAction, 
  PermissionScope 
} from '../../core/interfaces/auth.interface';
import { UnauthorizedError, ForbiddenError } from '../../core/utils/error.util';

// Constants for authentication configuration
const AUTH_CONFIG = {
  TOKEN_HEADER: 'Authorization',
  TOKEN_PREFIX: 'Bearer',
  PERMISSION_CACHE_TTL: 300000, // 5 minutes in milliseconds
  MAX_CACHE_SIZE: 10000,
};

// Cache for permission checks to improve performance
const permissionCache = new Map<string, {
  permissions: string[];
  timestamp: number;
}>();

/**
 * Express middleware for JWT authentication with performance optimization
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export async function authenticate(
  req: Request & { user?: AuthUser },
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  try {
    // Extract token from Authorization header
    const authHeader = req.headers[AUTH_CONFIG.TOKEN_HEADER.toLowerCase()];
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedError('Missing authentication token');
    }

    // Validate token format
    const [prefix, token] = authHeader.split(' ');
    if (prefix !== AUTH_CONFIG.TOKEN_PREFIX || !token) {
      throw new UnauthorizedError('Invalid token format');
    }

    // Verify token and decode payload
    const authService = new AuthService();
    const payload = await authService.validateToken(token);

    // Attach user data to request
    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      permissions: getPermissionsForRole(payload.role),
      isActive: true
    };

    // Log successful authentication
    const duration = Date.now() - startTime;
    await authService.logAuthAttempt({
      userId: payload.userId,
      success: true,
      duration,
      timestamp: new Date()
    });

    next();
  } catch (error) {
    // Log failed authentication attempt
    const authService = new AuthService();
    await authService.logAuthAttempt({
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
      timestamp: new Date()
    });

    next(error);
  }
}

/**
 * Express middleware factory for role-based authorization with caching
 * @param requiredPermissions - Array of required permissions
 * @returns Express middleware function
 */
export function authorize(requiredPermissions: string[]) {
  return async function(
    req: Request & { user?: AuthUser },
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const startTime = Date.now();

    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      // Check permission cache
      const cacheKey = `${req.user.userId}:${requiredPermissions.join(',')}`;
      const cachedPermissions = checkPermissionCache(cacheKey);
      
      if (cachedPermissions) {
        const hasPermission = requiredPermissions.every(
          permission => cachedPermissions.includes(permission)
        );
        if (hasPermission) {
          return next();
        }
      }

      // Verify permissions using auth service
      const authService = new AuthService();
      const permissionChecks = await Promise.all(
        requiredPermissions.map(permission =>
          authService.checkPermission(req.user!, permission)
        )
      );

      // Check if all permissions are granted
      const isAuthorized = permissionChecks.every(check => check.granted);

      if (!isAuthorized) {
        throw new ForbiddenError('Insufficient permissions');
      }

      // Cache successful permission check
      updatePermissionCache(cacheKey, req.user.permissions);

      // Log successful authorization
      await authService.logAuthAttempt({
        userId: req.user.userId,
        success: true,
        permissions: requiredPermissions,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });

      next();
    } catch (error) {
      // Log failed authorization attempt
      const authService = new AuthService();
      await authService.logAuthAttempt({
        userId: req.user?.userId,
        success: false,
        permissions: requiredPermissions,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });

      next(error);
    }
  };
}

/**
 * Helper function to get permissions for a user role
 * @param role - User role
 * @returns Array of permissions
 */
function getPermissionsForRole(role: UserRole): string[] {
  const permissions: string[] = [];
  
  switch (role) {
    case UserRole.ADMIN:
      permissions.push(
        'scraping:full',
        'documents:full',
        'data:full',
        'config:full'
      );
      break;
    case UserRole.DEVELOPER:
      permissions.push(
        'scraping:create',
        'scraping:read',
        'documents:create',
        'documents:read',
        'data:read',
        'config:read'
      );
      break;
    case UserRole.DATA_ENGINEER:
      permissions.push(
        'scraping:read',
        'documents:create',
        'documents:read',
        'data:read',
        'data:export',
        'config:read'
      );
      break;
    case UserRole.API_CONSUMER:
      permissions.push('data:read');
      break;
  }

  return permissions;
}

/**
 * Check permission cache for existing permission checks
 * @param cacheKey - Cache key for permission check
 * @returns Cached permissions or null
 */
function checkPermissionCache(cacheKey: string): string[] | null {
  const cached = permissionCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < AUTH_CONFIG.PERMISSION_CACHE_TTL) {
    return cached.permissions;
  }

  if (cached) {
    permissionCache.delete(cacheKey);
  }

  return null;
}

/**
 * Update permission cache with new permission check results
 * @param cacheKey - Cache key for permission check
 * @param permissions - Array of permissions to cache
 */
function updatePermissionCache(cacheKey: string, permissions: string[]): void {
  // Implement LRU-style cache eviction if cache is full
  if (permissionCache.size >= AUTH_CONFIG.MAX_CACHE_SIZE) {
    const oldestKey = permissionCache.keys().next().value;
    permissionCache.delete(oldestKey);
  }

  permissionCache.set(cacheKey, {
    permissions,
    timestamp: Date.now()
  });
}