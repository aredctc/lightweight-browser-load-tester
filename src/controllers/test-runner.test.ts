import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestRunner } from './test-runner';
import { BrowserPool } from '../managers/browser-pool';
import { RequestInterceptor } from '../interceptors/request-interceptor';
import { TestConfiguration, ManagedBrowserInstance } from '../types';

// Mock dependencies
vi.mock('../managers/browser-pool');
vi.mock('../interceptors/request-interceptor');

const MockBrowserPool = vi.mocked(BrowserPool);
const MockRequestInterceptor = vi.mocked(RequestInterceptor);

describe('TestRunner', () => {
  let testConfig: TestConfiguration;
  let testRunner: TestRunner;
  let mockBrowserPool: any;
  let mockBrowserInstance: ManagedBrowserInstance;
  let mockPage: any;
  let mockInterceptor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    testConfig = {
      concurrentUsers: 2,
      testDuration: 10,
      rampUpTime: 2,
      streamingUrl: 'https://example.com/stream',
      requestParameters: [],
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 5
      }
    };

    // Mock page object
    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      route: vi.fn().mockResolvedValue(undefined),
      unroute: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      removeListener: vi.fn()
    };

    // Mock browser instance
    mockBrowserInstance = {
      id: 'test-browser-1',
      browser: {},
      context: {},
      page: mockPage,
      createdAt: new Date(),
      lastUsed: new Date(),
      isActive: false,
      metrics: {
        instanceId: 'test-browser-1',
        memoryUsage: 100,
        cpuUsage: 10,
        requestCount: 0,
        errorCount: 0,
        uptime: 0
      }
    };

    // Mock interceptor
    mockInterceptor = {
      startInterception: vi.fn().mockResolvedValue(undefined),
      stopInterception: vi.fn().mockResolvedValue(undefined),
      startStreamingMonitoring: vi.fn(),
      getNetworkMetrics: vi.fn().mockReturnValue([]),
      getErrors: vi.fn().mockReturnValue([]),
      getStreamingErrors: vi.fn().mockReturnValue([])
    };

    // Mock browser pool
    mockBrowserPool = {
      initialize: vi.fn().mockResolvedValue(undefined),
      acquireInstance: vi.fn().mockResolvedValue(mockBrowserInstance),
      releaseInstance: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([mockBrowserInstance.metrics]),
      getPoolStatus: vi.fn().mockReturnValue({
        totalInstances: 1,
        availableInstances: 1,
        activeInstances: 0,
        maxInstances: 5,
        resourceLimits: testConfig.resourceLimits
      }),
      getResourceUsageStats: vi.fn().mockReturnValue({
        totalInstances: 1,
        activeInstances: 0,
        totalMemoryUsage: 100,
        averageMemoryUsage: 100,
        totalCpuUsage: 10,
        averageCpuUsage: 10,
        memoryUtilization: 20,
        cpuUtilization: 12.5,
        instancesNearMemoryLimit: 0,
        instancesNearCpuLimit: 0,
        resourceLimits: testConfig.resourceLimits
      }),
      cleanupIdleInstances: vi.fn().mockResolvedValue(0),
      shutdown: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      emit: vi.fn()
    };

    MockBrowserPool.mockImplementation(() => mockBrowserPool);
    MockRequestInterceptor.mockImplementation(() => mockInterceptor);

    testRunner = new TestRunner(testConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create TestRunner with valid configuration', () => {
      expect(testRunner).toBeInstanceOf(TestRunner);
      expect(testRunner.getTestId()).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(testRunner.isTestRunning()).toBe(false);
    });

    it('should create browser pool with correct configuration', () => {
      expect(MockBrowserPool).toHaveBeenCalledWith({
        maxInstances: testConfig.resourceLimits.maxConcurrentInstances,
        minInstances: Math.min(2, testConfig.concurrentUsers),
        resourceLimits: testConfig.resourceLimits,
        browserOptions: expect.objectContaining({
          headless: true,
          args: expect.arrayContaining([
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--enable-automation'
          ])
        })
      });
    });
  });

  describe('startTest', () => {
    it('should start test successfully', async () => {
      vi.useFakeTimers();
      
      const testStartedSpy = vi.fn();
      const sessionStartedSpy = vi.fn();
      testRunner.on('test-started', testStartedSpy);
      testRunner.on('session-started', sessionStartedSpy);

      const startPromise = testRunner.startTest();
      
      // Fast-forward through ramp-up
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      
      await startPromise;

      expect(mockBrowserPool.initialize).toHaveBeenCalled();
      expect(testRunner.isTestRunning()).toBe(true);
      expect(testStartedSpy).toHaveBeenCalledWith({
        testId: testRunner.getTestId(),
        config: testConfig
      });
      expect(sessionStartedSpy).toHaveBeenCalledTimes(testConfig.concurrentUsers);
    });

    it('should throw error if test is already running', async () => {
      vi.useFakeTimers();
      
      const startPromise1 = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(100);
      
      await expect(testRunner.startTest()).rejects.toThrow('Test is already running');
      
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise1;
    });

    it('should emit test-failed event on initialization error', async () => {
      const initError = new Error('Initialization failed');
      mockBrowserPool.initialize.mockRejectedValue(initError);
      
      const testFailedSpy = vi.fn();
      testRunner.on('test-failed', testFailedSpy);

      await expect(testRunner.startTest()).rejects.toThrow('Initialization failed');
      
      expect(testFailedSpy).toHaveBeenCalledWith({
        testId: testRunner.getTestId(),
        error: initError
      });
      expect(testRunner.isTestRunning()).toBe(false);
    });
  });

  describe('stopTest', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;
    });

    it('should stop test and return results', async () => {
      const testCompletedSpy = vi.fn();
      testRunner.on('test-completed', testCompletedSpy);

      const results = await testRunner.stopTest();

      expect(results).toHaveProperty('summary');
      expect(results).toHaveProperty('browserMetrics');
      expect(results).toHaveProperty('networkMetrics');
      expect(results).toHaveProperty('errors');
      expect(mockBrowserPool.shutdown).toHaveBeenCalled();
      expect(testRunner.isTestRunning()).toBe(false);
      expect(testCompletedSpy).toHaveBeenCalledWith({
        testId: testRunner.getTestId(),
        results
      });
    });

    it('should throw error if no test is running', async () => {
      await testRunner.stopTest();
      
      await expect(testRunner.stopTest()).rejects.toThrow('No test is currently running');
    });

    it('should handle multiple stop calls gracefully', async () => {
      // Test that multiple stop calls don't cause issues
      expect(testRunner.isTestRunning()).toBe(true);
      
      const results = await testRunner.stopTest();
      expect(results).toHaveProperty('summary');
      expect(testRunner.isTestRunning()).toBe(false);
      
      // Second call should throw
      await expect(testRunner.stopTest()).rejects.toThrow('No test is currently running');
    });
  });

  describe('session management', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
    });

    it('should start sessions with proper ramp-up timing', async () => {
      const sessionStartedSpy = vi.fn();
      testRunner.on('session-started', sessionStartedSpy);

      const startPromise = testRunner.startTest();
      
      // Wait for ramp-up to complete
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;
      
      expect(sessionStartedSpy).toHaveBeenCalledTimes(testConfig.concurrentUsers);
    }, 10000);

    it('should handle session startup failures gracefully', () => {
      // Test that the TestRunner can handle session failures without crashing
      const sessionError = new Error('Session startup failed');
      
      const sessionFailedSpy = vi.fn();
      testRunner.on('session-failed', sessionFailedSpy);

      // Simulate a session failure event
      testRunner.emit('session-failed', {
        sessionId: 'test-session',
        testId: testRunner.getTestId(),
        error: sessionError
      });

      expect(sessionFailedSpy).toHaveBeenCalledWith({
        sessionId: 'test-session',
        testId: testRunner.getTestId(),
        error: sessionError
      });
    });

    it('should complete sessions when test duration expires', async () => {
      const sessionCompletedSpy = vi.fn();
      testRunner.on('session-completed', sessionCompletedSpy);

      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Fast-forward to test completion
      await vi.advanceTimersByTimeAsync(testConfig.testDuration * 1000);

      expect(sessionCompletedSpy).toHaveBeenCalledTimes(testConfig.concurrentUsers);
      expect(mockInterceptor.stopInterception).toHaveBeenCalledTimes(testConfig.concurrentUsers);
      expect(mockBrowserPool.releaseInstance).toHaveBeenCalledTimes(testConfig.concurrentUsers);
    });
  });

  describe('monitoring', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;
    });

    it('should provide real-time monitoring data', () => {
      const monitoringData = testRunner.getMonitoringData();

      expect(monitoringData).toHaveProperty('activeSessions');
      expect(monitoringData).toHaveProperty('completedSessions');
      expect(monitoringData).toHaveProperty('failedSessions');
      expect(monitoringData).toHaveProperty('totalRequests');
      expect(monitoringData).toHaveProperty('successfulRequests');
      expect(monitoringData).toHaveProperty('failedRequests');
      expect(monitoringData).toHaveProperty('averageResponseTime');
      expect(monitoringData).toHaveProperty('currentRps');
      expect(monitoringData).toHaveProperty('elapsedTime');
      expect(monitoringData).toHaveProperty('remainingTime');
      expect(monitoringData).toHaveProperty('memoryUsage');
      expect(monitoringData).toHaveProperty('cpuUsage');
    });

    it('should emit monitoring updates periodically', async () => {
      const monitoringUpdateSpy = vi.fn();
      testRunner.on('monitoring-update', monitoringUpdateSpy);

      // Fast-forward to trigger monitoring updates
      await vi.advanceTimersByTimeAsync(4000); // 2 updates at 2-second intervals

      expect(monitoringUpdateSpy).toHaveBeenCalledTimes(2);
      expect(monitoringUpdateSpy).toHaveBeenCalledWith({
        testId: testRunner.getTestId(),
        data: expect.objectContaining({
          activeSessions: expect.any(Number),
          elapsedTime: expect.any(Number)
        })
      });
    });

    it('should calculate metrics correctly with network data', () => {
      const mockNetworkMetrics = [
        {
          url: 'https://example.com/api',
          method: 'GET',
          responseTime: 100,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 500,
          responseSize: 1000,
          isStreamingRelated: true,
          streamingType: 'api' as const
        },
        {
          url: 'https://example.com/error',
          method: 'GET',
          responseTime: 200,
          statusCode: 500,
          timestamp: new Date(),
          requestSize: 300,
          responseSize: 100,
          isStreamingRelated: false
        }
      ];

      mockInterceptor.getNetworkMetrics.mockReturnValue(mockNetworkMetrics);

      const monitoringData = testRunner.getMonitoringData();

      // We have 2 sessions, each returning the mock metrics, so 4 total requests
      expect(monitoringData.totalRequests).toBe(4);
      expect(monitoringData.successfulRequests).toBe(2);
      expect(monitoringData.failedRequests).toBe(2);
      expect(monitoringData.averageResponseTime).toBe(150);
    });
  });

  describe('results generation', () => {
    it('should generate comprehensive test results', async () => {
      vi.useFakeTimers();
      
      const mockNetworkMetrics = [
        {
          url: 'https://example.com/license',
          method: 'POST',
          responseTime: 150,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 1000,
          responseSize: 500,
          isStreamingRelated: true,
          streamingType: 'license' as const
        }
      ];

      const mockErrors = [
        {
          timestamp: new Date(),
          level: 'error' as const,
          message: 'Test error',
          context: { sessionId: 'test-session' }
        }
      ];

      mockInterceptor.getNetworkMetrics.mockReturnValue(mockNetworkMetrics);
      mockInterceptor.getErrors.mockReturnValue(mockErrors);

      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      const results = await testRunner.stopTest();

      expect(results.summary).toEqual({
        totalRequests: 2, // 2 sessions * 1 request each
        successfulRequests: 2,
        failedRequests: 0,
        averageResponseTime: 150,
        peakConcurrentUsers: testConfig.concurrentUsers,
        testDuration: expect.any(Number)
      });

      expect(results.browserMetrics).toHaveLength(1);
      expect(results.networkMetrics).toHaveLength(2);
      expect(results.errors).toHaveLength(2);
    });

    it('should generate DRM metrics when DRM config is provided', async () => {
      vi.useFakeTimers();
      
      const configWithDRM = {
        ...testConfig,
        drmConfig: {
          type: 'widevine' as const,
          licenseUrl: 'https://example.com/license'
        }
      };

      const testRunnerWithDRM = new TestRunner(configWithDRM);

      const mockLicenseMetrics = [
        {
          url: 'https://example.com/license',
          method: 'POST',
          responseTime: 200,
          statusCode: 200,
          timestamp: new Date(),
          requestSize: 1000,
          responseSize: 500,
          isStreamingRelated: true,
          streamingType: 'license' as const
        }
      ];

      mockInterceptor.getNetworkMetrics.mockReturnValue(mockLicenseMetrics);

      const startPromise = testRunnerWithDRM.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      const results = await testRunnerWithDRM.stopTest();

      expect(results.drmMetrics).toHaveLength(1);
      expect(results.drmMetrics[0]).toEqual({
        licenseRequestCount: 2, // 2 sessions
        averageLicenseTime: 200,
        licenseSuccessRate: 100,
        drmType: 'widevine',
        errors: []
      });
    });
  });

  describe('error handling', () => {
    it('should handle browser disconnect events', async () => {
      vi.useFakeTimers();
      
      const sessionFailedSpy = vi.fn();
      testRunner.on('session-failed', sessionFailedSpy);

      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Simulate browser disconnect
      const browserPoolOnCall = mockBrowserPool.on.mock.calls.find(
        call => call[0] === 'instanceDisconnected'
      );
      expect(browserPoolOnCall).toBeDefined();
      
      const disconnectHandler = browserPoolOnCall[1];
      disconnectHandler({ instanceId: mockBrowserInstance.id });

      expect(sessionFailedSpy).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^session-\d+-[a-z0-9]+$/),
        testId: testRunner.getTestId(),
        error: new Error('Browser instance disconnected')
      });
    });

    it('should handle session completion errors gracefully', async () => {
      vi.useFakeTimers();
      
      mockInterceptor.stopInterception.mockRejectedValue(new Error('Stop failed'));
      
      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Should not throw when stopping test despite session completion errors
      await expect(testRunner.stopTest()).resolves.toBeDefined();
    });
  });

  describe('lifecycle management', () => {
    it('should clean up resources on shutdown', async () => {
      vi.useFakeTimers();
      
      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      await testRunner.stopTest();

      expect(mockBrowserPool.shutdown).toHaveBeenCalled();
      expect(mockInterceptor.stopInterception).toHaveBeenCalledTimes(testConfig.concurrentUsers);
      expect(testRunner.isTestRunning()).toBe(false);
    });

    it('should auto-stop test when duration expires', async () => {
      vi.useFakeTimers();
      
      const testCompletedSpy = vi.fn();
      testRunner.on('test-completed', testCompletedSpy);

      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Fast-forward past test duration
      await vi.advanceTimersByTimeAsync(testConfig.testDuration * 1000);

      expect(testCompletedSpy).toHaveBeenCalled();
      expect(testRunner.isTestRunning()).toBe(false);
    });
  });

  // NEW TESTS FOR URL FILTERING FUNCTIONALITY
  describe('URL filtering integration', () => {
    it('should create RequestInterceptor with default URL filtering parameters', async () => {
      vi.useFakeTimers();
      
      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called with correct parameters
      expect(MockRequestInterceptor).toHaveBeenCalledWith(
        mockPage,
        testConfig.requestParameters,
        expect.objectContaining({ sessionId: expect.any(String) }),
        false, // streamingOnly default
        [], // allowedUrls default
        [] // blockedUrls default
      );
    });

    it('should create RequestInterceptor with streaming-only mode enabled', async () => {
      vi.useFakeTimers();
      
      const streamingOnlyConfig = {
        ...testConfig,
        streamingOnly: true
      };

      const streamingOnlyRunner = new TestRunner(streamingOnlyConfig);
      
      const startPromise = streamingOnlyRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called with streaming-only enabled
      expect(MockRequestInterceptor).toHaveBeenCalledWith(
        mockPage,
        streamingOnlyConfig.requestParameters,
        expect.objectContaining({ sessionId: expect.any(String) }),
        true, // streamingOnly enabled
        [], // allowedUrls default
        [] // blockedUrls default
      );
    });

    it('should create RequestInterceptor with allowed URLs configured', async () => {
      vi.useFakeTimers();
      
      const allowedUrlsConfig = {
        ...testConfig,
        streamingOnly: true,
        allowedUrls: ['*.css', '*fonts*', '/api/essential/']
      };

      const allowedUrlsRunner = new TestRunner(allowedUrlsConfig);
      
      const startPromise = allowedUrlsRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called with allowed URLs
      expect(MockRequestInterceptor).toHaveBeenCalledWith(
        mockPage,
        allowedUrlsConfig.requestParameters,
        expect.objectContaining({ sessionId: expect.any(String) }),
        true, // streamingOnly enabled
        ['*.css', '*fonts*', '/api/essential/'], // allowedUrls
        [] // blockedUrls default
      );
    });

    it('should create RequestInterceptor with blocked URLs configured', async () => {
      vi.useFakeTimers();
      
      const blockedUrlsConfig = {
        ...testConfig,
        blockedUrls: ['*analytics*', '*tracking*', '/ads/']
      };

      const blockedUrlsRunner = new TestRunner(blockedUrlsConfig);
      
      const startPromise = blockedUrlsRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called with blocked URLs
      expect(MockRequestInterceptor).toHaveBeenCalledWith(
        mockPage,
        blockedUrlsConfig.requestParameters,
        expect.objectContaining({ sessionId: expect.any(String) }),
        false, // streamingOnly default
        [], // allowedUrls default
        ['*analytics*', '*tracking*', '/ads/'] // blockedUrls
      );
    });

    it('should create RequestInterceptor with all URL filtering options configured', async () => {
      vi.useFakeTimers();
      
      const fullFilteringConfig = {
        ...testConfig,
        streamingOnly: true,
        allowedUrls: ['*.css', '*fonts*'],
        blockedUrls: ['*analytics*', '*tracking*']
      };

      const fullFilteringRunner = new TestRunner(fullFilteringConfig);
      
      const startPromise = fullFilteringRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called with all filtering options
      expect(MockRequestInterceptor).toHaveBeenCalledWith(
        mockPage,
        fullFilteringConfig.requestParameters,
        expect.objectContaining({ sessionId: expect.any(String) }),
        true, // streamingOnly enabled
        ['*.css', '*fonts*'], // allowedUrls
        ['*analytics*', '*tracking*'] // blockedUrls
      );
    });

    it('should handle undefined URL filtering options gracefully', async () => {
      vi.useFakeTimers();
      
      const undefinedOptionsConfig = {
        ...testConfig,
        streamingOnly: undefined,
        allowedUrls: undefined,
        blockedUrls: undefined
      };

      const undefinedOptionsRunner = new TestRunner(undefinedOptionsConfig);
      
      const startPromise = undefinedOptionsRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called with default values for undefined options
      expect(MockRequestInterceptor).toHaveBeenCalledWith(
        mockPage,
        undefinedOptionsConfig.requestParameters,
        expect.objectContaining({ sessionId: expect.any(String) }),
        false, // streamingOnly defaults to false
        [], // allowedUrls defaults to empty array
        [] // blockedUrls defaults to empty array
      );
    });

    it('should create separate RequestInterceptor instances for each session with same configuration', async () => {
      vi.useFakeTimers();
      
      const multiSessionConfig = {
        ...testConfig,
        concurrentUsers: 3,
        streamingOnly: true,
        allowedUrls: ['*.css'],
        blockedUrls: ['*analytics*']
      };

      const multiSessionRunner = new TestRunner(multiSessionConfig);
      
      const startPromise = multiSessionRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Verify RequestInterceptor was called once for each session
      expect(MockRequestInterceptor).toHaveBeenCalledTimes(3);
      
      // Verify all calls had the same configuration
      const calls = MockRequestInterceptor.mock.calls;
      calls.forEach(call => {
        expect(call).toEqual([
          mockPage,
          multiSessionConfig.requestParameters,
          expect.objectContaining({ sessionId: expect.any(String) }),
          true, // streamingOnly
          ['*.css'], // allowedUrls
          ['*analytics*'] // blockedUrls
        ]);
      });
    });
  });

  describe('blocked request tracking integration', () => {
    beforeEach(() => {
      // Add getBlockedRequestCount method to mock interceptor
      mockInterceptor.getBlockedRequestCount = vi.fn().mockReturnValue(5);
    });

    it('should access blocked request count from interceptor', async () => {
      vi.useFakeTimers();
      
      const startPromise = testRunner.startTest();
      await vi.advanceTimersByTimeAsync(testConfig.rampUpTime * 1000);
      await startPromise;

      // Simulate accessing blocked request count (this would be used in monitoring)
      const interceptorInstance = MockRequestInterceptor.mock.results[0].value;
      const blockedCount = interceptorInstance.getBlockedRequestCount();

      expect(blockedCount).toBe(5);
      expect(mockInterceptor.getBlockedRequestCount).toHaveBeenCalled();
    });
  });
});