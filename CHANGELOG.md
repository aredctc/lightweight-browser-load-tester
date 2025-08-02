# Changelog

All notable changes to the Lightweight Browser Load Tester will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of Lightweight Browser Load Tester
- Real browser testing using Playwright with Chromium
- DRM support for Widevine, PlayReady, and FairPlay
- Parameter injection for dynamic API request modification
- Comprehensive monitoring and metrics collection
- Prometheus and OpenTelemetry metrics export
- Kubernetes deployment support for local and cloud environments
- Multi-cloud support (AWS EKS, Google GKE, Azure AKS)
- Docker containerization with security hardening
- Horizontal Pod Autoscaler (HPA) for Kubernetes deployments
- Comprehensive documentation and examples
- CLI interface with configuration validation
- Programmatic API for Node.js applications
- **Request body injection support** for JSON and form data requests
- **Advanced request filtering** with streaming-only mode, allowed/blocked URL patterns
- **Comprehensive request ingestion guide** with detailed examples and troubleshooting
- **Enhanced parameter randomization** with built-in functions, array selection, and file-based data
- **Intelligent request body modification** with automatic JSON/form data detection
- **File-based data caching** for improved performance with external data sources
- **Request body injection examples** demonstrating complex JSON structure injection
- **Browser localStorage pre-population** for authenticated session simulation with multi-domain support
- **localStorage randomization support** with same functions as request parameters for unique user data per browser instance
- **Selective request targeting** with URL pattern and HTTP method filtering for parameter injection
- **Precise parameter control** allowing different parameters for different endpoints and request types

### Features

#### Core Functionality
- **Browser-based load testing**: Authentic user behavior simulation using real Chromium browsers
- **DRM license testing**: Built-in support for major DRM systems with metrics collection
- **Resource optimization**: Efficient memory and CPU usage with configurable limits
- **Real-time monitoring**: Live progress tracking with detailed metrics display
- **Flexible configuration**: YAML/JSON configuration files with environment variable overrides

#### Request Ingestion and Parameter Injection
- **URL-based selective targeting**: Primary feature for applying parameters to specific requests using URL patterns
- **HTTP method filtering**: Target specific HTTP methods (GET, POST, PUT, DELETE) for precise control
- **Multi-target parameter injection**: Support for headers, query parameters, and request bodies
- **JSON request body modification**: Automatic parsing and modification of JSON request bodies
- **Form data support**: URL-encoded form data parameter injection
- **Advanced randomization**: Built-in random functions (UUID, numbers, strings, timestamps)
- **Array-based selection**: Random selection from predefined arrays in variable context
- **File-based data sources**: Random selection from external text files with caching
- **Variable substitution**: Dynamic template variables with session and global scopes
- **Intelligent error handling**: Graceful fallback for unsupported body formats
- **Performance optimization**: File caching and efficient template processing
- **Wildcard and regex patterns**: Flexible URL pattern matching for precise request targeting

#### Kubernetes Integration
- **Multi-environment support**: Local (Minikube, Kind, Docker Desktop) and cloud deployments
- **Cloud provider optimization**: Specific configurations for AWS EKS, Google GKE, and Azure AKS
- **Scalability**: Horizontal Pod Autoscaler with CPU and memory-based scaling
- **Security**: Non-root containers, RBAC, and security contexts
- **Observability**: Prometheus metrics endpoints and service monitors

#### Metrics and Monitoring
- **Prometheus integration**: RemoteWrite support with configurable batching
- **OpenTelemetry support**: OTLP export with multiple protocols
- **Comprehensive metrics**: Request rates, response times, DRM performance, resource usage
- **Error tracking**: Detailed error logging and categorization
- **Real-time dashboards**: Live progress display with key performance indicators

#### Developer Experience
- **CLI interface**: Intuitive command-line tool with comprehensive options
- **Configuration validation**: Built-in validation with helpful error messages
- **Example configurations**: Pre-built configurations for common scenarios
- **Comprehensive documentation**: Detailed guides for all features and deployment scenarios
- **Troubleshooting support**: Extensive troubleshooting guide with common solutions

### Documentation
- Complete API documentation with TypeScript definitions
- Kubernetes deployment guide for all major cloud providers
- Configuration guide with best practices and examples
- **Request Ingestion Guide**: Comprehensive guide for parameter injection and request modification
- **Request Filtering Guide**: Advanced guide for streaming-only mode and URL pattern filtering
- **Parameter Randomization Guide**: Detailed guide for dynamic parameter generation
- Troubleshooting guide with common issues and solutions
- Contributing guidelines for open source development

### Examples
- **Organized examples directory**: All configuration examples moved to dedicated `examples/` folder
- **[basic-load-test.json](examples/basic-load-test.json)**: Basic load testing configuration
- **[drm-testing.yaml](examples/drm-testing.yaml)**: DRM testing with Widevine configuration
- **[selective-parameters.yaml](examples/selective-parameters.yaml)**: URL-based selective parameter targeting (RECOMMENDED)
- **[request-body-injection.yaml](examples/request-body-injection.yaml)**: Comprehensive request body modification examples
- **[randomization-features.yaml](examples/randomization-features.yaml)**: Advanced randomization with built-in functions, arrays, and files
- **Sample data files**: Organized data files in `examples/data/` for immediate use
- **Examples documentation**: Comprehensive README with usage instructions and best practices

### Infrastructure
- Docker multi-stage build with Alpine Linux base
- Kubernetes manifests with Kustomize overlays
- CI/CD pipeline configuration (GitHub Actions ready)
- Security scanning and vulnerability assessment
- Automated testing and quality assurance

## [1.0.0] - 2024-01-XX

### Added
- Initial public release
- All core features and functionality
- Complete documentation suite
- Kubernetes deployment capabilities
- Multi-cloud provider support

---

## Release Notes Template

### [Version] - YYYY-MM-DD

#### Added
- New features and capabilities

#### Changed
- Changes to existing functionality

#### Deprecated
- Features that will be removed in future versions

#### Removed
- Features that have been removed

#### Fixed
- Bug fixes and corrections

#### Security
- Security improvements and vulnerability fixes

---

## Contributing

When contributing to this project, please:

1. Follow the [Contributing Guidelines](CONTRIBUTING.md)
2. Update this changelog with your changes
3. Use the format specified above
4. Include relevant details about breaking changes
5. Reference related issues and pull requests

## Versioning Strategy

- **Major versions (X.0.0)**: Breaking changes, major new features
- **Minor versions (X.Y.0)**: New features, backward compatible
- **Patch versions (X.Y.Z)**: Bug fixes, security updates

## Links

- [GitHub Repository](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester)
- [Issues](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/issues)
- [Pull Requests](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/pulls)
- [Releases](https://github.com/YOUR_USERNAME/lightweight-browser-load-tester/releases)