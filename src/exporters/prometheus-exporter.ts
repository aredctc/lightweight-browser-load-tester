import {
  PrometheusConfiguration,
  BrowserMetrics,
  DRMMetrics,
  NetworkMetrics,
  ErrorLog,
  TestSummary
} from '../types/index.js';

/**
 * Prometheus metric sample in RemoteWrite format
 */
interface PrometheusSample {
  labels: Record<string, string>;
  value: number;
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Prometheus metric with samples
 */
interface PrometheusMetric {
  name: string;
  samples: PrometheusSample[];
}

/**
 * Prometheus RemoteWrite request payload
 */
interface PrometheusWriteRequest {
  timeseries: Array<{
    labels: Array<{ name: string; value: string }>;
    samples: Array<{ value: number; timestamp: number }>;
  }>;
}

/**
 * Exports metrics to Prometheus RemoteWrite endpoint in real-time
 */
export class PrometheusExporter {
  private config: PrometheusConfiguration;
  private metricBuffer: PrometheusMetric[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(config: PrometheusConfiguration) {
    this.config = {
      batchSize: 100,
      flushInterval: 10,
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Export browser metrics to Prometheus
   */
  async exportBrowserMetrics(metrics: BrowserMetrics): Promise<void> {
    if (!this.config.enabled) return;

    const timestamp = Date.now();
    const baseLabels = {
      instance_id: metrics.instanceId,
      job: 'browser_load_test'
    };

    const prometheusMetrics: PrometheusMetric[] = [
      {
        name: 'browser_memory_usage_mb',
        samples: [{
          labels: baseLabels,
          value: metrics.memoryUsage,
          timestamp
        }]
      },
      {
        name: 'browser_cpu_usage_percent',
        samples: [{
          labels: baseLabels,
          value: metrics.cpuUsage,
          timestamp
        }]
      },
      {
        name: 'browser_request_count_total',
        samples: [{
          labels: baseLabels,
          value: metrics.requestCount,
          timestamp
        }]
      },
      {
        name: 'browser_error_count_total',
        samples: [{
          labels: baseLabels,
          value: metrics.errorCount,
          timestamp
        }]
      },
      {
        name: 'browser_uptime_seconds',
        samples: [{
          labels: baseLabels,
          value: metrics.uptime,
          timestamp
        }]
      }
    ];

    this.addMetricsToBuffer(prometheusMetrics);
  }

  /**
   * Export DRM metrics to Prometheus
   */
  async exportDRMMetrics(metrics: DRMMetrics): Promise<void> {
    if (!this.config.enabled) return;

    const timestamp = Date.now();
    const baseLabels = {
      drm_type: metrics.drmType,
      job: 'browser_load_test'
    };

    const prometheusMetrics: PrometheusMetric[] = [
      {
        name: 'drm_license_request_count_total',
        samples: [{
          labels: baseLabels,
          value: metrics.licenseRequestCount,
          timestamp
        }]
      },
      {
        name: 'drm_average_license_time_ms',
        samples: [{
          labels: baseLabels,
          value: metrics.averageLicenseTime,
          timestamp
        }]
      },
      {
        name: 'drm_license_success_rate',
        samples: [{
          labels: baseLabels,
          value: metrics.licenseSuccessRate,
          timestamp
        }]
      },
      {
        name: 'drm_error_count_total',
        samples: [{
          labels: baseLabels,
          value: metrics.errors.length,
          timestamp
        }]
      }
    ];

    this.addMetricsToBuffer(prometheusMetrics);
  }

  /**
   * Export network metrics to Prometheus
   */
  async exportNetworkMetrics(metrics: NetworkMetrics[]): Promise<void> {
    if (!this.config.enabled || metrics.length === 0) return;

    const prometheusMetrics: PrometheusMetric[] = [];

    for (const metric of metrics) {
      const timestamp = metric.timestamp.getTime();
      const baseLabels = {
        method: metric.method,
        status_code: metric.statusCode.toString(),
        streaming_related: (metric.isStreamingRelated || false).toString(),
        streaming_type: metric.streamingType || 'unknown',
        job: 'browser_load_test'
      };

      prometheusMetrics.push(
        {
          name: 'http_request_duration_ms',
          samples: [{
            labels: baseLabels,
            value: metric.responseTime,
            timestamp
          }]
        },
        {
          name: 'http_request_size_bytes',
          samples: [{
            labels: baseLabels,
            value: metric.requestSize,
            timestamp
          }]
        },
        {
          name: 'http_response_size_bytes',
          samples: [{
            labels: baseLabels,
            value: metric.responseSize,
            timestamp
          }]
        }
      );
    }

    this.addMetricsToBuffer(prometheusMetrics);
  }

  /**
   * Export test summary metrics to Prometheus
   */
  async exportTestSummary(summary: TestSummary): Promise<void> {
    if (!this.config.enabled) return;

    const timestamp = Date.now();
    const baseLabels = { job: 'browser_load_test' };

    const prometheusMetrics: PrometheusMetric[] = [
      {
        name: 'test_total_requests',
        samples: [{
          labels: baseLabels,
          value: summary.totalRequests,
          timestamp
        }]
      },
      {
        name: 'test_successful_requests',
        samples: [{
          labels: baseLabels,
          value: summary.successfulRequests,
          timestamp
        }]
      },
      {
        name: 'test_failed_requests',
        samples: [{
          labels: baseLabels,
          value: summary.failedRequests,
          timestamp
        }]
      },
      {
        name: 'test_average_response_time_ms',
        samples: [{
          labels: baseLabels,
          value: summary.averageResponseTime,
          timestamp
        }]
      },
      {
        name: 'test_peak_concurrent_users',
        samples: [{
          labels: baseLabels,
          value: summary.peakConcurrentUsers,
          timestamp
        }]
      },
      {
        name: 'test_duration_seconds',
        samples: [{
          labels: baseLabels,
          value: summary.testDuration,
          timestamp
        }]
      }
    ];

    this.addMetricsToBuffer(prometheusMetrics);
  }

  /**
   * Export error metrics to Prometheus
   */
  async exportErrorMetrics(errors: ErrorLog[]): Promise<void> {
    if (!this.config.enabled || errors.length === 0) return;

    const timestamp = Date.now();
    
    // Count errors by level
    const errorCounts = errors.reduce((acc, error) => {
      acc[error.level] = (acc[error.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const prometheusMetrics: PrometheusMetric[] = [];

    for (const [level, count] of Object.entries(errorCounts)) {
      prometheusMetrics.push({
        name: 'test_error_count_total',
        samples: [{
          labels: {
            level,
            job: 'browser_load_test'
          },
          value: count,
          timestamp
        }]
      });
    }

    this.addMetricsToBuffer(prometheusMetrics);
  }

  /**
   * Manually flush all buffered metrics to Prometheus
   */
  async flush(): Promise<void> {
    if (!this.config.enabled || this.metricBuffer.length === 0) return;

    const metricsToSend = [...this.metricBuffer];
    this.metricBuffer = [];

    await this.sendMetricsToPrometheus(metricsToSend);
  }

  /**
   * Shutdown the exporter and flush remaining metrics
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    await this.flush();
  }

  /**
   * Add metrics to the buffer and trigger flush if batch size is reached
   */
  private addMetricsToBuffer(metrics: PrometheusMetric[]): void {
    this.metricBuffer.push(...metrics);

    if (this.metricBuffer.length >= (this.config.batchSize || 100)) {
      // Don't await to avoid blocking
      this.flush().catch(error => {
        console.error('Failed to flush metrics to Prometheus:', error);
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

    const intervalMs = (this.config.flushInterval || 10) * 1000;
    this.flushTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.flush().catch(error => {
          console.error('Failed to flush metrics to Prometheus:', error);
        });
      }
    }, intervalMs);
  }  /**

   * Send metrics to Prometheus RemoteWrite endpoint
   */
  private async sendMetricsToPrometheus(metrics: PrometheusMetric[]): Promise<void> {
    if (metrics.length === 0) return;

    const writeRequest = this.convertToPrometheusFormat(metrics);
    const payload = this.encodePrometheusPayload(writeRequest);

    let lastError: Error | null = null;
    const maxRetries = this.config.retryAttempts || 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.makeHttpRequest(payload);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = (this.config.retryDelay || 1000) * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed to send metrics to Prometheus after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Convert internal metrics format to Prometheus RemoteWrite format
   */
  private convertToPrometheusFormat(metrics: PrometheusMetric[]): PrometheusWriteRequest {
    const timeseries: PrometheusWriteRequest['timeseries'] = [];

    for (const metric of metrics) {
      for (const sample of metric.samples) {
        // Add metric name as __name__ label
        const labels = [
          { name: '__name__', value: metric.name },
          ...Object.entries(sample.labels).map(([name, value]) => ({ name, value }))
        ];

        timeseries.push({
          labels,
          samples: [{
            value: sample.value,
            timestamp: sample.timestamp
          }]
        });
      }
    }

    return { timeseries };
  }

  /**
   * Encode Prometheus payload using Protocol Buffers (simplified JSON for now)
   * In production, you might want to use actual protobuf encoding for better performance
   */
  private encodePrometheusPayload(writeRequest: PrometheusWriteRequest): Buffer {
    // For simplicity, we're using JSON encoding
    // In production, consider using protobuf for better compression and performance
    const jsonPayload = JSON.stringify(writeRequest);
    return Buffer.from(jsonPayload, 'utf-8');
  }

  /**
   * Make HTTP request to Prometheus RemoteWrite endpoint
   */
  private async makeHttpRequest(payload: Buffer): Promise<void> {
    const url = new URL(this.config.remoteWriteUrl);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', // Use application/x-protobuf for real protobuf
      'Content-Length': payload.length.toString(),
      'User-Agent': 'lightweight-browser-load-tester/1.0.0',
      ...this.config.headers
    };

    // Add authentication if provided
    if (this.config.username && this.config.password) {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const requestOptions = {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(this.config.timeout || 5000)
    };

    try {
      const response = await fetch(this.config.remoteWriteUrl, requestOptions);
      
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
   * Get current buffer size for monitoring
   */
  getBufferSize(): number {
    return this.metricBuffer.length;
  }

  /**
   * Get configuration for debugging
   */
  getConfig(): Readonly<PrometheusConfiguration> {
    return { ...this.config };
  }
}