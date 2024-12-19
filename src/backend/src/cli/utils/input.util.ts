import * as yargs from 'yargs'; // v17.5.1
import * as yaml from 'js-yaml'; // v4.1.0
import * as fs from 'fs';
import * as path from 'path';
import { CommandOptions } from '../interfaces/command.interface';

/**
 * Interface defining the structure of input validation results
 */
interface InputValidationResult {
  isValid: boolean;
  error?: string;
  details?: ValidationDetails;
}

/**
 * Interface for validation details with specific error information
 */
interface ValidationDetails {
  field?: string;
  constraint?: string;
  value?: any;
}

/**
 * Supported input format types
 */
type InputFormat = 'json' | 'yaml' | 'text';

/**
 * Maximum file size for configuration files (10MB)
 */
const MAX_CONFIG_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Allowed file extensions for configuration files
 */
const ALLOWED_CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml'];

/**
 * Parses and validates command line arguments into structured CommandOptions
 * @param args - Command line arguments array
 * @returns Parsed and validated CommandOptions
 * @throws Error if validation fails
 */
export function parseCommandInput(args: string[]): CommandOptions {
  try {
    // Sanitize input arguments
    const sanitizedArgs = args.map(arg => sanitizeInput(arg));

    // Initialize yargs parser with strict type checking
    const parser = yargs(sanitizedArgs)
      .strict()
      .options({
        config: { type: 'string', description: 'Path to configuration file' },
        jobId: { type: 'string', description: 'Job identifier' },
        file: { type: 'string', description: 'Input/output file path' },
        format: { type: 'string', choices: ['json', 'csv'], description: 'Output format' },
        filter: { type: 'string', description: 'Query filter expression' }
      });

    // Parse arguments with validation
    const options = parser.argv;

    // Validate option combinations
    validateOptionCombinations(options);

    return {
      config: options.config,
      jobId: options.jobId,
      file: options.file,
      format: options.format,
      filter: options.filter
    };
  } catch (error) {
    throw new Error(`Failed to parse command input: ${error.message}`);
  }
}

/**
 * Parses and validates configuration file content
 * @param filePath - Path to configuration file
 * @returns Parsed and validated configuration object
 * @throws Error if file parsing or validation fails
 */
export function parseConfigFile(filePath: string): object {
  try {
    // Validate file path
    const normalizedPath = path.normalize(filePath);
    if (!isValidFilePath(normalizedPath)) {
      throw new Error('Invalid file path');
    }

    // Check file existence and size
    const stats = fs.statSync(normalizedPath);
    if (stats.size > MAX_CONFIG_FILE_SIZE) {
      throw new Error('Configuration file exceeds maximum size limit');
    }

    // Determine and validate file format
    const ext = path.extname(normalizedPath).toLowerCase();
    if (!ALLOWED_CONFIG_EXTENSIONS.includes(ext)) {
      throw new Error('Unsupported configuration file format');
    }

    // Read and parse file content
    const content = fs.readFileSync(normalizedPath, 'utf8');
    const format = ext === '.json' ? 'json' : 'yaml';
    
    return parseContent(content, format);
  } catch (error) {
    throw new Error(`Failed to parse configuration file: ${error.message}`);
  }
}

/**
 * Validates input format with comprehensive rule checking
 * @param value - Input value to validate
 * @param format - Expected format
 * @returns Validation result with detailed information
 */
export function validateInputFormat(value: string, format: InputFormat): InputValidationResult {
  try {
    // Apply format-specific validation
    switch (format) {
      case 'json':
        JSON.parse(value);
        break;
      case 'yaml':
        yaml.load(value);
        break;
      case 'text':
        if (!value || typeof value !== 'string') {
          throw new Error('Invalid text input');
        }
        break;
      default:
        throw new Error('Unsupported format');
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      details: {
        field: 'format',
        constraint: format,
        value: value
      }
    };
  }
}

/**
 * Normalizes input values with type coercion and format standardization
 * @param value - Input value to normalize
 * @param type - Target type for normalization
 * @returns Normalized and sanitized value
 */
export function normalizeInput(value: any, type: string): any {
  if (value === null || value === undefined) {
    return value;
  }

  switch (type) {
    case 'string':
      return String(value).trim();
    case 'number':
      const num = Number(value);
      return isNaN(num) ? value : num;
    case 'boolean':
      return Boolean(value);
    case 'array':
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
}

/**
 * Validates combinations of command options
 * @param options - Command options to validate
 * @throws Error if invalid option combinations are detected
 */
function validateOptionCombinations(options: any): void {
  // Validate config file option
  if (options.config && options.file) {
    throw new Error('Cannot specify both config and file options');
  }

  // Validate format option
  if (options.format && !['json', 'csv'].includes(options.format)) {
    throw new Error('Invalid format specified');
  }

  // Validate job ID format if provided
  if (options.jobId && !isValidJobId(options.jobId)) {
    throw new Error('Invalid job ID format');
  }
}

/**
 * Sanitizes input string to prevent injection attacks
 * @param input - Input string to sanitize
 * @returns Sanitized input string
 */
function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input.replace(/[;&|`$]/g, '');
}

/**
 * Validates file path for security
 * @param filePath - File path to validate
 * @returns Boolean indicating if path is valid
 */
function isValidFilePath(filePath: string): boolean {
  // Check for path traversal attempts
  const normalizedPath = path.normalize(filePath);
  return !normalizedPath.includes('..');
}

/**
 * Validates job ID format
 * @param jobId - Job ID to validate
 * @returns Boolean indicating if job ID is valid
 */
function isValidJobId(jobId: string): boolean {
  // Job ID should be alphanumeric with optional hyphens
  return /^[a-zA-Z0-9-]+$/.test(jobId);
}

/**
 * Parses content based on format
 * @param content - Content to parse
 * @param format - Content format (json/yaml)
 * @returns Parsed content object
 */
function parseContent(content: string, format: 'json' | 'yaml'): object {
  try {
    return format === 'json' ? JSON.parse(content) : yaml.load(content);
  } catch (error) {
    throw new Error(`Failed to parse ${format} content: ${error.message}`);
  }
}