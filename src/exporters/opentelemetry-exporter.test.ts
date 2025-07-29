/**
 * Tests for OpenTelemetry exporter
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { OpenTelemetryExporter } from './opentelemetry-exporter';
import { OpenTelemetryConfiguration, BrowserMetrics, DRMMetrics, NetworkMetrics, ErrorLog, TestSummary } from '../types';

// Mock OpenTelemetry modules
vi.mock('@opentelemetry/sdk-node');
vi.mock('@opentelemetry/exporter-otlp-http');
vi.mock('@opentelemetry/exporter-otlp-grpc');
vi.mock('@opentelemetry/resources');
vi.mock('@opentelemetry/semantic-conventions');
vi.mock('@opentelemetry/api');
vi.mock('@opentelemetry/sdk-metrics');

describe('OpenTelemetryExporter', () => {
  let exporter: OpenTelemetryExporter;
  let mockConfig: OpenTelemetryConfiguration;

  // Mock objects
  let mockMeterProvider: any;
  let mockMeter: any;
  let mockMetricInstruments: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock configuration
    mockConfig = {
      enabled: true,
      endpoint: 'http://localhost:4318/v1/metrics',
      protocol: 'http/protobuf',
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
      timeout: 5000,
      compression: 'gzip',
      batchTimeout: 5000,
      maxExportBatchSize: 512,
      maxQueueSize: 2048,
      exportTimeout: 30000
    };

    // Mock fetch for HTTP requests
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK'
    });

    exporter = new OpenTelemetryExporter(mockConfig);
  });

  afterEach(async () => {
    if (exporter) {
      await exporter.shutdown();
    }
  });

  describe('Constructor', () => {
    it('should create exporter with default configuration', () => {
      const minimalConfig: OpenTelemetryConfiguration = {
        enabled: true,
        endpoint: 'http://localhost:4318/v1/metrics',
        protocol: 'http/protobuf'
      };

      const exporter = new OpenTelemetryExporter(minimalConfig);
      const config = exporter.getConfig();

      expect(config.serviceName).toBe('lightweight-browser-load-tester');
      expect(config.serviceVersion).toBe('1.0.0');
      expect(config.timeout).toBe(5000);
      expect(config.compression).toBe('gzip');
      expect(config.batchTimeout).toBe(5000);
      expect(config.maxExportBatchSize).toBe(512);
      expect(config.maxQueueSize).toBe(2048);
      expect(config.exportTimeout).toBe(30000);
    });

    it('should override default configuration with provided values', () => {
      const config = exporter.getConfig();

      expect(config.serviceName).toBe('test-service');
      expect(config.serviceVersion).toBe('1.0.0');
      expect(config.endpoint).toBe('http://localhost:4318/v1/metrics');
      expect(config.protocol).toBe('http/protobuf');
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await exporter.initialize();
      expect(exporter.isReady()).toBe(true);
    });

    it('should not initialize if disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledExporter = new OpenTelemetryExporter(disabledConfig);

      await disabledExporter.initialize();
      expect(disabledExporter.isReady()).toBe(false);
    });

    it('should not initialize twice', async () => {
      await exporter.initialize();
      await exporter.initialize(); // Second call should be ignored
      expect(exporter.isReady()).toBe(true);
    });
  });

  describe('Browser Metrics Export', () => {
    beforeEach(async () => {
      await exporter.initialize();
    });

    it('should export browser metrics successfully', async () => {
      const browserMetrics: BrowserMetrics = {
        instanceId: 'browser-1',
        memoryUsage: 256,
        cpuUsage: 45,
        requestCount: 100,
        errorCount: 2,
        uptime: 300
      };

      // Mock fetch to verify the HTTP request
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK')
      });

      await exporter.exportBrowserMetrics(browserMetrics);

      // Since our implementation uses a buffer, we need to flush to trigger the HTTP request
      await exporter.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4318/v1/metrics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should not export if disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledExporter = new OpenTelemetryExporter(disabledConfig);

      const browserMetrics: BrowserMetrics = {
        instanceId: 'browser-1',
        memoryUsage: 256,
        cpuUsage: 45,
        requestCount: 100,
        errorCount: 2,
        uptime: 300
      };

      global.fetch = vi.fn();

      await disabledExporter.exportBrowserMetrics(browserMetrics);
      await disabledExporter.flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not export if not initialized', async () => {
      const uninitializedExporter = new OpenTelemetryExporter(mockConfig);

      const browserMetrics: BrowserMetrics = {
        instanceId: 'browser-1',
        memoryUsage: 256,
        cpuUsage: 45,
        requestCount: 100,
        errorCount: 2,
        uptime: 300
      };

      global.fetch = vi.fn();

      await uninitializedExporter.exportBrowserMetrics(browserMetrics);
      await uninitializedExporter.flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('DRM Metrics Export', () => {
    beforeEach(async () => {
      await exporter.initialize();
    });

    it('should export DRM metrics successfully', async () => {
      const drmMetrics: DRMMetrics = {
        licenseRequestCount: 50,
        averageLicenseTime: 150,
        licenseSuccessRate: 95.5,
        drmType: 'widevine',
        errors: [
          {
            timestamp: new Date(),
            errorCode: 'DRM_001',
            errorMessage: 'License request failed',
            licenseUrl: 'https://example.com/license',
            drmType: 'widevine'
          }
        ]
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('OK')
      });

      await exporter.exportDRMMetrics(drmMetrics);
      await exporter.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4318/v1/metrics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('Network Metrics Export', () => {
    beforeEach(async () => {
      await exporter.initialize();
    });

    it('should export network metrics successfully', async () => {
      await exporter.initialize();
      
      const networkMetrics: NetworkMetrics[] = [
        {
          url: 'https://example.com/api',
          method: 'GET',
          responseTime: 200,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 1024,
          responseSize: 2048,
          isStreamingRelated: true,
          streamingType: 'manifest'
        },
        {
          url: 'https://example.com/segment',
          method: 'GET',
          responseTime: 150,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 512,
          responseSize: 4096,
          isStreamingRelated: true,
          streamingType: 'segment'
        }
      ];

      await exporter.exportNetworkMetrics(networkMetrics);
      await exporter.flush();

      // Verify HTTP request was made to OTLP endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4318/v1/metrics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle empty network metrics array', async () => {
      await exporter.exportNetworkMetrics([]);
      await exporter.flush();

      // Should not make HTTP request for empty metrics
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Test Summary Export', () => {
    beforeEach(async () => {
      await exporter.initialize();
    });

    it('should export test summary metrics successfully', async () => {
      const testSummary: TestSummary = {
        totalRequests: 1000,
        successfulRequests: 950,
        failedRequests: 50,
        averageResponseTime: 175,
        peakConcurrentUsers: 10,
        testDuration: 300
      };

      await exporter.exportTestSummary(testSummary);
      await exporter.flush();

      // Verify HTTP request was made to OTLP endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4318/v1/metrics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('Error Metrics Export', () => {
    beforeEach(async () => {
      await exporter.initialize();
    });

    it('should export error metrics successfully', async () => {
      const errors: ErrorLog[] = [
        {
          timestamp: new Date(),
          level: 'error',
          message: 'Test error 1',
          context: { test: true }
        },
        {
          timestamp: new Date(),
          level: 'error',
          message: 'Test error 2',
          context: { test: true }
        },
        {
          timestamp: new Date(),
          level: 'warning',
          message: 'Test warning',
          context: { test: true }
        }
      ];

      await exporter.exportErrorMetrics(errors);
      await exporter.flush();

      // Verify HTTP request was made to OTLP endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4318/v1/metrics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle empty errors array', async () => {
      await exporter.exportErrorMetrics([]);
      await exporter.flush();

      // Should not make HTTP request for empty errors
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Flush and Shutdown', () => {
    beforeEach(async () => {
      await exporter.initialize();
    });

    it('should flush metrics successfully', async () => {
      // Add some metrics to the buffer first
      const browserMetrics: BrowserMetrics = {
        instanceId: 'browser-1',
        memoryUsage: 256,
        cpuUsage: 45,
        requestCount: 100,
        errorCount: 2,
        uptime: 300
      };

      await exporter.exportBrowserMetrics(browserMetrics);
      await exporter.flush();

      // Verify HTTP request was made
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:4318/v1/metrics',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('should handle flush errors gracefully', async () => {
      // Mock fetch to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Should not throw even if HTTP request fails
      await expect(exporter.flush()).resolves.toBeUndefined();
    });

    it('should shutdown successfully', async () => {
      await exporter.shutdown();
      expect(exporter.isReady()).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      // Mock fetch to fail during flush
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Should not throw even if flush fails during shutdown
      await expect(exporter.shutdown()).resolves.toBeUndefined();
      expect(exporter.isReady()).toBe(false);
    });

    it('should not flush or shutdown if not initialized', async () => {
      const uninitializedExporter = new OpenTelemetryExporter(mockConfig);

      global.fetch = vi.fn();

      await uninitializedExporter.flush();
      await uninitializedExporter.shutdown();

      // Should not make HTTP requests if not initialized
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not shutdown twice', async () => {
      await exporter.shutdown();
      expect(exporter.isReady()).toBe(false);
      
      await exporter.shutdown(); // Second call should be ignored
      expect(exporter.isReady()).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should return readonly configuration', () => {
      const config = exporter.getConfig();

      expect(config).toEqual(mockConfig);
      
      // Verify it's readonly by attempting to modify
      expect(() => {
        (config as any).endpoint = 'modified';
      }).not.toThrow(); // TypeScript would prevent this, but runtime allows it

      // Original config should remain unchanged
      expect(exporter.getConfig().endpoint).toBe('http://localhost:4318/v1/metrics');
    });

    it('should handle different compression settings', () => {
      const noCompressionConfig = { ...mockConfig, compression: 'none' as const };
      const noCompressionExporter = new OpenTelemetryExporter(noCompressionConfig);

      expect(noCompressionExporter.getConfig().compression).toBe('none');
    });

    it('should handle different protocol settings', () => {
      const jsonConfig = { ...mockConfig, protocol: 'http/json' as const };
      const jsonExporter = new OpenTelemetryExporter(jsonConfig);

      expect(jsonExporter.getConfig().protocol).toBe('http/json');
    });
  });

  describe('Status Checking', () => {
    it('should report not ready before initialization', () => {
      const newExporter = new OpenTelemetryExporter(mockConfig);
      expect(newExporter.isReady()).toBe(false);
    });

    it('should report ready after initialization', async () => {
      await exporter.initialize();
      expect(exporter.isReady()).toBe(true);
    });

    it('should report not ready after shutdown', async () => {
      await exporter.initialize();
      expect(exporter.isReady()).toBe(true);

      await exporter.shutdown();
      expect(exporter.isReady()).toBe(false);
    });

    it('should report not ready if disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledExporter = new OpenTelemetryExporter(disabledConfig);

      expect(disabledExporter.isReady()).toBe(false);
    });
  });
});