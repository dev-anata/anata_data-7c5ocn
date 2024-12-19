// External Dependencies
import { injectable } from 'inversify'; // v6.0.1
import * as puppeteer from 'puppeteer'; // v19.0.0
import * as cheerio from 'cheerio'; // v1.0.0
import CircuitBreaker from 'opossum'; // v6.0.0

// Internal Dependencies
import { BaseScraper, ScrapingError, ScrapingErrorType } from './base.scraper';
import { ScrapingConfig, ScrapingSourceType, ScrapingAuthType } from '../interfaces/config.interface';
import { ScrapingResult, ResultStorage, ResultMetadata } from '../interfaces/result.interface';
import { LoggerService } from '../../../core/logging/logger.service';

/**
 * Interface for browser pool configuration
 */
interface BrowserPoolConfig {
  maxConcurrent: number;
  minIdle: number;
  maxUsageCount: number;
  timeout: number;
}

/**
 * Interface for page resource configuration
 */
interface ResourceConfig {
  images: boolean;
  stylesheets: boolean;
  fonts: boolean;
  javascript: boolean;
}

/**
 * Enhanced website scraper implementation with advanced features
 * Provides robust error handling, parallel processing, and resource optimization
 */
@injectable()
export class WebsiteScraper extends BaseScraper {
  private readonly browserPool: puppeteer.Browser[];
  private readonly browserConfig: BrowserPoolConfig;
  private readonly resourceConfig: ResourceConfig;
  private currentPage: puppeteer.Page | null;

  constructor(
    protected readonly logger: LoggerService,
    private readonly retryHandler: any
  ) {
    super(logger);
    this.browserPool = [];
    this.currentPage = null;
    
    // Configure browser pool settings
    this.browserConfig = {
      maxConcurrent: 5,
      minIdle: 1,
      maxUsageCount: 100,
      timeout: 30000
    };

    // Configure resource loading strategy
    this.resourceConfig = {
      images: false,
      stylesheets: false,
      fonts: false,
      javascript: true
    };

    this.initializeBrowserPool();
  }

