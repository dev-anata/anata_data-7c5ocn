/**
 * @fileoverview Centralizes and exports all CLI commands with enhanced validation and type safety
 * Implements command aggregation and validation based on technical specifications
 * @version 1.0.0
 */

import { Command } from '../interfaces/command.interface';
import { ConfigCommand } from './config.command';
import { DataCommand } from './data.command';
import { DocumentCommand } from './document.command';
import { ScrapingCommand } from './scraping.command';

/**
 * Interface for command validation result
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates all commands for interface compliance and uniqueness
 * @param commands - Array of command implementations to validate
 * @returns Validation result with status and errors
 */
function validateCommands(commands: Command[]): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: []
  };

  // Track command names for uniqueness check
  const commandNames = new Set<string>();

  commands.forEach(command => {
    // Validate command name
    if (!command.name || typeof command.name !== 'string') {
      result.errors.push(`Invalid command name: ${command.constructor.name}`);
    } else if (commandNames.has(command.name)) {
      result.errors.push(`Duplicate command name: ${command.name}`);
    } else {
      commandNames.add(command.name);
    }

    // Validate command description
    if (!command.description || typeof command.description !== 'string') {
      result.errors.push(`Missing or invalid description for command: ${command.name}`);
    }

    // Validate command options
    if (!command.options || typeof command.options !== 'object') {
      result.errors.push(`Invalid options for command: ${command.name}`);
    }

    // Validate execute method
    if (!command.execute || typeof command.execute !== 'function') {
      result.errors.push(`Missing execute method for command: ${command.name}`);
    }
  });

  // Update validation status
  result.isValid = result.errors.length === 0;

  return result;
}

/**
 * Array of all available CLI commands with validation
 * Implements command structure from technical specifications section 3.1.1
 */
export const commands: Command[] = [
  new ConfigCommand(),  // Configuration management commands
  new DataCommand(),    // Data management commands
  new DocumentCommand(), // Document processing commands
  new ScrapingCommand() // Web scraping commands
];

// Validate commands on module load
const validationResult = validateCommands(commands);
if (!validationResult.isValid) {
  console.error('Command validation failed:');
  validationResult.errors.forEach(error => console.error(`- ${error}`));
  throw new Error('Invalid command configuration detected');
}

/**
 * Export individual commands for direct access
 */
export {
  ConfigCommand,
  DataCommand,
  DocumentCommand,
  ScrapingCommand
};

/**
 * Export command validation function for testing and runtime checks
 */
export { validateCommands };

/**
 * Default export of validated commands array
 */
export default commands;