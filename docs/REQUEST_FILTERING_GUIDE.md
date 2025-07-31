# Request Filtering Guide

## Overview

The Lightweight Browser Load Tester provides advanced request filtering capabilities to optimize resource usage and focus testing on specific types of network requests. This is particularly useful for streaming applications where you want to minimize CPU and memory consumption by blocking unnecessary requests while preserving essential functionality.

## Request Filtering Features

### 1. Streaming-Only Mode

The `streamingOnly` option blocks all non-streaming requests to save compute power, allowing only streaming-related and essential requests to pass through.

#### What are Streaming-Related Requests?

Streaming-related requests are automatically identified using pattern matching. The system recognizes the following types:

**Manifest Requests** (`streamingType: "manifest"`):
- HLS playlists: `*.m3u8`
- DASH manifests: `*.mpd`
- URLs containing "manifest"

**Media Segment Requests** (`streamingType: "segment"`):
- Transport streams: `*.ts`
- MP4 segments: `*.m4s`, `*.mp4`
- URLs containing "segment" or "chunk"

**DRM/License Requests** (`streamingType: "license"`):
- URLs containing "license", "drm", "widevine", "playready", "fairplay"

**Streaming API Requests** (`streamingType: "api"`):
- URLs matching patterns like "api.*stream", "stream.*api", "playback", "player"

#### Essential Requests (Always Allowed)

Even in streaming-only mode, certain requests are considered essential for basic page functionality:
- Main page documents and HTML files
- Core JavaScript frameworks and CSS
- Authentication and session management
- Essential streaming setup APIs
- Favicon and critical icons

### 2. Allowed URLs Override

The `allowedUrls` option lets you specify URL patterns that should always be allowed, even when `streamingOnly` is enabled. This provides fine-grained control over which non-streaming requests are permitted.

### 3. Blocked URLs

The `blockedUrls` option allows you to block specific URL patterns, even if they would normally be considered streaming-related. This is useful for blocking analytics, tracking, or other unwanted requests.

## Request Filtering Priority

The system applies filtering rules in the following priority order:

1. **Blocked URLs** (Highest Priority) - Always blocked regardless of other settings
2. **Allowed URLs** - Always allowed, overrides streaming-only mode
3. **Streaming-Only Logic** - Applied only if URL is not explicitly allowed
4. **Default Behavior** - Allow all requests

## Configuration Examples

### Using Configuration Files

#### JSON Configuration
```json
{
  "concurrentUsers": 5,
  "testDuration": 300,
  "rampUpTime": 30,
  "streamingUrl": "https://example-streaming.com/live/channel1",
  "streamingOnly": true,
  "allowedUrls": [
    "*.css",
    "*fonts*",
    "/api/essential/*",
    "https://cdn.example.com/critical/*"
  ],
  "blockedUrls": [
    "*analytics*",
    "*tracking*",
    "*ads*",
    "https://metrics.example.com/*"
  ],
  "resourceLimits": {
    "maxMemoryPerInstance": 512,
    "maxCpuPercentage": 80,
    "maxConcurrentInstances": 10
  }
}
```

#### YAML Configuration
```yaml
concurrentUsers: 5
testDuration: 300
rampUpTime: 30
streamingUrl: "https://example-streaming.com/live/channel1"
streamingOnly: true
allowedUrls:
  - "*.css"
  - "*fonts*"
  - "/api/essential/*"
  - "https://cdn.example.com/critical/*"
blockedUrls:
  - "*analytics*"
  - "*tracking*"
  - "*ads*"
  - "https://metrics.example.com/*"
resourceLimits:
  maxMemoryPerInstance: 512
  maxCpuPercentage: 80
  maxConcurrentInstances: 10
```

### Using Command Line Flags

#### Basic Streaming-Only Mode
```bash
# Block all non-streaming requests
npm start -- --streaming-only --streaming-url "https://example-streaming.com/live/channel1"
```

#### With Allowed URLs
```bash
# Allow specific patterns even in streaming-only mode
npm start -- \
  --streaming-only \
  --streaming-url "https://example-streaming.com/live/channel1" \
  --allowed-urls "*.css,*fonts*,/api/essential/*"
```

