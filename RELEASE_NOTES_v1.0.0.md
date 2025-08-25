# 🚀 Lightweight Browser Load Tester v1.0.0-rc.6

## 🎉 Release Candidate 6 - Chrome Browser Support & Enhanced DRM!

We're excited to announce the sixth iteration of our release candidate! This version introduces full Google Chrome browser support alongside Chromium, providing enhanced DRM testing capabilities and fixing critical streaming classification issues. Building upon the robust foundation of previous releases, RC6 delivers true DRM compatibility with Chrome's Widevine support and resolves media segment detection problems, making it the most accurate and DRM-capable version yet.

## ✨ Key Features

### 🌐 **Browser-Based Load Testing**
- Real browser automation using Playwright
- Support for streaming media and DRM-protected content
- Concurrent user simulation with configurable ramp-up

### 🔐 **DRM Support**
- Widevine DRM integration
- PlayReady support
- FairPlay compatibility
- License server testing

### 📊 **Comprehensive Monitoring**
- Real-time performance metrics
- Resource usage tracking
- Error recovery and circuit breaker patterns
- Detailed test reporting

### 📈 **Metrics Export**
- Prometheus metrics integration
- OpenTelemetry support
- Custom metric exporters
- Real-time monitoring dashboards

### ☁️ **Cloud-Ready Deployment**
- Docker containerization
- Kubernetes deployment manifests
- Multi-cloud support (AWS EKS, Azure AKS, Google GKE)
- Horizontal scaling capabilities

### 🎯 **Advanced Parameter Injection**
- **Built-in Random Functions** - Generate UUIDs, timestamps, random numbers, and ranges
- **Array-based Randomization** - Random selection from predefined value sets
- **File-based Randomization** - Load and randomly select from external data files
- **Combined Templates** - Mix multiple randomization methods in single parameters
- **Performance Optimized** - File caching and efficient random generation

### 🚫 **Advanced Request Filtering**
- **Streaming-Only Mode** - Block non-streaming requests to save compute power with fine-grained control
- **Allowed URLs Override** - Specify URL patterns that should always be allowed
- **Blocked URLs** - Block specific URL patterns even if they're streaming-related
- **Smart Pattern Matching** - Support for wildcards, regex patterns, and exact matching
- **Resource Optimization** - 30-60% memory reduction and 20-40% CPU savings

### 🌐 **Chrome Browser Support** ⭐ NEW IN RC6
- **Dual Browser Support** - Choose between Google Chrome and Chromium browsers (`browserType: chrome|chromium`)
- **Automatic DRM Selection** - Chrome automatically selected when DRM configuration is detected
- **Cross-Platform Detection** - Automatic Chrome executable path detection for macOS, Windows, and Linux
- **Graceful Fallback** - Seamless fallback to Chromium when Chrome is unavailable
- **Enhanced CLI Options** - New `--browser-type`, `--headless`, `--no-headless` command-line arguments

### 🔐 **Enhanced DRM Compatibility** ⭐ IMPROVED IN RC6
- **True Widevine Support** - Full Chrome browser integration with hardware-backed DRM capabilities
- **Automatic Browser Selection** - Chrome automatically chosen for DRM testing scenarios
- **Hardware Security Features** - Access to Chrome's proprietary DRM modules and security features
- **DRM-Specific Arguments** - Chrome-optimized arguments (`--enable-widevine-cdm`, `--autoplay-policy=no-user-gesture-required`)
- **Intelligent Configuration** - Automatic headless mode disabling and DRM optimization

### 🔧 **Configurable Browser Options** ⭐ ENHANCED IN RC6
- **Browser Type Selection** - Choose Chrome for DRM or Chromium for performance (`browserType: chrome|chromium`)
- **Headless Mode Control** - Toggle browser visibility for debugging (`headless: true/false`)
- **Custom Browser Arguments** - Full control over browser behavior with 50+ supported arguments
- **Debugging Support** - DevTools integration, remote debugging, verbose logging capabilities
- **Performance Tuning** - Memory limits, CPU optimization, cache management, and resource control
- **DRM Optimization** - Hardware acceleration, codec support, and content protection settings

