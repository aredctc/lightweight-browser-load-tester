# 🚀 Lightweight Browser Load Tester v1.0.0-rc.4

## 🎉 Release Candidate 4 - Authenticated Session Simulation!

We're thrilled to announce the fourth iteration of our release candidate! This version introduces groundbreaking localStorage functionality for authenticated session simulation, along with comprehensive randomization support. Building upon the solid foundation of previous releases, RC4 delivers enterprise-grade load testing capabilities with realistic user behavior simulation for streaming applications and web platforms.

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

### NPM Package (Release Candidate 4)
```bash
# Install the latest RC version
npm install -g lightweight-browser-load-tester@rc
load-tester --help

# Or install specific RC4 version
npm install -g lightweight-browser-load-tester@1.0.0-rc.4
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
   
   # NEW IN RC4: Authenticated session simulation with localStorage
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
   load-tester test -c my-test-config.yaml
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

- **350+ passing tests** with comprehensive coverage
- Unit tests for all core components
- Integration tests for end-to-end workflows
- **Randomization feature tests** - 27 tests for parameter randomization
- **localStorage feature tests** - 28 new tests for authenticated session simulation
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

## 🆕 What's New in RC4

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

---

**Full Changelog**: https://github.com/[your-username]/lightweight-browser-load-tester/commits/v1.0.0-rc.4