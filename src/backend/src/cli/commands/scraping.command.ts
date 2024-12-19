/**
 * Enhanced CLI command implementation for web scraping operations
 * Provides comprehensive job management with validation and monitoring
 * @version 1.0.0
 */

import { injectable } from 'inversify'; // v6.0.1
import { Command, CommandOptions, CommandResult } from '../interfaces/command.interface';
import { ScrapingService } from '../../api/services/scraping.service';
import { displayResult, displayError, displayProgress } from '../utils/display.util';
import { ScrapingConfig } from '../../scraping/interfaces/config.interface';
import { JobStatus } from '../../scraping/interfaces/job.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Implementation of the scraping command interface with comprehensive job management
 */
@injectable()
export class ScrapingCommand implements Command {
    public readonly name: string = 'scrape';
    public readonly description: string = 'Manage web scraping jobs';
    public readonly options: CommandOptions = {
        config: 'Path to scraping configuration file',
        jobId: 'Job identifier for status/stop operations'
    };

    constructor(private readonly scrapingService: ScrapingService) {}

    /**
     * Executes the scraping command with comprehensive validation and error handling
     * @param options - Command options from CLI
     * @returns Promise resolving to command execution result
     */
    public async execute(options: CommandOptions): Promise<CommandResult> {
        try {
            // Validate subcommand
            const subcommand = options._.length > 0 ? options._[0] : null;
            if (!subcommand || !['start', 'stop', 'status'].includes(subcommand)) {
                throw new Error('Invalid subcommand. Use: start, stop, or status');
            }

            // Execute appropriate subcommand handler
            switch (subcommand) {
                case 'start':
                    return await this.handleStart(options);
                case 'stop':
                    return await this.handleStop(options);
                case 'status':
                    return await this.handleStatus(options);
                default:
                    throw new Error('Invalid subcommand');
            }
        } catch (error) {
            displayError(error.message);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Handles the start subcommand for initiating scraping jobs
     * @param options - Command options containing configuration path
     */
    private async handleStart(options: CommandOptions): Promise<CommandResult> {
        if (!options.config) {
            throw new Error('Configuration file path is required');
        }

        try {
            // Read and parse configuration file
            const configPath = path.resolve(options.config);
            const configContent = await fs.readFile(configPath, 'utf-8');
            const config: ScrapingConfig = JSON.parse(configContent);

            // Display progress indicator
            const spinner = displayProgress('Starting scraping job', 0);

            // Start scraping job
            const job = await this.scrapingService.startScrapingJob(config);
            spinner.succeed('Scraping job started successfully');

            return {
                success: true,
                message: 'Scraping job started successfully',
                data: {
                    jobId: job.id,
                    status: job.status,
                    createdAt: job.createdAt
                }
            };
        } catch (error) {
            throw new Error(`Failed to start scraping job: ${error.message}`);
        }
    }

    /**
     * Handles the stop subcommand for gracefully stopping scraping jobs
     * @param options - Command options containing job ID
     */
    private async handleStop(options: CommandOptions): Promise<CommandResult> {
        if (!options.jobId) {
            throw new Error('Job ID is required');
        }

        try {
            // Display progress indicator
            const spinner = displayProgress('Stopping scraping job', 0);

            // Stop the job
            await this.scrapingService.stopJob(options.jobId);
            spinner.succeed('Scraping job stopped successfully');

            return {
                success: true,
                message: 'Scraping job stopped successfully',
                data: { jobId: options.jobId }
            };
        } catch (error) {
            throw new Error(`Failed to stop scraping job: ${error.message}`);
        }
    }

    /**
     * Handles the status subcommand for checking job status and progress
     * @param options - Command options containing optional job ID
     */
    private async handleStatus(options: CommandOptions): Promise<CommandResult> {
        try {
            if (options.jobId) {
                // Get specific job status
                const job = await this.scrapingService.getJobStatus(options.jobId);
                
                return {
                    success: true,
                    message: 'Job status retrieved successfully',
                    data: {
                        jobId: job.id,
                        status: job.status,
                        progress: job.executionDetails.progress,
                        metrics: job.executionDetails.metrics,
                        startTime: job.executionDetails.startTime,
                        duration: job.executionDetails.duration,
                        error: job.executionDetails.error
                    }
                };
            } else {
                // List all jobs
                const jobs = await this.scrapingService.listJobs();
                
                return {
                    success: true,
                    message: 'Jobs retrieved successfully',
                    data: jobs.map(job => ({
                        jobId: job.id,
                        status: job.status,
                        progress: job.executionDetails.progress,
                        startTime: job.executionDetails.startTime
                    }))
                };
            }
        } catch (error) {
            throw new Error(`Failed to get job status: ${error.message}`);
        }
    }

    /**
     * Formats job status for display
     * @param status - Job status enum value
     */
    private formatStatus(status: JobStatus): string {
        return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    }

    /**
     * Validates job ID format
     * @param jobId - Job identifier to validate
     */
    private validateJobId(jobId: string): void {
        if (!jobId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
            throw new Error('Invalid job ID format');
        }
    }
}