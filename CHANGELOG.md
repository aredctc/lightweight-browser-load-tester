# Changelog

All notable changes to the Lightweight Browser Load Tester will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-rc.7] - 2025-08-26

### Added
- **Full Chrome Browser Integration** - Complete Google Chrome browser support with automatic DRM detection
  - Automatic Chrome browser selection when DRM configuration is detected
  - Cross-platform Chrome executable path detection for macOS, Windows, and Linux
  - Graceful fallback to Chromium when Chrome is unavailable with appropriate warnings
  - Chrome-specific browser arguments for optimal DRM performance
- **True Widevine DRM Support** - Hardware-backed DRM capabilities with Chrome's proprietary modules
  - `launchPersistentContext` with temporary profiles for secure DRM testing
  - Chrome DevTools Protocol integration for protected media permissions
  - Runtime verification of MediaKeySystemAccess and Widevine support
  - Access to Chrome's hardware-backed security features for L1 Widevine content
- **Temporary Profile Management** - Secure temporary Chrome profiles for isolated DRM testing
  - Unique temporary profiles (`/tmp/chrome-drm-profile-*`) for each DRM test instance
  - Automatic profile cleanup after test completion
  - Profile isolation for security and test independence
  - Enhanced DRM debugging and troubleshooting capabilities
- **DRM Capability Verification** - Automatic Widevine support detection and validation
  - Runtime verification of browser DRM capabilities on startup
  - Comprehensive DRM support testing and validation
  - Enhanced error reporting for DRM configuration issues
  - DRM-specific event monitoring and logging

### Changed
- **Browser Pool Architecture** - Enhanced browser instance management with DRM awareness
  - Intelligent selection between Chrome (DRM) and Chromium (performance)
  - DRM-aware instance creation with automatic headless mode disabling
  - Enhanced browser launch options with DRM-specific configurations
  - Improved browser type detection and fallback mechanisms
- **DRM Configuration Management** - Automatic DRM detection and browser optimization
  - Automatic Chrome selection and DRM-specific argument injection
  - Intelligent headless mode disabling for DRM compatibility
  - Enhanced DRM permissions setup using Chrome DevTools Protocol
  - Comprehensive DRM event monitoring and error handling
- **CLI Interface Enhancement** - Extended command-line options for browser control
  - New `--browser-type chrome|chromium` option for explicit browser selection
  - Enhanced `--headless` / `--no-headless` options with DRM awareness
  - Improved browser type validation and error messaging
  - Better integration with DRM configuration detection

### Fixed
- **DRM Testing Reliability** - Resolved DRM compatibility and testing issues
  - Fixed headless mode conflicts with DRM license acquisition
  - Resolved hardware security requirement issues in DRM testing
  - Enhanced Chrome browser detection and configuration
  - Improved DRM permissions setup and error handling
- **Browser Launch Stability** - Enhanced browser instance creation and management
  - Fixed Chrome executable path detection across platforms
  - Resolved browser launch failures with proper fallback mechanisms
  - Enhanced error handling for browser configuration issues
  - Improved browser instance lifecycle management
- **Temporary Profile Management** - Resolved profile creation and cleanup issues
  - Fixed temporary profile creation and permissions
  - Enhanced profile cleanup and resource management
  - Resolved profile isolation and security issues
  - Improved profile path handling across platforms

### DRM Features
- **Chrome-Specific DRM Arguments** - Optimized browser flags for DRM performance
  - `--enable-widevine-cdm` - Enable Widevine CDM module
  - `--enable-features=VaapiVideoDecoder` - Hardware video decoding
  - `--disable-component-update` - Prevent Widevine updates during testing
  - `--autoplay-policy=no-user-gesture-required` - Auto-play DRM content
  - Additional DRM-specific flags for optimal compatibility
- **Protected Media Permissions** - Automatic setup of DRM-required permissions
  - `protectedMediaIdentifier` permission setup via Chrome DevTools Protocol
  - Audio and video capture permissions for DRM contexts
  - Enhanced permission validation and error handling
  - Comprehensive permission status monitoring and logging
