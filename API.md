# API Documentation

This document provides detailed information about all public interfaces and classes in the Lightweight Browser Load Tester.

## Table of Contents

- [Core Classes](#core-classes)
- [Configuration Interfaces](#configuration-interfaces)
- [Result Interfaces](#result-interfaces)
- [Utility Classes](#utility-classes)
- [Error Handling](#error-handling)
- [Events](#events)

## Core Classes

### LoadTesterApp

Main application class that coordinates all components.

```typescript
class LoadTesterApp {
  constructor(config: TestConfiguration)
  
  // Start the load test application
  async start(): Promise<TestResults>
  
  // Stop the application gracefully
  async stop(): Promise<TestResults | null>
  
  // Get current test status
  getStatus(): {
    status: 'not_started' | 'running' | 'completed';
    testId?: string;
    monitoring?: any;
  }
}
```

**Usage Example:**
```typescript
import { LoadTesterApp, TestConfiguration } from 'lightweight-browser-load-tester';

const config: TestConfiguration = {
  concurrentUsers: 10,
  testDuration: 300,
  rampUpTime: 30,
  streamingUrl: 'https://example.com/stream',
  requestParameters: [],
  resourceLimits: {
    maxMemoryPerInstance: 512,
    maxCpuPercentage: 80,
    maxConcurrentInstances: 20
  }
};

const app = new LoadTesterApp(config);
const results = await app.start();
```

### TestRunner

Orchestrates browser instances and executes load tests.

```typescript
class TestRunner extends EventEmitter {
  constructor(config: TestConfiguration)
  
  // Start the load test
  async startTest(): Promise<void>
  
  // Stop the load test
  async stopTest(): Promise<TestResults>
  
  // Check if test is currently running
  isTestRunning(): boolean
  
  // Get unique test identifier
  getTestId(): string
  
  // Get real-time monitoring data
  getMonitoringData(): MonitoringData
}
```

**Events:**
- `test-started`: Emitted when test begins
- `test-completed`: Emitted when test finishes successfully
- `test-failed`: Emitted when test fails
- `ramp-up-completed`: Emitted when all users are active
- `monitoring-update`: Emitted with real-time metrics
- `session-failed`: Emitted when a browser session fails

### BrowserPool

Manages browser instance lifecycle and resource optimization.

```typescript
class BrowserPool {
  constructor(config: BrowserPoolConfig)
  
  // Get an available browser instance
  async acquireInstance(): Promise<ManagedBrowserInstance>
  
  // Return a browser instance to the pool
  async releaseInstance(instance: ManagedBrowserInstance): Promise<void>
  
  // Get current pool statistics
  getPoolStats(): {
    total: number;
    active: number;
    idle: number;
    memoryUsage: number;
  }
  
  // Cleanup all browser instances
  async cleanup(): Promise<void>
}
```

### RequestInterceptor

Intercepts and modifies network requests during page interactions.

```typescript
class RequestInterceptor {
  constructor(parameterTemplates: ParameterTemplate[])
  
  // Set up request interception for a page
  async setupInterception(page: Page): Promise<void>
  
  // Process and modify a request
  async processRequest(request: Request): Promise<void>
  
  // Get collected network metrics
  getNetworkMetrics(): NetworkMetrics[]
  
  // Get DRM-specific metrics
  getDRMMetrics(): DRMMetrics[]
}
```

### ResultsAggregator

Collects and processes test results from all browser instances.

```typescript
class ResultsAggregator {
  // Add metrics from a browser instance
  addBrowserMetrics(metrics: BrowserMetrics): void
  
  // Add network request metrics
  addNetworkMetrics(metrics: NetworkMetrics[]): void
  
  // Add DRM-specific metrics
  addDRMMetrics(metrics: DRMMetrics): void
  
  // Add error log entry
  addError(error: ErrorLog): void
  
  // Generate final test results
  generateResults(): TestResults
  
  // Reset all collected data
  reset(): void
}
```

### ConfigurationManager

Handles configuration parsing and validation.

```typescript
class ConfigurationManager {
  // Parse configuration from file and CLI arguments
  static async parseConfiguration(options: {
    configFile?: string;
    cliArgs?: string[];
    validateOnly?: boolean;
  }): Promise<{ config: TestConfiguration }>
  
  // Generate example configuration
  static generateExampleConfig(format: 'json' | 'yaml'): string
  
  // Validate configuration object
  static validateConfiguration(config: any): TestConfiguration
}
```

## Configuration Interfaces

### TestConfiguration

Main configuration interface for the load tester.

```typescript
interface TestConfiguration {
  concurrentUsers: number;           // Number of concurrent browser instances
  testDuration: number;              // Test duration in seconds (0 = infinite)
  rampUpTime: number;               // Time to gradually start all users
  streamingUrl: string;             // Target streaming URL
  drmConfig?: DRMConfiguration;     // Optional DRM configuration
  requestParameters: ParameterTemplate[]; // Request parameter injection
  resourceLimits: ResourceLimits;   // Resource usage limits
  prometheus?: PrometheusConfiguration; // Prometheus metrics export
  opentelemetry?: OpenTelemetryConfiguration; // OpenTelemetry export
}
```

### DRMConfiguration

Configuration for DRM systems.

```typescript
interface DRMConfiguration {
  type: 'widevine' | 'playready' | 'fairplay'; // DRM system type
  licenseUrl: string;               // License server URL
  certificateUrl?: string;          // Certificate URL (optional)
  customHeaders?: Record<string, string>; // Custom headers for requests
}
```

### ParameterTemplate

Template for parameterizing API requests.

```typescript
interface ParameterTemplate {
  target: 'header' | 'query' | 'body'; // Where to inject the parameter
  name: string;                     // Parameter name
  valueTemplate: string;            // Template with variable substitution
  scope: 'global' | 'per-session';  // Parameter scope
}
```

**Variable Substitution:**
- `{{sessionId}}`: Unique session identifier
- `{{timestamp}}`: Current timestamp
- `{{random}}`: Random number
- `{{token}}`: Authentication token

### ResourceLimits

Resource limits for browser instances.

```typescript
interface ResourceLimits {
  maxMemoryPerInstance: number;     // Maximum memory per instance (MB)
  maxCpuPercentage: number;        // Maximum CPU usage percentage
  maxConcurrentInstances: number;   // Maximum concurrent browser instances
}
```

### PrometheusConfiguration

Configuration for Prometheus metrics export.

```typescript
interface PrometheusConfiguration {
  enabled: boolean;                 // Enable Prometheus export
  remoteWriteUrl: string;          // Prometheus RemoteWrite endpoint
  username?: string;               // Authentication username
  password?: string;               // Authentication password
  headers?: Record<string, string>; // Custom headers
  batchSize?: number;              // Metrics batch size (default: 100)
  flushInterval?: number;          // Flush interval in seconds (default: 30)
  timeout?: number;                // Request timeout in ms (default: 10000)
  retryAttempts?: number;          // Retry attempts (default: 3)
  retryDelay?: number;             // Retry delay in ms (default: 1000)
}
```

### OpenTelemetryConfiguration

Configuration for OpenTelemetry metrics export.

```typescript
interface OpenTelemetryConfiguration {
  enabled: boolean;                 // Enable OpenTelemetry export
  endpoint: string;                // OTLP endpoint URL
  protocol: 'http/protobuf' | 'http/json' | 'grpc'; // Protocol type
  headers?: Record<string, string>; // Custom headers
  serviceName?: string;            // Service name (default: 'load-tester')
  serviceVersion?: string;         // Service version
  timeout?: number;                // Request timeout in ms
  compression?: 'gzip' | 'none';   // Compression type
  batchTimeout?: number;           // Batch timeout in ms
  maxExportBatchSize?: number;     // Maximum batch size
  maxQueueSize?: number;           // Maximum queue size
  exportTimeout?: number;          // Export timeout in ms
}
```

## Result Interfaces

### TestResults

Complete test results structure.

```typescript
interface TestResults {
  summary: TestSummary;            // Test execution summary
  browserMetrics: BrowserMetrics[]; // Browser instance metrics
  drmMetrics: DRMMetrics[];        // DRM-specific metrics
  networkMetrics: NetworkMetrics[]; // Network request metrics
  errors: ErrorLog[];              // Error log entries
}
```

### TestSummary

Summary of test execution results.

```typescript
interface TestSummary {
  totalRequests: number;           // Total number of requests made
  successfulRequests: number;      // Number of successful requests
  failedRequests: number;          // Number of failed requests
  averageResponseTime: number;     // Average response time in ms
  peakConcurrentUsers: number;     // Peak number of concurrent users
  testDuration: number;            // Actual test duration in seconds
}
```

### BrowserMetrics

Metrics for individual browser instances.

```typescript
interface BrowserMetrics {
  instanceId: string;              // Unique instance identifier
  memoryUsage: number;             // Memory usage in MB
  cpuUsage: number;               // CPU usage percentage
  requestCount: number;            // Number of requests made
  errorCount: number;              // Number of errors encountered
  uptime: number;                 // Instance uptime in seconds
}
```

### DRMMetrics

DRM performance metrics.

```typescript
interface DRMMetrics {
  licenseRequestCount: number;     // Number of license requests
  averageLicenseTime: number;      // Average license acquisition time (ms)
  licenseSuccessRate: number;      // License success rate (0-1)
  drmType: string;                // DRM system type
  errors: DRMError[];             // DRM-specific errors
}
```

### NetworkMetrics

Network request performance metrics.

```typescript
interface NetworkMetrics {
  url: string;                    // Request URL
  method: string;                 // HTTP method
  responseTime: number;           // Response time in ms
  statusCode: number;             // HTTP status code
  timestamp: Date;                // Request timestamp
  requestSize: number;            // Request size in bytes
  responseSize: number;           // Response size in bytes
  isStreamingRelated?: boolean;   // Whether request is streaming-related
  streamingType?: 'manifest' | 'segment' | 'license' | 'api' | 'other';
}
```

### ErrorLog

Error log entry.

```typescript
interface ErrorLog {
  timestamp: Date;                // Error timestamp
  level: 'error' | 'warning' | 'info'; // Error severity level
  message: string;                // Error message
  stack?: string;                 // Stack trace (if available)
  context?: Record<string, any>;  // Additional context information
}
```

## Utility Classes

### ErrorRecoveryManager

Handles error recovery and browser restart logic.

```typescript
class ErrorRecoveryManager {
  constructor(config: ResourceLimits)
  
  // Handle browser instance failure
  async handleBrowserFailure(instanceId: string, error: Error): Promise<boolean>
  
  // Check if instance should be restarted
  shouldRestartInstance(instanceId: string): boolean
  
  // Get failure statistics
  getFailureStats(): {
    totalFailures: number;
    restartAttempts: number;
    circuitBreakerActive: boolean;
  }
}
```

### PrometheusExporter

Exports metrics to Prometheus RemoteWrite endpoint.

```typescript
class PrometheusExporter {
  constructor(config: PrometheusConfiguration)
  
  // Export test summary metrics
  async exportTestSummary(summary: TestSummary): Promise<void>
  
  // Export browser metrics
  async exportBrowserMetrics(metrics: BrowserMetrics[]): Promise<void>
  
  // Export DRM metrics
  async exportDRMMetrics(metrics: DRMMetrics[]): Promise<void>
  
  // Shutdown and flush remaining metrics
  async shutdown(): Promise<void>
}
```

### OpenTelemetryExporter

Exports metrics to OpenTelemetry OTLP endpoint.

```typescript
class OpenTelemetryExporter {
  constructor(config: OpenTelemetryConfiguration)
  
  // Initialize the exporter
  async initialize(): Promise<void>
  
  // Export test summary metrics
  async exportTestSummary(summary: TestSummary): Promise<void>
  
  // Export browser metrics
  async exportBrowserMetrics(metrics: BrowserMetrics[]): Promise<void>
  
  // Export DRM metrics
  async exportDRMMetrics(metrics: DRMMetrics[]): Promise<void>
  
  // Shutdown the exporter
  async shutdown(): Promise<void>
}
```

## Error Handling

### ConfigurationError

Thrown when configuration is invalid.

```typescript
class ConfigurationError extends Error {
  constructor(message: string, source?: string)
  
  source?: string; // Source of the configuration error
}
```

### BrowserError

Thrown when browser operations fail.

```typescript
class BrowserError extends Error {
  constructor(message: string, instanceId?: string, cause?: Error)
  
  instanceId?: string; // Browser instance ID
  cause?: Error;       // Original error cause
}
```

### NetworkError

Thrown when network operations fail.

```typescript
class NetworkError extends Error {
  constructor(message: string, url?: string, statusCode?: number)
  
  url?: string;        // Request URL
  statusCode?: number; // HTTP status code
}
```

## Events

### TestRunner Events

The TestRunner class extends EventEmitter and emits the following events:

#### test-started
Emitted when a test begins execution.

```typescript
testRunner.on('test-started', ({ testId }: { testId: string }) => {
  console.log(`Test started with ID: ${testId}`);
});
```

#### test-completed
Emitted when a test completes successfully.

```typescript
testRunner.on('test-completed', ({ results }: { results: TestResults }) => {
  console.log('Test completed:', results.summary);
});
```

#### test-failed
Emitted when a test fails.

```typescript
testRunner.on('test-failed', ({ error }: { error: Error }) => {
  console.error('Test failed:', error.message);
});
```

#### ramp-up-completed
Emitted when the ramp-up phase is completed and all users are active.

```typescript
testRunner.on('ramp-up-completed', () => {
  console.log('All users are now active');
});
```

#### monitoring-update
Emitted periodically with real-time monitoring data.

```typescript
interface MonitoringData {
  elapsedTime: number;
  remainingTime: number;
  activeSessions: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  currentRps: number;
  averageResponseTime: number;
  memoryUsage: number;
}

testRunner.on('monitoring-update', ({ data }: { data: MonitoringData }) => {
  console.log(`Active sessions: ${data.activeSessions}, RPS: ${data.currentRps}`);
});
```

#### session-failed
Emitted when an individual browser session fails.

```typescript
testRunner.on('session-failed', ({ sessionId, error }: { 
  sessionId: string; 
  error: Error; 
}) => {
  console.warn(`Session ${sessionId} failed: ${error.message}`);
});
```

## Usage Examples

### Basic Load Test

```typescript
import { LoadTesterApp, TestConfiguration } from 'lightweight-browser-load-tester';

const config: TestConfiguration = {
  concurrentUsers: 5,
  testDuration: 300,
  rampUpTime: 30,
  streamingUrl: 'https://example.com/stream',
  requestParameters: [],
  resourceLimits: {
    maxMemoryPerInstance: 512,
    maxCpuPercentage: 80,
    maxConcurrentInstances: 10
  }
};

const app = new LoadTesterApp(config);

try {
  const results = await app.start();
  console.log('Test Results:', results.summary);
} catch (error) {
  console.error('Test failed:', error);
}
```

### DRM Testing

```typescript
const drmConfig: TestConfiguration = {
  concurrentUsers: 10,
  testDuration: 600,
  rampUpTime: 60,
  streamingUrl: 'https://example.com/drm-stream',
  drmConfig: {
    type: 'widevine',
    licenseUrl: 'https://example.com/license',
    customHeaders: {
      'Authorization': 'Bearer token123'
    }
  },
  requestParameters: [
    {
      target: 'header',
      name: 'Authorization',
      valueTemplate: 'Bearer {{token}}',
      scope: 'per-session'
    }
  ],
  resourceLimits: {
    maxMemoryPerInstance: 1024,
    maxCpuPercentage: 90,
    maxConcurrentInstances: 20
  }
};

const app = new LoadTesterApp(drmConfig);
const results = await app.start();

// Access DRM-specific metrics
results.drmMetrics.forEach(drm => {
  console.log(`${drm.drmType}: ${drm.licenseSuccessRate * 100}% success rate`);
});
```

### Event Monitoring

```typescript
import { TestRunner } from 'lightweight-browser-load-tester';

const testRunner = new TestRunner(config);

testRunner.on('monitoring-update', ({ data }) => {
  const progress = (data.elapsedTime / config.testDuration) * 100;
  console.log(`Progress: ${progress.toFixed(1)}%`);
  console.log(`Active Sessions: ${data.activeSessions}`);
  console.log(`Current RPS: ${data.currentRps.toFixed(1)}`);
});

testRunner.on('session-failed', ({ sessionId, error }) => {
  console.warn(`Session ${sessionId} failed: ${error.message}`);
});

await testRunner.startTest();
```

### Metrics Export

```typescript
const configWithMetrics: TestConfiguration = {
  // ... basic config
  prometheus: {
    enabled: true,
    remoteWriteUrl: 'https://prometheus.example.com/api/v1/write',
    username: 'user',
    password: 'pass',
    batchSize: 100,
    flushInterval: 30
  },
  opentelemetry: {
    enabled: true,
    endpoint: 'https://otel.example.com/v1/metrics',
    protocol: 'http/protobuf',
    serviceName: 'load-tester',
    serviceVersion: '1.0.0'
  }
};

const app = new LoadTesterApp(configWithMetrics);
await app.start(); // Metrics will be exported automatically
```

## Type Definitions

All TypeScript type definitions are available in the main package export:

```typescript
import {
  // Core types
  TestConfiguration,
  TestResults,
  TestSummary,
  
  // Configuration types
  DRMConfiguration,
  ParameterTemplate,
  ResourceLimits,
  PrometheusConfiguration,
  OpenTelemetryConfiguration,
  
  // Metrics types
  BrowserMetrics,
  DRMMetrics,
  NetworkMetrics,
  ErrorLog,
  
  // Utility types
  ManagedBrowserInstance,
  BrowserPoolConfig
} from 'lightweight-browser-load-tester';
```