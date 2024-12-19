/**
 * @fileoverview Core encryption utility module for secure data handling
 * @version 1.0.0
 */

import { KMSClient, KeyManagementServiceClient } from '@google-cloud/kms'; // v3.0.0
import * as bcrypt from 'bcryptjs'; // v2.4.3
import * as crypto from 'crypto';
import { GCPConfig } from '../interfaces/config.interface';

// Constants
const SALT_ROUNDS = 12;
const MAX_RETRY_ATTEMPTS = 3;
const KEY_CACHE_DURATION = 3600000; // 1 hour in milliseconds

/**
 * Interface for encryption options
 */
interface EncryptionOptions {
  /** Optional key version override */
  keyVersion?: string;
  /** Cache duration in milliseconds */
  cacheDuration?: number;
  /** Additional authenticated data */
  aad?: Buffer;
}

/**
 * Interface for decryption options
 */
interface DecryptionOptions {
  /** Additional authenticated data */
  aad?: Buffer;
  /** Verify key version */
  verifyKeyVersion?: boolean;
}

/**
 * Interface for key rotation options
 */
interface KeyRotationOptions {
  /** Force re-encryption of all data */
  forceReEncryption?: boolean;
  /** Backup existing keys */
  backupExistingKeys?: boolean;
}

/**
 * Interface for encrypted data structure
 */
interface EncryptedData {
  /** Encrypted data buffer */
  data: Buffer;
  /** Initialization vector */
  iv: Buffer;
  /** Key version used for encryption */
  keyVersion: string;
  /** Encryption timestamp */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Interface for key rotation results
 */
interface KeyRotationResult {
  /** New key version */
  newKeyVersion: string;
  /** Number of re-encrypted items */
  reEncryptedCount: number;
  /** Operation timestamp */
  timestamp: number;
}

/**
 * Custom error class for encryption operations
 */
export class EncryptionError extends Error {
  public readonly code: string;
  public readonly operation: string;
  public readonly details?: any;

  constructor(message: string, code: string, operation: string, details?: any) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
    this.operation = operation;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Cache for encryption keys
 */
const keyCache = new Map<string, { key: Buffer; expires: number }>();

/**
 * Decorator for retrying failed operations
 */
function retryable(maxAttempts: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          }
        }
      }
      
      throw lastError;
    };
    
    return descriptor;
  };
}

/**
 * Decorator for audit logging
 */
