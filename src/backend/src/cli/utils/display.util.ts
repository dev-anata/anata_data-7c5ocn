import chalk from 'chalk';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';
import { CommandResult } from '../interfaces/command.interface';

/**
 * Interface for customizing display output with enhanced accessibility and styling options
 * @version 1.0.0
 */
export interface DisplayOptions {
  /** Enable/disable color output */
  colors?: boolean;
  /** Date format for timestamps */
  dateFormat?: string;
  /** Table styling configuration */
  tableStyle?: 'default' | 'compact' | 'markdown';
  /** Enable accessibility features */
  accessibilityMode?: boolean;
  /** Custom theme overrides */
  customTheme?: {
    success: string;
    error: string;
    info: string;
    warning: string;
  };
}

// Default display options
const DEFAULT_OPTIONS: DisplayOptions = {
  colors: true,
  dateFormat: 'YYYY-MM-DD HH:mm:ss',
  tableStyle: 'default',
  accessibilityMode: false,
  customTheme: {
    success: 'green',
    error: 'red',
    info: 'blue',
    warning: 'yellow'
  }
};

/**
 * Displays command execution result with appropriate formatting, colors, and accessibility considerations
 * @param result - Command execution result
 * @param options - Display customization options
 */
export function displayResult(
  result: CommandResult,
  options: DisplayOptions = DEFAULT_OPTIONS
): void {
  const { success, message, data } = result;
  const { colors, accessibilityMode, customTheme } = { ...DEFAULT_OPTIONS, ...options };

  // Determine color based on result status and accessibility mode
  const color = success ? 
    (customTheme?.success || 'green') : 
    (customTheme?.error || 'red');

  // Format prefix based on accessibility mode
  const prefix = accessibilityMode ?
    (success ? '[SUCCESS] ' : '[ERROR] ') :
    (success ? '✓ ' : '✗ ');

  // Apply color if enabled and terminal supports it
  const formattedMessage = colors && !accessibilityMode ?
    chalk[color](prefix + message) :
    prefix + message;

  console.log(formattedMessage);

  // Display data if present
  if (data) {
    if (Array.isArray(data)) {
      displayTable(data, Object.keys(data[0]), options);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Displays error message in red color with error prefix and accessibility considerations
 * @param message - Error message to display
 * @param options - Display customization options
 */
export function displayError(
  message: string,
  options: DisplayOptions = DEFAULT_OPTIONS
): void {
  const { colors, accessibilityMode, customTheme } = { ...DEFAULT_OPTIONS, ...options };

  const errorPrefix = accessibilityMode ? '[ERROR] ' : '✗ ';
  const errorColor = customTheme?.error || 'red';

  const formattedError = colors && !accessibilityMode ?
    chalk[errorColor](errorPrefix + message) :
    errorPrefix + message;

  console.error(formattedError);

  // Add screen reader text if accessibility mode is enabled
  if (accessibilityMode) {
    console.error(chalk.hidden('Error occurred. Please review the message above.'));
  }
}

/**
 * Displays progress bar or spinner for long-running operations with accessibility support
 * @param message - Progress message
 * @param percent - Progress percentage (0-100)
 * @param options - Display customization options
 */
export function displayProgress(
  message: string,
  percent: number,
  options: DisplayOptions = DEFAULT_OPTIONS
): Ora {
  const { accessibilityMode, colors } = { ...DEFAULT_OPTIONS, ...options };

  // Validate percentage
  const validPercent = Math.max(0, Math.min(100, percent));

  // Create spinner instance
  const spinner = ora({
    text: message,
    color: 'cyan',
    spinner: accessibilityMode ? 'line' : 'dots',
    isEnabled: !accessibilityMode && colors
  });

  // Start spinner
  spinner.start();

  // Update spinner text with percentage
  spinner.text = `${message} (${validPercent}%)`;

  // Add accessibility text
  if (accessibilityMode) {
    console.log(chalk.hidden(`Progress: ${validPercent}% complete`));
  }

  return spinner;
}

/**
 * Displays data in formatted table structure with customizable styling
 * @param data - Array of data objects to display
 * @param headers - Array of column headers
 * @param options - Display customization options
 */
export function displayTable(
  data: any[],
  headers: string[],
  options: DisplayOptions = DEFAULT_OPTIONS
): void {
  const { tableStyle, accessibilityMode, colors } = { ...DEFAULT_OPTIONS, ...options };

  // Configure table style
  const tableConfig = {
    head: headers,
    style: {
      head: colors ? ['cyan'] : [],
      border: colors ? ['grey'] : [],
    },
    chars: accessibilityMode ? {
      'top': '-',
      'top-mid': '+',
      'top-left': '+',
      'top-right': '+',
      'bottom': '-',
      'bottom-mid': '+',
      'bottom-left': '+',
      'bottom-right': '+',
      'left': '|',
      'left-mid': '+',
      'mid': '-',
      'mid-mid': '+',
      'right': '|',
      'right-mid': '+',
      'middle': '|'
    } : undefined
  };

  // Create table instance
  const table = new Table(tableConfig);

  // Add data rows
  data.forEach(row => {
    const rowData = headers.map(header => {
      const value = row[header];
      return value === null || value === undefined ? '' : String(value);
    });
    table.push(rowData);
  });

  // Display table
  console.log(table.toString());

  // Add screen reader description if accessibility mode is enabled
  if (accessibilityMode) {
    console.log(chalk.hidden(
      `Table contains ${data.length} rows and ${headers.length} columns. ` +
      `Headers are: ${headers.join(', ')}`
    ));
  }
}

/**
 * Utility function to clear the terminal screen
 */
export function clearScreen(): void {
  process.stdout.write('\x1Bc');
}

/**
 * Utility function to determine if the terminal supports colors
 * @returns boolean indicating color support
 */
export function hasColorSupport(): boolean {
  return process.stdout.isTTY && process.env.TERM !== 'dumb';
}

/**
 * Utility function to get terminal width
 * @returns number representing terminal width in columns
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}