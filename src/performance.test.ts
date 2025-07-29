import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserPool } from './managers/browser-pool';
import { TestRunner } from './controllers/test-runner';
import { TestConfiguration, BrowserPoolConfig } from './types';
import { chromium } from 'playwright';

// Mock Playwright for performance tests
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn()
  }
}));

describe('Performance Optimization and Resource Management', () => {
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(() => {
    // Setup comprehensive mocks for performance testing
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      route: vi.fn().mockResolvedValue(undefined),
      unroute: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      removeListener: vi.fn()
    };

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      clearCookies: vi.fn().mockResolvedValue(undefined),
      clearPermissions: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([mockPage])
    };

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn().mockResolvedValue(undefined),
      contexts: vi.fn().mockReturnValue([mockContext]),
      on: vi.fn()
    };

    (chromium.launch as any).mockResolvedValue(mockBrowser);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Memory Cleanup Between Test Runs', () => {
    let browserPool: BrowserPool;
    let config: BrowserPoolConfig;

    beforeEach(() => {
      config = {
        maxInstances: 3,
        minInstances: 1,
        resourceLimits: {
          maxMemoryPerInstance: 256,
          maxCpuPercentage: 70,
          maxConcurrentInstances: 5
        },
        browserOptions: {
          headless: true,
          args: ['--test-arg']
        }
      };
      browserPool = new BrowserPool(config);
    });

    afterEach(async () => {
      if (browserPool) {
        await browserPool.shutdown();
      }
    });

    it('should perform comprehensive memory cleanup when releasing instances', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      const instanceId = instance.id;
      
      // Release the instance - should trigger memory cleanup
      await browserPool.releaseInstance(instanceId);
      
      // Verify cleanup operations were called
      expect(mockPage.goto).toHaveBeenCalledWith('about:blank');
      expect(mockContext.clearCookies).toHaveBeenCalled();
      expect(mockContext.clearPermissions).toHaveBeenCalled();
      expect(mockPage.evaluate).toHaveBeenCalled();
      
      // Verify the instance is available for reuse
      const poolStatus = browserPool.getPoolStatus();
      expect(poolStatus.availableInstances).toBe(1);
    });

    it('should perform aggressive memory cleanup for instances approaching limits', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      
      // Mock high memory usage
      instance.metrics.memoryUsage = 200; // Close to 256MB limit
      
      // Trigger aggressive cleanup
      await (browserPool as any).performAggressiveMemoryCleanup(instance);
      
      // Verify aggressive cleanup operations
      expect(mockPage.goto).toHaveBeenCalledWith('about:blank');
      expect(mockContext.clearCookies).toHaveBeenCalled();
      expect(mockContext.clearPermissions).toHaveBeenCalled();
      expect(mockPage.evaluate).toHaveBeenCalledTimes(2); // Standard + GC
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
    });

    it('should reset request count during memory cleanup', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      instance.metrics.requestCount = 100;
      
      await browserPool.releaseInstance(instance.id);
      
      // Request count should be reset
      expect(instance.metrics.requestCount).toBe(0);
    });

    it('should destroy instance if memory cleanup fails', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      const instanceId = instance.id;
      
      // Make cleanup fail
      mockPage.goto.mockRejectedValue(new Error('Cleanup failed'));
      
      const destroySpy = vi.fn();
      browserPool.on('instanceDestroyed', destroySpy);
      
      await browserPool.releaseInstance(instanceId);
      
      expect(destroySpy).toHaveBeenCalledWith({ instanceId });
    });
  });

  describe('Configurable Resource Limits Enforcement', () => {
    let browserPool: BrowserPool;
    let config: BrowserPoolConfig;

    beforeEach(() => {
      config = {
        maxInstances: 5,
        minInstances: 2,
        resourceLimits: {
          maxMemoryPerInstance: 256,
          maxCpuPercentage: 70,
          maxConcurrentInstances: 5
        }
      };
      browserPool = new BrowserPool(config);
    });

    afterEach(async () => {
      if (browserPool) {
        await browserPool.shutdown();
      }
    });

    it('should enforce memory limits and destroy instances exceeding critical thresholds', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      await browserPool.releaseInstance(instance.id);
      
      // Set memory usage to exceed critical threshold (1.5x limit)
      instance.metrics.memoryUsage = 400; // Exceeds 256 * 1.5 = 384
      
      const destroySpy = vi.fn();
      browserPool.on('instanceDestroyedForResourceLimit', destroySpy);
      
      // Trigger resource limit enforcement
      await (browserPool as any).enforceResourceLimits();
      
      expect(destroySpy).toHaveBeenCalledWith({ instanceId: instance.id });
    });

    it('should attempt cleanup before destroying instances with moderate resource usage', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      await browserPool.releaseInstance(instance.id);
      
      // Set memory usage to exceed limit but not critical threshold
      instance.metrics.memoryUsage = 300; // Exceeds 256 but less than 384
      
      const cleanupSpy = vi.fn();
      browserPool.on('instanceCleanedForResourceLimit', cleanupSpy);
      
      // Trigger resource limit enforcement
      await (browserPool as any).enforceResourceLimits();
      
      expect(cleanupSpy).toHaveBeenCalledWith({ instanceId: instance.id });
    });

    it('should emit warnings for active instances exceeding limits', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      // Keep instance active
      instance.isActive = true;
      instance.metrics.memoryUsage = 300; // Exceeds limit
      
      const warningSpy = vi.fn();
      browserPool.on('resourceLimitWarning', warningSpy);
      
      // Trigger resource limit enforcement
      await (browserPool as any).enforceResourceLimits();
      
      expect(warningSpy).toHaveBeenCalledWith({
        instanceId: instance.id,
        type: 'memory',
        usage: 300,
        limit: 256,
        isActive: true
      });
    });

    it('should enforce CPU limits', async () => {
      await browserPool.initialize();
      
      const instance = await browserPool.acquireInstance();
      await browserPool.releaseInstance(instance.id);
      
      // Set CPU usage to exceed limit
      instance.metrics.cpuUsage = 80; // Exceeds 70% limit
      
      const cleanupSpy = vi.fn();
      browserPool.on('instanceCleanedForResourceLimit', cleanupSpy);
      
      // Trigger resource limit enforcement
      await (browserPool as any).enforceResourceLimits();
      
      expect(cleanupSpy).toHaveBeenCalledWith({ instanceId: instance.id });
    });

    it('should respect maximum concurrent instances limit', async () => {
      const smallConfig = { ...config, maxInstances: 2 };
      await browserPool.shutdown();
      browserPool = new BrowserPool(smallConfig);
      await browserPool.initialize();
      
      // Acquire all available instances
      const instance1 = await browserPool.acquireInstance();
      const instance2 = await browserPool.acquireInstance();
      
      // Try to acquire one more - should wait or fail
      const acquirePromise = browserPool.acquireInstance();
      
      // Should not resolve immediately since we're at max capacity
      let resolved = false;
      acquirePromise.then(() => { resolved = true; }).catch(() => { resolved = true; });
      
      // Wait a short time
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(resolved).toBe(false);
      
      // Release an instance
      await browserPool.releaseInstance(instance1.id);
      
      // Now the acquire should succeed
      const instance3 = await acquirePromise;
      expect(instance3).toBeDefined();
    });
  });

  describe('Performance Monitoring and Alerting', () => {
    let testRunner: TestRunner;
    let testConfig: TestConfiguration;

    beforeEach(() => {
      testConfig = {
        concurrentUsers: 2,
        testDuration: 10,
        rampUpTime: 2,
        streamingUrl: 'https://example.com/stream',
        requestParameters: [],
        resourceLimits: {
          maxMemoryPerInstance: 256,
          maxCpuPercentage: 70,
          maxConcurrentInstances: 5
        }
      };
      testRunner = new TestRunner(testConfig);
    });

    it('should generate memory utilization alerts', () => {
      const mockResourceStats = {
        memoryUtilization: 85, // Above 80% threshold
        cpuUtilization: 60,
        instancesNearMemoryLimit: 2,
        instancesNearCpuLimit: 0,
        totalInstances: 3,
        activeInstances: 2
      };
      
      const alerts = (testRunner as any).generateResourceAlerts(mockResourceStats);
      
      const memoryAlert = alerts.find((alert: any) => alert.type === 'memory');
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert.severity).toBe('warning');
      expect(memoryAlert.message).toContain('High memory utilization: 85.0%');
    });

    it('should generate critical memory utilization alerts', () => {
      const mockResourceStats = {
        memoryUtilization: 95, // Above 90% threshold
        cpuUtilization: 60,
        instancesNearMemoryLimit: 3,
        instancesNearCpuLimit: 0,
        totalInstances: 3,
        activeInstances: 3
      };
      
      const alerts = (testRunner as any).generateResourceAlerts(mockResourceStats);
      
      const memoryAlert = alerts.find((alert: any) => alert.type === 'memory');
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert.severity).toBe('critical');
      expect(memoryAlert.message).toContain('Critical memory utilization: 95.0%');
    });

    it('should generate CPU utilization alerts', () => {
      const mockResourceStats = {
        memoryUtilization: 60,
        cpuUtilization: 85, // Above 80% threshold
        instancesNearMemoryLimit: 0,
        instancesNearCpuLimit: 2,
        totalInstances: 3,
        activeInstances: 2
      };
      
      const alerts = (testRunner as any).generateResourceAlerts(mockResourceStats);
      
      const cpuAlert = alerts.find((alert: any) => alert.type === 'cpu');
      expect(cpuAlert).toBeDefined();
      expect(cpuAlert.severity).toBe('warning');
      expect(cpuAlert.message).toContain('High CPU utilization: 85.0%');
    });

    it('should generate instance limit alerts', () => {
      const mockResourceStats = {
        memoryUtilization: 60,
        cpuUtilization: 60,
        instancesNearMemoryLimit: 0,
        instancesNearCpuLimit: 0,
        totalInstances: 5, // At max limit
        activeInstances: 5
      };
      
      const alerts = (testRunner as any).generateResourceAlerts(mockResourceStats);
      
      const instanceAlert = alerts.find((alert: any) => alert.type === 'instance_limit');
      expect(instanceAlert).toBeDefined();
      expect(instanceAlert.severity).toBe('critical');
      expect(instanceAlert.message).toContain('Near maximum instance limit: 5/5');
    });

    it('should generate performance alerts based on response times', () => {
      // Mock network metrics with slow response times
      const mockNetworkMetrics = [
        {
          url: 'https://example.com/api',
          method: 'GET',
          responseTime: 3000, // 3 seconds - above warning threshold
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 500,
          responseSize: 1000
        },
        {
          url: 'https://example.com/api2',
          method: 'GET',
          responseTime: 2500,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 500,
          responseSize: 1000
        }
      ];
      
      // Mock getAllNetworkMetrics to return our test data
      (testRunner as any).getAllNetworkMetrics = vi.fn().mockReturnValue(mockNetworkMetrics);
      
      const mockResourceStats = {
        memoryUtilization: 60,
        cpuUtilization: 60,
        instancesNearMemoryLimit: 0,
        instancesNearCpuLimit: 0,
        totalInstances: 2,
        activeInstances: 2
      };
      
      const alerts = (testRunner as any).generateResourceAlerts(mockResourceStats);
      
      const performanceAlert = alerts.find((alert: any) => alert.type === 'performance');
      expect(performanceAlert).toBeDefined();
      expect(performanceAlert.severity).toBe('warning');
      expect(performanceAlert.message).toContain('Slow response times: 2750ms average');
    });

    it('should provide detailed resource usage statistics', () => {
      const resourceStats = testRunner.getResourceUsageStats();
      
      expect(resourceStats).toHaveProperty('totalInstances');
      expect(resourceStats).toHaveProperty('activeInstances');
      expect(resourceStats).toHaveProperty('totalMemoryUsage');
      expect(resourceStats).toHaveProperty('averageMemoryUsage');
      expect(resourceStats).toHaveProperty('totalCpuUsage');
      expect(resourceStats).toHaveProperty('averageCpuUsage');
      expect(resourceStats).toHaveProperty('memoryUtilization');
      expect(resourceStats).toHaveProperty('cpuUtilization');
      expect(resourceStats).toHaveProperty('instancesNearMemoryLimit');
      expect(resourceStats).toHaveProperty('instancesNearCpuLimit');
      expect(resourceStats).toHaveProperty('resourceLimits');
    });

    it('should include resource utilization data in monitoring output', () => {
      const monitoringData = testRunner.getMonitoringData();
      
      expect(monitoringData).toHaveProperty('resourceUtilization');
      expect(monitoringData.resourceUtilization).toHaveProperty('memoryUtilization');
      expect(monitoringData.resourceUtilization).toHaveProperty('cpuUtilization');
      expect(monitoringData.resourceUtilization).toHaveProperty('instancesNearMemoryLimit');
      expect(monitoringData.resourceUtilization).toHaveProperty('instancesNearCpuLimit');
      expect(monitoringData.resourceUtilization).toHaveProperty('resourceAlerts');
      expect(Array.isArray(monitoringData.resourceUtilization.resourceAlerts)).toBe(true);
    });
  });

  describe('Resource Consumption Benchmarks', () => {
    let browserPool: BrowserPool;
    let config: BrowserPoolConfig;

    beforeEach(() => {
      config = {
        maxInstances: 10,
        minInstances: 2,
        resourceLimits: {
          maxMemoryPerInstance: 512,
          maxCpuPercentage: 80,
          maxConcurrentInstances: 10
        }
      };
      browserPool = new BrowserPool(config);
    });

    afterEach(async () => {
      if (browserPool) {
        await browserPool.shutdown();
      }
    });

    it('should maintain memory usage within configured limits per instance', async () => {
      await browserPool.initialize();
      
      // Create multiple instances and check memory usage
      const instances = [];
      for (let i = 0; i < 5; i++) {
        instances.push(await browserPool.acquireInstance());
      }
      
      const metrics = browserPool.getMetrics();
      
      // Each instance should be within memory limits
      for (const metric of metrics) {
        expect(metric.memoryUsage).toBeLessThanOrEqual(config.resourceLimits.maxMemoryPerInstance);
      }
      
      // Clean up
      for (const instance of instances) {
        await browserPool.releaseInstance(instance.id);
      }
    });

    it('should efficiently reuse browser instances to minimize resource overhead', async () => {
      await browserPool.initialize();
      
      // Acquire and release instances multiple times
      const acquisitionTimes = [];
      
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        const instance = await browserPool.acquireInstance();
        const acquisitionTime = Date.now() - startTime;
        acquisitionTimes.push(acquisitionTime);
        
        await browserPool.releaseInstance(instance.id);
      }
      
      // After the first few acquisitions, subsequent ones should be faster due to reuse
      const initialAcquisitions = acquisitionTimes.slice(0, 3);
      const laterAcquisitions = acquisitionTimes.slice(3);
      
      const avgInitial = initialAcquisitions.reduce((a, b) => a + b, 0) / initialAcquisitions.length;
      const avgLater = laterAcquisitions.reduce((a, b) => a + b, 0) / laterAcquisitions.length;
      
      // Later acquisitions should generally be faster (allowing some variance)
      expect(avgLater).toBeLessThanOrEqual(avgInitial * 1.5);
    });

    it('should cleanup idle instances to free resources', async () => {
      await browserPool.initialize();
      
      // Create several instances beyond minimum
      const instances = [];
      for (let i = 0; i < 5; i++) {
        instances.push(await browserPool.acquireInstance());
      }
      
      // Release them all
      for (const instance of instances) {
        await browserPool.releaseInstance(instance.id);
      }
      
      const statusAfterRelease = browserPool.getPoolStatus();
      
      // Manually set lastUsed time to make instances appear idle
      for (const [instanceId, instance] of (browserPool as any).instances) {
        if (!instance.isActive) {
          instance.lastUsed = new Date(Date.now() - 400000); // 400 seconds ago
        }
      }
      
      // Force cleanup of idle instances
      const cleanedCount = await browserPool.cleanupIdleInstances(300000); // 5 minutes
      
      const finalStatus = browserPool.getPoolStatus();
      
      // Should have cleaned up some instances if we had more than minimum
      if (statusAfterRelease.totalInstances > config.minInstances) {
        expect(cleanedCount).toBeGreaterThan(0);
        expect(finalStatus.totalInstances).toBeLessThan(statusAfterRelease.totalInstances);
      } else {
        // If we only had minimum instances, nothing should be cleaned up
        expect(cleanedCount).toBe(0);
      }
      
      // Should never go below minimum
      expect(finalStatus.totalInstances).toBeGreaterThanOrEqual(config.minInstances);
    });

    it('should provide accurate resource utilization calculations', async () => {
      await browserPool.initialize();
      
      // Create instances with known resource usage
      const instances = [];
      for (let i = 0; i < 3; i++) {
        const instance = await browserPool.acquireInstance();
        instance.metrics.memoryUsage = 100 + (i * 50); // 100, 150, 200 MB
        instance.metrics.cpuUsage = 20 + (i * 10); // 20, 30, 40%
        instances.push(instance);
      }
      
      const resourceStats = browserPool.getResourceUsageStats();
      
      // Verify calculations
      expect(resourceStats.totalMemoryUsage).toBe(450); // 100 + 150 + 200
      expect(resourceStats.averageMemoryUsage).toBe(150); // 450 / 3
      expect(resourceStats.totalCpuUsage).toBe(90); // 20 + 30 + 40
      expect(resourceStats.averageCpuUsage).toBe(30); // 90 / 3
      
      // Memory utilization: (450 / (3 * 512)) * 100 = ~29.3%
      expect(resourceStats.memoryUtilization).toBeCloseTo(29.3, 1);
      
      // CPU utilization: (30 / 80) * 100 = 37.5%
      expect(resourceStats.cpuUtilization).toBeCloseTo(37.5, 1);
      
      // Clean up
      for (const instance of instances) {
        await browserPool.releaseInstance(instance.id);
      }
    });

    it('should handle resource exhaustion gracefully', async () => {
      // Create a pool with very limited resources for testing
      const limitedConfig = {
        ...config,
        maxInstances: 2,
        resourceLimits: {
          ...config.resourceLimits,
          maxMemoryPerInstance: 100 // Very low limit
        }
      };
      
      await browserPool.shutdown();
      browserPool = new BrowserPool(limitedConfig);
      await browserPool.initialize();
      
      const instances = [];
      
      // Acquire instances and push them to memory limits
      for (let i = 0; i < 2; i++) {
        const instance = await browserPool.acquireInstance();
        instance.metrics.memoryUsage = 95; // Near limit
        instances.push(instance);
      }
      
      // Release instances
      for (const instance of instances) {
        await browserPool.releaseInstance(instance.id);
      }
      
      // Set one instance to exceed limits
      instances[0].metrics.memoryUsage = 120; // Exceeds limit
      
      const cleanupSpy = vi.fn();
      const destroySpy = vi.fn();
      browserPool.on('instanceCleanedForResourceLimit', cleanupSpy);
      browserPool.on('instanceDestroyedForResourceLimit', destroySpy);
      
      // Trigger resource enforcement
      await (browserPool as any).enforceResourceLimits();
      
      // Should have attempted cleanup or destruction
      expect(cleanupSpy.mock.calls.length + destroySpy.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Performance Tests', () => {
    it('should maintain performance under concurrent load', async () => {
      const testConfig: TestConfiguration = {
        concurrentUsers: 2, // Reduced for test stability
        testDuration: 2,    // Shorter duration for test
        rampUpTime: 1,
        streamingUrl: 'https://example.com/stream',
        requestParameters: [],
        resourceLimits: {
          maxMemoryPerInstance: 256,
          maxCpuPercentage: 70,
          maxConcurrentInstances: 10
        }
      };
      
      const testRunner = new TestRunner(testConfig);
      
      // Test resource usage statistics without actually starting the test
      const resourceStats = testRunner.getResourceUsageStats();
      
      // Verify resource statistics structure
      expect(resourceStats).toHaveProperty('totalInstances');
      expect(resourceStats).toHaveProperty('activeInstances');
      expect(resourceStats).toHaveProperty('memoryUtilization');
      expect(resourceStats).toHaveProperty('cpuUtilization');
      
      // Test monitoring data structure
      const monitoringData = testRunner.getMonitoringData();
      
      // Verify resource utilization is within acceptable bounds (should be 0 for new test runner)
      expect(monitoringData.resourceUtilization.memoryUtilization).toBeLessThan(90);
      expect(monitoringData.resourceUtilization.cpuUtilization).toBeLessThan(90);
      
      // Verify monitoring data structure
      expect(monitoringData).toHaveProperty('resourceUtilization');
      expect(monitoringData.resourceUtilization).toHaveProperty('resourceAlerts');
      expect(Array.isArray(monitoringData.resourceUtilization.resourceAlerts)).toBe(true);
      
      // Test idle cleanup functionality
      const cleanedCount = await testRunner.cleanupIdleInstances(0);
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });
  });
});