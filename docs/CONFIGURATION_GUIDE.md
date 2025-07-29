# Configuration Guide

This guide provides detailed information about configuring the Lightweight Browser Load Tester for different testing scenarios.

## Table of Contents

- [Configuration File Formats](#configuration-file-formats)
- [Basic Configuration](#basic-configuration)
- [DRM Testing Configuration](#drm-testing-configuration)
- [Parameter Injection](#parameter-injection)
- [Resource Management](#resource-management)
- [Metrics Export](#metrics-export)
- [Example Configurations](#example-configurations)
- [Environment Variables](#environment-variables)
- [Validation](#validation)

## Configuration File Formats

The tool supports both YAML and JSON configuration formats:

### YAML Format (Recommended)
```yaml
concurrentUsers: 10
testDuration: 600
streamingUrl: https://example.com/stream
```

### JSON Format
```json
{
  "concurrentUsers": 10,
  "testDuration": 600,
  "streamingUrl": "https://example.com/stream"
}
```

## Basic Configuration

### Required Fields

```yaml
concurrentUsers: 10              # Number of concurrent browser instances
testDuration: 600               # Test duration in seconds (0 = infinite)
rampUpTime: 60                  # Time to gradually start all users (seconds)
streamingUrl: "https://example.com/stream"  # Target streaming URL
```

### Resource Limits (Required)

```yaml
resourceLimits:
  maxMemoryPerInstance: 512     # Maximum memory per browser instance (MB)
  maxCpuPercentage: 80         # Maximum CPU usage percentage
  maxConcurrentInstances: 20    # Maximum number of browser instances
```

## DRM Testing Configuration

### Widevine Configuration

```yaml
drmConfig:
  type: widevine
  licenseUrl: "https://example.com/widevine/license"
  certificateUrl: "https://example.com/widevine/cert"  # Optional
  customHeaders:
    Authorization: "Bearer your-token"
    X-DRM-Version: "1.0"
```

### PlayReady Configuration

```yaml
drmConfig:
  type: playready
  licenseUrl: "https://example.com/playready/license"
  customHeaders:
    Authorization: "Bearer your-token"
    X-PlayReady-Version: "4.0"
```

### FairPlay Configuration

```yaml
drmConfig:
  type: fairplay
  licenseUrl: "https://example.com/fairplay/license"
  certificateUrl: "https://example.com/fairplay/cert"  # Required for FairPlay
  customHeaders:
    Authorization: "Bearer your-token"
```

## Parameter Injection

### Header Injection

```yaml
requestParameters:
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{token}}"
    scope: per-session
  - target: header
    name: "User-Agent"
    valueTemplate: "LoadTester/1.0 Session-{{sessionId}}"
    scope: per-session
```

### Query Parameter Injection

```yaml
requestParameters:
  - target: query
    name: "userId"
    valueTemplate: "user_{{sessionId}}"
    scope: per-session
  - target: query
    name: "timestamp"
    valueTemplate: "{{timestamp}}"
    scope: global
```

### Request Body Injection

```yaml
requestParameters:
  - target: body
    name: "sessionData"
    valueTemplate: '{"sessionId": "{{sessionId}}", "timestamp": {{timestamp}}}'
    scope: per-session
```

### Variable Substitution

Available template variables:

- `{{sessionId}}`: Unique identifier for each browser session
- `{{timestamp}}`: Current Unix timestamp
- `{{random}}`: Random number (0-999999)
- `{{token}}`: Authentication token (if configured)

### Parameter Scopes

- `global`: Same value used across all browser instances
- `per-session`: Unique value generated for each browser instance

## Resource Management

### Memory Configuration

```yaml
resourceLimits:
  maxMemoryPerInstance: 512     # MB per browser instance
  
# Guidelines:
# - 256MB: Minimal, suitable for simple pages
# - 512MB: Standard, good for most streaming content
# - 1024MB: High, for complex DRM or heavy pages
# - 2048MB: Maximum, for resource-intensive scenarios
```

### CPU Configuration

```yaml
resourceLimits:
  maxCpuPercentage: 80         # Maximum CPU usage
  
# Guidelines:
# - 50%: Conservative, leaves resources for system
# - 80%: Standard, good balance of performance and stability
# - 90%: Aggressive, maximum performance
# - 95%: Extreme, may cause system instability
```

### Concurrency Configuration

```yaml
resourceLimits:
  maxConcurrentInstances: 20   # Maximum browser instances
  
# Guidelines based on system resources:
# - 4GB RAM: 5-10 instances
# - 8GB RAM: 10-20 instances  
# - 16GB RAM: 20-40 instances
# - 32GB RAM: 40-80 instances
```

## Metrics Export

### Prometheus Configuration

```yaml
prometheus:
  enabled: true
  remoteWriteUrl: "https://prometheus.example.com/api/v1/write"
  username: "prometheus-user"           # Optional
  password: "prometheus-password"       # Optional
  batchSize: 100                       # Metrics per batch (default: 100)
  flushInterval: 30                    # Flush interval in seconds (default: 30)
  timeout: 10000                       # Request timeout in ms (default: 10000)
  retryAttempts: 3                     # Retry attempts (default: 3)
  retryDelay: 1000                     # Retry delay in ms (default: 1000)
  headers:                             # Optional custom headers
    X-Custom-Header: "custom-value"
```

### OpenTelemetry Configuration

```yaml
opentelemetry:
  enabled: true
  endpoint: "https://otel-collector.example.com/v1/metrics"
  protocol: "http/protobuf"            # http/protobuf | http/json | grpc
  serviceName: "load-tester"           # Service name (default: load-tester)
  serviceVersion: "1.0.0"              # Service version
  timeout: 15000                       # Request timeout in ms
  compression: "gzip"                  # gzip | none
  batchTimeout: 5000                   # Batch timeout in ms
  maxExportBatchSize: 512              # Maximum batch size
  maxQueueSize: 2048                   # Maximum queue size
  exportTimeout: 30000                 # Export timeout in ms
  headers:                             # Optional custom headers
    X-API-Key: "your-api-key"
```

## Example Configurations

### Basic Load Testing

**File:** `test-configs/example-basic.json`

Simple configuration for basic load testing without DRM or advanced features.

```json
{
  "concurrentUsers": 5,
  "testDuration": 300,
  "rampUpTime": 30,
  "streamingUrl": "https://example.com/stream",
  "resourceLimits": {
    "maxMemoryPerInstance": 512,
    "maxCpuPercentage": 80,
    "maxConcurrentInstances": 10
  }
}
```

**Use Case:** Quick validation of streaming infrastructure with minimal resource usage.

### DRM Testing

**File:** `test-configs/example-drm.yaml`

Configuration for testing DRM-protected content with parameter injection.

```yaml
concurrentUsers: 10
testDuration: 600
rampUpTime: 60
streamingUrl: https://example.com/drm-stream

drmConfig:
  type: widevine
  licenseUrl: https://example.com/license
  certificateUrl: https://example.com/cert
  customHeaders:
    Authorization: Bearer token123
    X-Custom-Header: custom-value

requestParameters:
  - target: header
    name: Authorization
    valueTemplate: Bearer {{token}}
    scope: per-session
  - target: query
    name: userId
    valueTemplate: user_{{sessionId}}
    scope: per-session

resourceLimits:
  maxMemoryPerInstance: 1024
  maxCpuPercentage: 90
  maxConcurrentInstances: 20
```

**Use Case:** Testing DRM license acquisition under load with authentication.

### High Concurrency Testing

**File:** `test-configs/example-high-concurrency.yaml`

Optimized configuration for testing with many concurrent users.

```yaml
concurrentUsers: 50
testDuration: 1800
rampUpTime: 300
streamingUrl: https://example.com/dash-stream

requestParameters:
  - target: header
    name: X-Load-Test
    valueTemplate: "true"
    scope: global
  - target: header
    name: X-User-ID
    valueTemplate: user_{{sessionId}}
    scope: per-session

resourceLimits:
  maxMemoryPerInstance: 384
  maxCpuPercentage: 75
  maxConcurrentInstances: 60
```

**Use Case:** Stress testing streaming infrastructure with high user loads.

### Prometheus Metrics Export

**File:** `test-configs/example-prometheus.json`

Configuration with Prometheus metrics export for monitoring and analysis.

```json
{
  "concurrentUsers": 15,
  "testDuration": 900,
  "rampUpTime": 90,
  "streamingUrl": "https://example.com/stream",
  "prometheus": {
    "enabled": true,
    "remoteWriteUrl": "https://prometheus.example.com/api/v1/write",
    "username": "load-tester",
    "password": "secure-password",
    "batchSize": 100,
    "flushInterval": 30
  }
}
```

**Use Case:** Long-term monitoring and analysis of load test results.

### OpenTelemetry Export

**File:** `test-configs/example-opentelemetry.yaml`

Configuration with OpenTelemetry metrics export for observability platforms.

```yaml
concurrentUsers: 20
testDuration: 1200
rampUpTime: 120
streamingUrl: https://example.com/hls-stream

opentelemetry:
  enabled: true
  endpoint: https://otel-collector.example.com/v1/metrics
  protocol: http/protobuf
  serviceName: browser-load-tester
  serviceVersion: 1.0.0
```

**Use Case:** Integration with OpenTelemetry-based observability stacks.

## Environment Variables

Override configuration values using environment variables with the `LT_` prefix:

### Basic Configuration
```bash
export LT_CONCURRENT_USERS=20
export LT_TEST_DURATION=900
export LT_RAMP_UP_TIME=90
export LT_STREAMING_URL="https://example.com/stream"
```

### Resource Limits
```bash
export LT_MAX_MEMORY_PER_INSTANCE=1024
export LT_MAX_CPU_PERCENTAGE=85
export LT_MAX_CONCURRENT_INSTANCES=25
```

### DRM Configuration
```bash
export LT_DRM_TYPE=widevine
export LT_DRM_LICENSE_URL="https://example.com/license"
export LT_DRM_CERT_URL="https://example.com/cert"
```

### Prometheus Configuration
```bash
export LT_PROMETHEUS_ENABLED=true
export LT_PROMETHEUS_URL="https://prometheus.example.com/api/v1/write"
export LT_PROMETHEUS_USERNAME="prometheus-user"
export LT_PROMETHEUS_PASSWORD="prometheus-pass"
```

### OpenTelemetry Configuration
```bash
export LT_OTEL_ENABLED=true
export LT_OTEL_ENDPOINT="https://otel.example.com/v1/metrics"
export LT_OTEL_PROTOCOL="http/protobuf"
export LT_OTEL_SERVICE_NAME="load-tester"
```

## Validation

### Validate Configuration File

```bash
# Validate YAML configuration
load-tester validate --config config.yaml

# Validate JSON configuration
load-tester validate --config config.json
```

### Common Validation Errors

**Missing Required Fields:**
```
❌ Configuration Error: "concurrentUsers" is required
```

**Invalid Data Types:**
```
❌ Configuration Error: "testDuration" must be a number
```

**Invalid Values:**
```
❌ Configuration Error: "concurrentUsers" must be greater than 0
```

**Invalid DRM Type:**
```
❌ Configuration Error: "drmConfig.type" must be one of [widevine, playready, fairplay]
```

### Configuration Schema

The tool validates configurations against the following schema:

```typescript
interface TestConfiguration {
  concurrentUsers: number;           // Required, > 0
  testDuration: number;              // Required, >= 0
  rampUpTime: number;               // Required, >= 0
  streamingUrl: string;             // Required, valid URL
  drmConfig?: {                     // Optional
    type: 'widevine' | 'playready' | 'fairplay';
    licenseUrl: string;             // Valid URL
    certificateUrl?: string;        // Optional, valid URL
    customHeaders?: Record<string, string>;
  };
  requestParameters: Array<{        // Optional, defaults to []
    target: 'header' | 'query' | 'body';
    name: string;
    valueTemplate: string;
    scope: 'global' | 'per-session';
  }>;
  resourceLimits: {                 // Required
    maxMemoryPerInstance: number;   // > 0
    maxCpuPercentage: number;      // 1-100
    maxConcurrentInstances: number; // > 0
  };
  prometheus?: {                    // Optional
    enabled: boolean;
    remoteWriteUrl: string;        // Valid URL
    username?: string;
    password?: string;
    // ... other optional fields
  };
  opentelemetry?: {                 // Optional
    enabled: boolean;
    endpoint: string;              // Valid URL
    protocol: 'http/protobuf' | 'http/json' | 'grpc';
    // ... other optional fields
  };
}
```

## Best Practices

### Performance Optimization

1. **Start Small:** Begin with low concurrency and short duration
2. **Gradual Ramp-up:** Use appropriate ramp-up times to avoid overwhelming systems
3. **Resource Monitoring:** Monitor system resources during testing
4. **Memory Management:** Use appropriate memory limits based on content complexity

### Configuration Management

1. **Version Control:** Store configurations in version control
2. **Environment-Specific:** Use different configurations for different environments
3. **Validation:** Always validate configurations before running tests
4. **Documentation:** Document custom configurations and their purposes

### Testing Strategy

1. **Baseline Testing:** Establish baseline performance before load testing
2. **Incremental Load:** Gradually increase load to find breaking points
3. **Duration Planning:** Use appropriate test durations for meaningful results
4. **Metrics Collection:** Enable metrics export for analysis and trending

### Security Considerations

1. **Credential Management:** Use environment variables for sensitive data
2. **Network Security:** Ensure secure connections to DRM and metrics endpoints
3. **Access Control:** Limit access to configuration files containing credentials
4. **Token Rotation:** Regularly rotate authentication tokens and passwords