### � **Authenthicated Session Simulation** ⭐ NEW IN RC4
- **Browser localStorage Pre-population** - Simulate authenticated users with pre-configured localStorage data
- **Multi-Domain Support** - Set localStorage for multiple domains (main app, API, CDN, etc.)
- **Randomized User Data** - Each browser instance gets unique user data for realistic testing
- **Complex JSON Support** - Handle complex application state and user preferences
- **Authentication Token Management** - Pre-populate JWT tokens, session IDs, and user credentials

### 🎲 **localStorage Randomization** ⭐ NEW IN RC4
- **Unique User Simulation** - Each browser instance simulates a different authenticated user
- **Dynamic Data Generation** - Randomize user IDs, session tokens, preferences, and application state
- **Predefined Arrays** - Built-in arrays for common data types (themes, languages, currencies, etc.)
- **File-Based Randomization** - Load user data from external files for environment-specific testing
- **JSON Structure Preservation** - Randomize values within JSON objects while maintaining valid structure

### 🛠️ **Developer Experience**
- TypeScript implementation with full type safety
- Comprehensive CLI interface
- Flexible configuration (JSON/YAML)
- Extensive documentation

## 📦 Installation

### NPM Package (Release Candidate 6)
```bash
# Install the latest RC version
npm install -g lightweight-browser-load-tester@rc
load-tester --help

# Or install specific RC6 version
npm install -g lightweight-browser-load-tester@1.0.0-rc.6
```

### Docker Image
```bash
docker pull ghcr.io/[your-username]/lightweight-browser-load-tester:v1.0.0
docker run ghcr.io/[your-username]/lightweight-browser-load-tester:v1.0.0 test --help
```

### Kubernetes Deployment
```bash
kubectl apply -f https://raw.githubusercontent.com/[your-username]/lightweight-browser-load-tester/main/k8s/base/
```

## 🚀 Quick Start

1. **Generate a configuration file:**
   ```bash
   load-tester init -f yaml -o my-test-config.yaml
   ```

2. **Edit the configuration:**
   ```yaml
   concurrentUsers: 10
   testDuration: 300
   streamingUrl: "https://your-streaming-service.com/stream"
   
   # NEW IN RC6: Chrome browser support and enhanced DRM
   browserOptions:
     browserType: chrome  # Choose 'chrome' for DRM or 'chromium' for performance
     headless: false      # Enable for debugging or DRM content (auto-disabled for DRM)
     args:
       - "--auto-open-devtools-for-tabs"  # Open DevTools automatically
       - "--start-maximized"              # Start browser maximized
       - "--enable-widevine-cdm"          # Enable Widevine DRM support (Chrome only)
   
   # DRM configuration (automatically disables headless mode)
   drmConfig:
     type: widevine
     licenseUrl: "https://your-drm-service.com/license"
     customHeaders:
       Authorization: "Bearer your-drm-token"
   
   # Authenticated session simulation with localStorage (RC4)
   localStorage:
     - domain: "your-streaming-service.com"
       data:
         auth_token: "Bearer {{random:uuid}}"
         user_id: "{{randomFrom:userIds}}"
         session_id: "sess-{{random:alphanumeric}}"
         preferences: '{"quality":"{{randomFrom:videoQualities}}","theme":"{{randomFrom:themes}}"}'
     - domain: "api.your-streaming-service.com"
       data:
         api_key: "{{randomFromFile:./data/api-keys.txt}}"
         rate_limit: "{{random:100-1000}}"
   
   # Advanced request filtering for resource optimization
   streamingOnly: true
   allowedUrls:
     - "*.css"
     - "*fonts*"
     - "/api/essential/*"
   blockedUrls:
     - "*analytics*"
     - "*tracking*"
     - "*ads*"
   
   # Advanced parameter randomization
   requestParameters:
     - target: header
       name: "X-Request-ID"
       valueTemplate: "{{random:uuid}}"
       scope: per-session
     - target: header
       name: "User-Agent"
       valueTemplate: "{{randomFrom:userAgents}}"
       scope: per-session
     - target: header
       name: "Authorization"
       valueTemplate: "Bearer {{randomFromFile:./data/auth-tokens.txt}}"
       scope: per-session
   ```