#### With Blocked URLs
```bash
# Block specific patterns regardless of streaming status
npm start -- \
  --streaming-url "https://example-streaming.com/live/channel1" \
  --blocked-urls "*analytics*,*tracking*,*ads*"
```

#### Combined Filtering
```bash
# Use all filtering options together
npm start -- \
  --streaming-only \
  --streaming-url "https://example-streaming.com/live/channel1" \
  --allowed-urls "*.css,*fonts*,/api/essential/*" \
  --blocked-urls "*analytics*,*tracking*,*ads*" \
  --concurrent-users 10 \
  --test-duration 300
```

### Using Environment Variables

```bash
# Set environment variables
export LOAD_TEST_STREAMING_ONLY=true
export LOAD_TEST_STREAMING_URL="https://example-streaming.com/live/channel1"
export LOAD_TEST_ALLOWED_URLS="*.css,*fonts*,/api/essential/*"
export LOAD_TEST_BLOCKED_URLS="*analytics*,*tracking*,*ads*"
export LOAD_TEST_CONCURRENT_USERS=5
export LOAD_TEST_DURATION=300

# Run the test
npm start
```

## URL Pattern Matching

The system supports flexible URL pattern matching:

### Wildcard Patterns
- `*` matches any sequence of characters
- `?` matches any single character
- `*.css` matches all CSS files
- `*analytics*` matches URLs containing "analytics"

### Regex Patterns
Patterns enclosed in forward slashes are treated as regular expressions:
- `/\.m3u8(\?|$)/` matches HLS playlist files
- `/api\/v[0-9]+\/stream/` matches versioned streaming APIs

### Exact Matching
- `https://example.com/api/stream` matches exactly this URL
- `/api/essential/` matches this specific path

## Understanding Test Results

### Result JSON Structure

The test results include detailed information about request filtering and streaming metrics:

```json
{
  "summary": {
    "totalRequests": 150,
    "successfulRequests": 145,
    "failedRequests": 5,
    "averageResponseTime": 125.5,
    "peakConcurrentUsers": 5,
    "testDuration": 300.5
  },
  "browserMetrics": [
    {
      "instanceId": "browser-1234567890-abc123",
      "memoryUsage": 256,
      "cpuUsage": 45,
      "requestCount": 30,
      "errorCount": 1,
      "uptime": 298.2
    }
  ],
  "networkMetrics": [
    {
      "url": "https://example-streaming.com/playlist.m3u8",
      "method": "GET",
      "responseTime": 85,
      "statusCode": 200,
      "timestamp": "2025-01-08T10:30:45.123Z",
      "requestSize": 512,
      "responseSize": 2048,
      "isStreamingRelated": true,
      "streamingType": "manifest"
    },
    {
      "url": "https://example-streaming.com/segment001.ts",
      "method": "GET",
      "responseTime": 120,
      "statusCode": 200,
      "timestamp": "2025-01-08T10:30:46.234Z",
      "requestSize": 512,
      "responseSize": 1048576,
      "isStreamingRelated": true,
      "streamingType": "segment"
    },
    {
      "url": "https://cdn.example.com/styles.css",
      "method": "GET",
      "responseTime": 45,
      "statusCode": 200,
      "timestamp": "2025-01-08T10:30:44.567Z",
      "requestSize": 384,
      "responseSize": 15360,
      "isStreamingRelated": false
    }
  ],
  "errors": [
    {
      "timestamp": "2025-01-08T10:30:47.890Z",
      "level": "error",
      "message": "Request failed",
      "context": {
        "sessionId": "session-1234567890-xyz789",
        "requestCount": 25,
        "url": "https://blocked-analytics.com/track",
        "method": "POST",
        "failure": "net::ERR_BLOCKED_BY_CLIENT"
      }
    }
  ]
}
```

### Key Metrics to Monitor

#### Network Metrics Fields
- **`isStreamingRelated`**: Boolean indicating if the request was classified as streaming-related
- **`streamingType`**: Type of streaming request (`manifest`, `segment`, `license`, `api`, or `other`)
- **`responseTime`**: Time taken for the request in milliseconds
- **`requestSize`** / **`responseSize`**: Size of request/response in bytes

