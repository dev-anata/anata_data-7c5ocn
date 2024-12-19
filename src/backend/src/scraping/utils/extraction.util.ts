// External Dependencies
import * as cheerio from 'cheerio'; // v1.0.0
import sanitizeHtml from 'sanitize-html'; // v2.7.0
import { createHash } from 'crypto';

// Internal Dependencies
import { ResultMetadata } from '../interfaces/result.interface';

/**
 * Configuration for HTML sanitization with enhanced security rules
 */
const SANITIZE_CONFIG = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'span', 'div', 'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'h1', 'h2', 'h3', 'h4', 'h5'
  ],
  allowedAttributes: {
    'a': ['href', 'title'],
    'td': ['rowspan', 'colspan'],
    'th': ['rowspan', 'colspan'],
    '*': ['class']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  parser: {
    lowerCaseTags: true,
    decodeEntities: true
  },
  transformTags: {
    'a': (tagName: string, attribs: any) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer'
      }
    })
  }
};

/**
 * Content size limits for security and performance
 */
const CONTENT_LIMITS = {
  maxHtmlSize: 10 * 1024 * 1024, // 10MB
  maxTextLength: 1000000, // 1M chars
  maxTableRows: 10000,
  maxUrlLength: 2048,
  maxLinks: 5000
};

/**
 * Extracts content from HTML using provided selectors with enhanced error handling
 * @param html - Raw HTML content
 * @param selectors - Map of selector names to CSS selectors
 * @returns Extracted content mapped by selector names with validation status
 */
