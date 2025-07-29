import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ResultsAggregator, ReportConfig } from './results-aggregator.js';
import {
  BrowserMetrics,
  DRMMetrics,
  NetworkMetrics,
  ErrorLog,
  TestResults,
  PrometheusConfiguration
} from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';

// Mock fs module
vi.mock('fs/promises');
vi.mock('path');

// Mock PrometheusExporter
vi.mock('../exporters/prometheus-exporter.js', () => ({
  PrometheusExporter: vi.fn().mockImplementation(() => ({
    exportBrowserMetrics: vi.fn().mockResolvedValue(undefined),
    exportDRMMetrics: vi.fn().mockResolvedValue(undefined),
    exportNetworkMetrics: vi.fn().mockResolvedValue(undefined),
    exportErrorMetrics: vi.fn().mockResolvedValue(undefined),
    exportTestSummary: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('ResultsAggregator', () => {
  let aggregator: ResultsAggregator;
  let mockBrowserMetrics: BrowserMetrics;
  let mockDRMMetrics: DRMMetrics;
  let mockNetworkMetrics: NetworkMetrics[];
  let mockErrorLog: ErrorLog;

  beforeEach(() => {
    aggregator = new ResultsAggregator();
    
    mockBrowserMetrics = {
      instanceId: 'browser-1',
      memoryUsage: 150.5,
      cpuUsage: 25.3,
      requestCount: 100,
      errorCount: 2,
      uptime: 300
    };

    mockDRMMetrics = {
      licenseRequestCount: 50,
      averageLicenseTime: 250.5,
      licenseSuccessRate: 0.96,
      drmType: 'widevine',
      errors: []
    };

    mockNetworkMetrics = [
      {
        url: 'https://example.com/api/test',
        method: 'GET',
        responseTime: 150,
        statusCode: 200,
        timestamp: new Date('2024-01-01T10:00:00Z'),
        requestSize: 1024,
        responseSize: 2048,
        isStreamingRelated: true,
        streamingType: 'manifest'
      },
      {
        url: 'https://example.com/api/fail',
        method: 'POST',
        responseTime: 500,
        statusCode: 500,
        timestamp: new Date('2024-01-01T10:01:00Z'),
        requestSize: 512,
        responseSize: 256,
        isStreamingRelated: false
      }
    ];

    mockErrorLog = {
      timestamp: new Date('2024-01-01T10:00:30Z'),
      level: 'error',
      message: 'Test error message',
      stack: 'Error stack trace',
      context: { userId: 'test-user' }
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with empty test results', () => {
      const results = aggregator.getResults();
      
      expect(results.summary.totalRequests).toBe(0);
      expect(results.summary.successfulRequests).toBe(0);
      expect(results.summary.failedRequests).toBe(0);
      expect(results.browserMetrics).toHaveLength(0);
      expect(results.drmMetrics).toHaveLength(0);
      expect(results.networkMetrics).toHaveLength(0);
      expect(results.errors).toHaveLength(0);
    });

    it('should initialize with Prometheus exporter when config provided', () => {
      const prometheusConfig: PrometheusConfiguration = {
        enabled: true,
        remoteWriteUrl: 'https://prometheus.example.com/api/v1/write'
      };
      
      const aggregatorWithPrometheus = new ResultsAggregator(prometheusConfig);
      
      // Should not throw and should initialize properly
      expect(aggregatorWithPrometheus).toBeDefined();
    });

    it('should initialize without Prometheus exporter when config not provided', () => {
      const aggregatorWithoutPrometheus = new ResultsAggregator();
      
      expect(aggregatorWithoutPrometheus).toBeDefined();
    });
  });

  describe('addBrowserMetrics', () => {
    it('should add browser metrics to the results', () => {
      aggregator.addBrowserMetrics(mockBrowserMetrics);
      
      const results = aggregator.getResults();
      expect(results.browserMetrics).toHaveLength(1);
      expect(results.browserMetrics[0]).toEqual(mockBrowserMetrics);
    });

    it('should add multiple browser metrics', () => {
      const secondMetrics = { ...mockBrowserMetrics, instanceId: 'browser-2' };
      
      aggregator.addBrowserMetrics(mockBrowserMetrics);
      aggregator.addBrowserMetrics(secondMetrics);
      
      const results = aggregator.getResults();
      expect(results.browserMetrics).toHaveLength(2);
      expect(results.browserMetrics[0].instanceId).toBe('browser-1');
      expect(results.browserMetrics[1].instanceId).toBe('browser-2');
    });
  });

  describe('addDRMMetrics', () => {
    it('should add DRM metrics to the results', () => {
      aggregator.addDRMMetrics(mockDRMMetrics);
      
      const results = aggregator.getResults();
      expect(results.drmMetrics).toHaveLength(1);
      expect(results.drmMetrics[0]).toEqual(mockDRMMetrics);
    });
  });

  describe('addNetworkMetrics', () => {
    it('should add network metrics to the results', () => {
      aggregator.addNetworkMetrics(mockNetworkMetrics);
      
      const results = aggregator.getResults();
      expect(results.networkMetrics).toHaveLength(2);
      expect(results.networkMetrics).toEqual(mockNetworkMetrics);
    });

    it('should handle empty network metrics array', () => {
      aggregator.addNetworkMetrics([]);
      
      const results = aggregator.getResults();
      expect(results.networkMetrics).toHaveLength(0);
    });
  });

  describe('addError', () => {
    it('should add error log to the results', () => {
      aggregator.addError(mockErrorLog);
      
      const results = aggregator.getResults();
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0]).toEqual(mockErrorLog);
    });
  });

  describe('finalize', () => {
    beforeEach(() => {
      // Add test data
      aggregator.addBrowserMetrics(mockBrowserMetrics);
      aggregator.addNetworkMetrics(mockNetworkMetrics);
      aggregator.addDRMMetrics(mockDRMMetrics);
      aggregator.addError(mockErrorLog);
    });

    it('should calculate summary statistics correctly', () => {
      // Add a small delay to ensure test duration is measurable
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Small delay
      }
      
      aggregator.finalize();
      
      const results = aggregator.getResults();
      const summary = results.summary;
      
      expect(summary.totalRequests).toBe(2);
      expect(summary.successfulRequests).toBe(1); // Only status 200
      expect(summary.failedRequests).toBe(1); // Status 500
      expect(summary.averageResponseTime).toBe(325); // (150 + 500) / 2
      expect(summary.peakConcurrentUsers).toBe(1); // One browser instance
      expect(summary.testDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty network metrics when calculating summary', () => {
      const emptyAggregator = new ResultsAggregator();
      emptyAggregator.finalize();
      
      const results = emptyAggregator.getResults();
      const summary = results.summary;
      
      expect(summary.totalRequests).toBe(0);
      expect(summary.successfulRequests).toBe(0);
      expect(summary.failedRequests).toBe(0);
      expect(summary.averageResponseTime).toBe(0);
    });
  });

  describe('generateReports', () => {
    const mockConfig: ReportConfig = {
      outputPath: './test-output',
      formats: ['json', 'html', 'csv'],
      includeDetailedMetrics: true,
      includeErrorAnalysis: true
    };

    beforeEach(() => {
      // Setup mocks
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      
      // Add test data
      aggregator.addBrowserMetrics(mockBrowserMetrics);
      aggregator.addNetworkMetrics(mockNetworkMetrics);
      aggregator.addDRMMetrics(mockDRMMetrics);
      aggregator.addError(mockErrorLog);
    });

    it('should generate JSON report', async () => {
      const config: ReportConfig = {
        ...mockConfig,
        formats: ['json']
      };

      await aggregator.generateReports(config);

      expect(fs.mkdir).toHaveBeenCalledWith('./test-output', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('load-test-results-'),
        expect.stringContaining('"totalRequests"')
      );
    });

    it('should generate HTML report', async () => {
      const config: ReportConfig = {
        ...mockConfig,
        formats: ['html']
      };

      await aggregator.generateReports(config);

      expect(fs.mkdir).toHaveBeenCalledWith('./test-output', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('load-test-results-'),
        expect.stringContaining('<!DOCTYPE html>')
      );
    });

    it('should generate CSV reports', async () => {
      const config: ReportConfig = {
        ...mockConfig,
        formats: ['csv']
      };

      await aggregator.generateReports(config);

      expect(fs.mkdir).toHaveBeenCalledWith('./test-output', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledTimes(3); // summary, network, browser CSVs
      
      // Check that CSV files are created
      const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeFileCalls.some(call => call[0].includes('summary'))).toBe(true);
      expect(writeFileCalls.some(call => call[0].includes('network'))).toBe(true);
      expect(writeFileCalls.some(call => call[0].includes('browser'))).toBe(true);
    });

    it('should generate multiple report formats', async () => {
      await aggregator.generateReports(mockConfig);

      expect(fs.writeFile).toHaveBeenCalledTimes(5); // 1 JSON + 1 HTML + 3 CSV files
    });

    it('should use default output path when not specified', async () => {
      const config: ReportConfig = {
        formats: ['json']
      };

      await aggregator.generateReports(config);

      expect(fs.mkdir).toHaveBeenCalledWith('./test-results', { recursive: true });
    });

    it('should finalize results if not already done', async () => {
      const config: ReportConfig = {
        formats: ['json']
      };

      // Don't call finalize manually
      await aggregator.generateReports(config);

      const results = aggregator.getResults();
      expect(results.summary.totalRequests).toBe(2); // Should be calculated
    });
  });

  describe('HTML report generation', () => {
    beforeEach(() => {
      aggregator.addBrowserMetrics(mockBrowserMetrics);
      aggregator.addNetworkMetrics(mockNetworkMetrics);
      aggregator.addDRMMetrics(mockDRMMetrics);
      aggregator.addError(mockErrorLog);
      aggregator.finalize();
    });

    it('should include summary metrics in HTML', async () => {
      const config: ReportConfig = {
        formats: ['html'],
        includeDetailedMetrics: false,
        includeErrorAnalysis: false
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      await aggregator.generateReports(config);

      const htmlContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(htmlContent).toContain('Total Requests');
      expect(htmlContent).toContain('2'); // Total requests
      expect(htmlContent).toContain('50.0%'); // Success rate
    });

    it('should include detailed metrics when requested', async () => {
      const config: ReportConfig = {
        formats: ['html'],
        includeDetailedMetrics: true,
        includeErrorAnalysis: false
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      await aggregator.generateReports(config);

      const htmlContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(htmlContent).toContain('Browser Instance Metrics');
      expect(htmlContent).toContain('browser-1');
    });

    it('should include error analysis when requested', async () => {
      const config: ReportConfig = {
        formats: ['html'],
        includeDetailedMetrics: false,
        includeErrorAnalysis: true
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      await aggregator.generateReports(config);

      const htmlContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(htmlContent).toContain('Error Analysis');
      expect(htmlContent).toContain('Test error message');
    });
  });

  describe('CSV report generation', () => {
    beforeEach(() => {
      aggregator.addBrowserMetrics(mockBrowserMetrics);
      aggregator.addNetworkMetrics(mockNetworkMetrics);
      aggregator.finalize();
    });

    it('should generate valid CSV format for summary', async () => {
      const config: ReportConfig = {
        formats: ['csv']
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      await aggregator.generateReports(config);

      const summaryCSV = vi.mocked(fs.writeFile).mock.calls
        .find(call => call[0].includes('summary'))?.[1] as string;
      
      expect(summaryCSV).toContain('Total Requests,Successful Requests');
      expect(summaryCSV).toContain('2,1,1'); // totalRequests, successfulRequests, failedRequests
    });

    it('should generate valid CSV format for network metrics', async () => {
      const config: ReportConfig = {
        formats: ['csv']
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      await aggregator.generateReports(config);

      const networkCSV = vi.mocked(fs.writeFile).mock.calls
        .find(call => call[0].includes('network'))?.[1] as string;
      
      expect(networkCSV).toContain('URL,Method,Response Time');
      expect(networkCSV).toContain('https://example.com/api/test');
      expect(networkCSV).toContain('GET,150,200');
    });
  });

  describe('Prometheus integration', () => {
    it('should not export metrics when Prometheus is not configured', () => {
      const aggregatorWithoutPrometheus = new ResultsAggregator();
      
      expect(() => {
        aggregatorWithoutPrometheus.addBrowserMetrics(mockBrowserMetrics);
        aggregatorWithoutPrometheus.addDRMMetrics(mockDRMMetrics);
        aggregatorWithoutPrometheus.addNetworkMetrics(mockNetworkMetrics);
        aggregatorWithoutPrometheus.addError(mockErrorLog);
        aggregatorWithoutPrometheus.finalize();
      }).not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown without Prometheus exporter', async () => {
      const aggregatorWithoutPrometheus = new ResultsAggregator();
      
      await expect(aggregatorWithoutPrometheus.shutdown()).resolves.not.toThrow();
    });
  });
});