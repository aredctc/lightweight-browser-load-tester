/**
 * Tests for type definitions
 */

import { describe, it, expect } from 'vitest';
import type { 
  TestConfiguration, 
  TestResults, 
  DRMConfiguration,
  ResourceLimits 
} from './index';

describe('Type Definitions', () => {
  it('should have valid TestConfiguration interface', () => {
    const config: TestConfiguration = {
      concurrentUsers: 10,
      testDuration: 300,
      rampUpTime: 30,
      streamingUrl: 'https://example.com/stream',
      requestParameters: [],
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 20
      }
    };

    expect(config.concurrentUsers).toBe(10);
    expect(config.streamingUrl).toBe('https://example.com/stream');
    expect(config.resourceLimits.maxMemoryPerInstance).toBe(512);
  });

  it('should have valid DRMConfiguration interface', () => {
    const drmConfig: DRMConfiguration = {
      type: 'widevine',
      licenseUrl: 'https://example.com/license'
    };

    expect(drmConfig.type).toBe('widevine');
    expect(drmConfig.licenseUrl).toBe('https://example.com/license');
  });

  it('should have valid ResourceLimits interface', () => {
    const limits: ResourceLimits = {
      maxMemoryPerInstance: 1024,
      maxCpuPercentage: 90,
      maxConcurrentInstances: 50
    };

    expect(limits.maxMemoryPerInstance).toBe(1024);
    expect(limits.maxCpuPercentage).toBe(90);
    expect(limits.maxConcurrentInstances).toBe(50);
  });
});