export async function extractContent(
  html: string,
  selectors: Record<string, string>
): Promise<Record<string, string>> {
  // Input validation
  if (!html || typeof html !== 'string') {
    throw new Error('Invalid HTML input');
  }
  if (!selectors || typeof selectors !== 'object') {
    throw new Error('Invalid selectors input');
  }

  // Size validation
  if (html.length > CONTENT_LIMITS.maxHtmlSize) {
    throw new Error('HTML content exceeds size limit');
  }

  try {
    const $ = cheerio.load(html, {
      decodeEntities: true,
      xmlMode: false,
      lowerCaseTags: true
    });

    const results: Record<string, string> = {};
    
    for (const [name, selector] of Object.entries(selectors)) {
      try {
        const element = $(selector);
        if (element.length) {
          const content = element.text().trim();
          results[name] = content.length > CONTENT_LIMITS.maxTextLength 
            ? content.slice(0, CONTENT_LIMITS.maxTextLength) 
            : content;
        } else {
          results[name] = '';
        }
      } catch (error) {
        console.error(`Selector extraction error for ${name}:`, error);
        results[name] = '';
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Content extraction failed: ${error.message}`);
  }
}

/**
 * Enhanced HTML content sanitization with comprehensive security rules
 * @param html - Raw HTML content
 * @returns Sanitized and normalized HTML content
 */
export function cleanHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    throw new Error('Invalid HTML input');
  }

  try {
    // Pre-sanitization normalization
    let normalized = html
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Apply sanitization
    const sanitized = sanitizeHtml(normalized, SANITIZE_CONFIG);

    // Post-sanitization cleanup
    return sanitized
      .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
      .replace(/<([^>]+)>\s*<\/\1>/g, '') // Remove empty elements
      .trim();
  } catch (error) {
    throw new Error(`HTML sanitization failed: ${error.message}`);
  }
}

/**
 * Comprehensive metadata extraction with content analysis
 * @param content - Content to analyze
 * @returns Detailed content metadata with quality metrics
 */
export function extractMetadata(content: string): ResultMetadata {
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid content input');
  }

  const timestamp = new Date();
  const checksum = createHash('sha256').update(content).digest('hex');

  const metadata: ResultMetadata = {
    size: Buffer.byteLength(content, 'utf8'),
    itemCount: content.split(/\s+/).length,
    format: 'text/html',
    contentType: 'text/html; charset=utf-8',
    checksum,
    validationStatus: 'VALID',
    qualityMetrics: {
      completeness: calculateCompleteness(content),
      accuracy: 1.0, // Default value, should be updated based on validation
      consistency: calculateConsistency(content),
      freshness: 1.0 // Default value, should be updated based on timestamp
    },
    processingHistory: [{
      stepId: `metadata-${timestamp.getTime()}`,
      operation: 'EXTRACT',
      timestamp,
      duration: 0,
      status: 'SUCCESS'
    }]
  };

  return metadata;
}

/**
 * Secure URL extraction and validation with comprehensive checks
 * @param html - HTML content
 * @param baseUrl - Base URL for resolving relative URLs
 * @returns List of validated and normalized URLs
 */
export function extractLinks(html: string, baseUrl: string): string[] {
  if (!html || !baseUrl) {
    throw new Error('Invalid input parameters');
  }

  try {
    const $ = cheerio.load(html);
    const links = new Set<string>();
    const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

    $('a[href]').each((_, element) => {
      try {
        const href = $(element).attr('href')?.trim();
        if (href && href.length <= CONTENT_LIMITS.maxUrlLength) {
          const url = new URL(href, baseUrl);
          if (urlPattern.test(url.href)) {
            links.add(url.href);
          }
        }
      } catch (error) {
        // Skip invalid URLs
      }
    });

    return Array.from(links).slice(0, CONTENT_LIMITS.maxLinks);
  } catch (error) {
    throw new Error(`Link extraction failed: ${error.message}`);
  }
}

/**
 * Enhanced tabular data extraction with structure validation
 * @param html - HTML content containing tables
 * @returns Validated and structured table data
 */
export function extractTables(html: string): Array<Record<string, string>> {
  if (!html) {
    throw new Error('Invalid HTML input');
  }

  try {
    const $ = cheerio.load(html);
    const tables: Array<Record<string, string>> = [];

    $('table').each((_, table) => {
      const headers: string[] = [];
      const rows: Array<Record<string, string>> = [];

      // Extract headers
      $(table).find('th').each((_, th) => {
        headers.push($(th).text().trim());
      });

      // Extract rows
      $(table).find('tr').each((_, tr) => {
        if (rows.length >= CONTENT_LIMITS.maxTableRows) return false;

        const row: Record<string, string> = {};
        $(tr).find('td').each((colIndex, td) => {
          if (headers[colIndex]) {
            row[headers[colIndex]] = $(td).text().trim();
          }
        });

        if (Object.keys(row).length > 0) {
          rows.push(row);
        }
      });

      if (headers.length > 0 && rows.length > 0) {
        tables.push(...rows);
      }
    });

    return tables;
  } catch (error) {
    throw new Error(`Table extraction failed: ${error.message}`);
  }
}

/**
 * Calculate content completeness score
 * @param content - Content to analyze
 * @returns Completeness score between 0 and 1
 */
function calculateCompleteness(content: string): number {
  if (!content) return 0;
  
  const words = content.split(/\s+/).filter(Boolean);
  const sentences = content.split(/[.!?]+/).filter(Boolean);
  
  if (words.length === 0) return 0;
  
  const avgWordsPerSentence = words.length / sentences.length;
  return Math.min(avgWordsPerSentence / 20, 1); // Normalize to 0-1 range
}

/**
 * Calculate content consistency score
 * @param content - Content to analyze
 * @returns Consistency score between 0 and 1
 */
function calculateConsistency(content: string): number {
  if (!content) return 0;
  
  const lines = content.split('\n').filter(Boolean);
  if (lines.length <= 1) return 1;
  
  const lengths = lines.map(line => line.length);
  const avg = lengths.reduce((a, b) => a + b) / lengths.length;
  const variance = lengths.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / lengths.length;
  
  return Math.max(0, 1 - Math.sqrt(variance) / avg);
}