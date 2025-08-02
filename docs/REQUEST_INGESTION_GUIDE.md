# Request Ingestion Guide

This guide provides comprehensive information about request ingestion and parameter injection in the Lightweight Browser Load Tester.

## Table of Contents

- [Overview](#overview)
- [Parameter Injection Basics](#parameter-injection-basics)
- [Target Types](#target-types)
- [Variable Substitution](#variable-substitution)
- [Scope Management](#scope-management)
- [Request Body Injection](#request-body-injection)
- [Configuration Examples](#configuration-examples)
- [Advanced Usage](#advanced-usage)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Request ingestion allows you to dynamically modify HTTP requests during load testing by injecting parameters into headers, query parameters, and request bodies. This enables realistic simulation of user behavior and API interactions.

The system intercepts all network requests made by the browser and applies parameter templates to modify them before they are sent to the server.

## Parameter Injection Basics

Parameter injection allows you to target specific requests and modify them dynamically. The key concept is **selective targeting** - applying different parameters to different types of requests based on URL patterns and HTTP methods.

### Core Configuration Structure

```yaml
requestParameters:
  - target: header              # Where to inject (header, query, body)
    name: "Authorization"       # Parameter name
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"  # Value with variables
    scope: per-session          # When to generate new values (global, per-session)
    urlPattern: "*/api/auth/*"  # Target specific URLs (RECOMMENDED)
    method: "POST"              # Target specific HTTP methods (optional)
```

**Key principle**: Always use `urlPattern` to target specific requests rather than applying parameters to all requests.

## URL-Based Request Targeting (Primary Feature)

The most important aspect of parameter injection is **targeting specific requests** using URL patterns. This allows you to apply different parameters to different endpoints, making your load testing realistic and efficient.

### Why Use URL Patterns?

- **Realistic Testing**: Different endpoints need different authentication, headers, and data
- **Performance**: Avoid unnecessary parameter injection on irrelevant requests  
- **Precision**: Apply exactly the right parameters to the right requests
- **Maintainability**: Clear separation of concerns for different API endpoints

### URL Pattern Examples

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

## Target Types

### Headers (`target: header`)

Injects parameters into HTTP request headers. **Always use urlPattern for precision**.

```yaml
requestParameters:
  # Authentication header for API endpoints only
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/api-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/*"  # Target API endpoints
  
  # Custom tracking header for specific services
  - target: header
    name: "X-Service-ID"
    valueTemplate: "{{random:uuid}}"
    scope: global
    urlPattern: "*/service/v2/*"  # Target v2 service endpoints
  
  # User agent override for streaming requests
  - target: header
    name: "User-Agent"
    valueTemplate: "{{randomFrom:streamingUserAgents}}"
    scope: per-session
    urlPattern: "*/stream/*"  # Target streaming endpoints
```

**Result**: Headers are added to or replace existing headers in the HTTP request.

### Query Parameters (`target: query`)

Injects parameters into URL query strings. **Always use urlPattern for targeted injection**.

```yaml
requestParameters:
  # User identification for API endpoints only
  - target: query
    name: "userId"
    valueTemplate: "user_{{sessionId}}"
    scope: per-session
    urlPattern: "*/api/*"  # Target API endpoints
  
  # Timestamp parameter for analytics requests
  - target: query
    name: "timestamp"
    valueTemplate: "{{timestamp}}"
    scope: global
    urlPattern: "*/analytics/*"  # Target analytics endpoints
  
  # Session tracking for streaming requests
  - target: query
    name: "session_id"
    valueTemplate: "{{random:uuid}}"
    scope: per-session
    urlPattern: "*/stream/*"  # Target streaming endpoints
```

**Result**: Parameters are added to the URL query string. If the parameter already exists, it will be replaced.

**Example transformation**:
- Original: `https://api.example.com/stream`
- Modified: `https://api.example.com/stream?userId=user_session123&timestamp=1704067200000`

### Request Body (`target: body`)

Injects parameters into request bodies for POST, PUT, and PATCH requests.

```yaml
requestParameters:
  # JSON body parameter
  - target: body
    name: "requestId"
    valueTemplate: "req_{{requestCount}}"
    scope: per-session
  
  # User context in body
  - target: body
    name: "sessionInfo"
    valueTemplate: '{"id": "{{sessionId}}", "timestamp": {{timestamp}}}'
    scope: per-session
```

**Supported body formats**:
- **JSON**: Automatically parsed and modified
- **Form data**: URL-encoded form data (application/x-www-form-urlencoded)
- **Other formats**: Returned unchanged with warning logged

## Variable Substitution

Variables in templates are substituted using the `{{variable}}` syntax.

### Built-in Variables

```yaml
# Session identifier (unique per browser instance)
valueTemplate: "{{sessionId}}"

# Current timestamp in milliseconds
valueTemplate: "{{timestamp}}"

# Request counter (increments with each request)
valueTemplate: "{{requestCount}}"

# Custom variables (passed in context)
valueTemplate: "{{customVar}}"
```

### Random Functions

```yaml
# UUID generation
valueTemplate: "{{random:uuid}}"

# Random numbers
valueTemplate: "{{random:number}}"      # 0-999999
valueTemplate: "{{random:1-100}}"       # Range 1-100

# Random strings
valueTemplate: "{{random:alphanumeric}}" # 8-char string
valueTemplate: "{{random:hex}}"          # Hex string
```

### Array Selection

```yaml
# Random selection from array
valueTemplate: "{{randomFrom:arrayName}}"
```

### File Selection

```yaml
# Random selection from file
valueTemplate: "{{randomFromFile:./examples/data/tokens.txt}}"
```

## Scope Management

### Global Scope (`scope: global`)

Values are generated once and reused across all requests and sessions.

```yaml
- target: header
  name: "X-Test-ID"
  valueTemplate: "{{random:uuid}}"
  scope: global  # Same value for all requests
```

**Use cases**:
- Test run identifiers
- Global configuration values
- Shared authentication tokens

### Per-Session Scope (`scope: per-session`)

Values are generated once per browser session and reused for all requests within that session.

```yaml
- target: header
  name: "X-Session-Token"
  valueTemplate: "{{random:uuid}}"
  scope: per-session  # Same value per browser instance
```

**Use cases**:
- Session tokens
- User identifiers
- Device-specific values

## Request Body Injection

The system supports intelligent request body modification for different content types.

### JSON Body Modification

For `Content-Type: application/json` requests:

```yaml
requestParameters:
  - target: body
    name: "userId"
    valueTemplate: "{{random:1-10000}}"
    scope: per-session
  
  - target: body
    name: "metadata"
    valueTemplate: '{"sessionId": "{{sessionId}}", "timestamp": {{timestamp}}}'
    scope: per-session
```

**Original request body**:
```json
{
  "action": "play",
  "videoId": "abc123"
}
```

**Modified request body**:
```json
{
  "action": "play",
  "videoId": "abc123",
  "userId": 5847,
  "metadata": {
    "sessionId": "session_1704067200000",
    "timestamp": 1704067200000
  }
}
```

### Form Data Modification

For `Content-Type: application/x-www-form-urlencoded` requests:

```yaml
requestParameters:
  - target: body
    name: "session_token"
    valueTemplate: "{{random:alphanumeric}}"
    scope: per-session
```

**Original request body**:
```
username=testuser&password=testpass
```

**Modified request body**:
```
username=testuser&password=testpass&session_token=K7mN9pQ2
```

### Complex JSON Injection

You can inject complex JSON structures:

```yaml
requestParameters:
  - target: body
    name: "clientInfo"
    valueTemplate: |
      {
        "deviceId": "{{randomFromFile:./examples/data/device-ids.txt}}",
        "userAgent": "{{randomFrom:userAgents}}",
        "sessionId": "{{sessionId}}",
        "capabilities": {
          "drm": ["widevine", "playready"],
          "codecs": ["h264", "h265"],
          "maxResolution": "4k"
        },
        "timestamp": {{timestamp}}
      }
    scope: per-session
```

### Body Modification Error Handling

The system gracefully handles various scenarios:

- **Empty body**: Logs warning, returns original
- **Invalid JSON**: Attempts form data parsing, falls back to original
- **Unsupported format**: Logs warning, returns original
- **Parse errors**: Logs error, returns original

## Configuration Examples

### Basic Authentication

```yaml
requestParameters:
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
```

### User Simulation

```yaml
requestParameters:
  # User identification
  - target: header
    name: "X-User-ID"
    valueTemplate: "{{random:1-10000}}"
    scope: per-session
  
  # Session tracking
  - target: query
    name: "sessionId"
    valueTemplate: "{{sessionId}}"
    scope: per-session
  
  # Request tracking
  - target: header
    name: "X-Request-ID"
    valueTemplate: "{{random:uuid}}"
    scope: global
```

### Device Simulation

```yaml
requestParameters:
  # Device headers
  - target: header
    name: "X-Device-Type"
    valueTemplate: "{{randomFrom:deviceTypes}}"
    scope: per-session
  
  - target: header
    name: "X-Device-ID"
    valueTemplate: "{{randomFromFile:./examples/data/device-ids.txt}}"
    scope: per-session
  
  # Platform information
  - target: query
    name: "platform"
    valueTemplate: "{{randomFrom:platforms}}"
    scope: per-session
```

### API Request Modification

```yaml
requestParameters:
  # API versioning
  - target: header
    name: "API-Version"
    valueTemplate: "{{randomFrom:apiVersions}}"
    scope: per-session
  
  # Request metadata in body
  - target: body
    name: "requestMetadata"
    valueTemplate: |
      {
        "clientVersion": "{{randomFrom:clientVersions}}",
        "requestId": "{{random:uuid}}",
        "timestamp": {{timestamp}},
        "userAgent": "{{randomFrom:userAgents}}"
      }
    scope: per-session
```

## Selective Request Targeting

You can target specific requests using URL patterns and HTTP methods, allowing precise control over which requests receive parameter injection.

### URL Pattern Matching

Use the `urlPattern` field to apply parameters only to requests matching specific URL patterns:

```yaml
requestParameters:
  # Apply only to API authentication endpoints
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/auth/*"  # Only auth API calls
  
  # Apply only to streaming manifest requests
  - target: header
    name: "X-Manifest-Request-ID"
    valueTemplate: "manifest_{{random:uuid}}"
    scope: global
    urlPattern: "*.m3u8"  # Only HLS manifest files
  
  # Apply only to license requests (DRM)
  - target: header
    name: "X-DRM-Session-ID"
    valueTemplate: "drm_{{sessionId}}_{{random:alphanumeric}}"
    scope: per-session
    urlPattern: "*/license*"  # Only license endpoints
```

### HTTP Method Filtering

Use the `method` field to apply parameters only to specific HTTP methods:

```yaml
requestParameters:
  # Apply only to POST requests
  - target: body
    name: "requestMetadata"
    valueTemplate: '{"timestamp": {{timestamp}}, "sessionId": "{{sessionId}}"}'
    scope: per-session
    method: "POST"
  
  # Apply only to PUT requests for user data
  - target: body
    name: "lastModified"
    valueTemplate: "{{timestamp}}"
    scope: global
    urlPattern: "*/api/user/*"
    method: "PUT"
```

### Combined Filtering

Combine URL patterns and HTTP methods for precise targeting:

```yaml
requestParameters:
  # Apply only to POST requests to analytics endpoints
  - target: body
    name: "sessionMetadata"
    valueTemplate: |
      {
        "sessionId": "{{sessionId}}",
        "timestamp": {{timestamp}},
        "requestCount": {{requestCount}},
        "userAgent": "{{randomFrom:userAgents}}"
      }
    scope: per-session
    urlPattern: "*/analytics/*"
    method: "POST"  # Only POST requests to analytics
```

### URL Pattern Syntax

The system supports flexible URL pattern matching:

#### Wildcard Patterns
```yaml
# Match any characters with *
urlPattern: "*/api/*"           # Matches /api/anything
urlPattern: "*.m3u8"            # Matches any .m3u8 file
urlPattern: "*staging*"         # Matches URLs containing "staging"
```

#### Regex Patterns
```yaml
# Use regex patterns enclosed in forward slashes
urlPattern: "/^https:\\/\\/cdn[0-9]+\\.example\\.com/"  # CDN servers
urlPattern: "/api\\/v[0-9]+\\/"                         # Versioned APIs
```

#### Exact Matching
```yaml
# Exact URL matching
urlPattern: "https://api.example.com/auth/login"
urlPattern: "/api/heartbeat"
```

### Practical Examples

#### Authentication by Endpoint
```yaml
requestParameters:
  # Different auth for different services
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/api-tokens.txt}}"
    scope: per-session
    urlPattern: "*/api/*"
  
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/streaming-tokens.txt}}"
    scope: per-session
    urlPattern: "*/stream/*"
```

#### Environment-Specific Configuration
```yaml
requestParameters:
  # Staging environment tokens
  - target: header
    name: "X-Environment-Token"
    valueTemplate: "{{randomFromFile:./examples/data/staging-tokens.txt}}"
    scope: per-session
    urlPattern: "*staging*"
  
  # Production environment tokens
  - target: header
    name: "X-Environment-Token"
    valueTemplate: "{{randomFromFile:./examples/data/prod-tokens.txt}}"
    scope: per-session
    urlPattern: "*prod*"
```

#### Request Type Specific Headers
```yaml
requestParameters:
  # Manifest requests
  - target: header
    name: "Accept"
    valueTemplate: "application/vnd.apple.mpegurl"
    scope: global
    urlPattern: "*/playlist*"
  
  # Segment requests
  - target: header
    name: "Range"
    valueTemplate: "bytes=0-"
    scope: global
    urlPattern: "*.ts"
  
  # License requests
  - target: header
    name: "Content-Type"
    valueTemplate: "application/octet-stream"
    scope: global
    urlPattern: "*/license*"
    method: "POST"
```

## Advanced Usage

### Conditional Parameter Injection

You can implement conditional logic by using selective targeting with different parameter sets:

```yaml
# For premium users (would be applied conditionally in code)
requestParameters:
  - target: header
    name: "X-Subscription-Level"
    valueTemplate: "premium"
    scope: per-session
  
  - target: body
    name: "features"
    valueTemplate: '["hd", "4k", "offline"]'
    scope: per-session
```

### Multi-Environment Configuration

```yaml
requestParameters:
  # Environment-specific endpoints
  - target: header
    name: "X-Environment"
    valueTemplate: "{{randomFrom:environments}}"
    scope: per-session
  
  # Environment-specific tokens
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/{{randomFrom:environments}}-tokens.txt}}"
    scope: per-session
```

### Complex Body Transformations

```yaml
requestParameters:
  # Complete request context
  - target: body
    name: "context"
    valueTemplate: |
      {
        "session": {
          "id": "{{sessionId}}",
          "startTime": {{timestamp}},
          "requestCount": {{requestCount}}
        },
        "device": {
          "type": "{{randomFrom:deviceTypes}}",
          "id": "{{randomFromFile:./examples/data/device-ids.txt}}",
          "capabilities": "{{randomFrom:deviceCapabilities}}"
        },
        "user": {
          "id": {{random:1-10000}},
          "tier": "{{randomFrom:userTiers}}",
          "region": "{{randomFrom:regions}}"
        }
      }
    scope: per-session
```

## Best Practices

### Parameter Design

1. **Realistic Values**: Use values that match production patterns
2. **Appropriate Scope**: Choose scope based on real-world behavior
3. **Performance Impact**: Consider the performance impact of complex templates
4. **Error Handling**: Design templates that degrade gracefully

### Security Considerations

1. **Test Data**: Never use real production credentials
2. **Token Management**: Use dedicated test tokens with limited scope
3. **Data Sanitization**: Sanitize any production data used for testing
4. **Access Control**: Restrict access to sensitive test data files

### Performance Optimization

1. **Template Complexity**: Keep templates simple for better performance
2. **File Size**: Limit data file sizes for faster loading
3. **Caching**: Leverage file caching for repeated data access
4. **Scope Selection**: Use appropriate scope to balance realism and performance

### Maintenance

1. **Documentation**: Document the purpose of each parameter template
2. **Version Control**: Include parameter configurations in version control
3. **Regular Updates**: Keep data files current with production changes
4. **Testing**: Test parameter injection in isolation before full load tests

## Troubleshooting

### Common Issues

#### Parameters Not Applied

**Symptoms**: Parameters don't appear in requests
**Causes**:
- Incorrect target type
- Invalid template syntax
- Missing variable context

**Solutions**:
```yaml
# Verify target type matches request
- target: header  # For HTTP headers
- target: query   # For URL parameters
- target: body    # For request body

# Check template syntax
valueTemplate: "{{variableName}}"  # Correct
valueTemplate: "{variableName}"    # Incorrect
```

#### Variable Substitution Fails

**Symptoms**: Variables appear as `{{variable}}` in requests
**Causes**:
- Variable not defined in context
- Typo in variable name
- Incorrect template syntax

**Solutions**:
```typescript
// Ensure variables are defined in context
const context = {
  sessionId: 'session123',
  customVar: 'customValue'
};

// Check variable names match exactly
valueTemplate: "{{sessionId}}"  // Must match context key
```

#### Body Modification Fails

**Symptoms**: Request body unchanged
**Causes**:
- Unsupported content type
- Invalid JSON format
- Empty request body

**Solutions**:
```yaml
# Ensure content type is supported
# Supported: application/json, application/x-www-form-urlencoded
# Check request has body content for POST/PUT/PATCH requests
```

#### File Loading Errors

**Symptoms**: `randomFromFile` returns original template
**Causes**:
- File not found
- Permission denied
- Invalid file format

**Solutions**:
```bash
# Verify file exists and is readable
ls -la ./data/tokens.txt
cat ./data/tokens.txt

# Check file permissions
chmod 644 ./data/tokens.txt
```

### Debugging

#### Enable Detailed Logging

```typescript
// Get errors from interceptor
const errors = interceptor.getErrors();
errors.forEach(error => {
  console.log('Error:', error.message);
  console.log('Context:', error.context);
});
```

#### Test Templates in Isolation

```typescript
// Test variable substitution
const result = interceptor.substituteVariables('{{sessionId}}');
console.log('Substituted value:', result);
```

#### Monitor Network Requests

```typescript
// Check if parameters are applied
const metrics = interceptor.getNetworkMetrics();
metrics.forEach(metric => {
  console.log('URL:', metric.url);
  console.log('Method:', metric.method);
});
```

### Performance Issues

#### Slow Parameter Injection

**Causes**:
- Complex templates
- Large data files
- Frequent file access

**Solutions**:
- Simplify templates
- Reduce data file sizes
- Use appropriate caching

#### Memory Usage

**Causes**:
- Large cached files
- Many concurrent sessions
- Complex variable contexts

**Solutions**:
- Monitor memory usage
- Implement data rotation
- Optimize variable contexts

## Examples

### Complete Configuration

```yaml
concurrentUsers: 10
testDuration: 300
rampUpTime: 30
streamingUrl: "https://api.example.com/stream"

requestParameters:
  # Authentication
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
  
  # User simulation
  - target: header
    name: "X-User-ID"
    valueTemplate: "{{random:1-10000}}"
    scope: per-session
  
  - target: query
    name: "sessionId"
    valueTemplate: "{{sessionId}}"
    scope: per-session
  
  # Device information
  - target: header
    name: "User-Agent"
    valueTemplate: "{{randomFrom:userAgents}}"
    scope: per-session
  
  - target: header
    name: "X-Device-Type"
    valueTemplate: "{{randomFrom:deviceTypes}}"
    scope: per-session
  
  # Request tracking
  - target: header
    name: "X-Request-ID"
    valueTemplate: "{{random:uuid}}"
    scope: global
  
  # Body parameters for API calls
  - target: body
    name: "clientInfo"
    valueTemplate: |
      {
        "version": "{{randomFrom:clientVersions}}",
        "platform": "{{randomFrom:platforms}}",
        "deviceId": "{{randomFromFile:./examples/data/device-ids.txt}}",
        "timestamp": {{timestamp}}
      }
    scope: per-session

resourceLimits:
  maxMemoryPerInstance: 512
  maxCpuPercentage: 80
  maxConcurrentInstances: 20
```

This guide provides comprehensive information about request ingestion and parameter injection. For more advanced randomization features, see the [Parameter Randomization Guide](RANDOMIZATION_GUIDE.md).