#### Error Context
- **`failure: "net::ERR_BLOCKED_BY_CLIENT"`**: Indicates request was blocked by filtering rules
- **`requestCount`**: Number of requests processed when error occurred
- **`sessionId`**: Unique identifier for the browser session

#### Browser Metrics
- **`memoryUsage`**: Memory consumption in MB per browser instance
- **`cpuUsage`**: CPU utilization percentage
- **`requestCount`**: Total requests processed by this browser instance

## Best Practices

### 1. Start with Basic Streaming-Only Mode
Begin with `streamingOnly: true` and gradually add allowed URLs as needed:

```json
{
  "streamingOnly": true,
  "allowedUrls": []
}
```

### 2. Monitor Resource Usage
Check browser metrics to verify that filtering is reducing resource consumption:

```bash
# Look for lower memory and CPU usage in results
grep -A 5 "browserMetrics" results.json
```

### 3. Identify Essential Non-Streaming Requests
Review blocked requests in error logs to identify legitimate requests that should be allowed:

```bash
# Find blocked requests
grep "ERR_BLOCKED_BY_CLIENT" results.json
```

### 4. Use Specific Patterns
Prefer specific patterns over broad wildcards to avoid unintended blocking:

```json
{
  "allowedUrls": [
    "https://cdn.example.com/fonts/*",  // Specific
    "*fonts*"                           // Broad
  ]
}
```

### 5. Test Incrementally
Add filtering rules gradually and test to ensure streaming functionality remains intact:

1. Test without filtering
2. Enable streaming-only mode
3. Add necessary allowed URLs
4. Add blocked URLs for optimization

## Troubleshooting

### Common Issues

#### Streaming Doesn't Start
**Symptom**: Video/audio doesn't play when `streamingOnly` is enabled
**Solution**: Add essential streaming setup URLs to `allowedUrls`:

```json
{
  "allowedUrls": [
    "/api/auth/*",
    "/api/player-token",
    "*license*",
    "*drm*"
  ]
}
```

#### High Resource Usage Despite Filtering
**Symptom**: Memory/CPU usage remains high
**Solution**: Review and expand blocked URL patterns:

```json
{
  "blockedUrls": [
    "*analytics*",
    "*metrics*",
    "*tracking*",
    "*ads*",
    "*social*"
  ]
}
```

#### Essential Features Broken
**Symptom**: Page functionality is impaired
**Solution**: Identify and allow essential resources:

```json
{
  "allowedUrls": [
    "*.css",
    "*/_next/static/*",
    "/api/essential/*",
    "*fonts*"
  ]
}
```

### Debugging Tips

1. **Check Error Logs**: Look for `ERR_BLOCKED_BY_CLIENT` errors to identify blocked requests
2. **Monitor Network Metrics**: Review `isStreamingRelated` field to verify classification
3. **Use Incremental Testing**: Enable filtering gradually to isolate issues
4. **Review Browser Metrics**: Confirm resource usage improvements

## Performance Impact

Request filtering can significantly improve performance:

- **Memory Reduction**: 30-60% lower memory usage by blocking unnecessary resources
- **CPU Savings**: 20-40% reduction in CPU usage from processing fewer requests
- **Network Efficiency**: Reduced bandwidth usage and faster test execution
- **Cleaner Results**: More focused metrics on streaming-specific performance

## Advanced Configuration

### Pattern Precedence Example
```json
{
  "streamingOnly": true,
  "allowedUrls": ["*analytics.example.com*"],
  "blockedUrls": ["*analytics*"]
}
```

In this case:
- `*analytics*` URLs are blocked (highest priority)
- `*analytics.example.com*` would still be blocked despite being in allowedUrls
- Only streaming and essential requests pass through

### Complex Pattern Matching
```json
{
  "allowedUrls": [
    "/^https:\\/\\/cdn\\.example\\.com\\/v[0-9]+\\//",  // Regex pattern
    "*.{css,js,woff2}",                                   // Multiple extensions
    "https://api.example.com/stream/*"                    // Specific API paths
  ]
}
```

This configuration demonstrates advanced pattern matching capabilities for precise control over request filtering.