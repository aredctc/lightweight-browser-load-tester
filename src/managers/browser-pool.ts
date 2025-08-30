import { Browser, chromium, BrowserType } from 'playwright';
import { EventEmitter } from 'events';
import { BrowserMetrics, BrowserPoolConfig, ManagedBrowserInstance } from '../types';
import { ErrorRecoveryManager } from './error-recovery';

/**
 * Browser pool manager that handles browser instance lifecycle and resource monitoring
 */
export class BrowserPool extends EventEmitter {
  private instances: Map<string, ManagedBrowserInstance> = new Map();
  private availableInstances: Set<string> = new Set();
  private config: BrowserPoolConfig;
  private resourceMonitorInterval?: NodeJS.Timeout;
  private isShuttingDown = false;
  private errorRecovery: ErrorRecoveryManager;
  private metricsHistory: Map<string, { metrics: BrowserMetrics; disconnectedAt: Date }> = new Map();

  constructor(config: BrowserPoolConfig) {
    super();
    this.config = config;
    this.errorRecovery = new ErrorRecoveryManager({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      successThreshold: 2,
      monitoringWindow: 300000
    });
    this.setupErrorRecoveryEvents();
    this.startResourceMonitoring();
  }

  /**
   * Initialize the browser pool with minimum instances
   */
  async initialize(): Promise<void> {
    const promises = [];
    for (let i = 0; i < this.config.minInstances; i++) {
      promises.push(this.createBrowserInstance());
    }
    await Promise.all(promises);
    this.emit('initialized', { instanceCount: this.instances.size });
  }

