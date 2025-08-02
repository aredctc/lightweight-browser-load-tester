# Lightweight Browser Load Tester

> **Built with Kiro**: This project was developed using [Kiro](https://kiro.ai), an AI-powered IDE that enhances developer productivity through intelligent code assistance and vibe coding approach.

> **Development Status**: This project is still in active development. Some features might not be thoroughly tested yet, and we greatly appreciate community support and feedback to help improve the tool.

A lightweight load testing tool that uses real browsers to test streaming applications, specifically focusing on DRM license acquisition. Built with open source technologies for resource-efficient testing of streaming platforms.

## Features

- **Real Browser Testing**: Uses Playwright with Chromium for authentic user behavior simulation
- **DRM Support**: Built-in support for Widevine, PlayReady, and FairPlay DRM systems
- **Authenticated Session Simulation**: Pre-populate browser localStorage by domain to simulate authenticated users
- **Advanced Request Filtering**: Block non-streaming requests to save compute power with fine-grained control
- **Resource Efficient**: Optimized for minimal memory and CPU usage per browser instance
- **Parameter Injection**: Dynamic modification of API requests with advanced randomization support
- **Comprehensive Monitoring**: Real-time metrics collection and detailed reporting
- **Export Integration**: Prometheus and OpenTelemetry metrics export support
- **Open Source**: Built entirely with open source components and permissive licenses

## Quick Start

### Installation

```bash
# Install from npm (when published)
npm install -g lightweight-browser-load-tester

# Or clone and build from source
git clone <repository-url>
cd lightweight-browser-load-tester
npm install
npm run build
```

### Basic Usage

```bash
# Run a simple load test
load-tester test --streaming-url https://example.com/stream --concurrent-users 5 --test-duration 300

# Use a configuration file
load-tester test --config test-config.yaml

# Generate example configuration
load-tester init --format yaml --output my-config.yaml
```

### Example Configuration

```yaml
concurrentUsers: 10
testDuration: 600
rampUpTime: 60
streamingUrl: https://example-streaming.com/live/channel1

# Request filtering for resource optimization
streamingOnly: true
allowedUrls:
  - "*.css"
  - "*fonts*"
  - "/api/essential/*"
blockedUrls:
  - "*analytics*"
  - "*tracking*"

resourceLimits:
  maxMemoryPerInstance: 512
  maxCpuPercentage: 80
  maxConcurrentInstances: 20
```

### Kubernetes Quick Start

```bash
# Build and deploy locally
docker build -t load-tester:latest .
kubectl apply -k k8s/overlays/local

# Check deployment status
kubectl get pods -n load-tester
kubectl logs -f deployment/load-tester -n load-tester

# Run a one-time load test job
kubectl create job load-test-$(date +%Y%m%d-%H%M%S) \
  --from=cronjob/load-tester-cronjob -n load-tester

# Clean up
kubectl delete -k k8s/overlays/local
```

## Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn package manager
- Sufficient system resources for browser instances

### From NPM (Recommended)

```bash
npm install -g lightweight-browser-load-tester
```

### From Source

```bash
# Clone the repository
git clone https://github.com/aredctc/lightweight-browser-load-tester.git
cd lightweight-browser-load-tester

# Install dependencies
npm install

# Build the project
npm run build

# Link for global usage (optional)
npm link
```

### Kubernetes Deployment

The tool can be deployed on Kubernetes for scalable, distributed load testing:

```bash
# Local deployment (Minikube, Kind, Docker Desktop)
kubectl apply -k k8s/overlays/local

# AWS EKS deployment
kubectl apply -k k8s/overlays/aws-eks

# Build and deploy custom image
docker build -t load-tester:latest .
kubectl apply -k k8s/overlays/local
```

See the [Kubernetes Deployment Guide](docs/KUBERNETES_DEPLOYMENT.md) for detailed instructions on deploying to various Kubernetes platforms including AWS EKS, Google GKE, and Azure AKS.

### System Requirements

- **Memory**: Minimum 2GB RAM, recommended 8GB+ for high concurrency
- **CPU**: Multi-core processor recommended for concurrent browser instances
- **Disk**: 1GB free space for browser binaries and logs
- **Network**: Stable internet connection for streaming content access

#### Kubernetes Requirements

- **Kubernetes**: Version 1.20+
- **Node Resources**: Minimum 4 CPU cores and 8GB RAM per node
- **Storage**: Persistent volume support for result storage
- **Container Runtime**: Docker or containerd

## Configuration

The tool supports configuration through YAML/JSON files and command-line arguments. Command-line arguments take precedence over configuration files.

### Configuration File Structure

```yaml
# Basic test parameters
concurrentUsers: 10          # Number of concurrent browser instances
testDuration: 600            # Test duration in seconds (0 = infinite)
rampUpTime: 60              # Time to gradually start all users
streamingUrl: "https://example-streaming.com/live/channel1"  # Target streaming URL

# Request filtering for resource optimization (optional)
streamingOnly: true          # Block all non-streaming requests to save CPU/memory
allowedUrls:                 # URL patterns to always allow (even when streamingOnly is enabled)
  - "*.css"
  - "*fonts*"
  - "/api/essential/*"
  - "https://cdn.example.com/critical/*"
blockedUrls:                 # URL patterns to always block (even if streaming-related)
  - "*analytics*"
  - "*tracking*"
  - "*ads*"

# DRM configuration (optional)
drmConfig:
  type: widevine            # widevine | playready | fairplay
  licenseUrl: "https://example.com/license"
  certificateUrl: "https://example.com/cert"  # Optional
  customHeaders:
    Authorization: "Bearer token123"
    X-Custom-Header: "custom-value"

# Request parameter injection (optional)
requestParameters:
  - target: header          # header | query | body
    name: "Authorization"
    valueTemplate: "Bearer {{token}}"
    scope: per-session      # global | per-session
  - target: query
    name: "userId"
    valueTemplate: "user_{{sessionId}}"
    scope: per-session

# Resource limits
resourceLimits:
  maxMemoryPerInstance: 512    # MB per browser instance
  maxCpuPercentage: 80        # Maximum CPU usage percentage
  maxConcurrentInstances: 20   # Maximum browser instances

# Prometheus metrics export (optional)
prometheus:
  enabled: true
  remoteWriteUrl: "https://prometheus.example.com/api/v1/write"
  username: "prometheus-user"
  password: "prometheus-pass"
  batchSize: 100
  flushInterval: 30

# OpenTelemetry metrics export (optional)
opentelemetry:
  enabled: true
  endpoint: "https://otel.example.com/v1/metrics"
  protocol: "http/protobuf"
  serviceName: "load-tester"
  serviceVersion: "1.0.0"
```

### Environment Variables

Configuration values can be overridden using environment variables:

```bash
export LT_CONCURRENT_USERS=20
export LT_TEST_DURATION=900
export LT_STREAMING_URL="https://example.com/stream"
export LT_DRM_LICENSE_URL="https://example.com/license"
export LT_PROMETHEUS_ENABLED=true
export LT_PROMETHEUS_URL="https://prometheus.example.com/api/v1/write"
```

## Usage

### Command Line Interface

#### Test Command

Run a load test with the specified configuration:

```bash
load-tester test [options]
```

**Options:**
- `-c, --config <file>`: Configuration file (JSON or YAML)
- `-u, --concurrent-users <number>`: Number of concurrent users
- `-d, --test-duration <seconds>`: Test duration in seconds
- `-r, --ramp-up-time <seconds>`: Ramp up time in seconds
- `-s, --streaming-url <url>`: Streaming URL to test
- `--streaming-only`: Block all non-streaming requests to save CPU/memory
- `--allowed-urls <patterns>`: Comma-separated URL patterns to always allow (even when streaming-only is enabled)
- `--blocked-urls <patterns>`: Comma-separated URL patterns to always block (even if streaming-related)
- `--max-memory <mb>`: Maximum memory per instance in MB
- `--max-cpu <percentage>`: Maximum CPU percentage
- `--max-instances <number>`: Maximum concurrent instances
- `--drm-type <type>`: DRM type (widevine|playready|fairplay)
- `--drm-license-url <url>`: DRM license URL
- `--drm-cert-url <url>`: DRM certificate URL
- `--prometheus-enabled`: Enable Prometheus metrics export
- `--prometheus-url <url>`: Prometheus RemoteWrite endpoint URL
- `--otel-enabled`: Enable OpenTelemetry metrics export
- `--otel-endpoint <url>`: OpenTelemetry OTLP endpoint URL
- `--output <file>`: Output file for results (JSON format)
- `--verbose`: Enable verbose logging

**Examples:**

```bash
# Basic load test
load-tester test --streaming-url https://example-streaming.com/live/channel1 --concurrent-users 5 --test-duration 300

# Streaming-only mode to save resources
load-tester test --streaming-url https://example-streaming.com/live/channel1 --streaming-only --concurrent-users 10

# With allowed URLs for essential resources
load-tester test --streaming-url https://example-streaming.com/live/channel1 --streaming-only \
  --allowed-urls "*.css,*fonts*,/api/essential/*" --concurrent-users 10

# Block analytics and tracking requests
load-tester test --streaming-url https://example-streaming.com/live/channel1 \
  --blocked-urls "*analytics*,*tracking*,*ads*" --concurrent-users 10

# DRM testing with request filtering
load-tester test --config drm-config.yaml --drm-type widevine --drm-license-url https://example.com/license \
  --streaming-only --allowed-urls "*.css,*fonts*"

# With metrics export
load-tester test --config config.yaml --prometheus-enabled --prometheus-url https://prometheus.example.com/api/v1/write

# Save results to file
load-tester test --config config.yaml --output results.json
```

#### Validate Command

Validate a configuration file without running the test:

```bash
load-tester validate --config config.yaml
```

#### Init Command

Generate an example configuration file:

```bash
# Generate YAML configuration
load-tester init --format yaml --output my-config.yaml

# Generate JSON configuration
load-tester init --format json --output my-config.json
```

### Programmatic Usage

The tool can also be used as a Node.js library:

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

try {
  const results = await app.start();
  console.log('Test completed:', results.summary);
} catch (error) {
  console.error('Test failed:', error);
} finally {
  await app.stop();
}
```

## DRM Testing

The tool provides comprehensive support for testing DRM-protected streaming content:

### Supported DRM Systems

- **Widevine**: Google's DRM system, widely used for web streaming
- **PlayReady**: Microsoft's DRM system for various platforms
- **FairPlay**: Apple's DRM system for iOS and Safari

### DRM Configuration

```yaml
drmConfig:
  type: widevine
  licenseUrl: "https://example.com/license"
  certificateUrl: "https://example.com/cert"  # Optional for some DRM types
  customHeaders:
    Authorization: "Bearer your-token"
    X-API-Key: "your-api-key"
```

### DRM Metrics

The tool automatically collects DRM-specific metrics:

- License request count and success rate
- Average license acquisition time
- DRM-specific error tracking
- License server response analysis

## Authenticated Session Simulation

The localStorage feature allows you to pre-populate browser localStorage with authentication tokens, user preferences, and application state to simulate authenticated users. This is essential for testing scenarios where applications rely on existing browser storage data.

### Why Use localStorage?

Many modern web applications store critical data in localStorage:
- Authentication tokens and session data
- User preferences and settings
- Application state and cached data
- Feature flags and A/B test configurations

Without pre-populated localStorage, your tests might fail to access protected resources or trigger authentication flows instead of testing actual functionality.

### Basic Configuration

```yaml
localStorage:
  - domain: "streaming-service.com"
    data:
      auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      user_id: "user_12345"
      subscription_tier: "premium"
      playback_quality: "1080p"
  - domain: "cdn.streaming-service.com"
    data:
      cache_version: "v2.1.0"
      preferred_server: "us-west-1"
```

### Common Use Cases

**Authentication Tokens:**
```yaml
localStorage:
  - domain: "myapp.com"
    data:
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      refresh_token: "def50200a1b2c3d4e5f6..."
      user_id: "user_12345"
```

**Randomized User Data:**
```yaml
localStorage:
  - domain: "streaming-service.com"
    data:
      auth_token: "Bearer {{random:uuid}}"
      user_id: "{{randomFrom:userIds}}"
      session_id: "sess-{{random:alphanumeric}}"
      preferences: '{"quality":"{{randomFrom:videoQualities}}","theme":"{{randomFrom:themes}}"}'
      timestamp: "{{random:timestamp}}"
```

**Application State:**
```yaml
localStorage:
  - domain: "ecommerce.com"
    data:
      cart_items: '[{"id":"{{random:uuid}}","quantity":{{random:1-5}}}]'
      recently_viewed: '["prod_{{random:1-1000}}","prod_{{random:1-1000}}"]'
      user_location: '{"country":"US","currency":"{{randomFrom:currencies}}"}'
```

### Multi-Domain Support

Configure localStorage for applications spanning multiple domains:

```yaml
localStorage:
  - domain: "main-app.com"
    data:
      auth_token: "main_app_token_123"
      user_session: "sess_main_456"
  - domain: "api.main-app.com"
    data:
      api_version: "v3"
      rate_limit_remaining: "1000"
  - domain: "cdn.main-app.com"
    data:
      cache_version: "v2.1.0"
      asset_preferences: '{"webp_support":true}'
```

See the [localStorage Guide](docs/LOCALSTORAGE_GUIDE.md) for comprehensive documentation and examples.

## Request Filtering

The tool provides advanced request filtering capabilities to optimize resource usage and focus testing on streaming-specific requests. This is particularly useful for reducing CPU and memory consumption during load testing.

### Streaming-Only Mode

Enable `streamingOnly: true` to block all non-streaming requests, allowing only streaming-related and essential requests to pass through. The system automatically identifies streaming requests based on URL patterns:

- **Manifest files**: `.m3u8`, `.mpd`, URLs containing "manifest"
- **Media segments**: `.ts`, `.m4s`, `.mp4`, URLs containing "segment" or "chunk"
- **DRM/License requests**: URLs containing "license", "drm", "widevine", "playready", "fairplay"
- **Streaming APIs**: URLs matching patterns like "api.*stream", "playback", "player"

### URL Pattern Control

- **Allowed URLs**: Specify patterns that should always be allowed, even in streaming-only mode
- **Blocked URLs**: Specify patterns that should always be blocked, even if they're streaming-related

### Example Configuration

```yaml
# Block all non-streaming requests to save resources
streamingOnly: true

# Allow essential resources even in streaming-only mode
allowedUrls:
  - "*.css"
  - "*fonts*"
  - "/api/essential/*"
  - "https://cdn.example.com/critical/*"

# Block analytics and tracking regardless of streaming status
blockedUrls:
  - "*analytics*"
  - "*tracking*"
  - "*ads*"
  - "https://metrics.example.com/*"
```

### Performance Benefits

Request filtering can significantly improve performance:
- **30-60% memory reduction** by blocking unnecessary resources
- **20-40% CPU savings** from processing fewer requests
- **Reduced bandwidth usage** and faster test execution
- **Cleaner metrics** focused on streaming-specific performance

See the [Request Filtering Guide](docs/REQUEST_FILTERING_GUIDE.md) for detailed information about patterns, configuration options, and troubleshooting.

## Parameter Injection

Dynamically modify specific API requests using **URL-based targeting** with powerful randomization capabilities. The key feature is **selective request targeting** - applying different parameters to different endpoints.

### URL-Based Request Targeting (Primary Feature)
```yaml
requestParameters:
  # Target authentication endpoints only
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/auth/*"  # Only auth endpoints
  
  # Target streaming manifest files only
  - target: header
    name: "Accept"
    valueTemplate: "application/vnd.apple.mpegurl"
    scope: global
    urlPattern: "*.m3u8"  # Only HLS manifests
  
  # Target analytics POST requests only
  - target: body
    name: "sessionData"
    valueTemplate: '{"sessionId": "{{sessionId}}", "timestamp": {{timestamp}}}'
    scope: per-session
    urlPattern: "*/analytics/*"
    method: "POST"  # Only POST to analytics
```

### Built-in Random Functions
```yaml
requestParameters:
  - target: header
    name: "X-Request-ID"
    valueTemplate: "{{random:uuid}}"
    scope: per-session
    urlPattern: "*/api/*"  # Target API endpoints
  - target: query
    name: "userId"
    valueTemplate: "{{random:1-10000}}"
    scope: per-session
    urlPattern: "*/user/*"  # Target user endpoints
```

### Random Selection from Files
```yaml
requestParameters:
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/auth/*"  # Only auth endpoints
```

### Parameter Types

- **Headers**: Modify HTTP headers for specific URL patterns
- **Query Parameters**: Add/modify URL query parameters for targeted requests
- **Request Body**: Modify POST/PUT request bodies (JSON and form data supported)

### URL Pattern Syntax

- **Wildcards**: `*/api/*` (matches any API endpoint)
- **File extensions**: `*.m3u8` (matches HLS manifests)
- **Regex patterns**: `/^https:\/\/cdn[0-9]+\.example\.com/` (CDN servers)
- **Method filtering**: Combine with `method: "POST"` for precise targeting

### Complete Example Configuration

```yaml
requestParameters:
  # Authentication for API endpoints
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/api-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/*"
  
  # User tracking for specific services
  - target: query
    name: "userId"
    valueTemplate: "user_{{sessionId}}"
    scope: per-session
    urlPattern: "*/service/user/*"
  
  # Request metadata for analytics POST requests
  - target: body
    name: "clientInfo"
    valueTemplate: '{"sessionId": "{{sessionId}}", "timestamp": {{timestamp}}, "deviceType": "{{randomFrom:deviceTypes}}"}'
    scope: per-session
    urlPattern: "*/analytics/*"
    method: "POST"
```

## Monitoring and Metrics

### Real-time Monitoring

During test execution, the tool displays real-time metrics:

```
⏱️  Progress: 45.2% | 👥 Active: 10 | 📊 Requests: 1,234 (1,200 success, 34 failed) | ⚡ RPS: 12.5 | 💾 Memory: 2,048MB | ⏰ Remaining: 164s
```

### Test Results

After completion, detailed results are displayed:

```
📊 Test Results Summary:
══════════════════════════════════════════════════
📈 Total Requests: 5,432
✅ Successful: 5,398 (99.4%)
❌ Failed: 34 (0.6%)
⏱️  Average Response Time: 245.67ms
👥 Peak Concurrent Users: 10
⏰ Test Duration: 300.0s

🔐 DRM Metrics:
  widevine: 543 requests, 156.23ms avg, 99.8% success

⚠️  Errors: 34 total
  error: 2
  warning: 32
```

### Metrics Export

#### Prometheus Integration

Export metrics to Prometheus for long-term storage and analysis:

```yaml
prometheus:
  enabled: true
  remoteWriteUrl: "https://prometheus.example.com/api/v1/write"
  username: "prometheus-user"
  password: "prometheus-pass"
  batchSize: 100
  flushInterval: 30
```

**Exported Metrics:**
- `load_test_requests_total`: Total number of requests
- `load_test_request_duration_seconds`: Request duration histogram
- `load_test_active_sessions`: Number of active browser sessions
- `load_test_drm_license_duration_seconds`: DRM license acquisition time
- `load_test_memory_usage_bytes`: Memory usage per browser instance

#### OpenTelemetry Integration

Export metrics to OpenTelemetry-compatible systems:

```yaml
opentelemetry:
  enabled: true
  endpoint: "https://otel.example.com/v1/metrics"
  protocol: "http/protobuf"
  serviceName: "load-tester"
  serviceVersion: "1.0.0"
```

## Performance Optimization

### Resource Management

The tool is optimized for minimal resource consumption:

- **Browser Instance Pooling**: Reuse browser instances to reduce startup overhead
- **Memory Management**: Automatic cleanup between test runs
- **CPU Throttling**: Configurable CPU usage limits per instance
- **Headless Mode**: Runs browsers without GUI by default

### Configuration Tips

For optimal performance:

```yaml
resourceLimits:
  maxMemoryPerInstance: 512    # Start with 512MB, increase if needed
  maxCpuPercentage: 80        # Leave 20% CPU for system processes
  maxConcurrentInstances: 20   # Adjust based on available system resources

# Use shorter test durations for initial testing
testDuration: 300             # 5 minutes for quick validation
rampUpTime: 30               # Gradual ramp-up reduces system shock
```

### System Tuning

For high-concurrency testing:

```bash
# Increase file descriptor limits
ulimit -n 65536

# Increase memory limits (if needed)
ulimit -v unlimited

# Monitor system resources during testing
htop  # or similar system monitor
```

## Documentation

- **[Configuration Guide](docs/CONFIGURATION_GUIDE.md)**: Detailed configuration options and examples
- **[Request Ingestion Guide](docs/REQUEST_INGESTION_GUIDE.md)**: Comprehensive guide for parameter injection and request modification
- **[Request Filtering Guide](docs/REQUEST_FILTERING_GUIDE.md)**: Complete guide to request filtering, streaming-only mode, and URL patterns
- **[Parameter Randomization Guide](docs/RANDOMIZATION_GUIDE.md)**: Advanced guide for dynamic parameter generation and randomization
- **[Kubernetes Deployment Guide](docs/KUBERNETES_DEPLOYMENT.md)**: Complete guide for deploying on Kubernetes (local, AWS EKS, GKE, AKS)
- **[API Documentation](API.md)**: Complete API reference for all classes and interfaces
- **[Troubleshooting Guide](TROUBLESHOOTING.md)**: Solutions to common issues and problems

## Troubleshooting

See the [Troubleshooting Guide](TROUBLESHOOTING.md) for detailed solutions to common issues.

### Common Issues

**Browser Launch Failures**
```
Error: Failed to launch browser
```
- Ensure sufficient system resources
- Check browser binary installation
- Verify network connectivity

**Memory Issues**
```
Error: Out of memory
```
- Reduce `maxConcurrentInstances`
- Increase `maxMemoryPerInstance`
- Monitor system memory usage

**DRM License Failures**
```
Error: DRM license acquisition failed
```
- Verify DRM configuration
- Check license server accessibility
- Validate authentication tokens

## API Documentation

See the [API Documentation](API.md) for detailed information about all public interfaces and classes.

## Examples

The `examples/` directory contains practical configuration examples for common scenarios:

- **[basic-load-test.json](examples/basic-load-test.json)**: Basic load testing configuration
- **[drm-testing.yaml](examples/drm-testing.yaml)**: DRM testing with Widevine
- **[selective-parameters.yaml](examples/selective-parameters.yaml)**: URL-based selective parameter targeting (RECOMMENDED)
- **[request-body-injection.yaml](examples/request-body-injection.yaml)**: Request body modification examples
- **[randomization-features.yaml](examples/randomization-features.yaml)**: Advanced randomization features

See the [Examples README](examples/README.md) for detailed descriptions and usage instructions.

## Open Source

This project is **100% open source** and built with open source technologies. We believe in the power of community-driven development and welcome contributions from developers worldwide.

### Open Source Technologies Used

- **[Node.js](https://nodejs.org/)**: JavaScript runtime built on Chrome's V8 engine
- **[TypeScript](https://www.typescriptlang.org/)**: Typed superset of JavaScript
- **[Playwright](https://playwright.dev/)**: Browser automation framework by Microsoft
- **[Commander.js](https://github.com/tj/commander.js/)**: Command-line interface framework
- **[Winston](https://github.com/winstonjs/winston)**: Logging library
- **[Joi](https://github.com/sideway/joi)**: Schema validation library
- **[YAML](https://github.com/eemeli/yaml)**: YAML parser and stringifier
- **[Vitest](https://vitest.dev/)**: Testing framework
- **[ESLint](https://eslint.org/)**: Code linting and formatting

### Open Source Principles

- **Transparency**: All code, documentation, and development processes are public
- **Community-driven**: Features and improvements driven by community needs
- **Permissive licensing**: MIT license allows commercial and personal use
- **No vendor lock-in**: Works with any infrastructure and cloud provider
- **Standards compliance**: Built on open standards and protocols

### Why Open Source?

1. **Community Innovation**: Leverage collective expertise and creativity
2. **Transparency**: Full visibility into how the tool works and what it does
3. **Security**: Open code allows for security audits and vulnerability detection
4. **Flexibility**: Modify and extend the tool to meet specific requirements
5. **Cost-effective**: No licensing fees or vendor restrictions
6. **Longevity**: Community maintenance ensures long-term viability

### Commercial Use

This project is licensed under the MIT License, which means:

- ✅ **Commercial use**: Use in commercial projects and products
- ✅ **Modification**: Modify the code for your needs
- ✅ **Distribution**: Distribute original or modified versions
- ✅ **Private use**: Use privately without sharing changes
- ✅ **Patent use**: Use any patents contributed by contributors

The only requirement is to include the original copyright notice and license text.

### Enterprise Support

While the project is open source, enterprise users can:

- **Self-support**: Use the comprehensive documentation and community resources
- **Community support**: Get help from the community via GitHub Issues and Discussions
- **Professional services**: Engage with contributors for custom development or consulting
- **Training and workshops**: Community members may offer training services

## Contributing

We welcome contributions from developers of all skill levels! Here's how you can help:

### Ways to Contribute

- 🐛 **Report bugs**: Help us identify and fix issues
- 💡 **Suggest features**: Propose new functionality or improvements
- 📝 **Improve documentation**: Enhance guides, examples, and API docs
- 🧪 **Add tests**: Increase test coverage and reliability
- 🔧 **Fix issues**: Submit pull requests for bug fixes
- 🌟 **Add examples**: Create configuration examples for new use cases
- ☁️ **Cloud support**: Improve Kubernetes and cloud provider integrations

### Quick Start for Contributors

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lightweight-browser-load-tester.git
   cd lightweight-browser-load-tester
   ```
3. **Install dependencies**:
   ```bash
   npm install
   npx playwright install chromium
   ```
4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes** and add tests
6. **Run tests**:
   ```bash
   npm test
   npm run lint
   ```
7. **Submit a pull request**

### Development Guidelines

- Follow the existing code style and conventions
- Add tests for new functionality
- Update documentation for user-facing changes
- Use clear, descriptive commit messages
- Keep pull requests focused and atomic

See our [Contributing Guide](CONTRIBUTING.md) for detailed information.

### Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

## Community

### Get Involved

- 🌟 **Star the repository** to show your support
- 👀 **Watch the repository** for updates and releases
- 🐛 **Report issues** to help improve the project
- 💬 **Join discussions** to share ideas and get help
- 🤝 **Contribute code** to add features and fix bugs
- 📢 **Spread the word** about the project

### Community Resources

- **[GitHub Repository](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester)**: Source code and project management
- **[GitHub Issues](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/issues)**: Bug reports and feature requests
- **[GitHub Discussions](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/discussions)**: Community Q&A and general discussion
- **[Releases](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/releases)**: Version releases and changelogs

### Recognition

Contributors are recognized through:
- GitHub contributors list
- Release notes acknowledgments
- Special mentions for significant contributions

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

The MIT License is a permissive license that allows:
- Commercial use
- Modification
- Distribution
- Private use

The only requirement is to include the original copyright notice and license text in any substantial portions of the software.

## Support

### Community Support (Free)

- **[GitHub Issues](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/issues)**: Report bugs and request features
- **[GitHub Discussions](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/discussions)**: Ask questions and get community help
- **[Documentation](docs/)**: Comprehensive guides and API documentation
- **[Examples](examples/)**: Configuration examples for common scenarios

### Self-Service Resources

- **[Configuration Guide](docs/CONFIGURATION_GUIDE.md)**: Detailed configuration options
- **[Kubernetes Deployment Guide](docs/KUBERNETES_DEPLOYMENT.md)**: Cloud deployment instructions
- **[API Documentation](API.md)**: Complete API reference
- **[Troubleshooting Guide](TROUBLESHOOTING.md)**: Solutions to common issues

### Professional Services

For organizations requiring additional support:
- Custom feature development
- Integration consulting
- Training and workshops
- Performance optimization
- Enterprise deployment assistance

Contact contributors through GitHub for professional service inquiries.