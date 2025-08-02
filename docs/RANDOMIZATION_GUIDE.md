# Parameter Randomization Guide

This guide provides comprehensive information about the dynamic parameter randomization features in the Lightweight Browser Load Tester.

## Table of Contents

- [Overview](#overview)
- [Built-in Random Functions](#built-in-random-functions)
- [Random Selection from Arrays](#random-selection-from-arrays)
- [Random Selection from Files](#random-selection-from-files)
- [Advanced Usage](#advanced-usage)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The load tester supports three powerful methods for dynamic parameter randomization:

1. **Built-in Random Functions** - Generate random values using predefined functions
2. **Random Selection from Arrays** - Pick random values from arrays defined in variable context
3. **Random Selection from Files** - Load and randomly select values from external text files

These methods can be used individually or combined to create realistic and varied load testing scenarios.

## Built-in Random Functions

Built-in random functions use the syntax `{{random:function}}` and generate values dynamically for each request.

### Available Functions

#### UUID Generation
```yaml
# Generates RFC 4122 compliant UUID
valueTemplate: "{{random:uuid}}"
# Example output: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

#### Random Numbers
```yaml
# Random integer between 0 and 999999
valueTemplate: "{{random:number}}"
# Example output: "742851"

# Random integer in specific range
valueTemplate: "{{random:1-100}}"
# Example output: "42"

valueTemplate: "{{random:1000-9999}}"
# Example output: "5847"
```

#### Timestamp Generation
```yaml
# Current timestamp in milliseconds
valueTemplate: "{{random:timestamp}}"
# Example output: "1704067200000"
```

#### Hexadecimal Strings
```yaml
# Random hexadecimal string
valueTemplate: "{{random:hex}}"
# Example output: "a3f2c9"
```

#### Alphanumeric Strings
```yaml
# 8-character alphanumeric string
valueTemplate: "{{random:alphanumeric}}"
# Example output: "K7mN9pQ2"
```

### Usage Examples

```yaml
requestParameters:
  # Request tracking
  - target: header
    name: "X-Request-ID"
    valueTemplate: "{{random:uuid}}"
    scope: per-session
  
  # Session tokens
  - target: header
    name: "X-Session-Token"
    valueTemplate: "session_{{random:alphanumeric}}_{{random:timestamp}}"
    scope: per-session
  
  # User simulation
  - target: query
    name: "userId"
    valueTemplate: "{{random:1-10000}}"
    scope: per-session
  
  # Trace IDs
  - target: header
    name: "X-Trace-ID"
    valueTemplate: "{{random:hex}}"
    scope: global
```

## Random Selection from Arrays

Random selection from arrays uses the syntax `{{randomFrom:arrayName}}` and selects values from arrays defined in the variable context.

### Configuration

Arrays are defined in the variable context passed to the RequestInterceptor:

```typescript
const variableContext = {
  userAgents: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
  ],
  deviceTypes: ["mobile", "tablet", "desktop", "smart-tv"],
  platforms: ["android", "ios", "web", "roku", "apple-tv"]
};
```

### Usage Examples

```yaml
requestParameters:
  # User agent rotation
  - target: header
    name: "User-Agent"
    valueTemplate: "{{randomFrom:userAgents}}"
    scope: per-session
  
  # Device type simulation
  - target: header
    name: "X-Device-Type"
    valueTemplate: "{{randomFrom:deviceTypes}}"
    scope: per-session
  
  # Platform targeting
  - target: query
    name: "platform"
    valueTemplate: "{{randomFrom:platforms}}"
    scope: per-session
  
  # Environment simulation
  - target: header
    name: "X-Environment"
    valueTemplate: "{{randomFrom:environments}}"
    scope: global
```

### Common Array Examples

```typescript
// Authentication levels
authLevels: ["guest", "basic", "premium", "admin"]

// Geographic regions
regions: ["us-east", "us-west", "eu-central", "ap-southeast"]

// Client versions
clientVersions: ["1.0.0", "1.1.0", "1.2.0", "2.0.0"]

// Content qualities
qualities: ["240p", "480p", "720p", "1080p", "4k"]

// Languages
languages: ["en", "es", "fr", "de", "ja", "zh"]
```

## Random Selection from Files

Random selection from files uses the syntax `{{randomFromFile:path}}` and loads values from external text files.

### File Format

Files should contain one value per line with the following rules:
- One value per line
- Empty lines are ignored
- Lines starting with `#` are treated as comments and ignored
- Leading and trailing whitespace is trimmed

### Example Files

#### User Agents (`./data/user-agents.txt`)
```
# Desktop browsers
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36

# Mobile browsers
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1
Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0
```

#### Authentication Tokens (`./data/auth-tokens.txt`)
```
# JWT tokens for load testing
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwOTg3NjU0MzIxIiwibmFtZSI6IkphbmUgU21pdGgiLCJpYXQiOjE1MTYyMzkwMjJ9.Gf7leJ8i4e90afOjwQzujBiQ5GL2qRWX4UCAGgOCRFI
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTU1NTU1NTU1IiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTUxNjIzOTAyMn0.4Adst6ku_0F8tVarE7UgVjz2C1xc2EqHb4-2_7hMJ1E
```

#### Device IDs (`./data/device-ids.txt`)
```
# Device identifiers for different platforms
android-phone-001
android-phone-002
android-tablet-001
ios-phone-001
ios-phone-002
ios-tablet-001
web-chrome-desktop-001
web-firefox-desktop-001
smart-tv-samsung-001
roku-device-001
```

### Usage Examples

```yaml
requestParameters:
  # Authentication
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
  
  # Device identification
  - target: header
    name: "X-Device-ID"
    valueTemplate: "{{randomFromFile:./examples/data/device-ids.txt}}"
    scope: per-session
  
  # User agent rotation
  - target: header
    name: "User-Agent"
    valueTemplate: "{{randomFromFile:./examples/data/user-agents.txt}}"
    scope: per-session
  
  # Session types
  - target: header
    name: "X-Session-Type"
    valueTemplate: "{{randomFromFile:./examples/data/session-types.txt}}"
    scope: per-session
```

### File Caching

The system automatically caches file contents to improve performance:
- Files are read once and cached in memory
- Cache is invalidated when file modification time changes
- Multiple requests reuse cached data
- Failed file reads are logged but don't stop processing

## Advanced Usage

### Combining Multiple Methods

You can combine all three randomization methods in a single template:

```yaml
requestParameters:
  # Complex header with all methods
  - target: header
    name: "X-Complex-Header"
    valueTemplate: "{{randomFrom:environments}}_{{random:uuid}}_{{randomFromFile:./examples/data/session-types.txt}}"
    scope: per-session
  
  # JSON body with mixed randomization
  - target: body
    name: "metadata"
    valueTemplate: |
      {
        "sessionId": "{{random:uuid}}",
        "deviceType": "{{randomFrom:deviceTypes}}",
        "timestamp": {{random:timestamp}},
        "authLevel": "{{randomFromFile:./examples/data/auth-levels.txt}}",
        "userId": {{random:1-10000}}
      }
    scope: per-session
```

### Conditional Randomization

Use different randomization strategies based on context:

```yaml
requestParameters:
  # Different auth methods for different user types
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/premium-tokens.txt}}"
    scope: per-session
    # Note: Conditional logic would be implemented in the application layer
  
  # Device-specific headers
  - target: header
    name: "X-Device-Capabilities"
    valueTemplate: "{{randomFrom:mobileCapabilities}}"
    scope: per-session
```

### Multi-target Parameters

Apply randomization across different parameter targets:

```yaml
requestParameters:
  # Header randomization
  - target: header
    name: "X-Client-ID"
    valueTemplate: "{{random:uuid}}"
    scope: per-session
  
  # Query parameter randomization
  - target: query
    name: "version"
    valueTemplate: "{{randomFrom:apiVersions}}"
    scope: per-session
  
  # Body parameter randomization
  - target: body
    name: "clientInfo"
    valueTemplate: |
      {
        "id": "{{random:uuid}}",
        "type": "{{randomFrom:clientTypes}}",
        "version": "{{randomFromFile:./examples/data/client-versions.txt}}"
      }
    scope: per-session
```

## Performance Considerations

### Memory Usage

- **Arrays**: Stored in memory, minimal impact for reasonable sizes
- **Files**: Cached in memory after first read, moderate impact for large files
- **Functions**: No memory overhead, computed on-demand

### CPU Impact

- **Functions**: Minimal CPU overhead for generation
- **Arrays**: Very low CPU overhead for selection
- **Files**: Initial file I/O cost, then minimal overhead

### Optimization Tips

1. **File Size**: Keep data files reasonably sized (< 10MB recommended)
2. **Array Size**: Arrays with 100-1000 items perform well
3. **Caching**: File caching reduces I/O overhead significantly
4. **Scope Selection**: Use appropriate scope to balance realism and performance

### Benchmarks

Typical performance characteristics:
- **UUID generation**: ~1μs per call
- **Array selection**: ~0.1μs per call
- **File selection**: ~0.1μs per call (after caching)
- **File loading**: ~1-10ms per file (one-time cost)

## Best Practices

### Data Management

1. **Organize Files**: Keep data files in a dedicated directory structure
2. **Version Control**: Include data files in version control
3. **Documentation**: Document the purpose and format of each data file
4. **Validation**: Validate data file contents before testing

### Realistic Simulation

1. **Real Data**: Use realistic values that match production patterns
2. **Distribution**: Ensure good distribution of values across the dataset
3. **Correlation**: Consider relationships between different parameters
4. **Evolution**: Update data files to reflect changing production patterns

### Security

1. **Sensitive Data**: Avoid real credentials or sensitive information
2. **Test Tokens**: Use dedicated test tokens that can't access production
3. **Data Sanitization**: Sanitize any production data used for testing
4. **Access Control**: Restrict access to data files containing sensitive information

### Maintenance

1. **Regular Updates**: Keep data files current with production changes
2. **Cleanup**: Remove obsolete or invalid entries regularly
3. **Monitoring**: Monitor for errors in randomization during tests
4. **Backup**: Maintain backups of important data files

## Troubleshooting

### Common Issues

#### File Not Found
```
Error: Failed to load file data: ENOENT: no such file or directory
```
**Solution**: Verify file path is correct and file exists

#### Empty Array
```
Warning: randomFrom target array is empty
```
**Solution**: Ensure array contains at least one value

#### Invalid File Format
```
Warning: File data is empty or could not be loaded
```
**Solution**: Check file format and ensure it contains valid data

#### Permission Denied
```
Error: Failed to load file data: EACCES: permission denied
```
**Solution**: Verify file permissions allow read access

### Debugging

#### Enable Logging
Monitor the error logs to identify randomization issues:

```typescript
const errors = interceptor.getErrors();
errors.forEach(error => {
  if (error.message.includes('randomization')) {
    console.log('Randomization error:', error);
  }
});
```

#### Test Templates
Test randomization templates in isolation:

```typescript
// Test specific template
const result = interceptor.substituteVariables('{{random:uuid}}');
console.log('Generated value:', result);
```

#### Validate Data Files
Check data file contents:

```bash
# Check file exists and has content
ls -la ./data/auth-tokens.txt
wc -l ./data/auth-tokens.txt

# Preview file contents
head -10 ./data/auth-tokens.txt
```

### Performance Issues

#### Slow File Loading
- **Cause**: Large files or slow disk I/O
- **Solution**: Reduce file size or use faster storage

#### High Memory Usage
- **Cause**: Large cached files or arrays
- **Solution**: Reduce data size or implement data rotation

#### CPU Spikes
- **Cause**: Complex randomization logic
- **Solution**: Simplify templates or reduce randomization frequency

### Error Recovery

The system is designed to gracefully handle errors:
- Invalid templates return the original expression
- Missing files or arrays don't stop processing
- Errors are logged for debugging
- Other parameters continue to work normally

## Examples

### Complete Configuration Example

```yaml
# Complete randomization example
concurrentUsers: 20
testDuration: 600
rampUpTime: 60
streamingUrl: "https://example.com/stream"

requestParameters:
  # Built-in functions
  - target: header
    name: "X-Request-ID"
    valueTemplate: "{{random:uuid}}"
    scope: per-session
  
  - target: query
    name: "userId"
    valueTemplate: "{{random:1-10000}}"
    scope: per-session
  
  # Array selection
  - target: header
    name: "User-Agent"
    valueTemplate: "{{randomFrom:userAgents}}"
    scope: per-session
  
  # File selection
  - target: header
    name: "Authorization"
    valueTemplate: "Bearer {{randomFromFile:./examples/data/auth-tokens.txt}}"
    scope: per-session
  
  # Combined methods
  - target: header
    name: "X-Session-Info"
    valueTemplate: "{{randomFrom:environments}}_{{random:alphanumeric}}_{{randomFromFile:./examples/data/session-types.txt}}"
    scope: per-session

resourceLimits:
  maxMemoryPerInstance: 512
  maxCpuPercentage: 80
  maxConcurrentInstances: 25
```

This comprehensive guide should help you effectively use all three randomization methods to create realistic and varied load testing scenarios.