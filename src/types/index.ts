/**
 * Core type definitions for the lightweight browser load tester
 */

/**
 * Configuration for DRM systems
 */
export interface DRMConfiguration {
  type: 'widevine' | 'playready' | 'fairplay';
  licenseUrl: string;
  certificateUrl?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Template for parameterizing API requests
 */
export interface ParameterTemplate {
  target: 'header' | 'query' | 'body';
  name: string;
  valueTemplate: string; // supports variable substitution
  scope: 'global' | 'per-session';
}

/**
 * Resource limits for browser instances
 */
export interface ResourceLimits {
  maxMemoryPerInstance: number; // MB
  maxCpuPercentage: number;
  maxConcurrentInstances: number;
}

/**
 * Prometheus RemoteWrite configuration
 */
export interface PrometheusConfiguration {
  enabled: boolean;
  remoteWriteUrl: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  batchSize?: number; // Number of metrics to batch before sending
  flushInterval?: number; // Interval in seconds to flush metrics
  timeout?: number; // Request timeout in milliseconds
  retryAttempts?: number;
  retryDelay?: number; // Delay between retries in milliseconds
}

/**
 * OpenTelemetry OTLP configuration
 */
export interface OpenTelemetryConfiguration {
  enabled: boolean;
  endpoint: string;
  protocol: 'http/protobuf' | 'http/json' | 'grpc';
  headers?: Record<string, string>;
  serviceName?: string;
  serviceVersion?: string;
  timeout?: number; // Request timeout in milliseconds
  compression?: 'gzip' | 'none';
  batchTimeout?: number; // Batch timeout in milliseconds
  maxExportBatchSize?: number; // Maximum batch size
  maxQueueSize?: number; // Maximum queue size
  exportTimeout?: number; // Export timeout in milliseconds
}

/**
 * Main test configuration interface
 */
export interface TestConfiguration {
  concurrentUsers: number;
  testDuration: number; // seconds
  rampUpTime: number; // seconds
  streamingUrl: string;
  streamingOnly?: boolean; // Block all non-streaming requests to save CPU/memory
  allowedUrls?: string[]; // URL patterns to always allow (even when streamingOnly is enabled)
  blockedUrls?: string[]; // URL patterns to always block (even if they're streaming-related)
  drmConfig?: DRMConfiguration;
  requestParameters: ParameterTemplate[];
  resourceLimits: ResourceLimits;
  prometheus?: PrometheusConfiguration;
  opentelemetry?: OpenTelemetryConfiguration;
}

/**
 * Summary of test execution results
 */
export interface TestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  peakConcurrentUsers: number;
  testDuration: number;
}

/**
 * Metrics for individual browser instances
 */
export interface BrowserMetrics {
  instanceId: string;
  memoryUsage: number; // MB
  cpuUsage: number; // percentage
  requestCount: number;
  errorCount: number;
  uptime: number; // seconds
}

/**
 * DRM-specific error information
 */
export interface DRMError {
  timestamp: Date;
  errorCode: string;
  errorMessage: string;
  licenseUrl: string;
  drmType: string;
}

/**
 * DRM performance metrics
 */
export interface DRMMetrics {
  licenseRequestCount: number;
  averageLicenseTime: number;
  licenseSuccessRate: number;
  drmType: string;
  errors: DRMError[];
}

/**
 * Network request performance metrics
 */
export interface NetworkMetrics {
  url: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: Date;
  requestSize: number;
  responseSize: number;
  isStreamingRelated?: boolean;
  streamingType?: 'manifest' | 'segment' | 'license' | 'api' | 'other';
}

/**
 * Streaming-specific request metrics
 */
export interface StreamingMetrics {
  manifestRequests: number;
  segmentRequests: number;
  licenseRequests: number;
  apiRequests: number;
  totalStreamingRequests: number;
  averageManifestTime: number;
  averageSegmentTime: number;
  averageLicenseTime: number;
  streamingSuccessRate: number;
  bandwidthUsage: number; // bytes per second
  errors: StreamingError[];
}

/**
 * Streaming-specific error information
 */
export interface StreamingError {
  timestamp: Date;
  errorType: 'manifest' | 'segment' | 'license' | 'playback' | 'network';
  errorCode?: string;
  errorMessage: string;
  url?: string;
  context?: Record<string, any>;
}

/**
 * Error log entry
 */
export interface ErrorLog {
  timestamp: Date;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

/**
 * Complete test results structure
 */
export interface TestResults {
  summary: TestSummary;
  browserMetrics: BrowserMetrics[];
  drmMetrics: DRMMetrics[];
  networkMetrics: NetworkMetrics[];
  errors: ErrorLog[];
}

/**
 * Browser pool configuration options
 */
export interface BrowserPoolConfig {
  maxInstances: number;
  minInstances: number;
  resourceLimits: ResourceLimits;
  browserOptions?: {
    headless?: boolean;
    args?: string[];
  };
}

/**
 * Managed browser instance with resource tracking
 */
export interface ManagedBrowserInstance {
  id: string;
  browser: any; // Browser from playwright
  context: any; // BrowserContext from playwright
  page: any; // Page from playwright
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
  metrics: BrowserMetrics;
}