3. **Run your test:**
   ```bash
   # Automatic browser selection based on configuration
   load-tester test -c my-test-config.yaml
   
   # Or specify browser type explicitly
   load-tester test -c my-test-config.yaml --browser-type chrome --no-headless
   ```

## 📋 What's Included

### Core Components
- **Browser Pool Management** - Efficient browser instance lifecycle
- **Error Recovery System** - Automatic failure detection and recovery
- **Request Interceptor** - Network request modification and monitoring
- **Results Aggregator** - Comprehensive test result analysis
- **Test Runner** - Orchestrates the entire testing workflow

### Configuration Options
- Concurrent user simulation (1-1000+ users)
- Configurable test duration and ramp-up time
- DRM configuration for protected content
- Resource limits and monitoring
- **localStorage Pre-population** ⭐ NEW - Multi-domain authenticated session simulation
- **localStorage Randomization** ⭐ NEW - Unique user data per browser instance
- **Advanced Request Filtering** - Streaming-only mode with allowed/blocked URL patterns
- **Dynamic Parameter Randomization** - Advanced request modification with randomization
- Custom request parameters and headers
- Prometheus and OpenTelemetry integration

### Deployment Options
- **Local Development** - Direct npm installation
- **Docker Containers** - Containerized deployment
- **Kubernetes** - Production-ready orchestration
- **CI/CD Integration** - GitHub Actions workflows

## 🧪 Testing Coverage

- **418+ passing tests** with comprehensive coverage (100% success rate)
- Unit tests for all core components
- Integration tests for end-to-end workflows
- **Chrome browser integration tests** - New tests for dual browser support
- **Streaming type detection tests** - Validation for media segment classification
- **Randomization feature tests** - 27 tests for parameter randomization
- **localStorage feature tests** - 28 tests for authenticated session simulation
- **Shared randomization utility tests** - 24 tests for consistent randomization behavior
- Performance tests for scalability validation
- Docker and Kubernetes deployment testing

## 📚 Documentation

