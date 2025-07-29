# Design Document

## Overview

The lightweight browser load tester is designed as a Node.js application that orchestrates multiple browser instances to simulate real user interactions with streaming applications. The system focuses on minimal resource consumption while providing comprehensive DRM license testing capabilities. The architecture emphasizes modularity, allowing for easy extension and configuration of different testing scenarios.

## Architecture

The system follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Test Controller                     │
├─────────────────────────────────────────────────────────────┤
│  • Test Configuration Management                            │
│  • Browser Instance Orchestration                          │
│  • Results Aggregation & Reporting                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Browser Pool Manager                     │
├─────────────────────────────────────────────────────────────┤
│  • Browser Instance Lifecycle                              │
│  • Resource Optimization                                   │
│  • Connection Pooling                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Network Interceptor                       │
├─────────────────────────────────────────────────────────────┤
│  • API Request Interception                                │
│  • Parameter Injection                                     │
│  • DRM License Monitoring                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Browser Instances                        │
├─────────────────────────────────────────────────────────────┤
│  • Playwright/Chromium Browsers                            │
│  • Minimal Streaming Pages                                 │
│  • DRM Content Playback                                    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Load Test Controller
**Purpose:** Central orchestration component that manages the entire load testing process.

**Key Interfaces:**
- `TestConfiguration`: Defines test parameters, user counts, duration, and scenarios
- `TestRunner`: Executes load tests and coordinates browser instances
- `ResultsAggregator`: Collects and processes test results from all browser instances

**Responsibilities:**
- Parse configuration files and command-line arguments
- Coordinate browser pool creation and management
- Aggregate performance metrics and generate reports
- Handle test lifecycle (start, monitor, stop, cleanup)

### Browser Pool Manager
**Purpose:** Manages browser instance lifecycle and resource optimization.

**Key Interfaces:**
- `BrowserPool`: Maintains pool of reusable browser instances
- `ResourceMonitor`: Tracks CPU and memory usage per instance
- `InstanceAllocator`: Assigns browser instances to test scenarios

**Responsibilities:**
- Create and destroy browser instances efficiently
- Implement browser instance pooling and reuse
- Monitor resource consumption and enforce limits
- Handle browser crashes and recovery

### Network Interceptor
**Purpose:** Intercepts and modifies network requests during page interactions.

**Key Interfaces:**
- `RequestInterceptor`: Captures outgoing HTTP requests
- `ParameterInjector`: Modifies request parameters dynamically
- `DRMLicenseMonitor`: Specifically tracks DRM-related requests

**Responsibilities:**
- Intercept API calls made by streaming applications
- Inject parameterized data into requests (headers, query params, body)
- Monitor DRM license acquisition requests and responses
- Log network activity and performance metrics

### Streaming Page Manager
**Purpose:** Creates and serves minimal streaming pages optimized for load testing.

**Key Interfaces:**
- `PageTemplate`: Defines minimal HTML structure for streaming
- `ContentLoader`: Handles streaming content initialization
- `DRMHandler`: Manages DRM license acquisition flow

**Responsibilities:**
- Generate lightweight HTML pages with only essential streaming functionality
- Remove unnecessary scripts, analytics, and UI elements
- Initialize streaming players with test content
- Handle DRM license requests for various DRM systems

## Data Models

### Test Configuration
```typescript
interface TestConfiguration {
  concurrentUsers: number;
  testDuration: number; // seconds
  rampUpTime: number; // seconds
  streamingUrl: string;
  drmConfig?: DRMConfiguration;
  requestParameters: ParameterTemplate[];
  resourceLimits: ResourceLimits;
}

interface DRMConfiguration {
  type: 'widevine' | 'playready' | 'fairplay';
  licenseUrl: string;
  certificateUrl?: string;
  customHeaders?: Record<string, string>;
}

interface ParameterTemplate {
  target: 'header' | 'query' | 'body';
  name: string;
  valueTemplate: string; // supports variable substitution
  scope: 'global' | 'per-session';
}

interface ResourceLimits {
  maxMemoryPerInstance: number; // MB
  maxCpuPercentage: number;
  maxConcurrentInstances: number;
}
```

### Test Results
```typescript
interface TestResults {
  summary: TestSummary;
  browserMetrics: BrowserMetrics[];
  drmMetrics: DRMMetrics[];
  networkMetrics: NetworkMetrics[];
  errors: ErrorLog[];
}

interface TestSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  peakConcurrentUsers: number;
  testDuration: number;
}

interface DRMMetrics {
  licenseRequestCount: number;
  averageLicenseTime: number;
  licenseSuccessRate: number;
  drmType: string;
  errors: DRMError[];
}
```

## Error Handling

### Browser Instance Failures
- Implement automatic browser restart on crashes
- Maintain error logs with detailed stack traces
- Graceful degradation when instances become unresponsive
- Circuit breaker pattern for repeatedly failing instances

### Network Request Failures
- Retry logic for transient network errors
- Detailed logging of failed API requests
- Fallback mechanisms for DRM license acquisition failures
- Request timeout handling with configurable limits

### Resource Exhaustion
- Memory monitoring with automatic cleanup
- CPU usage throttling when limits are exceeded
- Graceful test termination when resources are unavailable
- Warning systems for approaching resource limits

## Testing Strategy

### Unit Testing
- Test individual components in isolation
- Mock browser instances for controller testing
- Validate parameter injection logic
- Test configuration parsing and validation

### Integration Testing
- End-to-end test with real browser instances
- Validate DRM license acquisition flow
- Test resource management under load
- Verify network interception accuracy

### Performance Testing
- Benchmark resource consumption per browser instance
- Measure overhead of network interception
- Test scalability with increasing concurrent users
- Validate memory leak prevention

### Load Testing Validation
- Self-testing capability using simple streaming content
- Comparison with known performance baselines
- Validation of reported metrics accuracy
- Cross-platform compatibility testing

## Implementation Considerations

### Browser Selection
- **Playwright with Chromium**: Recommended for best performance and DRM support
- Headless mode by default with option for headed debugging
- Custom browser flags for minimal resource usage
- Shared browser contexts where possible

### Resource Optimization
- Browser instance pooling to reduce startup overhead
- Shared browser processes with isolated contexts
- Minimal page content loading (disable images, CSS, non-essential JS)
- Memory cleanup between test runs

### DRM Support
- Widevine L3 support through Chromium
- Custom certificate handling for enterprise DRM
- License request/response logging and timing
- Support for multiple DRM systems in single test

### Configuration Management
- YAML/JSON configuration files
- Environment variable support
- Command-line argument parsing
- Configuration validation and defaults

### Monitoring and Reporting
- Real-time progress indicators
- Detailed HTML/JSON reports
- Prometheus metrics export capability
- Integration with common monitoring tools