# Browser localStorage Configuration Guide

## Overview

The localStorage feature allows you to pre-populate browser localStorage with key-value pairs for specific domains before starting your load tests. This is essential for simulating authenticated user sessions and testing scenarios where the application relies on existing browser storage data.

## Why Use localStorage?

Many modern web applications store authentication tokens, user preferences, session data, and other critical information in localStorage. When load testing these applications, you often need to simulate users who are already authenticated or have specific application state. Without pre-populated localStorage, your tests might:

- Fail to access protected resources
- Trigger authentication flows instead of testing the actual functionality
- Miss performance issues in authenticated user scenarios
- Not accurately represent real user behavior

## Configuration

### Basic Structure

```yaml
localStorage:
  - domain: "example.com"
    data:
      auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      user_id: "12345"
      session_id: "sess_abc123"
  - domain: "cdn.example.com"
    data:
      preferences: '{"theme":"dark","language":"en"}'
      cache_version: "1.2.3"
```

### Randomized Values

localStorage values support the same randomization functions as request parameters, allowing each browser instance to have unique data:

```yaml
localStorage:
  - domain: "example.com"
    data:
      auth_token: "Bearer {{random:uuid}}"
      user_id: "{{randomFrom:userIds}}"
      session_id: "sess-{{random:alphanumeric}}"
      timestamp: "{{random:timestamp}}"
      device_id: "device-{{random:1-9999}}"
```

**Available Randomization Functions:**
- `{{random:uuid}}` - Generate UUID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- `{{random:number}}` - Random number 0-999999
- `{{random:timestamp}}` - Current timestamp
- `{{random:hex}}` - Random hexadecimal string
- `{{random:alphanumeric}}` - 8-character alphanumeric string
- `{{random:1-100}}` - Random number in range (1-100)
- `{{randomFrom:arrayName}}` - Random selection from predefined array
- `{{randomFromFile:./path/to/file.txt}}` - Random line from file

**Predefined Arrays Available:**
The system provides several built-in arrays for common randomization needs:
- `userIds` - ['user_001', 'user_002', 'user_003', 'user_004', 'user_005']
- `deviceTypes` - ['desktop', 'mobile', 'tablet']
- `themes` - ['light', 'dark', 'auto']
- `languages` - ['en', 'es', 'fr', 'de', 'ja']
- `currencies` - ['USD', 'EUR', 'GBP', 'JPY', 'CAD']

### Randomization Patterns

**Unique User Simulation:**
Each browser instance gets different user data, perfect for testing user-specific scenarios:

```yaml
localStorage:
  - domain: "app.example.com"
    data:
      user_id: "{{randomFrom:userIds}}"
      session_token: "{{random:uuid}}"
      device_fingerprint: "{{random:hex}}"
      login_timestamp: "{{random:timestamp}}"
      preferences: '{"theme":"{{randomFrom:themes}}","lang":"{{randomFrom:languages}}"}'
```

**Complex JSON Structures:**
Randomize values within JSON objects while maintaining valid structure:

```yaml
localStorage:
  - domain: "ecommerce.example.com"
    data:
      user_profile: '{"id":"{{randomFrom:userIds}}","tier":"{{randomFrom:subscriptionTiers}}","joinDate":"{{random:timestamp}}"}'
      cart_state: '{"items":[{"id":"{{random:uuid}}","qty":{{random:1-5}}}],"total":{{random:10-500}}}'
      activity_log: '{"lastLogin":"{{random:timestamp}}","pageViews":{{random:1-100}},"purchases":{{random:0-10}}}'
```

**File-Based Randomization:**
Use external files for more complex or environment-specific data:

```yaml
localStorage:
  - domain: "staging.example.com"
    data:
      auth_token: "{{randomFromFile:./data/staging-tokens.txt}}"
      test_user_id: "{{randomFromFile:./data/test-users.txt}}"
      api_key: "{{randomFromFile:./data/api-keys.txt}}"
```

### Configuration Properties

- **domain**: The domain for which localStorage data should be set
  - Can be a full domain like `example.com` or `subdomain.example.com`
  - Can include protocol like `https://example.com` (optional)
  - Each domain is visited separately to set its localStorage data

- **data**: Key-value pairs to store in localStorage
  - Keys and values must be strings (localStorage only supports strings)
  - Complex objects should be JSON-stringified
  - All values are stored exactly as provided

## Common Use Cases

### 1. Authentication Tokens

Store JWT tokens or session identifiers for authenticated testing:

```yaml
localStorage:
  - domain: "myapp.com"
    data:
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
      refresh_token: "def50200a1b2c3d4e5f6..."
      token_expires: "1640995200000"
      user_id: "user_12345"
```

**With Randomization for Unique Users:**

```yaml
localStorage:
  - domain: "myapp.com"
    data:
      access_token: "Bearer {{random:uuid}}"
      refresh_token: "refresh_{{random:alphanumeric}}"
      token_expires: "{{random:timestamp}}"
      user_id: "{{randomFrom:userIds}}"
      device_id: "device_{{random:1-9999}}"
      session_start: "{{random:timestamp}}"
```

### 2. User Preferences

Pre-configure user settings and preferences:

```yaml
localStorage:
  - domain: "streaming-service.com"
    data:
      user_preferences: '{"quality":"1080p","autoplay":true,"subtitles":"en"}'
      volume_level: "0.8"
      playback_speed: "1.0"
      theme: "dark"
```

**With Randomization for Diverse User Scenarios:**

```yaml
localStorage:
  - domain: "streaming-service.com"
    data:
      user_preferences: '{"quality":"{{randomFrom:videoQualities}}","autoplay":{{randomFrom:booleans}},"subtitles":"{{randomFrom:languages}}"}'
      volume_level: "{{random:1-100}}"
      playback_speed: "{{randomFrom:playbackSpeeds}}"
      theme: "{{randomFrom:themes}}"
      user_tier: "{{randomFrom:subscriptionTiers}}"
```

