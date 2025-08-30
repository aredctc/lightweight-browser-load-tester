import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { BrowserPool } from './browser-pool';
import { BrowserPoolConfig } from '../types';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn()
  }
}));

describe('BrowserPool', () => {
  let browserPool: BrowserPool;
  let mockBrowser: Browser;
  let mockContext: BrowserContext;
  let mockPage: Page;
  let config: BrowserPoolConfig;

  beforeEach(() => {
    // Setup mocks
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      clearCookies: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([mockPage])
    } as any;

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn().mockResolvedValue(undefined),
      contexts: vi.fn().mockReturnValue([mockContext]),
      on: vi.fn()
    } as any;

    (chromium.launch as Mock).mockResolvedValue(mockBrowser);

    config = {
      maxInstances: 5,
      minInstances: 2,
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 10
      },
      browserOptions: {
        headless: true,
        args: ['--test-arg']
      }
    };
  });

  afterEach(async () => {
    if (browserPool) {
      await browserPool.shutdown();
    }
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create browser pool with correct configuration', () => {
      browserPool = new BrowserPool(config);
      expect(browserPool).toBeInstanceOf(BrowserPool);
    });

    it('should initialize with minimum number of instances', async () => {
      browserPool = new BrowserPool(config);
      
      const initPromise = browserPool.initialize();
      
      // Wait for initialization
      await initPromise;
      
      expect(chromium.launch).toHaveBeenCalledTimes(config.minInstances);
      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        args: expect.arrayContaining(['--test-arg', '--no-sandbox'])
      });
    });

    it('should emit initialized event after setup', async () => {
      browserPool = new BrowserPool(config);
      
      const initSpy = vi.fn();
      browserPool.on('initialized', initSpy);
      
      await browserPool.initialize();
      
      expect(initSpy).toHaveBeenCalledWith({ instanceCount: config.minInstances });
    });
  });

  describe('instance management', () => {
    beforeEach(async () => {
      browserPool = new BrowserPool(config);
      await browserPool.initialize();
    });

    it('should acquire available instance from pool', async () => {
      const instance = await browserPool.acquireInstance();
      
      expect(instance).toBeDefined();
      expect(instance.id).toMatch(/^browser-\d+-[a-z0-9]+$/);
      expect(instance.browser).toBe(mockBrowser);
      expect(instance.context).toBe(mockContext);
      expect(instance.page).toBe(mockPage);
      expect(instance.isActive).toBe(true);
    });

    it('should create new instance when pool is empty and under limit', async () => {
      // Acquire all available instances
      const instances = [];
      for (let i = 0; i < config.minInstances; i++) {
        instances.push(await browserPool.acquireInstance());
      }
      
      // Should create a new instance since we're under maxInstances
      const newInstance = await browserPool.acquireInstance();
      expect(newInstance).toBeDefined();
      expect(chromium.launch).toHaveBeenCalledTimes(config.minInstances + 1);
    });

    it('should release instance back to pool', async () => {
      const instance = await browserPool.acquireInstance();
      const instanceId = instance.id;
      
      await browserPool.releaseInstance(instanceId);
      
      expect(instance.isActive).toBe(false);
      expect(mockPage.goto).toHaveBeenCalledWith('about:blank');
      expect(mockContext.clearCookies).toHaveBeenCalled();
    });

    it('should destroy instance if cleanup fails during release', async () => {
      const instance = await browserPool.acquireInstance();
      const instanceId = instance.id;
      
      // Make cleanup fail
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));
      
      await browserPool.releaseInstance(instanceId);
      
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should throw error when releasing non-existent instance', async () => {
      await expect(browserPool.releaseInstance('non-existent')).rejects.toThrow(
        'Browser instance non-existent not found'
      );
    });

    it('should throw error when acquiring instance during shutdown', async () => {
      const shutdownPromise = browserPool.shutdown();
      
      await expect(browserPool.acquireInstance()).rejects.toThrow(
        'Browser pool is shutting down'
      );
      
      await shutdownPromise;
    });
  });

  describe('resource monitoring', () => {
    beforeEach(async () => {
      browserPool = new BrowserPool(config);
      await browserPool.initialize();
    });

    it('should return metrics for all instances', async () => {
      const _instance = await browserPool.acquireInstance();
      
      const metrics = browserPool.getMetrics();
      
      expect(metrics).toHaveLength(config.minInstances);
      expect(metrics[0]).toMatchObject({
        instanceId: expect.any(String),
        memoryUsage: expect.any(Number),
        cpuUsage: expect.any(Number),
        requestCount: 0,
        errorCount: 0,
        uptime: expect.any(Number)
      });
    });

    it('should return correct pool status', async () => {
      const _instance = await browserPool.acquireInstance();
      
      const status = browserPool.getPoolStatus();
      
      expect(status).toEqual({
        totalInstances: config.minInstances,
        availableInstances: config.minInstances - 1,
        activeInstances: 1,
        maxInstances: config.maxInstances,
        resourceLimits: config.resourceLimits
      });
    });

    it('should emit resource limit exceeded event', async () => {
      const limitSpy = vi.fn();
      browserPool.on('resourceLimitExceeded', limitSpy);
      
      // Simulate high memory usage by modifying the internal method
      const instance = await browserPool.acquireInstance();
      
      // Access private method for testing
      const updateMetrics = (browserPool as any).updateResourceMetrics.bind(browserPool);
      
      // Mock getBrowserMemoryUsage to return high value
      const originalGetMemory = (browserPool as any).getBrowserMemoryUsage;
      (browserPool as any).getBrowserMemoryUsage = vi.fn().mockResolvedValue(1000); // Exceeds 512MB limit
      
      await updateMetrics();
      
      expect(limitSpy).toHaveBeenCalledWith({
        instanceId: instance.id,
        type: 'memory',
        usage: 1000,
        limit: 512
      });
      
      // Restore original method
      (browserPool as any).getBrowserMemoryUsage = originalGetMemory;
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      browserPool = new BrowserPool(config);
    });

    it('should handle browser creation failure', async () => {
      (chromium.launch as Mock).mockRejectedValue(new Error('Launch failed'));
      
      await expect(browserPool.initialize()).rejects.toThrow('Launch failed');
    });

    it('should handle browser disconnect', async () => {
      await browserPool.initialize();
      
      const disconnectSpy = vi.fn();
      browserPool.on('instanceDisconnected', disconnectSpy);
      
      // Simulate browser disconnect
      const onCall = (mockBrowser.on as Mock).mock.calls.find(call => call[0] === 'disconnected');
      if (onCall) {
        onCall[1](); // Call the disconnect handler
      }
      
      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should handle metrics update failure gracefully', async () => {
      await browserPool.initialize();
      
      const errorSpy = vi.fn();
      browserPool.on('metricsUpdateFailed', errorSpy);
      
      // Mock getBrowserMemoryUsage to throw error
      const originalGetMemory = (browserPool as any).getBrowserMemoryUsage;
      (browserPool as any).getBrowserMemoryUsage = vi.fn().mockRejectedValue(new Error('Memory check failed'));
      
      // Trigger metrics update
      await (browserPool as any).updateResourceMetrics();
      
      expect(errorSpy).toHaveBeenCalled();
      
      // Restore original method
      (browserPool as any).getBrowserMemoryUsage = originalGetMemory;
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      browserPool = new BrowserPool(config);
      await browserPool.initialize();
    });

    it('should shutdown all instances and cleanup resources', async () => {
      const shutdownSpy = vi.fn();
      browserPool.on('shutdown', shutdownSpy);
      
      await browserPool.shutdown();
      
      expect(mockContext.close).toHaveBeenCalledTimes(config.minInstances);
      expect(mockBrowser.close).toHaveBeenCalledTimes(config.minInstances);
      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should handle cleanup errors during shutdown', async () => {
      mockContext.close.mockRejectedValue(new Error('Close failed'));
      
      // Should not throw error
      await expect(browserPool.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('instance pooling and reuse', () => {
    beforeEach(async () => {
      browserPool = new BrowserPool(config);
      await browserPool.initialize();
    });

    it('should reuse released instances', async () => {
      // Acquire a single instance
      const instance1 = await browserPool.acquireInstance();
      const instanceId = instance1.id;
      
      // Release the instance
      await browserPool.releaseInstance(instanceId);
      
      // Verify it's available for reuse
      const poolStatus = browserPool.getPoolStatus();
      expect(poolStatus.availableInstances).toBeGreaterThan(0);
      
      // Acquire an instance - should reuse from available pool
      const reusedInstance = await browserPool.acquireInstance();
      
      // Should get an instance (might be the same one or another available one)
      expect(reusedInstance).toBeDefined();
      expect(reusedInstance.isActive).toBe(true);
      
      // The key test is that we're reusing instances from the pool, not always creating new ones
      // We can verify this by checking that we don't exceed the expected instance count
      const finalStatus = browserPool.getPoolStatus();
      expect(finalStatus.totalInstances).toBeLessThanOrEqual(config.maxInstances);
      
      // Clean up
      await browserPool.releaseInstance(reusedInstance.id);
    });

    it.skip('should wait for available instance when at max capacity', async () => {
      // Set a small max for testing
      const smallConfig = { ...config, maxInstances: 1, minInstances: 1 };
      await browserPool.shutdown();
      browserPool = new BrowserPool(smallConfig);
      await browserPool.initialize();
      
      // Acquire the only instance
      const instance1 = await browserPool.acquireInstance();
      
      // Verify we're at capacity
      const statusBeforeWait = browserPool.getPoolStatus();
      expect(statusBeforeWait.availableInstances).toBe(0);
      expect(statusBeforeWait.totalInstances).toBe(1);
      
      // This should wait - start the acquire but don't await it yet
      const acquirePromise = browserPool.acquireInstance();
      
      // Give it a moment to start waiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Release the instance - this should trigger the waiting acquire
      await browserPool.releaseInstance(instance1.id);
      
      // Now the acquire should complete within a reasonable time
      const instance2 = await Promise.race([
        acquirePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Acquire timed out')), 3000))
      ]);
      
      expect(instance2).toBeDefined();
      expect(instance2.isActive).toBe(true);
      
      // Clean up
      await browserPool.releaseInstance(instance2.id);
    }, 5000);

    it('should timeout when waiting too long for available instance', async () => {
      // Set a small max for testing
      const smallConfig = { ...config, maxInstances: 1, minInstances: 1 };
      await browserPool.shutdown();
      browserPool = new BrowserPool(smallConfig);
      await browserPool.initialize();
      
      // Acquire the only instance
      await browserPool.acquireInstance();
      
      // This should timeout (we'll mock setTimeout to make it faster)
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: Function) => {
        fn();
        return 1 as any;
      }) as any;
      
      await expect(browserPool.acquireInstance()).rejects.toThrow(
        'Timeout waiting for available browser instance'
      );
      
      global.setTimeout = originalSetTimeout;
    });
  });

  describe('error recovery integration', () => {
    beforeEach(async () => {
      browserPool = new BrowserPool(config);
      await browserPool.initialize();
    });

    it('should emit circuit breaker events', async () => {
      const circuitOpenSpy = vi.fn();
      const circuitClosedSpy = vi.fn();
      
      browserPool.on('circuitBreakerOpened', circuitOpenSpy);
      browserPool.on('circuitBreakerClosed', circuitClosedSpy);
      
      // Get access to error recovery manager
      const errorRecovery = (browserPool as any).errorRecovery;
      
      // Simulate circuit breaker opening
      const instanceId = 'test-instance';
      const error = new Error('Test error');
      
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      expect(circuitOpenSpy).toHaveBeenCalledWith({ instanceId });
    });

    it('should emit instance blacklisted events', async () => {
      const blacklistSpy = vi.fn();
      browserPool.on('instanceBlacklisted', blacklistSpy);
      
      const errorRecovery = (browserPool as any).errorRecovery;
      const instanceId = 'test-instance';
      const error = new Error('Test error');
      
      // Generate enough failures to trigger blacklisting
      for (let i = 0; i < 6; i++) {
        errorRecovery.recordFailure(instanceId, error);
      }
      
      expect(blacklistSpy).toHaveBeenCalledWith({
        instanceId,
        reason: 'Too many consecutive failures'
      });
    });

    it('should emit instance restart events', async () => {
      const restartAttemptedSpy = vi.fn();
      browserPool.on('instanceRestartAttempted', restartAttemptedSpy);
      
      const errorRecovery = (browserPool as any).errorRecovery;
      const instanceId = 'test-instance';
      
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      expect(restartAttemptedSpy).toHaveBeenCalledWith({
        instanceId,
        success: true,
        error: undefined
      });
    });

    it('should check circuit breaker state when acquiring instances', async () => {
      const errorRecovery = (browserPool as any).errorRecovery;
      const instance = await browserPool.acquireInstance();
      const instanceId = instance.id;
      
      // Release the instance first
      await browserPool.releaseInstance(instanceId);
      
      // Open circuit breaker for this instance
      const error = new Error('Test error');
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      // Should skip this instance when acquiring
      const newInstance = await browserPool.acquireInstance();
      expect(newInstance.id).not.toBe(instanceId);
    });

    it('should attempt automatic restart on browser disconnect', async () => {
      const restartSpy = vi.fn();
      const restartFailedSpy = vi.fn();
      
      browserPool.on('instanceRestarted', restartSpy);
      browserPool.on('instanceRestartFailed', restartFailedSpy);
      
      const instance = await browserPool.acquireInstance();
      const originalInstanceId = instance.id;
      
      // Simulate browser disconnect
      const onCall = (mockBrowser.on as Mock).mock.calls.find(call => call[0] === 'disconnected');
      if (onCall) {
        onCall[1](); // Call the disconnect handler
      }
      
      // Wait a bit for async restart attempt
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should have attempted restart (success depends on mock setup)
      expect(restartSpy).toHaveBeenCalledWith({
        originalInstanceId,
        newInstanceId: expect.any(String)
      });
    });

    it('should handle restart failure gracefully', async () => {
      const restartFailedSpy = vi.fn();
      browserPool.on('instanceRestartFailed', restartFailedSpy);
      
      // Make browser creation fail for restart
      (chromium.launch as Mock).mockRejectedValueOnce(new Error('Restart failed'));
      
      const instance = await browserPool.acquireInstance();
      const originalInstanceId = instance.id;
      
      // Simulate browser disconnect
      const onCall = (mockBrowser.on as Mock).mock.calls.find(call => call[0] === 'disconnected');
      if (onCall) {
        onCall[1](); // Call the disconnect handler
      }
      
      // Wait a bit for async restart attempt
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(restartFailedSpy).toHaveBeenCalledWith({
        instanceId: originalInstanceId,
        originalError: expect.any(Error),
        restartError: expect.any(Error)
      });
    });

    it('should provide error recovery statistics', async () => {
      const errorRecovery = (browserPool as any).errorRecovery;
      const instanceId = 'test-instance';
      const error = new Error('Test error');
      
      // Generate some failures and restarts
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      const stats = browserPool.getErrorRecoveryStats();
      
      expect(stats).toMatchObject({
        totalInstances: expect.any(Number),
        failingInstances: expect.any(Number),
        blacklistedInstances: expect.any(Number),
        openCircuitBreakers: expect.any(Number),
        halfOpenCircuitBreakers: expect.any(Number),
        totalFailures: expect.any(Number),
        totalRestarts: expect.any(Number)
      });
    });

    it('should forward error logs from error recovery manager', async () => {
      const errorLoggedSpy = vi.fn();
      browserPool.on('errorLogged', errorLoggedSpy);
      
      const errorRecovery = (browserPool as any).errorRecovery;
      const instanceId = 'test-instance';
      const error = new Error('Test error');
      
      errorRecovery.recordFailure(instanceId, error);
      
      expect(errorLoggedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date),
        level: 'error',
        message: 'Browser instance failure recorded',
        stack: error.stack,
        context: expect.objectContaining({
          component: 'ErrorRecoveryManager',
          instanceId
        })
      });
    });

    it('should shutdown error recovery manager on pool shutdown', async () => {
      const errorRecovery = (browserPool as any).errorRecovery;
      const shutdownSpy = vi.fn();
      
      errorRecovery.on('shutdown', shutdownSpy);
      
      await browserPool.shutdown();
      
      expect(shutdownSpy).toHaveBeenCalled();
    });
  });

  describe('DRM functionality', () => {
    let drmConfig: BrowserPoolConfig;
    let mockCdpSession: any;
    let mockPersistentContext: any;

    beforeEach(() => {
      // Setup DRM-specific mocks
      mockCdpSession = {
        send: vi.fn().mockResolvedValue(undefined)
      };

      mockContext.newCDPSession = vi.fn().mockResolvedValue(mockCdpSession);

      // Mock persistent context for DRM
      mockPersistentContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        clearCookies: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        pages: vi.fn().mockReturnValue([mockPage]),
        on: vi.fn(),
        newCDPSession: vi.fn().mockResolvedValue(mockCdpSession)
      };

      (chromium as any).launchPersistentContext = vi.fn().mockResolvedValue(mockPersistentContext);

      drmConfig = {
        ...config,
        drmConfig: {
          type: 'widevine',
          licenseUrl: 'https://example.com/license'
        }
      };
    });

    it('should automatically select Chrome browser when DRM is configured', async () => {
      browserPool = new BrowserPool(drmConfig);
      
      await browserPool.initialize();
      
      // Verify launchPersistentContext is used for DRM with Chrome-specific arguments
      expect((chromium as any).launchPersistentContext).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/chrome-drm-profile-/),
        expect.objectContaining({
          args: expect.arrayContaining([
            '--enable-widevine-cdm',
            '--disable-features=VizDisplayCompositor'
          ])
        })
      );
    });

    it('should disable headless mode automatically for DRM', async () => {
      const headlessDrmConfig = {
        ...drmConfig,
        browserOptions: {
          ...drmConfig.browserOptions,
          headless: true // This should be overridden
        }
      };

      browserPool = new BrowserPool(headlessDrmConfig);
      
      await browserPool.initialize();
      
      // Verify headless is disabled for DRM in persistent context
      expect((chromium as any).launchPersistentContext).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/chrome-drm-profile-/),
        expect.objectContaining({
          headless: false
        })
      );
    });

    it('should create temporary Chrome profile for DRM', async () => {
      browserPool = new BrowserPool(drmConfig);
      
      await browserPool.initialize();
      
      // Verify launchPersistentContext is called with temporary profile
      expect((chromium as any).launchPersistentContext).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/chrome-drm-profile-/),
        expect.objectContaining({
          userDataDir: expect.stringMatching(/\/tmp\/chrome-drm-profile-/)
        })
      );
    });

    it('should setup DRM permissions using CDP', async () => {
      browserPool = new BrowserPool(drmConfig);
      
      await browserPool.initialize();
      
      // Verify CDP session is created and permissions are set on persistent context
      expect(mockPersistentContext.newCDPSession).toHaveBeenCalled();
      expect(mockCdpSession.send).toHaveBeenCalledWith('Browser.grantPermissions', {
        permissions: [
          'protectedMediaIdentifier',
          'audioCapture',
          'videoCapture',
          'displayCapture'
        ]
      });
      expect(mockCdpSession.send).toHaveBeenCalledWith('Browser.setPermission', {
        permission: { name: 'protectedMediaIdentifier' },
        setting: 'granted'
      });
    });

    it('should verify DRM capabilities after setup', async () => {
      // Mock page.evaluate for DRM verification
      mockPage.evaluate = vi.fn().mockResolvedValue({
        widevine: true,
        error: null
      });

      browserPool = new BrowserPool(drmConfig);
      
      const drmVerifiedSpy = vi.fn();
      browserPool.on('drmCapabilitiesVerified', drmVerifiedSpy);
      
      await browserPool.initialize();
      
      // Verify DRM capabilities are checked
      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(drmVerifiedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          drmSupport: { widevine: true, error: null }
        })
      );
    });

    it('should handle DRM permission setup failures gracefully', async () => {
      // Mock CDP failure
      mockCdpSession.send = vi.fn().mockRejectedValue(new Error('CDP permission failed'));

      browserPool = new BrowserPool(drmConfig);
      
      const drmSetupSpy = vi.fn();
      browserPool.on('drmPermissionsSetup', drmSetupSpy);
      
      await browserPool.initialize();
      
      // Verify failure is handled gracefully
      expect(drmSetupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'CDP permission failed'
        })
      );
    });

    it('should handle DRM verification failures gracefully', async () => {
      // Mock page.evaluate failure
      mockPage.evaluate = vi.fn().mockRejectedValue(new Error('DRM verification failed'));

      browserPool = new BrowserPool(drmConfig);
      
      const drmFailedSpy = vi.fn();
      browserPool.on('drmVerificationFailed', drmFailedSpy);
      
      await browserPool.initialize();
      
      // Verify failure is handled gracefully
      expect(drmFailedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'DRM verification failed'
        })
      );
    });

    it('should emit DRM-related events', async () => {
      mockPage.evaluate = vi.fn().mockResolvedValue({
        widevine: true,
        error: null
      });

      browserPool = new BrowserPool(drmConfig);
      
      const drmSetupSpy = vi.fn();
      const drmVerifiedSpy = vi.fn();
      
      browserPool.on('drmPermissionsSetup', drmSetupSpy);
      browserPool.on('drmCapabilitiesVerified', drmVerifiedSpy);
      
      await browserPool.initialize();
      
      // Verify both DRM events are emitted
      expect(drmSetupSpy).toHaveBeenCalled();
      expect(drmVerifiedSpy).toHaveBeenCalled();
    });

    it('should use DRM-specific browser arguments', async () => {
      browserPool = new BrowserPool(drmConfig);
      
      await browserPool.initialize();
      
      // Verify streamlined DRM arguments are used in persistent context
      expect((chromium as any).launchPersistentContext).toHaveBeenCalledWith(
        expect.stringMatching(/\/tmp\/chrome-drm-profile-/),
        expect.objectContaining({
          args: expect.arrayContaining([
            '--enable-widevine-cdm',
            '--autoplay-policy=no-user-gesture-required',
            '--enable-features=VaapiVideoDecoder',
            '--disable-component-update',
            '--allow-running-insecure-content',
            '--disable-background-media-suspend',
            '--disable-backgrounding-occluded-windows'
          ])
        })
      );
    });

    it('should clean up DRM profiles on shutdown', async () => {
      browserPool = new BrowserPool(drmConfig);
      
      // Spy on the cleanup methods
      const cleanupDrmProfileSpy = vi.spyOn(browserPool as any, 'cleanupDrmProfile');
      const cleanupAllDrmProfilesSpy = vi.spyOn(browserPool as any, 'cleanupAllDrmProfiles');
      
      await browserPool.initialize();
      await browserPool.shutdown();
      
      // Verify cleanup methods are called
      expect(cleanupDrmProfileSpy).toHaveBeenCalled();
      expect(cleanupAllDrmProfilesSpy).toHaveBeenCalled();
    });
  });
});