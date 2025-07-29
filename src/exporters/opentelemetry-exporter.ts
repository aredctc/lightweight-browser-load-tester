import {
  OpenTelemetryConfiguration,
  BrowserMetrics,
  DRMMetrics,
  NetworkMetrics,
  ErrorLog,
  TestSummary
} from '../types';

/**
 * OpenTelemetry metric data structure
 */
interface OTelMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
  type: 'counter' | 'gauge' | 'histogram';
}

/**
 * OTLP request payload structure
 */
interface OTLPMetricRequest {
  resourceMetrics: Array<{
    resource: {
      attributes: Array<{ key: string; value: { stringValue: string } }>;
    };
    scopeMetrics: Array<{
      scope: {
        name: string;
        version: string;
      };
      metrics: Array<{
        name: string;
        description?: string;
        unit?: string;
        gauge?: {
          dataPoints: Array<{
            attributes: Array<{ key: string; value: { stringValue: string } }>;
            timeUnixNano: string;
            asDouble: number;
          }>;
        };
        sum?: {
          dataPoints: Array<{
            attributes: Array<{ key: string; value: { stringValue: string } }>;
            timeUnixNano: string;
            asDouble: number;
          }>;
          aggregationTemporality: number;
          isMonotonic: boolean;
        };
        histogram?: {
          dataPoints: Array<{
            attributes: Array<{ key: string; value: { stringValue: string } }>;
            timeUnixNano: string;
            count: string;
            sum: number;
            bucketCounts: string[];
            explicitBounds: number[];
          }>;
          aggregationTemporality: number;
        };
      }>;
    }>;
  }>;
}

/**
 * Exports metrics to OpenTelemetry OTLP endpoint in real-time
 * This is a simplified implementation that demonstrates OpenTelemetry integration
 */
export class OpenTelemetryExporter {
  private config: OpenTelemetryConfiguration;
  private metricBuffer: OTelMetric[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isInitialized = false;
  private isShuttingDown = false;

  constructor(config: OpenTelemetryConfiguration) {
    this.config = {
      serviceName: 'lightweight-browser-load-tester',
      serviceVersion: '1.0.0',
      timeout: 5000,
      compression: 'gzip',
      batchTimeout: 5000,
      maxExportBatchSize: 512,
      maxQueueSize: 2048,
      exportTimeout: 30000,
      ...config
    };

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Initialize OpenTelemetry exporter (simplified implementation)
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled || this.isInitialized) {
      return;
    }

    try {
      // Simplified initialization - in a real implementation, this would set up the OpenTelemetry SDK
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize OpenTelemetry exporter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export browser metrics to OpenTelemetry
   */
  async exportBrowserMetrics(metrics: BrowserMetrics): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) return;

    const timestamp = Date.now();
    const baseLabels = {
      instance_id: metrics.instanceId,
      service: this.config.serviceName!
    };

    const otelMetrics: OTelMetric[] = [
      {
        name: 'browser_memory_usage_mb',
        value: metrics.memoryUsage,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      },
      {
        name: 'browser_cpu_usage_percent',
        value: metrics.cpuUsage,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      },
      {
        name: 'browser_request_count_total',
        value: metrics.requestCount,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      },
      {
        name: 'browser_error_count_total',
        value: metrics.errorCount,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      },
      {
        name: 'browser_uptime_seconds',
        value: metrics.uptime,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      }
    ];

    this.addMetricsToBuffer(otelMetrics);
  }