- [Configuration Guide](docs/CONFIGURATION_GUIDE.md)
- **[localStorage Guide](docs/LOCALSTORAGE_GUIDE.md)** ⭐ NEW - Comprehensive guide for authenticated session simulation
- **[Request Filtering Guide](docs/REQUEST_FILTERING_GUIDE.md)** - Advanced request filtering and resource optimization
- **[Parameter Randomization Guide](docs/RANDOMIZATION_GUIDE.md)** - Comprehensive guide for dynamic parameter features
- [Kubernetes Deployment](docs/KUBERNETES_DEPLOYMENT.md)
- [API Documentation](API.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

## 📋 New Examples in RC4

### localStorage Configuration Examples
- **[authenticated-session.yaml](examples/authenticated-session.yaml)** - Complete authenticated streaming session with randomized user data
- **[localstorage-examples.yaml](examples/localstorage-examples.yaml)** - Industry-specific localStorage scenarios (e-commerce, SaaS, gaming, education)
- **[localstorage-randomization.yaml](examples/localstorage-randomization.yaml)** - Advanced randomization patterns for diverse user simulation

### Key Example Features
- **Multi-Domain localStorage** - Configure data across main app, API, and CDN domains
- **Randomized Authentication** - Unique tokens, user IDs, and session data per browser instance
- **Complex JSON Structures** - Randomize values within JSON objects while maintaining validity
- **Industry-Specific Patterns** - Real-world examples for streaming, e-commerce, SaaS, and gaming applications

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:
- Setting up the development environment
- Running tests and linting
- Submitting pull requests
- Code style guidelines

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Special thanks to all contributors and the open-source community for making this project possible.

## 🆕 What's New in RC6

### Major Enhancements
- **🌐 Chrome Browser Support** - Full Google Chrome browser integration alongside Chromium
- **🔐 Enhanced DRM Compatibility** - True Widevine DRM support with Chrome's proprietary modules
- **🎯 Automatic Browser Selection** - Intelligent Chrome/Chromium selection based on DRM requirements
- **🔧 Extended CLI Interface** - New browser control options and environment variable support
- **�  Critical Bug Fixes** - Fixed streaming type detection for accurate media analytics

### New Capabilities
- **Dual Browser Architecture** - Choose between Chrome and Chromium with `browserType: chrome|chromium`
- **Cross-Platform Chrome Detection** - Automatic Chrome executable path resolution for macOS, Windows, Linux
- **DRM-Optimized Configuration** - Chrome automatically selected with DRM-specific arguments when DRM is detected
- **Enhanced CLI Options** - New `--browser-type`, `--headless`, `--no-headless` command-line arguments
- **Environment Variable Support** - `LOAD_TEST_BROWSER_TYPE` and `LOAD_TEST_HEADLESS` configuration options

### Critical Fixes
- **Streaming Type Detection** - Fixed `.ts` files being incorrectly classified as 'manifest' instead of 'segment'
- **Media Analytics Accuracy** - Resolved Transport Stream segment classification for proper streaming metrics
- **DRM Testing Reliability** - Chrome browser ensures full Widevine DRM compatibility with hardware security
- **Browser Selection Logic** - Improved automatic browser selection with graceful fallback mechanisms

### Developer Experience Improvements
- **Enhanced Configuration Examples** - New Chrome-specific and Chromium-optimized configuration examples
- **Comprehensive Browser Documentation** - Updated guides with Chrome vs Chromium comparison and selection criteria
- **Improved Error Handling** - Better Chrome detection with informative fallback messages
- **Backward Compatibility** - All existing configurations continue to work with automatic browser selection

## 🆕 What's New in RC4 (Previous Release)

### Major Enhancements
- **🔐 Authenticated Session Simulation** - Complete localStorage pre-population for realistic user testing
- **🎲 localStorage Randomization** - Unique user data generation for each browser instance
- **🌐 Multi-Domain Support** - Configure localStorage across multiple domains (main app, API, CDN)
- **📊 Enhanced Testing Coverage** - 79 additional tests (350+ total) for localStorage and randomization features
- **📚 Comprehensive Documentation** - New localStorage guide with industry-specific examples

### New Capabilities
- **Unique User Simulation** - Each browser instance simulates a different authenticated user
- **Complex JSON Randomization** - Randomize values within JSON structures while preserving validity
- **Predefined Data Arrays** - Built-in arrays for themes, languages, currencies, video qualities, etc.
- **File-Based User Data** - Load randomized user data from external files for environment-specific testing

### Performance Improvements
- **Shared Randomization Utility** - Consistent and optimized randomization across all features
- **30-60% Memory Reduction** through intelligent request filtering (from RC2)
- **20-40% CPU Savings** with streaming-only mode (from RC2)
- **File Caching System** for optimized randomization performance (from RC2)

## 🆕 What's New in RC5 (Previous Release)

### Major Enhancements
- **🔧 Configurable Browser Options** - Complete control over browser behavior and debugging capabilities
- **🤖 Intelligent DRM Compatibility** - Automatic DRM detection with smart browser configuration
- **🔍 Enhanced Debugging Support** - DevTools integration, remote debugging, and comprehensive logging
- **⚡ DRM Playback Resolution** - Fixed critical Widevine headless mode compatibility issues
- **📚 Comprehensive Browser Documentation** - Detailed guide with 50+ browser arguments categorized by use case

### New Capabilities
- **Headless Mode Control** - Toggle browser visibility with `browserOptions.headless: true/false`
- **Custom Browser Arguments** - Full support for Chromium arguments across debugging, performance, media, security, and DRM categories
- **Automatic DRM Detection** - Smart detection of DRM configuration with automatic headless override and DRM-optimized arguments
- **Hardware Security Handling** - Proper Widevine L1 hardware-backed security requirements management
- **User Notifications** - Clear warnings when DRM configuration overrides browser settings

---

**Full Changelog**: https://github.com/[your-username]/lightweight-browser-load-tester/commits/v1.0.0-rc.6