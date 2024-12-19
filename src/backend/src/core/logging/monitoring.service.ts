/**
 * @fileoverview Core monitoring service that integrates with Google Cloud Monitoring for metrics collection, alerting, and observability
 * @version 1.0.0
 */

import { injectable } from 'inversify';
import { MetricServiceClient } from '@google-cloud/monitoring'; // ^3.0.0
import { trace, Span, SpanKind, SpanStatusCode } from '@opentelemetry/api'; // ^1.12.0
import * as prometheus from 'prom-client'; // ^14.0.0
import { LoggerService } from './logger.service';
import { GCPConfig } from '../interfaces/config.interface';

/**
 * Interface for metric data point
 */
interface MetricDataPoint {
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
}

/**
 * Interface for alert condition
 */
interface AlertCondition {
  filter: string;
  duration: string;
  comparison: string;
  threshold: number;
  aggregations?: Array<{
    alignmentPeriod: string;
    crossSeriesReducer: string;
    perSeriesAligner: string;
  }>;
}

/**
 * Interface for notification channel
 */
interface NotificationChannel {
  type: string;
  labels: Record<string, string>;
}

/**
 * Core monitoring service that provides comprehensive system monitoring functionality
 */
@injectable()
export class MonitoringService {
  private metricClient: MetricServiceClient;
  private metricsRegistry: prometheus.Registry;
  private tracer: any;
  private metricBuffer: Map<string, MetricDataPoint[]>;
  private readonly BUFFER_FLUSH_INTERVAL = 60000; // 1 minute
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly PROJECT_PATH: string;

  constructor(
    private logger: LoggerService,
    private gcpConfig: GCPConfig
  ) {
    this.PROJECT_PATH = `projects/${this.gcpConfig.projectId}`;
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring components and configurations
   */
  private initializeMonitoring(): void {
    // Initialize Google Cloud Monitoring client with retry configuration
    this.metricClient = new MetricServiceClient({
      projectId: this.gcpConfig.projectId,
      retry: {
        initialRetryDelayMillis: 100,
        retryDelayMultiplier: 1.3,
        maxRetryDelayMillis: 60000,
        maxAttempts: 5
      }
    });

    // Initialize Prometheus registry with default collectors
    this.metricsRegistry = new prometheus.Registry();
    prometheus.collectDefaultMetrics({ register: this.metricsRegistry });

    // Initialize OpenTelemetry tracer
    this.tracer = trace.getTracer('pharma-pipeline', '1.0.0');

    // Initialize metric buffer
    this.metricBuffer = new Map();

    // Start buffer flush interval
    setInterval(() => this.flushMetricBuffer(), this.BUFFER_FLUSH_INTERVAL);
  }

  /**
   * Record a custom metric with validation and buffering
   */
  public async recordMetric(
    metricName: string,
    value: number,
    labels: Record<string, string> = {}
  ): Promise<void> {
    try {
      this.validateMetricInput(metricName, value, labels);

      const dataPoint: MetricDataPoint = {
        value,
        timestamp: new Date(),
        labels: this.sanitizeLabels(labels)
      };

      // Buffer the metric data point
      this.bufferMetricDataPoint(metricName, dataPoint);

      // Update Prometheus metric
      this.updatePrometheusMetric(metricName, value, labels);
    } catch (error) {
      await this.logger.error('Failed to record metric', error as Error, {
        metricName,
        value,
        labels
      });
      throw error;
    }
  }

  /**
   * Start a new trace span with context propagation
   */
  public startSpan(name: string, attributes: Record<string, string> = {}): Span {
    const ctx = trace.getSpanContext(trace.getActiveSpan()?.context() || trace.context.active());
    
    return this.tracer.startSpan(name, {
      kind: SpanKind.INTERNAL,
      attributes: {
        ...attributes,
        'service.name': 'pharma-pipeline',
        'service.version': process.env.npm_package_version || '1.0.0'
      },
      links: ctx ? [{ context: ctx }] : undefined
    });
  }

  /**
   * Create a new alerting policy with notification channels
   */
  public async createAlert(
    alertName: string,
    conditions: AlertCondition[],
    notificationChannels: NotificationChannel[]
  ): Promise<string> {
    try {
      const [channels] = await this.metricClient.createNotificationChannel({
        parent: this.PROJECT_PATH,
        notificationChannel: {
          displayName: `${alertName}-channel`,
          type: notificationChannels[0].type,
          labels: notificationChannels[0].labels
        }
      });

      const [alertPolicy] = await this.metricClient.createAlertPolicy({
        parent: this.PROJECT_PATH,
        alertPolicy: {
          displayName: alertName,
          conditions: conditions.map(condition => ({
            displayName: `${alertName}-condition`,
            conditionThreshold: {
              filter: condition.filter,
              duration: condition.duration,
              comparison: condition.comparison,
              thresholdValue: condition.threshold,
              aggregations: condition.aggregations
            }
          })),
          notificationChannels: [channels.name],
          documentation: {
            content: `Alert policy for ${alertName}`,
            mimeType: 'text/markdown'
          }
        }
      });

      return alertPolicy.name;
    } catch (error) {
      await this.logger.error('Failed to create alert policy', error as Error, {
        alertName,
        conditions,
        notificationChannels
      });
      throw error;
    }
  }

  /**
   * Retrieve metric data with filtering and aggregation
   */
  public async getMetrics(
    metricName: string,
    timeRange: { startTime: Date; endTime: Date },
    filters: Record<string, string> = {}
  ): Promise<Array<any>> {
    try {
      const filterString = this.buildMetricFilter(metricName, filters);

      const [timeSeries] = await this.metricClient.listTimeSeries({
        name: this.PROJECT_PATH,
        filter: filterString,
        interval: {
          startTime: {
            seconds: Math.floor(timeRange.startTime.getTime() / 1000)
          },
          endTime: {
            seconds: Math.floor(timeRange.endTime.getTime() / 1000)
          }
        }
      });

      return timeSeries;
    } catch (error) {
      await this.logger.error('Failed to retrieve metrics', error as Error, {
        metricName,
        timeRange,
        filters
      });
      throw error;
    }
  }

  /**
   * Validate metric input parameters
   */
  private validateMetricInput(
    metricName: string,
    value: number,
    labels: Record<string, string>
  ): void {
    if (!metricName || typeof metricName !== 'string') {
      throw new Error('Invalid metric name');
    }

    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('Invalid metric value');
    }

    if (Object.keys(labels).length > 10) {
      throw new Error('Too many metric labels');
    }
  }