- **DRM Event System** - Comprehensive DRM-specific event monitoring
  - `drmPermissionsSetup` - DRM permissions configuration status events
  - `drmCapabilitiesVerified` - Widevine capability verification results
  - `browserInstanceCreated` - Browser type and DRM mode logging events
  - Enhanced DRM debugging and troubleshooting event data

### Testing
- **DRM Testing Framework** - Comprehensive DRM testing validation
  - Enhanced DRM configuration testing with Chrome browser integration
  - Temporary profile creation and cleanup testing
  - DRM permissions setup and verification testing
  - Chrome browser detection and fallback testing
- **Browser Pool DRM Tests** - Extensive DRM-specific browser pool testing
  - Chrome browser auto-selection testing for DRM configurations
  - Temporary profile management and cleanup testing
  - DRM permissions setup and CDP integration testing
  - Comprehensive DRM capability verification testing

### Documentation
- **Enhanced DRM Documentation** - Comprehensive DRM testing guide updates
  - Updated DRM testing guide with Chrome browser requirements
  - Enhanced configuration examples with Chrome-specific settings
  - Improved troubleshooting guide for DRM-related issues
  - Comprehensive DRM setup and verification documentation
- **Chrome Browser Integration Guide** - New documentation for Chrome vs Chromium
  - Detailed Chrome browser installation and setup instructions
  - Chrome vs Chromium comparison for DRM testing scenarios
  - Platform-specific Chrome configuration and troubleshooting
  - Enhanced DRM testing best practices and recommendations

## [1.0.0-rc.6] - 2025-08-25

### Added
- **Chrome Browser Support** - Full Google Chrome browser integration alongside Chromium
  - `browserOptions.browserType` - Choose between 'chrome' and 'chromium' browsers
  - Automatic Chrome selection for DRM testing with Widevine support
  - Chrome executable path detection for macOS, Windows, and Linux
  - Graceful fallback to Chromium when Chrome is unavailable
- **Enhanced DRM Compatibility** - Improved DRM testing with Chrome browser
  - Chrome browser automatically selected when DRM configuration is detected
  - Full Widevine DRM support with hardware security features
  - Chrome-specific DRM arguments (`--enable-widevine-cdm`, `--autoplay-policy=no-user-gesture-required`)
  - Automatic headless mode disabling for DRM content protection
- **CLI Browser Options** - Extended command-line interface for browser control
  - `--browser-type <type>` - Specify Chrome or Chromium browser
  - `--headless` / `--no-headless` - Control headless mode explicitly
  - Environment variable support (`LOAD_TEST_BROWSER_TYPE`, `LOAD_TEST_HEADLESS`)
- **Configuration Examples** - New browser-specific configuration examples
  - `examples/drm-testing.yaml` - Updated with Chrome browser configuration
  - `examples/chromium-testing.yaml` - New example for Chromium-based testing

### Changed
- **Browser Pool Architecture** - Enhanced browser instance management
  - Automatic browser type selection based on DRM requirements
  - Chrome executable path resolution with platform detection
  - Improved browser launch options with type-specific arguments
  - Enhanced error handling and fallback mechanisms
- **Configuration Schema** - Extended browser options validation
  - Added `browserType` field to `BrowserOptions` interface
  - Updated configuration validation with Chrome/Chromium support
  - Enhanced TypeScript type definitions for browser selection

### Fixed
- **Streaming Type Detection** - Critical fix for media segment classification
  - Fixed `.ts` files being incorrectly classified as 'manifest' instead of 'segment'
  - Prioritized file extension detection over path component matching
  - Resolved issue with Transport Stream segments in manifest paths
  - Improved accuracy of streaming metrics and analytics
- **DRM Testing Reliability** - Enhanced DRM content testing stability
  - Chrome browser ensures full Widevine DRM compatibility
  - Resolved headless mode conflicts with DRM license acquisition
  - Fixed hardware security requirement issues in DRM testing

### Documentation
- **Browser Support Guide** - Comprehensive Chrome vs Chromium documentation
  - Detailed comparison of Chrome and Chromium capabilities
  - DRM requirements and browser selection guidance
  - Installation instructions for both browsers
  - Automatic vs manual browser configuration examples
