# Troubleshooting Guide

This guide provides solutions to common issues encountered when using the Lightweight Browser Load Tester.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Problems](#configuration-problems)
- [Browser Launch Failures](#browser-launch-failures)
- [Memory and Resource Issues](#memory-and-resource-issues)
- [Network and Connectivity Problems](#network-and-connectivity-problems)
- [DRM Testing Issues](#drm-testing-issues)
- [Performance Problems](#performance-problems)
- [Metrics Export Issues](#metrics-export-issues)
- [Common Error Messages](#common-error-messages)
- [Debugging Tips](#debugging-tips)

## Installation Issues

### Node.js Version Compatibility

**Problem:** Installation fails with Node.js version errors.

**Solution:**
```bash
# Check your Node.js version
node --version

# Install Node.js 18+ if needed
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or download from nodejs.org
```

**Requirements:**
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher

### Playwright Installation Issues

**Problem:** Playwright browser binaries fail to download.

**Solution:**
```bash
# Install Playwright browsers manually
npx playwright install chromium

# If behind a corporate firewall
export HTTPS_PROXY=http://your-proxy:port
npx playwright install chromium

# For offline environments
npx playwright install --with-deps chromium
```

### Permission Errors

**Problem:** Permission denied errors during installation.

**Solution:**
```bash
# Fix npm permissions (Linux/macOS)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use a Node version manager like nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

## Configuration Problems

### Invalid Configuration File

**Problem:** Configuration validation fails.

**Error Message:**
```
❌ Configuration Error: "concurrentUsers" is required
```

**Solution:**
```bash
# Validate your configuration file
load-tester validate --config your-config.yaml

# Generate a valid example configuration
load-tester init --format yaml --output example-config.yaml
```

**Common Issues:**
- Missing required fields (`concurrentUsers`, `testDuration`, `streamingUrl`)
- Invalid data types (strings instead of numbers)
- Malformed YAML/JSON syntax

### Environment Variable Override Issues

**Problem:** Environment variables not being recognized.

**Solution:**
```bash
# Check environment variable names (must start with LT_)
export LT_CONCURRENT_USERS=10
export LT_TEST_DURATION=300
export LT_STREAMING_URL="https://example.com/stream"

# Verify variables are set
env | grep LT_
```

### File Path Issues

**Problem:** Configuration file not found.

**Solution:**
```bash
# Use absolute paths
load-tester test --config /full/path/to/config.yaml

# Or relative paths from current directory
load-tester test --config ./configs/test-config.yaml

# Check file exists and is readable
ls -la config.yaml
```

## Browser Launch Failures

### Browser Binary Not Found

**Problem:** Playwright cannot find browser binaries.

**Error Message:**
```
Error: Failed to launch browser: Executable doesn't exist
```

**Solution:**
```bash
# Install browser binaries
npx playwright install chromium

# Check installation
npx playwright install --dry-run

# For custom installations, set environment variable
export PLAYWRIGHT_BROWSERS_PATH=/custom/path/to/browsers
```

### Insufficient System Resources

**Problem:** Browser instances fail to start due to resource constraints.

**Error Message:**
```
Error: Failed to launch browser: spawn ENOMEM
```

**Solution:**
```yaml
# Reduce resource usage in configuration
resourceLimits:
  maxMemoryPerInstance: 256  # Reduce from 512MB
  maxConcurrentInstances: 5  # Reduce concurrent instances
  maxCpuPercentage: 60      # Reduce CPU usage

# Or increase system resources
```

### Display/X11 Issues (Linux)

**Problem:** Browser fails to start on headless Linux systems.

**Error Message:**
```
Error: Failed to launch browser: No X11 DISPLAY variable was set
```

**Solution:**
```bash
# Install virtual display
sudo apt-get install xvfb

# Run with virtual display
xvfb-run -a load-tester test --config config.yaml

# Or ensure headless mode is enabled (default)
```

### Sandbox Issues (Linux)

**Problem:** Chrome sandbox restrictions prevent browser launch.

**Error Message:**
```
Error: Failed to launch browser: Running as root without --no-sandbox is not supported
```

**Solution:**
```bash
# Option 1: Don't run as root (recommended)
su - normaluser
load-tester test --config config.yaml

# Option 2: Disable sandbox (less secure)
# Add to browser args in configuration:
```

```yaml
# Not directly configurable, but handled automatically by the tool
```

## Memory and Resource Issues

### Out of Memory Errors

**Problem:** System runs out of memory during testing.

**Error Message:**
```
Error: spawn ENOMEM
FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Solution:**
```yaml
# Reduce memory usage
resourceLimits:
  maxMemoryPerInstance: 256    # Reduce per-instance memory
  maxConcurrentInstances: 5    # Reduce concurrent instances

# Shorter test duration
testDuration: 300              # 5 minutes instead of longer tests
```

```bash
# Increase Node.js heap size
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory usage
htop  # or top, ps aux
```

### High CPU Usage

**Problem:** System becomes unresponsive due to high CPU usage.

**Solution:**
```yaml
# Limit CPU usage
resourceLimits:
  maxCpuPercentage: 50         # Reduce from 80%
  maxConcurrentInstances: 3    # Fewer instances

# Increase ramp-up time
rampUpTime: 120               # Slower ramp-up
```

### File Descriptor Limits

**Problem:** Too many open files error.

**Error Message:**
```
Error: EMFILE: too many open files
```

**Solution:**
```bash
# Check current limits
ulimit -n

# Increase file descriptor limit
ulimit -n 65536

# Make permanent (Linux)
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

## Network and Connectivity Problems

### Connection Timeouts

**Problem:** Network requests timeout during testing.

**Error Message:**
```
Error: Navigation timeout of 30000ms exceeded
```

**Solution:**
```yaml
# Increase timeout values (not directly configurable, but handled by tool)
# Ensure stable network connection
# Check target server capacity
```

```bash
# Test connectivity manually
curl -I https://your-streaming-url.com

# Check DNS resolution
nslookup your-streaming-url.com
```

### Proxy Configuration

**Problem:** Requests fail behind corporate proxy.

**Solution:**
```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1

# For authenticated proxies
export HTTP_PROXY=http://username:password@proxy.company.com:8080
```

### SSL/TLS Certificate Issues

**Problem:** SSL certificate validation fails.

**Error Message:**
```
Error: certificate verify failed: self signed certificate
```

**Solution:**
```bash
# For development/testing only - disable SSL verification
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Better solution: Add certificates to system trust store
# Or configure proper certificates on target server
```

### Rate Limiting

**Problem:** Target server rate limits requests.

**Error Message:**
```
HTTP 429: Too Many Requests
```

**Solution:**
```yaml
# Reduce request rate
concurrentUsers: 5            # Reduce from higher number
rampUpTime: 300              # Slower ramp-up (5 minutes)

# Add delays between requests (handled automatically by browser behavior)
```

## DRM Testing Issues

### DRM License Acquisition Failures

**Problem:** DRM license requests fail.

**Error Message:**
```
Error: DRM license acquisition failed
```

**Solution:**
```yaml
# Verify DRM configuration
drmConfig:
  type: widevine              # Ensure correct DRM type
  licenseUrl: "https://correct-license-server.com/license"
  customHeaders:
    Authorization: "Bearer valid-token"  # Ensure valid auth
```

```bash
# Test license server manually
curl -H "Authorization: Bearer your-token" \
     -X POST \
     https://license-server.com/license
```

### Unsupported DRM System

**Problem:** DRM system not supported by browser.

**Solution:**
- Widevine: Supported in Chromium (default)
- PlayReady: Limited support, may require specific configuration
- FairPlay: Not supported in Chromium, requires Safari

```yaml
# Use Widevine for maximum compatibility
drmConfig:
  type: widevine
  licenseUrl: "https://your-widevine-license-server.com"
```

### Certificate Issues

**Problem:** DRM certificate validation fails.

**Solution:**
```yaml
drmConfig:
  type: widevine
  licenseUrl: "https://license-server.com"
  certificateUrl: "https://certificate-server.com/cert"  # Ensure valid cert URL
  customHeaders:
    X-Certificate-Auth: "cert-token"
```

## Performance Problems

### Slow Test Execution

**Problem:** Tests run slower than expected.

**Diagnosis:**
```bash
# Monitor system resources
htop
iostat -x 1
```

**Solutions:**
```yaml
# Optimize configuration
resourceLimits:
  maxMemoryPerInstance: 1024   # Increase if system has memory
  maxConcurrentInstances: 10   # Optimize for your system

# Use SSD storage for better I/O performance
# Ensure adequate network bandwidth
```

### Inconsistent Results

**Problem:** Test results vary significantly between runs.

**Solutions:**
```yaml
# Longer test duration for stability
testDuration: 600             # 10 minutes minimum

# Consistent ramp-up
rampUpTime: 60               # 1 minute ramp-up

# Stable network environment
# Consistent system load
```

### Memory Leaks

**Problem:** Memory usage increases over time.

**Solution:**
```yaml
# Shorter test duration
testDuration: 300            # Restart test more frequently

# Monitor for memory leaks
```

```bash
# Monitor memory usage
watch -n 5 'ps aux | grep load-tester'
```

## Metrics Export Issues

### Prometheus Export Failures

**Problem:** Metrics not appearing in Prometheus.

**Error Message:**
```
Error: Failed to export metrics to Prometheus
```

**Solution:**
```yaml
prometheus:
  enabled: true
  remoteWriteUrl: "https://correct-prometheus-url.com/api/v1/write"
  username: "valid-username"
  password: "valid-password"
  timeout: 30000              # Increase timeout
```

```bash
# Test Prometheus endpoint manually
curl -u username:password \
     -X POST \
     -H "Content-Type: application/x-protobuf" \
     https://prometheus-url.com/api/v1/write
```

### OpenTelemetry Export Issues

**Problem:** OpenTelemetry metrics not being received.

**Solution:**
```yaml
opentelemetry:
  enabled: true
  endpoint: "https://correct-otel-endpoint.com/v1/metrics"
  protocol: "http/protobuf"    # Try different protocols
  serviceName: "load-tester"
  timeout: 30000
```

## Common Error Messages

### "Configuration Error: streaming URL is required"

**Cause:** Missing or invalid streaming URL.

**Solution:**
```bash
# Provide URL via command line
load-tester test --streaming-url https://example.com/stream

# Or in configuration file
```

```yaml
streamingUrl: "https://example.com/stream"
```

### "Failed to launch browser: spawn ENOENT"

**Cause:** Browser binary not found.

**Solution:**
```bash
# Install browser binaries
npx playwright install chromium

# Check installation path
npx playwright install --dry-run
```

### "Error: EADDRINUSE: address already in use"

**Cause:** Port conflict (usually with metrics export).

**Solution:**
```bash
# Check what's using the port
lsof -i :port-number

# Kill conflicting process or use different port
```

### "Navigation timeout of 30000ms exceeded"

**Cause:** Page load timeout.

**Solution:**
- Check network connectivity
- Verify streaming URL is accessible
- Ensure target server is responsive

```bash
# Test URL manually
curl -I https://your-streaming-url.com
```

## Debugging Tips

### Enable Verbose Logging

```bash
# Enable verbose output
load-tester test --config config.yaml --verbose

# Or set environment variable
export DEBUG=load-tester:*
load-tester test --config config.yaml
```

### Browser Debugging

```yaml
# Enable headed mode for debugging (not directly configurable)
# Use browser developer tools to inspect network requests
```

```bash
# Run single instance for debugging
load-tester test --concurrent-users 1 --test-duration 60 --streaming-url https://example.com
```

### Network Debugging

```bash
# Monitor network traffic
sudo tcpdump -i any host your-streaming-server.com

# Check DNS resolution
dig your-streaming-server.com

# Test connectivity
telnet your-streaming-server.com 443
```

### System Resource Monitoring

```bash
# Monitor CPU and memory
htop

# Monitor disk I/O
iostat -x 1

# Monitor network
iftop

# Check system limits
ulimit -a
```

### Log Analysis

```bash
# Check system logs
journalctl -f

# Monitor application logs
tail -f /var/log/load-tester.log  # if logging to file

# Check for core dumps
ls -la /var/crash/
```

## Getting Help

If you continue to experience issues:

1. **Check the logs**: Enable verbose logging and examine error messages
2. **Verify configuration**: Use `load-tester validate --config your-config.yaml`
3. **Test connectivity**: Manually test your streaming URL and DRM endpoints
4. **Check system resources**: Ensure adequate CPU, memory, and network capacity
5. **Update dependencies**: Ensure you're using the latest version
6. **Search issues**: Check GitHub issues for similar problems
7. **Create an issue**: Provide detailed error messages, configuration, and system information

### Information to Include in Bug Reports

- Operating system and version
- Node.js version (`node --version`)
- Tool version (`load-tester --version`)
- Complete error message and stack trace
- Configuration file (with sensitive data removed)
- System resource information (CPU, memory, network)
- Steps to reproduce the issue

### Useful Commands for Diagnostics

```bash
# System information
uname -a
node --version
npm --version

# Resource usage
free -h
df -h
lscpu

# Network configuration
ip addr show
cat /etc/resolv.conf

# Process information
ps aux | grep load-tester
lsof -p <process-id>
```