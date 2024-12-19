/**
 * Core interface that all CLI commands must implement to ensure consistent command structure and behavior.
 * This interface establishes the contract for implementing commands in the Pharmaceutical Data Pipeline Platform CLI.
 * @version 1.0.0
 */
export interface Command {
  /**
   * The name of the command as it should be invoked from the CLI
   */
  name: string;

  /**
   * Detailed description of the command's purpose and usage
   */
  description: string;

  /**
   * Configuration options supported by the command
   */
  options: CommandOptions;

  /**
   * Executes the command with the provided options
   * @param options - Command-specific options passed from the CLI
   * @returns Promise resolving to a CommandResult containing execution status and data
   */
  execute(options: CommandOptions): Promise<CommandResult>;
}

/**
 * Interface defining all possible command options that can be passed to any CLI command.
 * This provides a unified structure for handling command parameters across the platform.
 */
export interface CommandOptions {
  /**
   * Path to a configuration file (e.g., for scraping jobs)
   */
  config?: string;

  /**
   * Identifier for tracking specific jobs or processes
   */
  jobId?: string;

  /**
   * Path to input/output files (e.g., for document processing)
   */
  file?: string;

  /**
   * Output format specification (e.g., 'csv', 'json')
   */
  format?: string;

  /**
   * Query filter expression for data retrieval
   */
  filter?: string;
}

/**
 * Interface defining the standardized structure of command execution results.
 * Ensures consistent output handling across all CLI commands.
 */
export interface CommandResult {
  /**
   * Indicates whether the command executed successfully
   */
  success: boolean;

  /**
   * Human-readable message describing the execution result
   */
  message: string;

  /**
   * Optional data payload returned by the command
   * Can contain command-specific structured data
   */
  data?: any;
}

/**
 * Type definition for supported output formats
 */
export type OutputFormat = 'json' | 'csv';

/**
 * Type definition for command execution status
 */
export type ExecutionStatus = 'success' | 'error' | 'in-progress';

/**
 * Type definition for command categories based on technical specifications
 */
export type CommandCategory = 'scrape' | 'docs' | 'data' | 'config' | 'monitor';

/**
 * Type definition for supported subcommands per category
 */
export type SubCommand = {
  scrape: 'start' | 'stop' | 'status';
  docs: 'upload' | 'process' | 'status';
  data: 'export' | 'query' | 'validate';
  config: 'set' | 'get' | 'list';
  monitor: 'logs' | 'metrics' | 'alerts';
};