- **Updated Configuration Guide** - Enhanced browser configuration documentation
  - Browser type selection with automatic DRM detection
  - Chrome-specific configuration examples and best practices
  - Platform-specific installation and setup instructions

### Technical Details
- **Browser Detection Logic** - Intelligent browser selection system
  - Automatic Chrome selection for DRM testing scenarios
  - Chromium default for regular load testing (better performance)
  - Platform-specific Chrome executable path detection
  - Comprehensive error handling and user feedback
- **Streaming Classification** - Improved media request categorization
  - File extension-based detection prioritized over path matching
  - Accurate segment vs manifest classification for analytics
  - Enhanced streaming metrics accuracy and reporting

## [1.0.0-rc.5] - 2025-02-08

### Added
- **Configurable Browser Options** - Full control over browser behavior and debugging capabilities
  - `browserOptions.headless` - Control headless mode (true/false)
  - `browserOptions.args` - Custom browser arguments for debugging, performance, and DRM optimization
  - Comprehensive browser argument documentation with categorized examples
- **Automatic DRM Compatibility** - Intelligent DRM detection and browser configuration
  - Automatic headless mode disabling when DRM configuration is detected
  - Automatic DRM-specific browser arguments injection (`--enable-features=WidevineL1`, etc.)
  - User warnings when DRM overrides browser configuration
- **Enhanced DRM Support** - Improved Widevine, PlayReady, and FairPlay compatibility
  - Hardware security requirement handling for Widevine L1
  - Display context requirements for DRM content protection
  - EME (Encrypted Media Extensions) optimization
- **Comprehensive Browser Arguments** - Support for 50+ browser arguments across categories:
  - Debugging & Development (DevTools, logging, remote debugging)
  - Performance & Memory (heap size, cache management, CPU optimization)
  - Media & Streaming (autoplay, hardware acceleration, codec support)
  - Network & Security (SSL, CORS, proxy configuration)
  - Display & Window (size, position, scaling, kiosk mode)
  - DRM & Content Protection (Widevine L1, HDCP policy, content settings)

### Changed
- **TestRunner Browser Configuration** - Enhanced browser pool configuration with DRM detection
  - Browser options now merge user-specified args with stability defaults
  - DRM configuration automatically triggers non-headless mode and DRM-optimized arguments
  - Improved browser argument handling with conflict resolution
- **Configuration Schema** - Extended configuration validation
  - Added `browserOptions` schema with `headless` boolean and `args` array validation
  - Updated TypeScript interfaces with new `BrowserOptions` type
  - Enhanced configuration examples with browser options

### Fixed
- **DRM Playback Issues** - Resolved Widevine DRM compatibility problems
  - Fixed headless mode preventing DRM license acquisition
  - Resolved hardware security requirement conflicts
  - Fixed EME (Encrypted Media Extensions) limitations in headless browsers
- **Browser Launch Stability** - Improved browser instance reliability
  - Enhanced default browser arguments for stability and performance
  - Better handling of browser argument conflicts and overrides

### Documentation
- **Enhanced Configuration Guide** - Comprehensive browser options documentation
  - Detailed browser argument categories with practical examples
  - DRM-specific configuration guidance with automatic behavior explanation
  - Performance optimization recommendations for different use cases
- **Expanded Troubleshooting Guide** - New DRM troubleshooting section
  - Detailed DRM + headless mode issue resolution
  - Hardware security requirement explanations
  - Step-by-step DRM debugging procedures with remote debugging setup
- **Updated README** - Clarified DRM and headless mode behavior

### Technical Details
- **Browser Pool Enhancement** - Improved browser instance management
  - Dynamic browser argument merging with user preferences
  - Automatic DRM detection and configuration override
  - Enhanced logging and user feedback for configuration changes
- **Configuration Management** - Extended configuration system
  - New `browserOptions` configuration section with validation
  - Backward compatibility with existing configurations
  - Environment variable support for browser options (future enhancement)

## [1.0.0-rc.4] - 2025-02-07

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