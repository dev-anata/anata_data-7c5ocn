/**
 * @fileoverview Barrel file that exports the Cloud Storage service implementation and related storage interfaces
 * for the Pharmaceutical Data Pipeline Platform. Provides a centralized access point for storage functionality
 * with comprehensive type definitions and configuration options.
 * @version 1.0.0
 */

// Import Cloud Storage service implementation
export { CloudStorageService } from './cloud-storage.service';

// Import storage interfaces for type definitions and configuration
export {
    StorageService,
    StorageFile,
    StorageOptions
} from '../interfaces/storage.interface';

// Re-export storage configuration for easy access
export { storageConfig } from '../../config/storage.config';