  /**
   * Sanitize metric labels
   */
  private sanitizeLabels(labels: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels)) {
      sanitized[key.replace(/[^a-zA-Z0-9_]/g, '_')] = String(value);
    }
    return sanitized;
  }

  /**
   * Buffer metric data point for batch processing
   */
  private bufferMetricDataPoint(metricName: string, dataPoint: MetricDataPoint): void {
    if (!this.metricBuffer.has(metricName)) {
      this.metricBuffer.set(metricName, []);
    }

    const buffer = this.metricBuffer.get(metricName)!;
    buffer.push(dataPoint);

    if (buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushMetricBuffer(metricName);
    }
  }

  /**
   * Flush metric buffer to Cloud Monitoring
   */
  private async flushMetricBuffer(metricName?: string): Promise<void> {
    const metricsToFlush = metricName 
      ? [[metricName, this.metricBuffer.get(metricName)!]]
      : Array.from(this.metricBuffer.entries());

    for (const [name, dataPoints] of metricsToFlush) {
      if (!dataPoints || dataPoints.length === 0) continue;

      try {
        await this.metricClient.createTimeSeries({
          name: this.PROJECT_PATH,
          timeSeries: [{
            metric: {
              type: `custom.googleapis.com/${name}`,
              labels: dataPoints[0].labels
            },
            resource: {
              type: 'cloud_run_revision',
              labels: {
                project_id: this.gcpConfig.projectId,
                location: this.gcpConfig.region,
                service_name: 'pharma-pipeline'
              }
            },
            points: dataPoints.map(dp => ({
              interval: {
                endTime: {
                  seconds: Math.floor(dp.timestamp.getTime() / 1000),
                  nanos: (dp.timestamp.getTime() % 1000) * 1e6
                }
              },
              value: {
                doubleValue: dp.value
              }
            }))
          }]
        });

        this.metricBuffer.set(name, []);
      } catch (error) {
        await this.logger.error('Failed to flush metric buffer', error as Error, {
          metricName: name,
          dataPointCount: dataPoints.length
        });
      }
    }
  }

  /**
   * Update Prometheus metric
   */
  private updatePrometheusMetric(
    metricName: string,
    value: number,
    labels: Record<string, string>
  ): void {
    const metric = this.metricsRegistry.getSingleMetric(metricName) ||
      new prometheus.Gauge({
        name: metricName,
        help: `Custom metric ${metricName}`,
        labelNames: Object.keys(labels),
        registers: [this.metricsRegistry]
      });

    metric.set(labels, value);
  }

  /**
   * Build metric filter string
   */
  private buildMetricFilter(
    metricName: string,
    filters: Record<string, string>
  ): string {
    let filterString = `metric.type = "custom.googleapis.com/${metricName}"`;
    
    for (const [key, value] of Object.entries(filters)) {
      filterString += ` AND metric.labels.${key} = "${value}"`;
    }

    return filterString;
  }
}