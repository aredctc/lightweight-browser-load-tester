/**
 * Basic tests to verify type definitions and project setup
 */

import { describe, it, expect } from 'vitest';
import { TestConfiguration, DRMConfiguration, TestResults } from './index';

describe('Type Definitions', () => {
  it('should create a valid TestConfiguration', () => {
    const config: TestConfiguration = {
      concurrentUsers: 10,
      testDuration: 300,
      rampUpTime: 60,
      streamingUrl: 'https://example.com/stream',
      requestParameters: [],
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 20
      }
    };

    expect(config.concurrentUsers).toBe(10);
    expect(config.testDuration).toBe(300);
    expect(config.streamingUrl).toBe('https://example.com/stream');
  });

  it('should create a valid DRMConfiguration', () => {
    const drmConfig: DRMConfiguration = {
      type: 'widevine',
      licenseUrl: 'https://example.com/license',
      certificateUrl: 'https://example.com/cert',
      customHeaders: {
        'Authorization': 'Bearer token123'
      }
    };

    expect(drmConfig.type).toBe('widevine');
    expect(drmConfig.licenseUrl).toBe('https://example.com/license');
    expect(drmConfig.customHeaders?.Authorization).toBe('Bearer token123');
  });

  it('should create a valid TestResults structure', () => {
    const results: TestResults = {
      summary: {
        totalRequests: 1000,
        successfulRequests: 950,
        failedRequests: 50,
        averageResponseTime: 250,
        peakConcurrentUsers: 10,
        testDuration: 300
      },
      browserMetrics: [],
      drmMetrics: [],
      networkMetrics: [],
      errors: []
    };

    expect(results.summary.totalRequests).toBe(1000);
    expect(results.summary.successfulRequests).toBe(950);
    expect(results.summary.failedRequests).toBe(50);
  });
});