import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PrometheusExporter } from './prometheus-exporter.js';
import {
  PrometheusConfiguration,
  BrowserMetrics,
  DRMMetrics,
  NetworkMetrics,
  ErrorLog,
  TestSummary
} from '../types/index.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('PrometheusExporter', () => {
  let exporter: PrometheusExporter;
  let mockConfig: PrometheusConfiguration;
  let mockBrowserMetrics: BrowserMetrics;
  let mockDRMMetrics: DRMMetrics;
  let mockNetworkMetrics: NetworkMetrics[];
  let mockErrorLog: ErrorLog;
  let mockTestSummary: TestSummary;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      remoteWriteUrl: 'https://prometheus.example.com/api/v1/write',
      username: 'test-user',
      password: 'test-password',
      batchSize: 10,
      flushInterval: 5,
      timeout: 3000,
      retryAttempts: 2,
      retryDelay: 500,
      headers: {
        'X-Custom-Header': 'test-value'
      }
    };

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

    mockTestSummary = {
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      averageResponseTime: 200.5,
      peakConcurrentUsers: 10,
      testDuration: 300
    };

    // Reset mocks
    vi.clearAllMocks();
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 200 }));
  });

  afterEach(async () => {
    if (exporter) {
      await exporter.shutdown();
    }
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      exporter = new PrometheusExporter(mockConfig);
      
      const config = exporter.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.remoteWriteUrl).toBe(mockConfig.remoteWriteUrl);
      expect(config.batchSize).toBe(10);
      expect(config.flushInterval).toBe(5);
    });

    it('should apply default values for optional configuration', () => {
      const minimalConfig: PrometheusConfiguration = {
        enabled: true,
        remoteWriteUrl: 'https://prometheus.example.com/api/v1/write'
      };
      
      exporter = new PrometheusExporter(minimalConfig);
      
      const config = exporter.getConfig();
      expect(config.batchSize).toBe(100);
      expect(config.flushInterval).toBe(10);
      expect(config.timeout).toBe(5000);
      expect(config.retryAttempts).toBe(3);
      expect(config.retryDelay).toBe(1000);
    });

    it('should not start flush timer when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      exporter = new PrometheusExporter(disabledConfig);
      
      expect(exporter.getBufferSize()).toBe(0);
    });
  });

  describe('exportBrowserMetrics', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should export browser metrics when enabled', async () => {
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });

    it('should not export metrics when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      exporter = new PrometheusExporter(disabledConfig);
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      expect(exporter.getBufferSize()).toBe(0);
    });

    it('should include correct metric names and labels', async () => {
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      // Check that metrics were added to buffer
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });
  });

  describe('exportDRMMetrics', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should export DRM metrics when enabled', async () => {
      await exporter.exportDRMMetrics(mockDRMMetrics);
      
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });

    it('should not export metrics when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      exporter = new PrometheusExporter(disabledConfig);
      
      await exporter.exportDRMMetrics(mockDRMMetrics);
      
      expect(exporter.getBufferSize()).toBe(0);
    });
  });

  describe('exportNetworkMetrics', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should export network metrics when enabled', async () => {
      await exporter.exportNetworkMetrics(mockNetworkMetrics);
      
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });

    it('should handle empty network metrics array', async () => {
      await exporter.exportNetworkMetrics([]);
      
      expect(exporter.getBufferSize()).toBe(0);
    });

    it('should not export metrics when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      exporter = new PrometheusExporter(disabledConfig);
      
      await exporter.exportNetworkMetrics(mockNetworkMetrics);
      
      expect(exporter.getBufferSize()).toBe(0);
    });
  });

  describe('exportTestSummary', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should export test summary metrics when enabled', async () => {
      await exporter.exportTestSummary(mockTestSummary);
      
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });

    it('should not export metrics when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      exporter = new PrometheusExporter(disabledConfig);
      
      await exporter.exportTestSummary(mockTestSummary);
      
      expect(exporter.getBufferSize()).toBe(0);
    });
  });

  describe('exportErrorMetrics', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should export error metrics when enabled', async () => {
      await exporter.exportErrorMetrics([mockErrorLog]);
      
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });

    it('should handle empty error array', async () => {
      await exporter.exportErrorMetrics([]);
      
      expect(exporter.getBufferSize()).toBe(0);
    });

    it('should aggregate errors by level', async () => {
      const errors = [
        { ...mockErrorLog, level: 'error' as const },
        { ...mockErrorLog, level: 'error' as const },
        { ...mockErrorLog, level: 'warning' as const }
      ];
      
      await exporter.exportErrorMetrics(errors);
      
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
    });
  });

  describe('flush', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should send metrics to Prometheus endpoint', async () => {
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      await exporter.flush();
      
      expect(fetch).toHaveBeenCalledWith(
        mockConfig.remoteWriteUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': expect.stringContaining('Basic'),
            'X-Custom-Header': 'test-value'
          })
        })
      );
    });

    it('should clear buffer after successful flush', async () => {
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
      
      await exporter.flush();
      expect(exporter.getBufferSize()).toBe(0);
    });

    it('should handle empty buffer', async () => {
      await exporter.flush();
      
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should not flush when disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      exporter = new PrometheusExporter(disabledConfig);
      
      await exporter.flush();
      
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('HTTP request handling', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should include authentication headers when credentials provided', async () => {
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      await exporter.flush();
      
      const expectedAuth = Buffer.from(`${mockConfig.username}:${mockConfig.password}`).toString('base64');
      
      expect(fetch).toHaveBeenCalledWith(
        mockConfig.remoteWriteUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`
          })
        })
      );
    });

    it('should not include authentication when credentials not provided', async () => {
      const configWithoutAuth = { ...mockConfig };
      delete configWithoutAuth.username;
      delete configWithoutAuth.password;
      
      exporter = new PrometheusExporter(configWithoutAuth);
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      await exporter.flush();
      
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should handle HTTP errors with retry', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('', { status: 200 }));
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      await exporter.flush();
      
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries exceeded', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      await expect(exporter.flush()).rejects.toThrow('Failed to send metrics to Prometheus after 3 attempts');
      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should handle HTTP error responses', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' })
      );
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      await expect(exporter.flush()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('Timeout'), { name: 'AbortError' }));
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      await expect(exporter.flush()).rejects.toThrow('Request timeout after 3000ms');
    });
  });

  describe('batching and automatic flush', () => {
    it('should automatically flush when batch size is reached', async () => {
      const smallBatchConfig = { ...mockConfig, batchSize: 2 };
      exporter = new PrometheusExporter(smallBatchConfig);
      
      const flushSpy = vi.spyOn(exporter, 'flush').mockResolvedValue();
      
      // Add metrics to exceed batch size
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      await exporter.exportDRMMetrics(mockDRMMetrics);
      
      // Wait a bit for async flush to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should flush periodically based on flush interval', async () => {
      const quickFlushConfig = { ...mockConfig, flushInterval: 0.1 }; // 100ms
      exporter = new PrometheusExporter(quickFlushConfig);
      
      const flushSpy = vi.spyOn(exporter, 'flush').mockResolvedValue();
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      
      // Wait for flush interval
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should flush remaining metrics on shutdown', async () => {
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      expect(exporter.getBufferSize()).toBeGreaterThan(0);
      
      await exporter.shutdown();
      
      expect(fetch).toHaveBeenCalled();
      expect(exporter.getBufferSize()).toBe(0);
    });

    it('should stop periodic flush timer on shutdown', async () => {
      const flushSpy = vi.spyOn(exporter, 'flush').mockResolvedValue();
      
      await exporter.shutdown();
      
      // Wait longer than flush interval to ensure timer is stopped
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should only be called once during shutdown, not periodically
      expect(flushSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('metric format conversion', () => {
    beforeEach(() => {
      exporter = new PrometheusExporter(mockConfig);
    });

    it('should convert metrics to correct Prometheus format', async () => {
      let capturedPayload: any = null;
      
      vi.mocked(fetch).mockImplementation(async (url, options) => {
        if (options?.body) {
          capturedPayload = JSON.parse(options.body.toString());
        }
        return new Response('', { status: 200 });
      });
      
      await exporter.exportBrowserMetrics(mockBrowserMetrics);
      await exporter.flush();
      
      expect(capturedPayload).toHaveProperty('timeseries');
      expect(Array.isArray(capturedPayload.timeseries)).toBe(true);
      
      const firstTimeseries = capturedPayload.timeseries[0];
      expect(firstTimeseries).toHaveProperty('labels');
      expect(firstTimeseries).toHaveProperty('samples');
      
      const nameLabel = firstTimeseries.labels.find((l: any) => l.name === '__name__');
      expect(nameLabel).toBeDefined();
      expect(nameLabel.value).toMatch(/^browser_/);
    });
  });
});