import { Browser, chromium } from 'playwright';
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
    this.emit('shutdown');
  }

  /**
   * Get error recovery statistics
   */
  getErrorRecoveryStats() {
    return this.errorRecovery.getRecoveryStats();
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
    
    const browserOptions = {
      headless: this.config.browserOptions?.headless ?? true,
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
        // Removed --single-process as it makes browsers more fragile, not more stable
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
        ...(this.config.browserOptions?.args || [])
      ]
    };

    try {
      const browser = await chromium.launch(browserOptions);
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true
      });
      const page = await context.newPage();

      // Initialize localStorage if configured
      if (this.config.localStorage && this.config.localStorage.length > 0) {
        await this.initializeLocalStorage(page);
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