function auditLog(operation: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        // Audit log success
        console.log(`Encryption operation ${operation} completed successfully`, {
          operation,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
        return result;
      } catch (error) {
        // Audit log failure
        console.error(`Encryption operation ${operation} failed`, {
          operation,
          error: error.message,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Encrypts data using Google Cloud KMS with AES-256
 * @param data Data to encrypt
 * @param keyPath Full path to KMS key
 * @param options Encryption options
 * @returns Encrypted data with metadata
 */
@retryable(MAX_RETRY_ATTEMPTS)
@auditLog('encryption')
export async function encryptData(
  data: string | Buffer,
  keyPath: string,
  options: EncryptionOptions = {}
): Promise<EncryptedData> {
  try {
    // Initialize KMS client
    const kmsClient = new KeyManagementServiceClient();
    
    // Generate initialization vector
    const iv = crypto.randomBytes(16);
    
    // Get or generate data encryption key
    let dataKey: Buffer;
    const cacheKey = `${keyPath}-${options.keyVersion || 'latest'}`;
    const cached = keyCache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      dataKey = cached.key;
    } else {
      const [encryptResponse] = await kmsClient.encrypt({
        name: keyPath,
        plaintext: crypto.randomBytes(32)
      });
      
      dataKey = Buffer.from(encryptResponse.ciphertext);
      
      // Cache the key
      keyCache.set(cacheKey, {
        key: dataKey,
        expires: Date.now() + (options.cacheDuration || KEY_CACHE_DURATION)
      });
    }
    
    // Create cipher and encrypt data
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    
    if (options.aad) {
      cipher.setAAD(options.aad);
    }
    
    const inputData = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const encryptedData = Buffer.concat([
      cipher.update(inputData),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine encrypted data with auth tag
    const finalData = Buffer.concat([encryptedData, authTag]);
    
    return {
      data: finalData,
      iv,
      keyVersion: options.keyVersion || 'latest',
      timestamp: Date.now(),
      metadata: {
        algorithm: 'aes-256-gcm',
        keyPath,
        aadPresent: !!options.aad
      }
    };
  } catch (error) {
    throw new EncryptionError(
      'Encryption failed',
      'ENCRYPTION_FAILED',
      'encryptData',
      error
    );
  }
}

/**
 * Decrypts data using Google Cloud KMS
 * @param encryptedData Encrypted data object
 * @param keyPath Full path to KMS key
 * @param options Decryption options
 * @returns Decrypted data buffer
 */
@retryable(MAX_RETRY_ATTEMPTS)
@auditLog('decryption')
export async function decryptData(
  encryptedData: EncryptedData,
  keyPath: string,
  options: DecryptionOptions = {}
): Promise<Buffer> {
  try {
    // Initialize KMS client
    const kmsClient = new KeyManagementServiceClient();
    
    // Verify key version if required
    if (options.verifyKeyVersion && encryptedData.keyVersion !== 'latest') {
      const [version] = await kmsClient.getCryptoKeyVersion({
        name: `${keyPath}/cryptoKeyVersions/${encryptedData.keyVersion}`
      });
      
      if (version.state !== 'ENABLED') {
        throw new EncryptionError(
          'Key version is not enabled',
          'INVALID_KEY_VERSION',
          'decryptData'
        );
      }
    }
    
    // Separate auth tag from encrypted data
    const authTagLength = 16;
    const encryptedContent = encryptedData.data.slice(0, -authTagLength);
    const authTag = encryptedData.data.slice(-authTagLength);
    
    // Get decryption key
    const [decryptResponse] = await kmsClient.decrypt({
      name: keyPath,
      ciphertext: encryptedContent
    });
    
    const decryptionKey = Buffer.from(decryptResponse.plaintext);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      decryptionKey,
      encryptedData.iv
    );
    
    decipher.setAuthTag(authTag);
    
    if (options.aad) {
      decipher.setAAD(options.aad);
    }
    
    // Decrypt data
    return Buffer.concat([
      decipher.update(encryptedContent),
      decipher.final()
    ]);
  } catch (error) {
    throw new EncryptionError(
      'Decryption failed',
      'DECRYPTION_FAILED',
      'decryptData',
      error
    );
  }
}

/**
 * Rotates encryption key and re-encrypts affected data
 * @param keyPath Full path to KMS key
 * @param options Key rotation options
 * @returns Results of key rotation operation
 */
@auditLog('keyRotation')
export async function rotateEncryptionKey(
  keyPath: string,
  options: KeyRotationOptions = {}
): Promise<KeyRotationResult> {
  try {
    // Initialize KMS client
    const kmsClient = new KeyManagementServiceClient();
    
    // Create new key version
    const [newVersion] = await kmsClient.createCryptoKeyVersion({
      parent: keyPath
    });
    
    const newKeyVersion = newVersion.name.split('/').pop();
    
    // Clear key cache
    keyCache.clear();
    
    // Re-encrypt data if required
    let reEncryptedCount = 0;
    if (options.forceReEncryption) {
      // Implementation for re-encryption would go here
      // This would involve fetching all encrypted data and re-encrypting
      // with the new key version
      reEncryptedCount = 0; // Placeholder
    }
    
    return {
      newKeyVersion,
      reEncryptedCount,
      timestamp: Date.now()
    };
  } catch (error) {
    throw new EncryptionError(
      'Key rotation failed',
      'KEY_ROTATION_FAILED',
      'rotateEncryptionKey',
      error
    );
  }
}

/**
 * Hashes a password using bcrypt
 * @param password Password to hash
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    return await bcrypt.hash(password, SALT_ROUNDS);
  } catch (error) {
    throw new EncryptionError(
      'Password hashing failed',
      'HASH_FAILED',
      'hashPassword',
      error
    );
  }
}

/**
 * Verifies a password against its hash
 * @param password Password to verify
 * @param hash Hash to verify against
 * @returns Boolean indicating if password matches
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    throw new EncryptionError(
      'Password verification failed',
      'VERIFY_FAILED',
      'verifyPassword',
      error
    );
  }
}