  /**
   * Export DRM metrics to OpenTelemetry
   */
  async exportDRMMetrics(metrics: DRMMetrics): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) return;

    const timestamp = Date.now();
    const baseLabels = {
      drm_type: metrics.drmType,
      service: this.config.serviceName!
    };

    const otelMetrics: OTelMetric[] = [
      {
        name: 'drm_license_request_count_total',
        value: metrics.licenseRequestCount,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      },
      {
        name: 'drm_average_license_time_ms',
        value: metrics.averageLicenseTime,
        labels: baseLabels,
        timestamp,
        type: 'histogram'
      },
      {
        name: 'drm_license_success_rate',
        value: metrics.licenseSuccessRate,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      },
      {
        name: 'drm_error_count_total',
        value: metrics.errors.length,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      }
    ];

    this.addMetricsToBuffer(otelMetrics);
  }

  /**
   * Export network metrics to OpenTelemetry
   */
  async exportNetworkMetrics(metrics: NetworkMetrics[]): Promise<void> {
    if (!this.config.enabled || !this.isInitialized || metrics.length === 0) return;

    const otelMetrics: OTelMetric[] = [];

    for (const metric of metrics) {
      const timestamp = metric.timestamp.getTime();
      const baseLabels = {
        method: metric.method,
        status_code: metric.statusCode.toString(),
        streaming_related: (metric.isStreamingRelated || false).toString(),
        streaming_type: metric.streamingType || 'unknown',
        service: this.config.serviceName!
      };

      otelMetrics.push(
        {
          name: 'http_request_duration_ms',
          value: metric.responseTime,
          labels: baseLabels,
          timestamp,
          type: 'histogram'
        },
        {
          name: 'http_request_size_bytes',
          value: metric.requestSize,
          labels: baseLabels,
          timestamp,
          type: 'histogram'
        },
        {
          name: 'http_response_size_bytes',
          value: metric.responseSize,
          labels: baseLabels,
          timestamp,
          type: 'histogram'
        }
      );
    }

    this.addMetricsToBuffer(otelMetrics);
  }

  /**
   * Export test summary metrics to OpenTelemetry
   */
  async exportTestSummary(summary: TestSummary): Promise<void> {
    if (!this.config.enabled || !this.isInitialized) return;

    const timestamp = Date.now();
    const baseLabels = {
      service: this.config.serviceName!
    };

    const otelMetrics: OTelMetric[] = [
      {
        name: 'test_total_requests',
        value: summary.totalRequests,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      },
      {
        name: 'test_successful_requests',
        value: summary.successfulRequests,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      },
      {
        name: 'test_failed_requests',
        value: summary.failedRequests,
        labels: baseLabels,
        timestamp,
        type: 'counter'
      },
      {
        name: 'test_average_response_time_ms',
        value: summary.averageResponseTime,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      },
      {
        name: 'test_peak_concurrent_users',
        value: summary.peakConcurrentUsers,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      },
      {
        name: 'test_duration_seconds',
        value: summary.testDuration,
        labels: baseLabels,
        timestamp,
        type: 'gauge'
      }
    ];

    this.addMetricsToBuffer(otelMetrics);
  }

  /**
   * Export error metrics to OpenTelemetry
   */
  async exportErrorMetrics(errors: ErrorLog[]): Promise<void> {
    if (!this.config.enabled || !this.isInitialized || errors.length === 0) return;

    const timestamp = Date.now();
    
    // Count errors by level
    const errorCounts = errors.reduce((acc, error) => {
      acc[error.level] = (acc[error.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const otelMetrics: OTelMetric[] = [];

    for (const [level, count] of Object.entries(errorCounts)) {
      otelMetrics.push({
        name: 'test_error_count_total',
        value: count,
        labels: {
          level,
          service: this.config.serviceName!
        },
        timestamp,
        type: 'counter'
      });
    }

    this.addMetricsToBuffer(otelMetrics);
  }

  /**
   * Add metrics to the buffer and trigger flush if batch size is reached
   */
  private addMetricsToBuffer(metrics: OTelMetric[]): void {
    this.metricBuffer.push(...metrics);

    if (this.metricBuffer.length >= (this.config.maxExportBatchSize || 512)) {
      // Don't await to avoid blocking
      this.flush().catch(error => {
        console.error('Failed to flush metrics to OpenTelemetry:', error);
      });
    }
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    const intervalMs = this.config.batchTimeout || 5000;
    this.flushTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.flush().catch(error => {
          console.error('Failed to flush metrics to OpenTelemetry:', error);
        });
      }
    }, intervalMs);
  }

  /**
   * Manually flush all buffered metrics to OpenTelemetry
   */
  async flush(): Promise<void> {
    if (!this.config.enabled || this.metricBuffer.length === 0) return;

    const metricsToSend = [...this.metricBuffer];
    this.metricBuffer = [];

    await this.sendMetricsToOTLP(metricsToSend);
  }

  /**
   * Send metrics to OpenTelemetry OTLP endpoint
   */
  private async sendMetricsToOTLP(metrics: OTelMetric[]): Promise<void> {
    if (metrics.length === 0) return;

    const otlpRequest = this.convertToOTLPFormat(metrics);
    const payload = JSON.stringify(otlpRequest);

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.makeHttpRequest(Buffer.from(payload, 'utf-8'));
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    console.error(`Failed to send metrics to OpenTelemetry after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Convert internal metrics format to OTLP format
   */
  private convertToOTLPFormat(metrics: OTelMetric[]): OTLPMetricRequest {
    const resourceMetrics = [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: this.config.serviceName! } },
          { key: 'service.version', value: { stringValue: this.config.serviceVersion! } }
        ]
      },
      scopeMetrics: [{
        scope: {
          name: this.config.serviceName!,
          version: this.config.serviceVersion!
        },
        metrics: metrics.map(metric => this.convertMetricToOTLP(metric))
      }]
    }];

    return { resourceMetrics };
  }

  /**
   * Convert a single metric to OTLP format
   */
  private convertMetricToOTLP(metric: OTelMetric): any {
    const attributes = Object.entries(metric.labels).map(([key, value]) => ({
      key,
      value: { stringValue: value }
    }));

    const timeUnixNano = (metric.timestamp * 1000000).toString(); // Convert to nanoseconds

    const baseMetric = {
      name: metric.name,
      description: `${metric.name} metric`,
      unit: this.getMetricUnit(metric.name)
    };

    switch (metric.type) {
      case 'gauge':
        return {
          ...baseMetric,
          gauge: {
            dataPoints: [{
              attributes,
              timeUnixNano,
              asDouble: metric.value
            }]
          }
        };
      
      case 'counter':
        return {
          ...baseMetric,
          sum: {
            dataPoints: [{
              attributes,
              timeUnixNano,
              asDouble: metric.value
            }],
            aggregationTemporality: 2, // CUMULATIVE
            isMonotonic: true
          }
        };
      
      case 'histogram':
        return {
          ...baseMetric,
          histogram: {
            dataPoints: [{
              attributes,
              timeUnixNano,
              count: '1',
              sum: metric.value,
              bucketCounts: ['0', '1'],
              explicitBounds: [metric.value]
            }],
            aggregationTemporality: 2 // CUMULATIVE
          }
        };
      
      default:
        return baseMetric;
    }
  }

  /**
   * Get appropriate unit for metric name
   */
  private getMetricUnit(metricName: string): string {
    if (metricName.includes('_mb')) return 'MB';
    if (metricName.includes('_percent')) return '%';
    if (metricName.includes('_seconds')) return 's';
    if (metricName.includes('_ms')) return 'ms';
    if (metricName.includes('_bytes')) return 'bytes';
    return '1';
  }

  /**
   * Make HTTP request to OpenTelemetry OTLP endpoint
   */
  private async makeHttpRequest(payload: Buffer): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': payload.length.toString(),
      'User-Agent': 'lightweight-browser-load-tester/1.0.0',
      ...this.config.headers
    };

    const requestOptions = {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(this.config.timeout || 5000)
    };

    try {
      const response = await fetch(this.config.endpoint, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.config.timeout}ms`);
        }
        throw error;
      }
      throw new Error('Unknown error occurred during HTTP request');
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the exporter and flush remaining metrics
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) return;

    this.isShuttingDown = true;

    try {
      // Clear flush timer
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = undefined;
      }

      // Flush remaining metrics
      await this.flush();
    } catch (error) {
      console.error('Error during OpenTelemetry shutdown:', error);
    } finally {
      this.isInitialized = false;
    }
  }

  /**
   * Get configuration for debugging
   */
  getConfig(): Readonly<OpenTelemetryConfiguration> {
    return { ...this.config };
  }

  /**
   * Check if the exporter is initialized
   */
  isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }
}