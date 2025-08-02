# Load Tester Configuration Examples

This directory contains practical configuration examples for the Lightweight Browser Load Tester, demonstrating various features and use cases.

## Quick Start Examples

### Basic Load Testing
- **[basic-load-test.json](basic-load-test.json)** - Simple load testing configuration
- **[drm-testing.yaml](drm-testing.yaml)** - DRM testing with Widevine configuration

### Parameter Injection Examples
- **[selective-parameters.yaml](selective-parameters.yaml)** - URL-based selective parameter targeting (RECOMMENDED)
- **[request-body-injection.yaml](request-body-injection.yaml)** - Request body modification with JSON and form data
- **[randomization-features.yaml](randomization-features.yaml)** - Advanced randomization with built-in functions, arrays, and files

### Authenticated Session Simulation
- **[authenticated-session.yaml](authenticated-session.yaml)** - Complete authenticated user simulation with localStorage
- **[localstorage-examples.yaml](localstorage-examples.yaml)** - Multiple localStorage scenarios for different industries
- **[localstorage-randomization.yaml](localstorage-randomization.yaml)** - Advanced localStorage randomization patterns for diverse user simulation

### Advanced Configurations
- **[high-concurrency.yaml](high-concurrency.yaml)** - High concurrency testing setup
- **[prometheus-metrics.json](prometheus-metrics.json)** - Prometheus metrics export configuration
- **[opentelemetry-integration.yaml](opentelemetry-integration.yaml)** - OpenTelemetry integration example

## Data Files

The `data/` subdirectory contains sample data files used by the examples:
- **[auth-tokens.txt](data/auth-tokens.txt)** - Sample authentication tokens
- **[device-ids.txt](data/device-ids.txt)** - Sample device identifiers
- **[staging-tokens.txt](data/staging-tokens.txt)** - Environment-specific tokens

## Usage

To use any example configuration:

```bash
# Run with example configuration
load-tester test --config examples/selective-parameters.yaml

# Or copy and modify for your needs
cp examples/selective-parameters.yaml my-config.yaml
# Edit my-config.yaml with your specific requirements
load-tester test --config my-config.yaml
```

## Key Features Demonstrated

### URL-Based Selective Targeting (Primary Feature)
Most examples demonstrate **selective request targeting** using URL patterns:

```yaml
requestParameters:
  # Target authentication endpoints only
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/auth/*"  # Only auth endpoints
```

### Request Body Injection
Examples show how to inject parameters into JSON and form data request bodies:

```yaml
requestParameters:
  - target: body
    name: "clientInfo"
    valueTemplate: |
      {
        "sessionId": "{{sessionId}}",
        "timestamp": {{timestamp}},
        "deviceType": "{{randomFrom:deviceTypes}}"
      }
    scope: per-session
    urlPattern: "*/api/*"
```

### Advanced Randomization
Examples demonstrate built-in random functions, array selection, and file-based data:

```yaml
requestParameters:
  - target: header
    name: "X-Request-ID"
    valueTemplate: "{{random:uuid}}"
    scope: global
  
  - target: header
    name: "User-Agent"
    valueTemplate: "{{randomFrom:userAgents}}"
    scope: per-session
  
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
```

### Authenticated Session Simulation
Examples show how to pre-populate browser localStorage to simulate authenticated users:

```yaml
localStorage:
  # Main application domain
  - domain: "streaming-platform.example.com"
    data:
      auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      user_id: "user_12345"
      subscription_tier: "premium"
      playback_preferences: '{"quality":"1080p","autoplay":true}'
  
  # CDN domain for performance data
  - domain: "cdn.streaming-platform.example.com"
    data:
      cache_version: "v2.1.0"
      preferred_server: "us-west-1"
```

This feature is essential for testing applications that rely on localStorage for:
- Authentication tokens and session data
- User preferences and settings
- Application state and cached data
- Feature flags and A/B test configurations

## Best Practices

1. **Always use URL patterns** for selective targeting rather than applying parameters to all requests
2. **Use appropriate scopes** - `per-session` for user-specific data, `global` for shared values
3. **Organize data files** in the `data/` directory for reusability
4. **Test incrementally** - start with basic examples and add complexity gradually
5. **Use realistic data** that matches your production patterns

## Contributing Examples

To contribute new examples:

1. Create a new configuration file with a descriptive name
2. Add comprehensive comments explaining the use case
3. Include any required data files in the `data/` directory
4. Update this README with a description of your example
5. Test the configuration to ensure it works correctly

## Support

For questions about these examples or to request new examples, please:
- Check the [main documentation](../docs/)
- Review the [API documentation](../API.md)
- Open an issue in the project repository