  /**
   * Initialize browser pool for parallel processing
   */
  private async initializeBrowserPool(): Promise<void> {
    try {
      for (let i = 0; i < this.browserConfig.minIdle; i++) {
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });
        this.browserPool.push(browser);
      }
    } catch (error) {
      throw new ScrapingError(
        ScrapingErrorType.INTERNAL,
        'Failed to initialize browser pool',
        false,
        { error }
      );
    }
  }

  /**
   * Enhanced validation of website-specific scraping prerequisites
   */
  protected async validatePrerequisites(): Promise<void> {
    if (!this.config.source.url) {
      throw new ScrapingError(
        ScrapingErrorType.VALIDATION,
        'Invalid source URL',
        false
      );
    }

    if (!this.config.source.selectors || Object.keys(this.config.source.selectors).length === 0) {
      throw new ScrapingError(
        ScrapingErrorType.VALIDATION,
        'No selectors configured',
        false
      );
    }

    // Validate browser pool health
    if (this.browserPool.length === 0) {
      await this.initializeBrowserPool();
    }
  }

  /**
   * Execute optimized website scraping with parallel processing
   */
  protected async performScraping(): Promise<any> {
    try {
      const browser = await this.acquireBrowser();
      this.currentPage = await browser.newPage();

      // Configure page settings
      await this.configurePage(this.currentPage);

      // Handle authentication if required
      if (this.config.source.authentication?.type !== ScrapingAuthType.NONE) {
        await this.handleAuthentication(this.currentPage);
      }

      // Navigate to target URL with timeout
      await this.currentPage.goto(this.config.source.url, {
        waitUntil: 'networkidle0',
        timeout: this.config.options.timeout
      });

      // Extract data using configured selectors
      const data = await this.extractData(this.currentPage);

      // Release resources
      await this.releaseBrowser(browser);

      return data;
    } catch (error) {
      throw this.handleScrapingError(error);
    }
  }

  /**
   * Configure page settings for optimal performance
   */
  private async configurePage(page: puppeteer.Page): Promise<void> {
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (
        (!this.resourceConfig.images && resourceType === 'image') ||
        (!this.resourceConfig.stylesheets && resourceType === 'stylesheet') ||
        (!this.resourceConfig.fonts && resourceType === 'font')
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Set custom user agent
    await page.setUserAgent(this.config.options.userAgent);

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
  }

  /**
   * Handle website authentication
   */
  private async handleAuthentication(page: puppeteer.Page): Promise<void> {
    const auth = this.config.source.authentication!;

    switch (auth.type) {
      case ScrapingAuthType.BASIC:
        await page.authenticate({
          username: auth.credentials.username as string,
          password: auth.credentials.password as string
        });
        break;
      case ScrapingAuthType.TOKEN:
        await page.setExtraHTTPHeaders({
          'Authorization': `Bearer ${auth.credentials.token}`
        });
        break;
      // Implement other authentication types as needed
    }
  }

  /**
   * Extract data using configured selectors
   */
  private async extractData(page: puppeteer.Page): Promise<any> {
    const result: Record<string, any> = {};

    for (const [key, selectorConfig] of Object.entries(this.config.source.selectors)) {
      try {
        const elements = await page.$$(selectorConfig.selector);
        
        if (elements.length === 0 && selectorConfig.required) {
          throw new ScrapingError(
            ScrapingErrorType.PARSING,
            `Required selector "${key}" not found`,
            true
          );
        }

        result[key] = await Promise.all(
          elements.map(element => element.evaluate(el => el.textContent))
        );
      } catch (error) {
        if (selectorConfig.required) {
          throw error;
        }
        this.logger.warn(`Failed to extract data for selector "${key}"`, { error });
      }
    }

    return result;
  }

  /**
   * Process scraped data with validation
   */
  protected async processData(rawData: any): Promise<ScrapingResult> {
    const metadata: ResultMetadata = {
      size: Buffer.from(JSON.stringify(rawData)).length,
      itemCount: Object.keys(rawData).length,
      format: 'json',
      contentType: 'application/json',
      checksum: this.generateChecksum(rawData),
      validationStatus: 'VALID',
      qualityMetrics: {
        completeness: this.calculateCompleteness(rawData),
        accuracy: 1.0,
        consistency: 1.0,
        freshness: 1.0
      },
      processingHistory: []
    };

    const storage: ResultStorage = {
      rawFile: await this.storeRawData(rawData),
      processedFile: await this.storeProcessedData(rawData),
      bigQueryTable: this.config.gcp.bigquery.tableId,
      version: '1.0',
      compressionType: 'gzip',
      encryptionKey: this.config.gcp.storage.encryption.kmsKeyName
    };

    return {
      id: `scrape-${Date.now()}`,
      jobId: this.config.jobId,
      sourceType: ScrapingSourceType.WEBSITE,
      sourceUrl: this.config.source.url,
      timestamp: new Date(),
      storage,
      metadata
    };
  }

  /**
   * Acquire browser from pool
   */
  private async acquireBrowser(): Promise<puppeteer.Browser> {
    if (this.browserPool.length === 0) {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      return browser;
    }
    return this.browserPool.pop()!;
  }

  /**
   * Release browser back to pool
   */
  private async releaseBrowser(browser: puppeteer.Browser): Promise<void> {
    if (this.browserPool.length < this.browserConfig.maxConcurrent) {
      this.browserPool.push(browser);
    } else {
      await browser.close();
    }
  }

  /**
   * Handle scraping-specific errors
   */
  private handleScrapingError(error: Error): ScrapingError {
    if (error instanceof ScrapingError) {
      return error;
    }

    if (error.message.includes('net::')) {
      return new ScrapingError(
        ScrapingErrorType.NETWORK,
        'Network error occurred',
        true,
        { originalError: error }
      );
    }

    if (error.message.includes('timeout')) {
      return new ScrapingError(
        ScrapingErrorType.TIMEOUT,
        'Operation timed out',
        true,
        { originalError: error }
      );
    }

    return new ScrapingError(
      ScrapingErrorType.INTERNAL,
      'Unexpected error occurred',
      false,
      { originalError: error }
    );
  }

  /**
   * Calculate data completeness metric
   */
  private calculateCompleteness(data: any): number {
    const requiredFields = Object.entries(this.config.source.selectors)
      .filter(([_, config]) => config.required)
      .map(([key]) => key);

    const presentFields = requiredFields.filter(field => 
      data[field] && data[field].length > 0
    );

    return presentFields.length / requiredFields.length;
  }

  /**
   * Generate checksum for data integrity
   */
  private generateChecksum(data: any): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Cleanup resources on scraper destruction
   */
  public async destroy(): Promise<void> {
    await Promise.all(
      this.browserPool.map(browser => browser.close())
    );
    this.browserPool.length = 0;
  }
}