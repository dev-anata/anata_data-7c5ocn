/**
 * @fileoverview Core authentication and authorization interfaces for the Pharmaceutical Data Pipeline Platform.
 * Defines the structure of authentication-related data, JWT payloads, user roles and permissions.
 * @version 1.0.0
 */

/**
 * Enum defining available user roles in the system.
 * Maps to the authorization matrix defined in technical specifications.
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
  DATA_ENGINEER = 'DATA_ENGINEER',
  API_CONSUMER = 'API_CONSUMER'
}

/**
 * Interface defining the structure of authentication token response.
 * Used when issuing JWTs after successful authentication.
 */
export interface AuthToken {
  /** JWT token string */
  token: string;
  /** Token expiration time in seconds */
  expiresIn: number;
}

/**
 * Interface defining the structure of JWT token payload.
 * Contains essential user information and token metadata.
 */
export interface JWTPayload {
  /** Unique identifier of the user */
  userId: string;
  /** User's email address */
  email: string;
  /** User's role in the system */
  role: UserRole;
  /** Token issued at timestamp */
  iat: number;
  /** Token expiration timestamp */
  exp: number;
}

/**
 * Type defining the mapping of roles to their allowed permissions.
 * Implements the role-based access control matrix from technical specifications.
 */
export type RolePermissions = Record<UserRole, string[]>;

/**
 * Default permission mappings for each role.
 * Based on the authorization matrix defined in technical specifications.
 */
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  [UserRole.ADMIN]: [
    'scraping:full',
    'documents:full',
    'data:full',
    'config:full'
  ],
  [UserRole.DEVELOPER]: [
    'scraping:create',
    'scraping:read',
    'documents:create',
    'documents:read',
    'data:read',
    'config:read'
  ],
  [UserRole.DATA_ENGINEER]: [
    'scraping:read',
    'documents:create',
    'documents:read',
    'data:read',
    'data:export',
    'config:read'
  ],
  [UserRole.API_CONSUMER]: [
    'data:read'
  ]
};

/**
 * Interface defining the structure of authenticated user data.
 * Contains user profile information and associated permissions.
 */
export interface AuthUser {
  /** Unique identifier of the user */
  userId: string;
  /** User's email address */
  email: string;
  /** User's role in the system */
  role: UserRole;
  /** List of permissions granted to the user */
  permissions: string[];
  /** Flag indicating if the user account is active */
  isActive: boolean;
}

/**
 * Type defining the structure of permission scopes.
 * Used for fine-grained access control within the system.
 */
export type PermissionScope = 'scraping' | 'documents' | 'data' | 'config';

/**
 * Type defining the structure of permission actions.
 * Defines possible actions that can be performed on resources.
 */
export type PermissionAction = 'full' | 'create' | 'read' | 'update' | 'delete' | 'export';

/**
 * Interface defining the structure of a permission check result.
 * Used when validating user permissions for specific actions.
 */
export interface PermissionCheckResult {
  /** Whether the permission check passed */
  granted: boolean;
  /** Optional reason for permission denial */
  reason?: string;
}

/**
 * Interface defining the structure of authentication configuration.
 * Contains settings for JWT token generation and validation.
 */
export interface AuthConfig {
  /** JWT secret key identifier in Cloud KMS */
  jwtKeyId: string;
  /** Token expiration time in seconds */
  tokenExpirationTime: number;
  /** Maximum number of failed login attempts */
  maxLoginAttempts: number;
  /** Account lockout duration in seconds */
  lockoutDuration: number;
}