  /**
   * Acquire a browser instance from the pool
   */
  async acquireInstance(): Promise<ManagedBrowserInstance> {
    if (this.isShuttingDown) {
      throw new Error('Browser pool is shutting down');
    }

    // Try to get an available instance first, checking circuit breaker state
    for (const availableId of this.availableInstances) {
      if (this.errorRecovery.canUseInstance(availableId)) {
        const instance = this.instances.get(availableId)!;
        this.availableInstances.delete(availableId);
        instance.isActive = true;
        instance.lastUsed = new Date();

        // Record successful acquisition
        this.errorRecovery.recordSuccess(availableId);

        this.emit('instanceAcquired', { instanceId: availableId });
        return instance;
      }
    }

    // Create new instance if under limit
    if (this.instances.size < this.config.maxInstances) {
      const instance = await this.createBrowserInstance();
      instance.isActive = true;
      this.emit('instanceAcquired', { instanceId: instance.id });
      return instance;
    }

    // Wait for an instance to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available browser instance'));
      }, 30000); // 30 second timeout

      const onInstanceReleased = () => {
        clearTimeout(timeout);
        this.removeListener('instanceReleased', onInstanceReleased);

        // Try to get an available instance directly instead of recursive call
        for (const availableId of this.availableInstances) {
          if (this.errorRecovery.canUseInstance(availableId)) {
            const instance = this.instances.get(availableId)!;
            this.availableInstances.delete(availableId);
            instance.isActive = true;
            instance.lastUsed = new Date();

            // Record successful acquisition
            this.errorRecovery.recordSuccess(availableId);

            this.emit('instanceAcquired', { instanceId: availableId });
            resolve(instance);
            return;
          }
        }

        // If no available instances, wait for another release
        this.on('instanceReleased', onInstanceReleased);
      };

      this.on('instanceReleased', onInstanceReleased);
    });
  }

  /**
   * Release a browser instance back to the pool
   */
  async releaseInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Browser instance ${instanceId} not found`);
    }

    instance.isActive = false;
    instance.lastUsed = new Date();

    // Perform comprehensive memory cleanup
    try {
      await this.performMemoryCleanup(instance);
    } catch (error) {
      // If cleanup fails, destroy the instance
      await this.destroyInstance(instanceId);
      return;
    }

    this.availableInstances.add(instanceId);
    this.emit('instanceReleased', { instanceId });
  }

  /**
   * Get current metrics for all browser instances (including recently disconnected)
   */
  getMetrics(): BrowserMetrics[] {
    const currentMetrics = Array.from(this.instances.values()).map(instance => ({
      ...instance.metrics,
      uptime: (Date.now() - instance.createdAt.getTime()) / 1000
    }));

    // Include metrics from recently disconnected instances (within last 30 seconds)
    const recentDisconnectedMetrics: BrowserMetrics[] = [];
    const cutoffTime = Date.now() - 30000; // 30 seconds ago

    for (const [instanceId, historyEntry] of this.metricsHistory) {
      if (historyEntry.disconnectedAt.getTime() > cutoffTime) {
        recentDisconnectedMetrics.push(historyEntry.metrics);
      } else {
        // Clean up old entries
        this.metricsHistory.delete(instanceId);
      }
    }

    return [...currentMetrics, ...recentDisconnectedMetrics];
  }

  /**
   * Get pool status information
   */
  getPoolStatus() {
    return {
      totalInstances: this.instances.size,
      availableInstances: this.availableInstances.size,
      activeInstances: this.instances.size - this.availableInstances.size,
      maxInstances: this.config.maxInstances,
      resourceLimits: this.config.resourceLimits
    };
  }

  /**
   * Shutdown the browser pool and cleanup all instances
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
    }

    // Shutdown error recovery manager
    this.errorRecovery.shutdown();

    const shutdownPromises = Array.from(this.instances.keys()).map(id =>
      this.destroyInstance(id)
    );

    await Promise.all(shutdownPromises);

    // Clean up any remaining DRM profiles (safety cleanup)
    await this.cleanupAllDrmProfiles();

    this.emit('shutdown');
  }

  /**
   * Get error recovery statistics
   */
  getErrorRecoveryStats() {
    return this.errorRecovery.getRecoveryStats();
  }

  /**
   * Get the appropriate browser launcher and options based on browser type
   */
  private async getBrowserLauncherAndOptions(browserType: 'chromium' | 'chrome'): Promise<{ launcher: BrowserType; executablePath?: string }> {
    if (browserType === 'chrome') {
      try {
        // For Chrome, we use the chromium launcher but specify Chrome's executable path
        // This allows us to use the full Chrome browser with DRM support

        // Try to find Chrome executable path
        let chromeExecutablePath: string | undefined;

        // Platform-specific Chrome paths
        const platform = process.platform;
        if (platform === 'darwin') {
          chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        } else if (platform === 'win32') {
          chromeExecutablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        } else if (platform === 'linux') {
          chromeExecutablePath = '/usr/bin/google-chrome';
        }

        return {
          launcher: chromium,
          executablePath: chromeExecutablePath
        };
      } catch (error) {
        console.warn('Chrome browser not available, falling back to Chromium. DRM functionality may be limited.');
        return { launcher: chromium };
      }
    }
    return { launcher: chromium };
  }

  /**
   * Setup error recovery event handlers
   */
  private setupErrorRecoveryEvents(): void {
    this.errorRecovery.on('circuit-breaker-opened', ({ instanceId }) => {
      this.emit('circuitBreakerOpened', { instanceId });
    });

    this.errorRecovery.on('circuit-breaker-closed', ({ instanceId }) => {
      this.emit('circuitBreakerClosed', { instanceId });
    });

    this.errorRecovery.on('instance-blacklisted', ({ instanceId, reason }) => {
      this.emit('instanceBlacklisted', { instanceId, reason });
      // Remove blacklisted instance from available pool
      this.availableInstances.delete(instanceId);
    });

    this.errorRecovery.on('restart-attempted', ({ instanceId, success, error }) => {
      this.emit('instanceRestartAttempted', { instanceId, success, error });
    });

    this.errorRecovery.on('error-logged', (errorLog) => {
      this.emit('errorLogged', errorLog);
    });
  }

  /**
   * Create a new browser instance
   */
  private async createBrowserInstance(): Promise<ManagedBrowserInstance> {
    const instanceId = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Determine browser type and headless mode based on DRM configuration
    const isDrmEnabled = !!this.config.drmConfig;
    const browserType = this.config.browserOptions?.browserType || (isDrmEnabled ? 'chrome' : 'chromium');
    const headlessMode = isDrmEnabled ? false : (this.config.browserOptions?.headless ?? true);

    // Get the appropriate browser launcher and options
    const { launcher: browserLauncher, executablePath } = await this.getBrowserLauncherAndOptions(browserType);

    const browserOptions: any = {
      headless: headlessMode,
      ...(executablePath && { executablePath }),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        // Additional stability flags
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
        // DRM-specific flags for Chrome (enhanced for streaming service compatibility)
        ...(browserType === 'chrome' ? [
          // Core Widevine DRM support
          '--enable-widevine-cdm',
          
          // Media and DRM permissions
          '--autoplay-policy=no-user-gesture-required',
          '--enable-features=VaapiVideoDecoder,WidevineAv1Decoder',
          '--disable-features=UseChromeOSDirectVideoDecoder',

          // Hardware acceleration and media
          '--enable-accelerated-video-decode',
          '--enable-gpu-rasterization',
          '--enable-zero-copy',

          // DRM-specific security and permissions
          '--allow-running-insecure-content',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--ignore-certificate-errors',
          '--ignore-ssl-errors',
          '--ignore-certificate-errors-spki-list',

          // Media session and background behavior
          '--disable-background-media-suspend',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',

          // Component and update management
          '--disable-component-update',
          '--component-updater=fast-update',

          // Additional DRM compatibility
          '--enable-logging=stderr',
          '--log-level=0',
          '--enable-media-stream',
          '--use-fake-ui-for-media-stream',
          '--disable-gesture-requirement-for-media-playback'
        ] : []),
        ...(this.config.browserOptions?.args || [])
      ]
    };

    try {
      let browser: any;
      let context: any;
      let page: any;

      if (isDrmEnabled) {
        // Check if we should use temporary profile or regular Chrome
        const useTemporaryProfile = this.config.drmConfig?.useTemporaryProfile !== false;
        const chromeProfilePath = this.config.drmConfig?.chromeProfilePath;

        if (useTemporaryProfile) {
          // For DRM, use launchPersistentContext with a temporary profile
          const persistentContextOptions = {
            ...browserOptions,
            userDataDir: `/tmp/chrome-drm-profile-${instanceId}`,
            viewport: { width: 1920, height: 1080 },
            screen: { width: 1920, height: 1080 },
            deviceScaleFactor: 1,
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            },
            permissions: [
              'camera',
              'microphone',
              'geolocation',
              'notifications'
            ]
          };

          try {
            context = await browserLauncher.launchPersistentContext(
              `/tmp/chrome-drm-profile-${instanceId}`,
              persistentContextOptions
            );
            browser = context; // In persistent context, context acts as browser
            page = await context.newPage();
          } catch (error) {
            // Fallback to regular browser launch if persistent context fails
            console.warn('DRM persistent context failed, falling back to regular browser:', error instanceof Error ? error.message : 'Unknown error');
            browser = await browserLauncher.launch(browserOptions);
            context = await browser.newContext({
              viewport: { width: 1920, height: 1080 },
              ignoreHTTPSErrors: true,
              extraHTTPHeaders: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
              }
            });
            page = await context.newPage();
          }
        } else {
          // Use regular Chrome profile with launchPersistentContext
          // Create unique profile for each instance to avoid conflicts
          const profilePath = await this.createUniqueProfilePath(chromeProfilePath, instanceId);

          // Remove --user-data-dir from args since we'll pass it to launchPersistentContext
          const filteredArgs = browserOptions.args?.filter((arg: string) => !arg.startsWith('--user-data-dir=')) || [];

          const persistentContextOptions = {
            ...browserOptions,
            args: [
              ...filteredArgs,
              // Essential DRM-specific flags
              '--enable-widevine-cdm',
              '--disable-component-update', // Prevent CDM updates during testing
              '--enable-features=VaapiVideoDecoder,WidevineAv1Decoder',
              '--disable-features=UseChromeOSDirectVideoDecoder',
              
              // Additional flags for DRM compatibility
              '--no-first-run',
              '--no-default-browser-check',
              '--disable-default-apps',
              '--disable-extensions',
              '--disable-plugins-discovery',
              '--allow-running-insecure-content',
              '--disable-web-security',
              '--ignore-certificate-errors',
              '--ignore-ssl-errors',
              '--ignore-certificate-errors-spki-list',
              
              // Media and autoplay settings
              '--autoplay-policy=no-user-gesture-required',
              '--disable-gesture-requirement-for-media-playback',
              '--enable-media-stream',
              '--use-fake-ui-for-media-stream',
              
              // Performance and stability
              '--disable-background-media-suspend',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
              '--disable-background-timer-throttling'
            ],
            viewport: { width: 1920, height: 1080 },
            screen: { width: 1920, height: 1080 },
            deviceScaleFactor: 1,
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.155 Safari/537.36'
            },
            permissions: [
              'camera',
              'microphone',
              'geolocation',
              'notifications'
            ]
          };

          context = await browserLauncher.launchPersistentContext(profilePath, persistentContextOptions);
          browser = context; // In persistent context, context acts as browser
          page = await context.newPage();
        }
      } else {
        // Regular browser launch for non-DRM scenarios
        browser = await browserLauncher.launch(browserOptions);
        context = await browser.newContext({
          viewport: { width: 1280, height: 720 },
          ignoreHTTPSErrors: true
        });
        page = await context.newPage();
      }

      // Log browser type and mode for debugging
      this.emit('browserInstanceCreated', {
        instanceId,
        browserType,
        headless: headlessMode,
        isDrmEnabled
      });

      // Initialize localStorage if configured
      if (this.config.localStorage && this.config.localStorage.length > 0) {
        await this.initializeLocalStorage(page);
      }

      // Setup and verify DRM capabilities if DRM is enabled
      if (isDrmEnabled) {
        await this.setupDrmPermissions(context, instanceId);
        await this.verifyDrmCapabilities(page, instanceId);
      }

      const instance: ManagedBrowserInstance = {
        id: instanceId,
        browser,
        context,
        page,
        createdAt: new Date(),
        lastUsed: new Date(),
        isActive: false,
        metrics: {
          instanceId,
          memoryUsage: 0,
          cpuUsage: 0,
          requestCount: 0,
          errorCount: 0,
          uptime: 0
        }
      };

      this.instances.set(instanceId, instance);
      this.availableInstances.add(instanceId);

      // Set up error handling
      browser.on('disconnected', () => {
        this.handleBrowserDisconnect(instanceId);
      });

      this.emit('instanceCreated', { instanceId });
      return instance;
    } catch (error) {
      this.emit('instanceCreationFailed', { instanceId, error });
      throw error;
    }
  }

  /**
   * Destroy a browser instance and clean up resources
   */
  private async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    try {
      await instance.context.close();
      await instance.browser.close();
    } catch (error) {
      // Ignore cleanup errors during shutdown
    }

    // Clean up temporary DRM profile if it exists
    await this.cleanupDrmProfile(instanceId);

    this.instances.delete(instanceId);
    this.availableInstances.delete(instanceId);
    this.emit('instanceDestroyed', { instanceId });
  }

  /**
   * Handle browser disconnect events
   */
  private handleBrowserDisconnect(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    const uptime = instance ? (Date.now() - instance.createdAt.getTime()) / 1000 : 0;

    // Don't treat disconnections during shutdown as errors
    if (this.isShuttingDown) {
      // This is expected during shutdown - just clean up
      if (instance) {
        this.metricsHistory.set(instanceId, {
          metrics: {
            ...instance.metrics,
            uptime: (Date.now() - instance.createdAt.getTime()) / 1000
          },
          disconnectedAt: new Date()
        });
      }

      this.instances.delete(instanceId);
      this.availableInstances.delete(instanceId);
      this.emit('instanceDisconnected', { instanceId });
      return;
    }

    // Only treat as unexpected error if not shutting down
    const error = new Error('Browser instance disconnected unexpectedly');

    // Record the failure only for unexpected disconnections
    this.errorRecovery.recordFailure(instanceId, error, {
      event: 'browser-disconnect',
      timestamp: new Date(),
      uptime
    });

    // Store metrics in history before removing the instance
    if (instance) {
      this.metricsHistory.set(instanceId, {
        metrics: {
          ...instance.metrics,
          uptime: (Date.now() - instance.createdAt.getTime()) / 1000
        },
        disconnectedAt: new Date()
      });
    }

    // Clean up the disconnected instance
    this.instances.delete(instanceId);
    this.availableInstances.delete(instanceId);

    this.emit('instanceDisconnected', { instanceId });

    // Attempt automatic restart if conditions are met
    this.attemptInstanceRestart(instanceId, error);

    // Ensure we maintain minimum pool size
    this.ensureMinimumPoolSize();
  }

  /**
   * Ensure the pool maintains minimum instance count
   */
  private async ensureMinimumPoolSize(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    const currentCount = this.instances.size;
    const needed = this.config.minInstances - currentCount;

    if (needed > 0) {
      const promises = [];
      for (let i = 0; i < needed; i++) {
        promises.push(this.createBrowserInstance().catch(error => {
          // Log error but don't fail the entire operation
          this.emit('instanceCreationFailed', { instanceId: `recovery-${Date.now()}`, error });
        }));
      }
      await Promise.all(promises);
    }
  }

  /**
   * Attempt to restart a failed browser instance
   */
  private async attemptInstanceRestart(instanceId: string, originalError: Error): Promise<void> {
    // Check if restart should be attempted
    if (!this.errorRecovery.shouldRestartInstance(instanceId) || this.isShuttingDown) {
      return;
    }

    try {
      // Create a new instance to replace the failed one
      const newInstance = await this.createBrowserInstance();

      // Record successful restart
      this.errorRecovery.recordRestartAttempt(instanceId, true);

      this.emit('instanceRestarted', {
        originalInstanceId: instanceId,
        newInstanceId: newInstance.id
      });

    } catch (restartError) {
      // Record failed restart attempt
      this.errorRecovery.recordRestartAttempt(instanceId, false, restartError as Error);

      this.emit('instanceRestartFailed', {
        instanceId,
        originalError,
        restartError: restartError as Error
      });
    }
  }

  /**
   * Start monitoring resource usage of browser instances
   */
  private startResourceMonitoring(): void {
    this.resourceMonitorInterval = setInterval(async () => {
      await this.updateResourceMetrics();
      await this.enforceResourceLimits();
    }, 5000); // Monitor every 5 seconds
  }

  /**
   * Update resource metrics for all browser instances
   */
  private async updateResourceMetrics(): Promise<void> {
    for (const [instanceId, instance] of this.instances) {
      try {
        // Get memory usage from browser process
        const memoryInfo = await this.getBrowserMemoryUsage(instance.browser);
        instance.metrics.memoryUsage = memoryInfo;

        // CPU usage would require additional system monitoring
        // For now, we'll estimate based on activity
        instance.metrics.cpuUsage = instance.isActive ? 15 : 5; // Rough estimate

        // Check if instance exceeds memory limits
        if (memoryInfo > this.config.resourceLimits.maxMemoryPerInstance) {
          this.emit('resourceLimitExceeded', {
            instanceId,
            type: 'memory',
            usage: memoryInfo,
            limit: this.config.resourceLimits.maxMemoryPerInstance
          });
        }
      } catch (error) {
        instance.metrics.errorCount++;
        this.emit('metricsUpdateFailed', { instanceId, error });
      }
    }
  }

  /**
   * Get memory usage for a browser instance
   */
  private async getBrowserMemoryUsage(browser: Browser): Promise<number> {
    try {
      // This is a simplified approach - in production you might want to use
      // system monitoring tools or browser CDP for more accurate metrics
      const contexts = browser.contexts();
      let totalMemory = 50; // Base browser memory estimate in MB

      for (const context of contexts) {
        const pages = context.pages();
        totalMemory += pages.length * 20; // Estimate 20MB per page
      }

      return totalMemory;
    } catch {
      return 50; // Return base memory instead of 0
    }
  }

  /**
   * Enforce resource limits by destroying instances that exceed limits
   */
  private async enforceResourceLimits(): Promise<void> {
    const instancesToDestroy: string[] = [];
    const instancesToCleanup: string[] = [];

    for (const [instanceId, instance] of this.instances) {
      const { memoryUsage, cpuUsage } = instance.metrics;

      if (memoryUsage > this.config.resourceLimits.maxMemoryPerInstance ||
        cpuUsage > this.config.resourceLimits.maxCpuPercentage) {
        if (!instance.isActive) {
          // If memory usage is critically high, destroy the instance
          if (memoryUsage > this.config.resourceLimits.maxMemoryPerInstance * 1.5) {
            instancesToDestroy.push(instanceId);
          } else {
            // Otherwise, try aggressive cleanup first
            instancesToCleanup.push(instanceId);
          }
        } else {
          // For active instances, emit warning but don't destroy
          this.emit('resourceLimitWarning', {
            instanceId,
            type: memoryUsage > this.config.resourceLimits.maxMemoryPerInstance ? 'memory' : 'cpu',
            usage: memoryUsage > this.config.resourceLimits.maxMemoryPerInstance ? memoryUsage : cpuUsage,
            limit: memoryUsage > this.config.resourceLimits.maxMemoryPerInstance ?
              this.config.resourceLimits.maxMemoryPerInstance : this.config.resourceLimits.maxCpuPercentage,
            isActive: true
          });
        }
      }
    }

    // Try aggressive cleanup first
    for (const instanceId of instancesToCleanup) {
      try {
        const instance = this.instances.get(instanceId);
        if (instance) {
          await this.performAggressiveMemoryCleanup(instance);
          this.emit('instanceCleanedForResourceLimit', { instanceId });
        }
      } catch (error) {
        // If cleanup fails, add to destroy list
        instancesToDestroy.push(instanceId);
      }
    }

    // Destroy instances that exceed limits or failed cleanup
    for (const instanceId of instancesToDestroy) {
      await this.destroyInstance(instanceId);
      this.emit('instanceDestroyedForResourceLimit', { instanceId });
    }
  }

  /**
   * Perform comprehensive memory cleanup on browser instance
   */
  private async performMemoryCleanup(instance: ManagedBrowserInstance): Promise<void> {
    // Navigate to blank page to clear current page resources
    await instance.page.goto('about:blank');

    // Clear browser context data
    await instance.context.clearCookies();
    await instance.context.clearPermissions();

    // Clear storage data
    try {
      await instance.page.evaluate(() => {
        // Clear localStorage
        if (typeof (globalThis as any).localStorage !== 'undefined') {
          (globalThis as any).localStorage.clear();
        }
        // Clear sessionStorage
        if (typeof (globalThis as any).sessionStorage !== 'undefined') {
          (globalThis as any).sessionStorage.clear();
        }
        // Clear IndexedDB
        if (typeof (globalThis as any).indexedDB !== 'undefined') {
          (globalThis as any).indexedDB.databases?.().then((databases: any[]) => {
            databases.forEach((db: any) => {
              if (db.name) {
                (globalThis as any).indexedDB.deleteDatabase(db.name);
              }
            });
          });
        }
      });
    } catch (error) {
      // Ignore storage cleanup errors
    }

    // Reset request count for metrics
    instance.metrics.requestCount = 0;
  }

  /**
   * Perform aggressive memory cleanup for instances approaching limits
   */
  private async performAggressiveMemoryCleanup(instance: ManagedBrowserInstance): Promise<void> {
    // Perform standard cleanup first
    await this.performMemoryCleanup(instance);

    // Force garbage collection if available
    try {
      await instance.page.evaluate(() => {
        // Force garbage collection in browser context
        if (typeof (globalThis as any).window !== 'undefined' && ((globalThis as any).window as any).gc) {
          ((globalThis as any).window as any).gc();
        }
      });
    } catch (error) {
      // Ignore GC errors
    }

    // Close and recreate the page to free up resources
    try {
      await instance.page.close();
      instance.page = await instance.context.newPage();
      await instance.page.goto('about:blank');
    } catch (error) {
      throw new Error(`Failed to recreate page during aggressive cleanup: ${error}`);
    }
  }

  /**
   * Get detailed resource usage statistics
   */
  getResourceUsageStats() {
    const instances = Array.from(this.instances.values());
    const totalMemory = instances.reduce((sum, instance) => sum + instance.metrics.memoryUsage, 0);
    const averageMemory = instances.length > 0 ? totalMemory / instances.length : 0;
    const totalCpu = instances.reduce((sum, instance) => sum + instance.metrics.cpuUsage, 0);
    const averageCpu = instances.length > 0 ? totalCpu / instances.length : 0;

    const memoryLimit = this.config.resourceLimits.maxMemoryPerInstance;
    const cpuLimit = this.config.resourceLimits.maxCpuPercentage;

    const instancesNearMemoryLimit = instances.filter(
      instance => instance.metrics.memoryUsage > memoryLimit * 0.8
    ).length;

    const instancesNearCpuLimit = instances.filter(
      instance => instance.metrics.cpuUsage > cpuLimit * 0.8
    ).length;

    return {
      totalInstances: instances.length,
      activeInstances: instances.filter(instance => instance.isActive).length,
      totalMemoryUsage: totalMemory,
      averageMemoryUsage: averageMemory,
      totalCpuUsage: totalCpu,
      averageCpuUsage: averageCpu,
      memoryUtilization: instances.length > 0 ? (totalMemory / (instances.length * memoryLimit)) * 100 : 0,
      cpuUtilization: (averageCpu / cpuLimit) * 100,
      instancesNearMemoryLimit,
      instancesNearCpuLimit,
      resourceLimits: this.config.resourceLimits
    };
  }

  /**
   * Force cleanup of idle instances to free resources
   */
  async cleanupIdleInstances(maxIdleTime: number = 300000): Promise<number> {
    const now = Date.now();
    const instancesToCleanup: string[] = [];

    // Find idle instances that can be cleaned up
    for (const [instanceId, instance] of this.instances) {
      if (!instance.isActive &&
        (now - instance.lastUsed.getTime()) > maxIdleTime) {
        instancesToCleanup.push(instanceId);
      }
    }

    // Only cleanup instances if we have more than minimum
    const maxToCleanup = Math.max(0, this.instances.size - this.config.minInstances);
    const actualCleanupCount = Math.min(instancesToCleanup.length, maxToCleanup);

    // Cleanup idle instances (up to the limit)
    for (let i = 0; i < actualCleanupCount; i++) {
      const instanceId = instancesToCleanup[i];
      await this.destroyInstance(instanceId);
      this.emit('instanceCleanedForIdle', { instanceId });
    }

    return actualCleanupCount;
  }

  /**
   * Setup DRM permissions using Chrome DevTools Protocol
   */
  private async setupDrmPermissions(context: any, instanceId: string): Promise<void> {
    try {
      // Get or create a page for CDP session
      const pages = context.pages();
      const page = pages.length > 0 ? pages[0] : await context.newPage();
      const cdpSession = await context.newCDPSession(page);

      // Enable runtime and page domains
      await cdpSession.send('Runtime.enable');
      await cdpSession.send('Page.enable');

      // Set up comprehensive DRM permissions
      try {
        await cdpSession.send('Browser.grantPermissions', {
          permissions: [
            'protectedMediaIdentifier',
            'audioCapture',
            'videoCapture',
            'displayCapture',
            'camera',
            'microphone'
          ]
        });
      } catch (permError) {
        // Fallback: try individual permissions
        const permissions = ['protectedMediaIdentifier', 'audioCapture', 'videoCapture'];
        for (const permission of permissions) {
          try {
            await cdpSession.send('Browser.setPermission', {
              permission: { name: permission },
              setting: 'granted'
            });
          } catch (individualError) {
            // Continue with other permissions
          }
        }
      }

      // Enable media features via Runtime
      await cdpSession.send('Runtime.evaluate', {
        expression: `
          // Enable media autoplay
          if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia || function() {
              return Promise.resolve({
                getTracks: () => [],
                getVideoTracks: () => [],
                getAudioTracks: () => []
              });
            };
          }
          
          // Set up MediaKeySystemAccess if not available
          if (typeof navigator !== 'undefined' && !navigator.requestMediaKeySystemAccess) {
            navigator.requestMediaKeySystemAccess = function(keySystem, supportedConfigurations) {
              if (keySystem === 'com.widevine.alpha') {
                return Promise.resolve({
                  keySystem: keySystem,
                  getConfiguration: () => supportedConfigurations[0] || {}
                });
              }
              return Promise.reject(new Error('Key system not supported'));
            };
          }
          
          true;
        `
      });

      this.emit('drmPermissionsSetup', {
        instanceId,
        success: true,
        timestamp: new Date()
      });

    } catch (error) {
      // Log warning but don't fail - browser flags should handle DRM
      console.warn(`DRM permissions setup failed for instance ${instanceId}, relying on browser flags:`, error instanceof Error ? error.message : 'Unknown error');

      this.emit('drmPermissionsSetup', {
        instanceId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  }

  /**
   * Verify DRM capabilities for the browser instance
   */
  private async verifyDrmCapabilities(page: any, instanceId: string): Promise<void> {
    try {
      const drmSupport = await page.evaluate(() => {
        return new Promise<{
          widevine: boolean;
          error: string | null;
          userAgent: string;
          platform: string;
          cdmAvailable: boolean;
          mediaCapabilities: boolean;
        }>((resolve) => {
          const result = {
            widevine: false,
            error: null as string | null,
            userAgent: (globalThis as any).navigator.userAgent,
            platform: (globalThis as any).navigator.platform,
            cdmAvailable: false,
            mediaCapabilities: false
          };

          // Check if MediaCapabilities API is available
          result.mediaCapabilities = typeof (globalThis as any).navigator.mediaCapabilities !== 'undefined';

          // Check for Widevine CDM availability
          const checkWidevine = () => {
            if (typeof (globalThis as any).navigator?.requestMediaKeySystemAccess === 'function') {
              result.cdmAvailable = true;

              // Enhanced Widevine configuration for better compatibility
              const widevineConfig = [{
                initDataTypes: ['cenc', 'keyids', 'webm'],
                audioCapabilities: [
                  { contentType: 'audio/mp4; codecs="mp4a.40.2"' },
                  { contentType: 'audio/webm; codecs="opus"' }
                ],
                videoCapabilities: [
                  { contentType: 'video/mp4; codecs="avc1.42E01E"' },
                  { contentType: 'video/mp4; codecs="avc1.4d401e"' },
                  { contentType: 'video/mp4; codecs="avc1.640028"' },
                  { contentType: 'video/webm; codecs="vp9"' }
                ],
                distinctiveIdentifier: 'optional',
                persistentState: 'optional'
              }];

              (globalThis as any).navigator.requestMediaKeySystemAccess('com.widevine.alpha', widevineConfig)
                .then((keySystemAccess: any) => {
                  result.widevine = true;
                  result.error = null;
                  resolve(result);
                })
                .catch((error: any) => {
                  result.widevine = false;
                  result.error = error?.message || 'Widevine access denied';
                  resolve(result);
                });
            } else {
              result.error = 'MediaKeySystemAccess not available';
              resolve(result);
            }
          };

          // Check for protected media identifier permission first
          if (typeof (globalThis as any).navigator?.permissions !== 'undefined') {
            (globalThis as any).navigator.permissions.query({ name: 'protected-media-identifier' as any })
              .then((permissionStatus: any) => {
                if (permissionStatus.state === 'granted') {
                  checkWidevine();
                } else {
                  result.error = `Protected media permission: ${permissionStatus.state}`;
                  checkWidevine(); // Still try even if permission not explicitly granted
                }
              })
              .catch(() => checkWidevine()); // Fallback to direct check
          } else {
            checkWidevine();
          }
        });
      });

      this.emit('drmCapabilitiesVerified', {
        instanceId,
        drmSupport,
        timestamp: new Date()
      });

      if (!drmSupport.widevine) {
        console.warn(`DRM verification failed for instance ${instanceId}:`, drmSupport.error);
        console.warn(`Browser details - UA: ${drmSupport.userAgent.substring(0, 100)}...`);
        console.warn(`CDM Available: ${drmSupport.cdmAvailable}, Media Capabilities: ${drmSupport.mediaCapabilities}`);
        
        // Don't throw error, just warn - the browser might still work for some DRM content
        console.warn(`⚠️  Instance ${instanceId} may have limited DRM capabilities but will continue`);
      } else {
        console.log(`✅ DRM verification successful for instance ${instanceId}`);
      }

    } catch (error) {
      this.emit('drmVerificationFailed', {
        instanceId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  }

  /**
   * Clean up temporary profile directories (both DRM and regular profiles)
   */
  private async cleanupDrmProfile(instanceId: string): Promise<void> {
    const profilePaths: string[] = [];

    // Add DRM temporary profile if it exists
    if (this.config.drmConfig && this.config.drmConfig.useTemporaryProfile !== false) {
      profilePaths.push(`/tmp/chrome-drm-profile-${instanceId}`);
    }

    // Add regular profile paths if DRM is enabled but not using temporary profiles
    if (this.config.drmConfig && this.config.drmConfig.useTemporaryProfile === false) {
      profilePaths.push(`/tmp/chrome-profile-${instanceId}`);
      profilePaths.push(`/tmp/chrome-regular-profile-${instanceId}`);
    }

    for (const profilePath of profilePaths) {
      try {
        const fs = await import('fs');

        // Check if profile directory exists
        if (fs.existsSync(profilePath)) {
          // Remove the entire profile directory recursively
          await fs.promises.rm(profilePath, { recursive: true, force: true });

          this.emit('profileCleaned', {
            instanceId,
            profilePath,
            timestamp: new Date()
          });
        }
      } catch (error) {
        // Log warning but don't fail the cleanup
        console.warn(`Failed to clean up profile for instance ${instanceId}:`, error instanceof Error ? error.message : 'Unknown error');

        this.emit('profileCleanupFailed', {
          instanceId,
          profilePath,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        });
      }
    }
  }

  /**
   * Create a unique profile path for parallel browser instances
   */
  private async createUniqueProfilePath(baseProfilePath: string | undefined, instanceId: string): Promise<string> {
    const shareProfile = this.config.drmConfig?.shareProfileBetweenInstances === true;

    if (shareProfile && baseProfilePath) {
      // WARNING: This can cause conflicts with parallel sessions
      console.warn(`Instance ${instanceId}: Sharing Chrome profile between instances. This may cause conflicts in parallel sessions.`);
      return baseProfilePath;
    }

    // Always create a fresh DRM-optimized profile instead of copying
    // This avoids Chrome's "settings were reset" security detection
    const uniqueProfilePath = `/tmp/chrome-drm-${instanceId}`;
    
    if (baseProfilePath) {
      console.log(`Note: Ignoring chromeProfilePath (${baseProfilePath}) and creating fresh DRM-optimized profile for ${instanceId} to avoid Chrome security warnings`);
    } else {
      console.log(`Creating fresh DRM-optimized profile for ${instanceId}`);
    }
    
    await this.createDrmOptimizedProfile(uniqueProfilePath, instanceId);
    
    return uniqueProfilePath;
  }

  /**
   * Create a DRM-optimized Chrome profile from scratch
   */
  private async createDrmOptimizedProfile(profilePath: string, instanceId: string): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Create profile directory structure
      await fs.promises.mkdir(profilePath, { recursive: true });
      await fs.promises.mkdir(path.join(profilePath, 'Default'), { recursive: true });

      // Create comprehensive DRM-optimized preferences
      const preferences = {
        "profile": {
          "default_content_setting_values": {
            "protected_media_identifier": 1,  // Essential for DRM
            "media_stream_camera": 1,
            "media_stream_mic": 1,
            "notifications": 1,
            "geolocation": 1
          },
          "content_settings": {
            "exceptions": {
              "protected_media_identifier": {
                "*": {
                  "setting": 1,
                  "last_modified": Date.now()
                }
              }
            }
          },
          "info_cache": {
            "Default": {
              "active_time": Date.now(),
              "is_using_default_name": true,
              "name": `DRM Test Profile ${instanceId}`,
              "user_name": `drm_user_${instanceId}`
            }
          }
        },
        "browser": {
          "enabled_labs_experiments": [
            "enable-widevine-cdm@1"
          ],
          "check_default_browser": false,
          "show_home_button": false,
          "has_seen_welcome_page": true
        },
        "media": {
          "device_id_salt": `drm_salt_${instanceId}`,
          "storage_id_salt": `storage_salt_${instanceId}`
        },
        "hardware_acceleration_mode_enabled": true,
        "enable_media_router": true,
        "privacy_sandbox": {
          "apis_enabled": true
        },
        "component_updater": {
          "recovery_component": {}
        },
        // Essential for avoiding "settings reset" warnings
        "profile_info_cache": {
          "Default": {
            "active_time": Date.now(),
            "is_using_default_name": true,
            "name": `DRM Profile ${instanceId}`
          }
        },
        // Minimal settings for performance
        "extensions": {
          "settings": {}
        },
        "sync": {
          "suppress_start": true
        },
        // First run flags to avoid setup dialogs
        "first_run_tabs": []
      };

      await fs.promises.writeFile(
        path.join(profilePath, 'Default', 'Preferences'),
        JSON.stringify(preferences, null, 2)
      );

      // Create comprehensive Local State file
      const localState = {
        "browser": {
          "enabled_labs_experiments": [
            "enable-widevine-cdm@1"
          ]
        },
        "user_experience_metrics": {
          "stability": {
            "stats_version": 1
          }
        },
        "profile": {
          "info_cache": {
            "Default": {
              "active_time": Date.now(),
              "is_using_default_name": true,
              "name": `DRM Profile ${instanceId}`,
              "user_name": `drm_user_${instanceId}`
            }
          },
          "last_used": Date.now(),
          "last_active_profiles": ["Default"]
        },
        // Component updater settings
        "component_updater": {
          "recovery_component": {}
        },
        // Hardware acceleration
        "hardware_acceleration_mode_enabled": true
      };

      await fs.promises.writeFile(
        path.join(profilePath, 'Local State'),
        JSON.stringify(localState, null, 2)
      );

      // Create First Run file to skip setup
      await fs.promises.writeFile(
        path.join(profilePath, 'First Run'),
        ''
      );

      this.emit('drmProfileCreated', {
        instanceId,
        profilePath,
        timestamp: new Date()
      });

    } catch (error) {
      console.warn(`Failed to create DRM-optimized profile for instance ${instanceId}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Enhance an existing profile with DRM optimizations
   */
  private async enhanceProfileForDrm(profilePath: string, instanceId: string): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Ensure Default directory exists
      const defaultDir = path.join(profilePath, 'Default');
      await fs.promises.mkdir(defaultDir, { recursive: true });

      const preferencesPath = path.join(defaultDir, 'Preferences');

      let preferences: any = {};

      // Load existing preferences if they exist
      if (fs.existsSync(preferencesPath)) {
        try {
          const existingPrefs = await fs.promises.readFile(preferencesPath, 'utf8');
          preferences = JSON.parse(existingPrefs);
          console.log(`Loaded existing preferences for ${instanceId}`);
        } catch (parseError) {
          // If parsing fails, start with empty preferences
          console.warn(`Failed to parse existing preferences for ${instanceId}, creating new ones:`, parseError instanceof Error ? parseError.message : 'Unknown error');
          preferences = {};
        }
      } else {
        console.log(`No existing preferences found for ${instanceId}, creating DRM-optimized preferences from scratch`);
        preferences = {};
      }

      // Create comprehensive DRM-optimized preferences that match a real Chrome profile
      preferences.profile = preferences.profile || {};
      preferences.profile.default_content_setting_values = preferences.profile.default_content_setting_values || {};
      
      // DRM and media permissions (essential for DRM)
      preferences.profile.default_content_setting_values.protected_media_identifier = 1;
      preferences.profile.default_content_setting_values.media_stream_camera = 1;
      preferences.profile.default_content_setting_values.media_stream_mic = 1;
      preferences.profile.default_content_setting_values.notifications = 1;
      preferences.profile.default_content_setting_values.geolocation = 1;

      // Content settings for DRM (critical for streaming services)
      preferences.profile.content_settings = preferences.profile.content_settings || {};
      preferences.profile.content_settings.exceptions = preferences.profile.content_settings.exceptions || {};
      preferences.profile.content_settings.exceptions.protected_media_identifier = {
        "*": { "setting": 1 }
      };

      // Media settings
      preferences.profile.default_content_settings = preferences.profile.default_content_settings || {};
      preferences.profile.default_content_settings.popups = 1;
      preferences.profile.default_content_settings.plugins = 1;

      // Hardware acceleration and media features (important for DRM performance)
      preferences.hardware_acceleration_mode_enabled = true;
      preferences.enable_media_router = true;

      // Browser-level settings for DRM
      preferences.browser = preferences.browser || {};
      preferences.browser.enabled_labs_experiments = preferences.browser.enabled_labs_experiments || [];
      
      // Add DRM-related experiments if not already present
      const drmExperiments = ["enable-widevine-cdm@1"];
      for (const experiment of drmExperiments) {
        if (!preferences.browser.enabled_labs_experiments.includes(experiment)) {
          preferences.browser.enabled_labs_experiments.push(experiment);
        }
      }

      // Media settings (unique per instance to avoid conflicts)
      preferences.media = preferences.media || {};
      preferences.media.device_id_salt = `drm_salt_${instanceId}`;
      preferences.media.storage_id_salt = `storage_salt_${instanceId}`;

      // Component updater settings (prevent CDM updates during testing)
      preferences.component_updater = preferences.component_updater || {};
      preferences.component_updater.recovery_component = preferences.component_updater.recovery_component || {};

      // Privacy and security settings that affect DRM
      preferences.privacy_sandbox = preferences.privacy_sandbox || {};
      preferences.privacy_sandbox.apis_enabled = true;

      // Disable sync to avoid conflicts between instances
      preferences.sync = preferences.sync || {};
      preferences.sync.suppress_start = true;

      // First run and setup flags
      preferences.browser = preferences.browser || {};
      preferences.browser.check_default_browser = false;
      preferences.browser.show_home_button = false;

      // Profile info
      preferences.profile.info_cache = preferences.profile.info_cache || {};
      preferences.profile.info_cache.Default = {
        "active_time": Date.now(),
        "is_using_default_name": true,
        "name": `DRM Profile ${instanceId}`,
        "user_name": `drm_user_${instanceId}`
      };

      // Save enhanced preferences
      await fs.promises.writeFile(preferencesPath, JSON.stringify(preferences, null, 2));

      this.emit('profileEnhanced', {
        instanceId,
        profilePath,
        timestamp: new Date()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to enhance profile for DRM for instance ${instanceId}:`, errorMessage);
      throw new Error(`Profile enhancement failed: ${errorMessage}`);
    }
  }

  /**
   * Copy Chrome profile directory (preserving DRM-related files)
   */
  private async copyProfile(sourcePath: string, targetPath: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    // Create target directory
    await fs.promises.mkdir(targetPath, { recursive: true });

    // Files to exclude (lock files, cache, etc.) - but preserve DRM-related files
    const excludePatterns = [
      'SingletonLock',
      'SingletonSocket',
      'SingletonCookie',
      'lockfile',
      'Cache',
      'Code Cache',
      'GPUCache',
      'Service Worker',
      'Session Storage',
      'Local Storage/leveldb/LOCK',
      'IndexedDB/leveldb/LOCK',
      'LOG',
      'LOG.old'
    ];

    // Files that are critical for DRM functionality - always copy these
    const drmCriticalFiles = [
      'Preferences',
      'Local State',
      'Secure Preferences',
      'TransportSecurity',
      'Origin Bound Certs',
      'Certificate Revocation Lists',
      'EVWhitelist',
      'First Run',
      'Web Data',
      'Web Data-journal'
    ];

    const shouldExclude = (filePath: string): boolean => {
      const fileName = path.basename(filePath);
      
      // Never exclude DRM-critical files
      if (drmCriticalFiles.some(critical => fileName === critical || filePath.includes(critical))) {
        return false;
      }
      
      return excludePatterns.some(pattern => filePath.includes(pattern));
    };

    const copyRecursive = async (src: string, dest: string): Promise<void> => {
      try {
        const stats = await fs.promises.stat(src);

        if (stats.isDirectory()) {
          await fs.promises.mkdir(dest, { recursive: true });
          const entries = await fs.promises.readdir(src);

          for (const entry of entries) {
            const srcPath = path.join(src, entry);
            const destPath = path.join(dest, entry);

            if (!shouldExclude(srcPath)) {
              await copyRecursive(srcPath, destPath);
            }
          }
        } else if (stats.isFile() && !shouldExclude(src)) {
          try {
            await fs.promises.copyFile(src, dest);
          } catch (copyError) {
            // If copying fails (e.g., file is locked), try to handle DRM-critical files specially
            const fileName = path.basename(src);
            if (drmCriticalFiles.includes(fileName)) {
              console.warn(`Failed to copy DRM-critical file ${fileName}, will recreate:`, copyError instanceof Error ? copyError.message : 'Unknown error');
            } else {
              console.warn(`Failed to copy file ${src}:`, copyError instanceof Error ? copyError.message : 'Unknown error');
            }
          }
        }
      } catch (statError) {
        // If we can't stat the source file, skip it
        console.warn(`Failed to stat ${src}:`, statError instanceof Error ? statError.message : 'Unknown error');
      }
    };

    await copyRecursive(sourcePath, targetPath);

    // Ensure critical directory structure exists
    const defaultDir = path.join(targetPath, 'Default');
    await fs.promises.mkdir(defaultDir, { recursive: true });

    // Copy Local State file from parent directory if it exists
    const sourceLocalState = path.join(sourcePath, 'Local State');
    const targetLocalState = path.join(targetPath, 'Local State');
    
    if (fs.existsSync(sourceLocalState) && !fs.existsSync(targetLocalState)) {
      try {
        await fs.promises.copyFile(sourceLocalState, targetLocalState);
        console.log(`Copied Local State file for DRM support`);
      } catch (error) {
        console.warn(`Failed to copy Local State file:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    // Check if critical DRM files exist after copying
    const preferencesPath = path.join(defaultDir, 'Preferences');
    if (!fs.existsSync(preferencesPath)) {
      console.warn(`Preferences file not found after copying profile, will create during enhancement`);
    } else {
      console.log(`✅ Preferences file copied successfully`);
    }
  }

  /**
   * Clean up all temporary profiles (both DRM and regular profiles)
   */
  private async cleanupAllDrmProfiles(): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Find all chrome profile directories in /tmp
      const tmpDir = '/tmp';
      const files = await fs.promises.readdir(tmpDir);

      const profilePatterns = [
        'chrome-drm-profile-',
        'chrome-profile-',
        'chrome-regular-profile-'
      ];

      const allProfiles = files.filter(file =>
        profilePatterns.some(pattern => file.startsWith(pattern))
      );

      const cleanupPromises = allProfiles.map(async (profileDir) => {
        const fullPath = path.join(tmpDir, profileDir);
        try {
          await fs.promises.rm(fullPath, { recursive: true, force: true });
          console.log(`Cleaned up orphaned profile: ${fullPath}`);
        } catch (error) {
          console.warn(`Failed to clean up orphaned profile ${fullPath}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      });

      await Promise.all(cleanupPromises);

      if (allProfiles.length > 0) {
        this.emit('allProfilesCleaned', {
          profileCount: allProfiles.length,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.warn('Failed to perform profile cleanup:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Initialize localStorage for all configured domains
   */
  private async initializeLocalStorage(page: any): Promise<void> {
    if (!this.config.localStorage || this.config.localStorage.length === 0) {
      return;
    }

    // Import randomization utility
    const { RandomizationUtil } = await import('../utils/randomization');

    // Create randomization context with browser instance specific data
    const instanceId = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const randomizationUtil = new RandomizationUtil({
      instanceId,
      timestamp: Date.now().toString(),
      sessionId: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // Add any arrays that might be used in randomFrom functions
      userIds: ['user_001', 'user_002', 'user_003', 'user_004', 'user_005'],
      deviceTypes: ['desktop', 'mobile', 'tablet'],
      themes: ['light', 'dark', 'auto'],
      languages: ['en', 'es', 'fr', 'de', 'ja'],
      currencies: ['USD', 'EUR', 'GBP', 'JPY', 'CAD'],
      // Additional arrays for streaming/media applications
      videoQualities: ['480p', '720p', '1080p', '4K'],
      subscriptionTiers: ['free', 'basic', 'premium', 'enterprise'],
      booleans: ['true', 'false'],
      playbackSpeeds: ['0.5', '0.75', '1.0', '1.25', '1.5', '2.0']
    });

    for (const localStorageEntry of this.config.localStorage) {
      try {
        // Navigate to the domain to set localStorage
        const domainUrl = localStorageEntry.domain.startsWith('http')
          ? localStorageEntry.domain
          : `https://${localStorageEntry.domain}`;

        await page.goto(domainUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        // Process localStorage data with randomization
        const processedData = randomizationUtil.processLocalStorageData(localStorageEntry.data);

        // Set localStorage items for this domain
        await page.evaluate((data: Record<string, string>) => {
          Object.entries(data).forEach(([key, value]) => {
            (globalThis as any).localStorage.setItem(key, value);
          });
        }, processedData);

        this.emit('localStorageInitialized', {
          domain: localStorageEntry.domain,
          itemCount: Object.keys(processedData).length,
          processedData // Include processed data in event for debugging
        });

      } catch (error) {
        this.emit('localStorageInitializationFailed', {
          domain: localStorageEntry.domain,
          error
        });
        // Continue with other domains even if one fails
      }
    }

    // Navigate to about:blank after setting up localStorage
    await page.goto('about:blank');
  }
}