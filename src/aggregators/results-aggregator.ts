import {
    TestResults,
    BrowserMetrics,
    DRMMetrics,
    NetworkMetrics,
    ErrorLog,
    PrometheusConfiguration
} from '../types/index.js';
import { PrometheusExporter } from '../exporters/prometheus-exporter.js';

/**
 * Configuration for report generation
 */
export interface ReportConfig {
    outputPath?: string;
    formats: ('html' | 'json' | 'csv')[];
    includeDetailedMetrics?: boolean;
    includeErrorAnalysis?: boolean;
}

/**
 * Aggregates test results from multiple browser instances and generates reports
 */
export class ResultsAggregator {
    private testResults: TestResults;
    private startTime: Date;
    private endTime?: Date;
    private prometheusExporter?: PrometheusExporter;

    constructor(prometheusConfig?: PrometheusConfiguration) {
        this.testResults = {
            summary: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                peakConcurrentUsers: 0,
                testDuration: 0
            },
            browserMetrics: [],
            drmMetrics: [],
            networkMetrics: [],
            errors: []
        };
        this.startTime = new Date();
        
        // Initialize Prometheus exporter if configuration is provided
        if (prometheusConfig) {
            this.prometheusExporter = new PrometheusExporter(prometheusConfig);
        }
    }

    /**
     * Add browser metrics from a single instance
     */
    addBrowserMetrics(metrics: BrowserMetrics): void {
        this.testResults.browserMetrics.push(metrics);
        
        // Export to Prometheus in real-time if configured
        if (this.prometheusExporter) {
            this.prometheusExporter.exportBrowserMetrics(metrics).catch(error => {
                console.error('Failed to export browser metrics to Prometheus:', error);
            });
        }
    }

    /**
     * Add DRM metrics
     */
    addDRMMetrics(metrics: DRMMetrics): void {
        this.testResults.drmMetrics.push(metrics);
        
        // Export to Prometheus in real-time if configured
        if (this.prometheusExporter) {
            this.prometheusExporter.exportDRMMetrics(metrics).catch(error => {
                console.error('Failed to export DRM metrics to Prometheus:', error);
            });
        }
    }

    /**
     * Add network metrics
     */
    addNetworkMetrics(metrics: NetworkMetrics[]): void {
        this.testResults.networkMetrics.push(...metrics);
        
        // Export to Prometheus in real-time if configured
        if (this.prometheusExporter && metrics.length > 0) {
            this.prometheusExporter.exportNetworkMetrics(metrics).catch(error => {
                console.error('Failed to export network metrics to Prometheus:', error);
            });
        }
    }

    /**
     * Add error log entry
     */
    addError(error: ErrorLog): void {
        this.testResults.errors.push(error);
        
        // Export to Prometheus in real-time if configured
        if (this.prometheusExporter) {
            this.prometheusExporter.exportErrorMetrics([error]).catch(error => {
                console.error('Failed to export error metrics to Prometheus:', error);
            });
        }
    }

    /**
     * Finalize test results and calculate summary statistics
     */
    finalize(): void {
        this.endTime = new Date();
        this.calculateSummary();
        
        // Export final summary to Prometheus if configured
        if (this.prometheusExporter) {
            this.prometheusExporter.exportTestSummary(this.testResults.summary).catch(error => {
                console.error('Failed to export test summary to Prometheus:', error);
            });
        }
    }

    /**
     * Get the aggregated test results
     */
    getResults(): TestResults {
        return { ...this.testResults };
    }

    /**
     * Shutdown the aggregator and flush any remaining Prometheus metrics
     */
    async shutdown(): Promise<void> {
        if (this.prometheusExporter) {
            await this.prometheusExporter.shutdown();
        }
    }

    /**
     * Generate reports in specified formats
     */
    async generateReports(config: ReportConfig): Promise<void> {
        if (!this.endTime) {
            this.finalize();
        }

        for (const format of config.formats) {
            switch (format) {
                case 'json':
                    await this.generateJSONReport(config);
                    break;
                case 'html':
                    await this.generateHTMLReport(config);
                    break;
                case 'csv':
                    await this.generateCSVReport(config);
                    break;
            }
        }
    }

    /**
     * Calculate summary statistics from collected metrics
     */
    private calculateSummary(): void {
        const networkMetrics = this.testResults.networkMetrics;
        const browserMetrics = this.testResults.browserMetrics;

        // Calculate request statistics
        this.testResults.summary.totalRequests = networkMetrics.length;
        this.testResults.summary.successfulRequests = networkMetrics.filter(
            m => m.statusCode >= 200 && m.statusCode < 400
        ).length;
        this.testResults.summary.failedRequests =
            this.testResults.summary.totalRequests - this.testResults.summary.successfulRequests;

        // Calculate average response time
        if (networkMetrics.length > 0) {
            this.testResults.summary.averageResponseTime =
                networkMetrics.reduce((sum, m) => sum + m.responseTime, 0) / networkMetrics.length;
        }

        // Calculate peak concurrent users (max active browser instances)
        this.testResults.summary.peakConcurrentUsers = browserMetrics.length;

        // Calculate test duration
        if (this.endTime) {
            this.testResults.summary.testDuration =
                (this.endTime.getTime() - this.startTime.getTime()) / 1000;
        }
    }

    /**
     * Generate JSON report
     */
    private async generateJSONReport(config: ReportConfig): Promise<void> {
        const fs = await import('fs/promises');
        const path = await import('path');

        const outputPath = config.outputPath || './test-results';
        const filename = path.join(outputPath, `load-test-results-${Date.now()}.json`);

        await fs.mkdir(outputPath, { recursive: true });
        await fs.writeFile(filename, JSON.stringify(this.testResults, null, 2));
    }

    /**
     * Generate HTML report
     */
    private async generateHTMLReport(config: ReportConfig): Promise<void> {
        const fs = await import('fs/promises');
        const path = await import('path');

        const outputPath = config.outputPath || './test-results';
        const filename = path.join(outputPath, `load-test-results-${Date.now()}.html`);

        const html = this.generateHTMLContent(config);

        await fs.mkdir(outputPath, { recursive: true });
        await fs.writeFile(filename, html);
    }

    /**
     * Generate CSV report
     */
    private async generateCSVReport(config: ReportConfig): Promise<void> {
        const fs = await import('fs/promises');
        const path = await import('path');

        const outputPath = config.outputPath || './test-results';
        const timestamp = Date.now();

        await fs.mkdir(outputPath, { recursive: true });

        // Generate summary CSV
        const summaryCSV = this.generateSummaryCSV();
        await fs.writeFile(
            path.join(outputPath, `load-test-summary-${timestamp}.csv`),
            summaryCSV
        );

        // Generate network metrics CSV
        const networkCSV = this.generateNetworkMetricsCSV();
        await fs.writeFile(
            path.join(outputPath, `load-test-network-${timestamp}.csv`),
            networkCSV
        );

        // Generate browser metrics CSV
        const browserCSV = this.generateBrowserMetricsCSV();
        await fs.writeFile(
            path.join(outputPath, `load-test-browser-${timestamp}.csv`),
            browserCSV
        );
    }  /**
 
  * Generate HTML content for the report
   */
    private generateHTMLContent(config: ReportConfig): string {
        const summary = this.testResults.summary;
        const errors = this.testResults.errors;
        const drmMetrics = this.testResults.drmMetrics;

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Load Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; margin-top: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .error { color: #dc3545; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .chart-placeholder { background: #f8f9fa; height: 200px; display: flex; align-items: center; justify-content: center; border-radius: 6px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Load Test Results</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
            <p>Test Duration: ${summary.testDuration.toFixed(2)} seconds</p>
        </div>

        <div class="section">
            <h2>Summary</h2>
            <div class="summary">
                <div class="metric-card">
                    <div class="metric-value">${summary.totalRequests}</div>
                    <div class="metric-label">Total Requests</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value ${summary.successfulRequests > 0 ? 'success' : ''}">${summary.successfulRequests}</div>
                    <div class="metric-label">Successful Requests</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value ${summary.failedRequests > 0 ? 'error' : ''}">${summary.failedRequests}</div>
                    <div class="metric-label">Failed Requests</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${summary.averageResponseTime.toFixed(2)}ms</div>
                    <div class="metric-label">Avg Response Time</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${summary.peakConcurrentUsers}</div>
                    <div class="metric-label">Peak Concurrent Users</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${((summary.successfulRequests / summary.totalRequests) * 100).toFixed(1)}%</div>
                    <div class="metric-label">Success Rate</div>
                </div>
            </div>
        </div>

        ${config.includeDetailedMetrics ? this.generateBrowserMetricsHTML() : ''}
        ${drmMetrics.length > 0 ? this.generateDRMMetricsHTML() : ''}
        ${config.includeErrorAnalysis && errors.length > 0 ? this.generateErrorAnalysisHTML() : ''}
    </div>
</body>
</html>`;
    }

    /**
     * Generate browser metrics section for HTML report
     */
    private generateBrowserMetricsHTML(): string {
        const browserMetrics = this.testResults.browserMetrics;

        if (browserMetrics.length === 0) {
            return '';
        }

        const rows = browserMetrics.map(metrics => `
      <tr>
        <td>${metrics.instanceId}</td>
        <td>${metrics.memoryUsage.toFixed(2)} MB</td>
        <td>${metrics.cpuUsage.toFixed(1)}%</td>
        <td>${metrics.requestCount}</td>
        <td>${metrics.errorCount}</td>
        <td>${metrics.uptime.toFixed(2)}s</td>
      </tr>
    `).join('');

        return `
      <div class="section">
        <h2>Browser Instance Metrics</h2>
        <table>
          <thead>
            <tr>
              <th>Instance ID</th>
              <th>Memory Usage</th>
              <th>CPU Usage</th>
              <th>Requests</th>
              <th>Errors</th>
              <th>Uptime</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
    }

    /**
     * Generate DRM metrics section for HTML report
     */
    private generateDRMMetricsHTML(): string {
        const drmMetrics = this.testResults.drmMetrics;

        const rows = drmMetrics.map(metrics => `
      <tr>
        <td>${metrics.drmType}</td>
        <td>${metrics.licenseRequestCount}</td>
        <td>${metrics.averageLicenseTime.toFixed(2)}ms</td>
        <td>${(metrics.licenseSuccessRate * 100).toFixed(1)}%</td>
        <td>${metrics.errors.length}</td>
      </tr>
    `).join('');

        return `
      <div class="section">
        <h2>DRM Metrics</h2>
        <table>
          <thead>
            <tr>
              <th>DRM Type</th>
              <th>License Requests</th>
              <th>Avg License Time</th>
              <th>Success Rate</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
    }

    /**
     * Generate error analysis section for HTML report
     */
    private generateErrorAnalysisHTML(): string {
        const errors = this.testResults.errors;

        const errorRows = errors.slice(0, 50).map(error => `
      <tr>
        <td>${error.timestamp.toLocaleString()}</td>
        <td><span class="${error.level}">${error.level.toUpperCase()}</span></td>
        <td>${error.message}</td>
        <td>${error.context ? JSON.stringify(error.context) : '-'}</td>
      </tr>
    `).join('');

        return `
      <div class="section">
        <h2>Error Analysis</h2>
        <p>Showing ${Math.min(50, errors.length)} of ${errors.length} total errors</p>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Level</th>
              <th>Message</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            ${errorRows}
          </tbody>
        </table>
      </div>
    `;
    }

    /**
     * Generate summary CSV content
     */
    private generateSummaryCSV(): string {
        const summary = this.testResults.summary;
        const headers = [
            'Total Requests',
            'Successful Requests',
            'Failed Requests',
            'Average Response Time (ms)',
            'Peak Concurrent Users',
            'Test Duration (s)',
            'Success Rate (%)'
        ];

        const values = [
            summary.totalRequests,
            summary.successfulRequests,
            summary.failedRequests,
            summary.averageResponseTime.toFixed(2),
            summary.peakConcurrentUsers,
            summary.testDuration.toFixed(2),
            ((summary.successfulRequests / summary.totalRequests) * 100).toFixed(1)
        ];

        return headers.join(',') + '\n' + values.join(',');
    }

    /**
     * Generate network metrics CSV content
     */
    private generateNetworkMetricsCSV(): string {
        const headers = [
            'URL',
            'Method',
            'Response Time (ms)',
            'Status Code',
            'Timestamp',
            'Request Size (bytes)',
            'Response Size (bytes)',
            'Streaming Related',
            'Streaming Type'
        ];

        const rows = this.testResults.networkMetrics.map(metric => [
            `"${metric.url}"`,
            metric.method,
            metric.responseTime,
            metric.statusCode,
            metric.timestamp.toISOString(),
            metric.requestSize,
            metric.responseSize,
            metric.isStreamingRelated || false,
            metric.streamingType || ''
        ].join(','));

        return headers.join(',') + '\n' + rows.join('\n');
    }

    /**
     * Generate browser metrics CSV content
     */
    private generateBrowserMetricsCSV(): string {
        const headers = [
            'Instance ID',
            'Memory Usage (MB)',
            'CPU Usage (%)',
            'Request Count',
            'Error Count',
            'Uptime (s)'
        ];

        const rows = this.testResults.browserMetrics.map(metric => [
            metric.instanceId,
            metric.memoryUsage.toFixed(2),
            metric.cpuUsage.toFixed(1),
            metric.requestCount,
            metric.errorCount,
            metric.uptime.toFixed(2)
        ].join(','));

        return headers.join(',') + '\n' + rows.join('\n');
    }
}