### 3. Application State

Set up specific application states for testing:

```yaml
localStorage:
  - domain: "ecommerce.com"
    data:
      cart_items: '[{"id":"prod_123","quantity":2},{"id":"prod_456","quantity":1}]'
      recently_viewed: '["prod_789","prod_101","prod_202"]'
      user_location: '{"country":"US","state":"CA","city":"San Francisco"}'
      currency: "USD"
```

### 4. Feature Flags

Enable or disable features for testing:

```yaml
localStorage:
  - domain: "beta.myapp.com"
    data:
      feature_flags: '{"new_ui":true,"experimental_player":false,"beta_features":true}'
      ab_test_group: "variant_b"
      debug_mode: "false"
```

### 5. Multi-Domain Applications

Configure localStorage for applications that span multiple domains:

```yaml
localStorage:
  - domain: "main-app.com"
    data:
      auth_token: "main_app_token_123"
      user_session: "sess_main_456"
  - domain: "cdn.main-app.com"
    data:
      cache_version: "v2.1.0"
      asset_preferences: '{"webp_support":true,"lazy_loading":true}'
  - domain: "api.main-app.com"
    data:
      api_version: "v3"
      rate_limit_remaining: "1000"
```

## JSON Configuration Example

```json
{
  "concurrentUsers": 10,
  "testDuration": 300,
  "rampUpTime": 30,
  "streamingUrl": "https://streaming-service.com/watch/movie123",
  "localStorage": [
    {
      "domain": "streaming-service.com",
      "data": {
        "auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "user_id": "user_789",
        "subscription_tier": "premium",
        "playback_quality": "1080p",
        "user_preferences": "{\"autoplay\":true,\"subtitles\":\"en\",\"volume\":0.8}"
      }
    },
    {
      "domain": "cdn.streaming-service.com",
      "data": {
        "cache_version": "2.1.0",
        "preferred_server": "us-west-1"
      }
    }
  ],
  "resourceLimits": {
    "maxMemoryPerInstance": 512,
    "maxCpuPercentage": 80,
    "maxConcurrentInstances": 10
  }
}
```

## Best Practices

### 1. Use Realistic Data

- Use actual token formats from your application
- Include realistic expiration times and user IDs
- Test with data that represents your actual user base

### 2. Domain Specificity

- Be specific about domains to avoid conflicts
- Include subdomains if your application uses them
- Consider both www and non-www versions if applicable

### 3. Data Format

- Always stringify complex objects before storing
- Use consistent naming conventions
- Include all necessary data for your test scenarios

### 4. Security Considerations

- Don't include real production tokens in configuration files
- Use test/staging tokens when possible
- Consider using environment variables for sensitive data

### 5. Performance Impact

- localStorage initialization adds startup time to each browser instance
- Minimize the number of domains if possible
- Keep data payloads reasonable in size

## Troubleshooting

### Common Issues

1. **localStorage not being set**
   - Verify domain format is correct
   - Check that the domain is accessible
   - Ensure data values are strings

2. **Authentication still failing**
   - Verify token format matches application expectations
   - Check token expiration times
   - Ensure all required localStorage keys are present

3. **Performance impact**
   - Reduce number of domains if initialization is slow
   - Minimize data payload size
   - Consider if all localStorage data is necessary

### Debug Information

The browser pool emits events when localStorage is initialized:

- `localStorageInitialized`: Successfully set localStorage for a domain
- `localStorageInitializationFailed`: Failed to set localStorage for a domain

Monitor these events to troubleshoot localStorage setup issues.

## Environment Variables

Currently, localStorage configuration is only supported through configuration files (JSON/YAML). Environment variable support may be added in future versions.

## Integration with Other Features

### Request Parameters

localStorage works alongside request parameters to provide comprehensive session simulation:

```yaml
localStorage:
  - domain: "api.example.com"
    data:
      auth_token: "stored_token_123"

requestParameters:
  - target: "header"
    name: "Authorization"
    valueTemplate: "Bearer {{token_from_request}}"
    scope: "per-session"
```

### DRM Configuration

For DRM-protected content, localStorage can store license-related data:

```yaml
localStorage:
  - domain: "drm-service.com"
    data:
      device_id: "device_12345"
      license_cache: '{"widevine_cert":"cached_cert_data"}'

drmConfig:
  type: "widevine"
  licenseUrl: "https://drm-service.com/license"
```

## Examples by Industry

### Streaming Services

```yaml
localStorage:
  - domain: "streaming.example.com"
    data:
      user_token: "stream_token_123"
      subscription_status: "active"
      playback_position: '{"movie_123":{"position":1800,"duration":7200}}'
      quality_preference: "auto"
      subtitle_language: "en"
```

### E-commerce

```yaml
localStorage:
  - domain: "shop.example.com"
    data:
      session_id: "shop_sess_456"
      cart_id: "cart_789"
      user_preferences: '{"currency":"USD","language":"en","notifications":true}'
      recently_viewed: '["prod_1","prod_2","prod_3"]'
```

### SaaS Applications

```yaml
localStorage:
  - domain: "app.saas-example.com"
    data:
      access_token: "saas_token_789"
      workspace_id: "ws_123"
      user_role: "admin"
      ui_preferences: '{"sidebar_collapsed":false,"theme":"light"}'
      feature_flags: '{"beta_features":true,"new_dashboard":false}'
```

This localStorage feature enables comprehensive testing of authenticated user scenarios, making your load tests more realistic and valuable for identifying performance issues in production-like conditions.