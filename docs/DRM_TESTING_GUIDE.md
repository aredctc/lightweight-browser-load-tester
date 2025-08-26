# DRM Testing Guide

This guide covers testing DRM-protected streaming content with the load testing framework.

## Prerequisites

### Chrome Browser Requirements

1. **Full Chrome Installation**: You need Google Chrome (not Chromium) installed on your system
   - macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
   - Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - Linux: `/usr/bin/google-chrome`

2. **Protected Content Permission**: Chrome must allow protected content
   - Go to `chrome://settings/content/protectedContent`
   - Ensure "Allow sites to play protected content" is enabled

3. **Widevine CDM**: Widevine Content Decryption Module must be enabled
   - Go to `chrome://components/`
   - Find "Widevine Content Decryption Module"
   - Ensure it's up to date and enabled

## Configuration

### Basic DRM Configuration

```yaml
# DRM configuration - requires Chrome browser for Widevine support
drmConfig:
  type: widevine
  licenseUrl: https://example.com/license
  certificateUrl: https://example.com/cert
  customHeaders:
    Authorization: Bearer token123
    X-Custom-Header: custom-value

# Browser configuration for DRM testing
browserOptions:
  browserType: chrome      # Required for DRM support
  headless: false         # Required for DRM (automatically set)
  args:
    - "--enable-widevine-cdm"
    - "--autoplay-policy=no-user-gesture-required"
    - "--enable-features=VaapiVideoDecoder"
    - "--disable-component-update"
    - "--allow-running-insecure-content"
```

### Advanced DRM Configuration

For more complex DRM scenarios, you can add additional Chrome flags:

```yaml
browserOptions:
  args:
    - "--enable-widevine-cdm"
    - "--autoplay-policy=no-user-gesture-required"
    - "--enable-features=VaapiVideoDecoder"
    - "--disable-component-update"
    - "--allow-running-insecure-content"
    - "--enable-logging=stderr"
    - "--log-level=0"
    - "--disable-web-security"  # For testing environments only
    - "--ignore-certificate-errors"  # For testing environments only
```

## DRM Types Supported

### Widevine
- **Level 1**: Hardware-based DRM (highest security)
- **Level 3**: Software-based DRM (most common for testing)

### Configuration Example
```yaml
drmConfig:
  type: widevine
  level: L3  # or L1 for hardware DRM
  licenseUrl: https://drm-license-server.com/license
  certificateUrl: https://drm-license-server.com/cert
```

## Troubleshooting

### Common Issues

1. **"DRM not supported" Error**
   - Verify Chrome (not Chromium) is installed
   - Check Widevine CDM is enabled in `chrome://components/`
   - Ensure protected content is allowed in Chrome settings

2. **DRM Permission Setup**
   - Framework uses Chrome DevTools Protocol for native DRM permission management
   - Automatically creates temporary Chrome profiles with DRM enabled
   - Bypasses Playwright limitations by using Chrome's native capabilities
   - Real Chrome browser provides full DRM functionality

3. **License Request Failures**
   - Verify license server URL is correct
   - Check authentication headers are properly configured
   - Ensure network connectivity to license server

4. **Playback Failures**
   - Check video codec compatibility
   - Verify DRM level requirements (L1 vs L3)
   - Ensure proper user agent string

### Native Chrome DRM Integration

**Framework Approach**: Uses real Chrome browser with native DRM capabilities:

- **Chrome DevTools Protocol**: Direct permission management bypassing Playwright limitations
- **Temporary Chrome Profiles**: Automatic DRM-enabled profile creation per browser instance
- **Native DRM Flags**: Comprehensive Chrome flags for optimal DRM performance
- **Real DRM Testing**: Full Widevine L1/L3 support with hardware security when available
- **Production Equivalent**: Same DRM capabilities as end-user browsers

### Debug Mode

Enable verbose logging for DRM debugging:

```yaml
browserOptions:
  args:
    - "--enable-logging=stderr"
    - "--log-level=0"
    - "--vmodule=*media*=3"  # Verbose media logging
```

### DRM Capability Verification

The framework automatically verifies DRM capabilities when starting browser instances. Check the logs for:

```
DRM capabilities verified for instance browser-xxx: { widevine: true }
```

If verification fails, check:
1. Chrome installation path
2. Widevine CDM status
3. Protected content permissions

## Testing Strategies

### Load Testing DRM Content

1. **Gradual Ramp-up**: Start with low concurrent users
2. **Monitor License Server**: Watch for license request bottlenecks
3. **Resource Monitoring**: DRM decryption is CPU-intensive
4. **Network Bandwidth**: Account for encrypted content overhead

### Example Test Configuration

```yaml
concurrentUsers: 5        # Start low for DRM testing
testDuration: 300         # 5 minutes
rampUpTime: 60           # Gradual ramp-up
streamingUrl: https://example.com/drm-stream

drmConfig:
  type: widevine
  licenseUrl: https://license.example.com/v1/license
  customHeaders:
    Authorization: Bearer your-token-here

browserOptions:
  browserType: chrome
  headless: false
  
resourceLimits:
  maxMemoryPerInstance: 2048  # Increase for DRM content
  maxCpuPercentage: 80       # DRM decryption is CPU-intensive
```

## Real-World DRM Setup

### For Production Testing

When testing against real DRM-protected content, you may need:

1. **Pre-configured Chrome Profile**
   ```bash
   # Create a Chrome profile with DRM enabled
   google-chrome --user-data-dir=/path/to/test-profile --enable-widevine-cdm
   # Manually enable protected content in chrome://settings/content/protectedContent
   ```

2. **Manual Permission Grant**
   - Some DRM content requires user interaction to grant permissions
   - Consider using Chrome's `--autoplay-policy=no-user-gesture-required` flag
   - Test with content that doesn't require user interaction

3. **Chrome Profile in Testing**
   ```yaml
   browserOptions:
     browserType: chrome
     args:
       - "--user-data-dir=/path/to/drm-enabled-profile"
       - "--enable-widevine-cdm"
   ```

### Testing Strategy

- **Start with Test DRM Content**: Use DRM test streams that don't require complex permissions
- **Validate License Requests**: Focus on testing license server load and response times
- **Monitor DRM Metrics**: Track license acquisition success rates and timing
- **Gradual Complexity**: Start simple, then add real content complexity

## Performance Considerations

### Resource Usage
- DRM decryption increases CPU usage by 20-40%
- Memory usage increases by 200-500MB per stream
- Network overhead for license requests

### Scaling Recommendations
- Use fewer concurrent users per machine
- Monitor license server capacity
- Consider distributed testing for high loads

## Security Notes

### Testing Environment
- Use test DRM keys and certificates
- Avoid production license servers for load testing
- Implement proper authentication for test environments

### Production Considerations
- Never disable web security in production
- Use proper certificate validation
- Implement rate limiting on license servers

## Supported Streaming Platforms

The framework has been tested with:
- Generic Widevine L3 implementations
- DASH and HLS with DRM
- Custom DRM implementations

For platform-specific configurations, refer to the examples directory.