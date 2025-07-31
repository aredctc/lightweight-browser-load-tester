import { EventEmitter } from 'events';
import { BrowserPool } from '../managers/browser-pool';
import { RequestInterceptor } from '../interceptors/request-interceptor';
import { 
  TestConfiguration, 
  TestResults, 
  TestSummary, 
  NetworkMetrics, 
  ErrorLog,
  ManagedBrowserInstance,
  BrowserPoolConfig,
  DRMMetrics
} from '../types';

/**
 * Test session represents a single user session
 */
export interface TestSession {
  id: string;
  browserInstance: ManagedBrowserInstance;
  interceptor: RequestInterceptor;
  startTime: Date;
  endTime?: Date;
  status: 'starting' | 'running' | 'stopping' | 'completed' | 'failed';
  errors: ErrorLog[];
}

/**
 * Real-time test monitoring data
 */
export interface TestMonitoringData {
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  currentRps: number; // requests per second
  elapsedTime: number; // seconds
  remainingTime: number; // seconds
  memoryUsage: number; // MB
  cpuUsage: number; // percentage
  resourceUtilization: ResourceUtilizationData;
}

/**
 * Resource utilization and performance data
 */
export interface ResourceUtilizationData {
  memoryUtilization: number; // percentage
  cpuUtilization: number; // percentage
  instancesNearMemoryLimit: number;
  instancesNearCpuLimit: number;
  totalInstances: number;
  activeInstances: number;
  resourceAlerts: ResourceAlert[];
}

/**
 * Resource alert information
 */
export interface ResourceAlert {
  type: 'memory' | 'cpu' | 'instance_limit' | 'performance';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: Date;
  instanceId?: string;
  value?: number;
  limit?: number;
}

/**
 * Test execution events
 */
export interface TestRunnerEvents {
  'test-started': { testId: string; config: TestConfiguration };
  'test-completed': { testId: string; results: TestResults };
  'test-failed': { testId: string; error: Error };
  'session-started': { sessionId: string; testId: string };
  'session-completed': { sessionId: string; testId: string };
  'session-failed': { sessionId: string; testId: string; error: Error };
  'monitoring-update': { testId: string; data: TestMonitoringData };
  'ramp-up-completed': { testId: string };
}

/**
 * TestRunner orchestrates browser instances and executes load tests
 */
export class TestRunner extends EventEmitter {
  private testId: string;
  private config: TestConfiguration;
  private browserPool: BrowserPool;
  private sessions: Map<string, TestSession> = new Map();
  private isRunning = false;
  private startTime?: Date;
  private endTime?: Date;
  private monitoringInterval?: NodeJS.Timeout;
  private rampUpInterval?: NodeJS.Timeout;
  private testTimeout?: NodeJS.Timeout;
  private shutdownPromise?: Promise<void>;

  constructor(config: TestConfiguration) {
    super();
    this.testId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.config = config;
    
    // Create browser pool configuration
    const poolConfig: BrowserPoolConfig = {
      maxInstances: config.resourceLimits.maxConcurrentInstances,
      minInstances: Math.min(2, config.concurrentUsers),
      resourceLimits: config.resourceLimits,
      browserOptions: {
        headless: true,
        args: [
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-client-side-phishing-detection',
          '--disable-default-apps',
          '--disable-hang-monitor',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-sync',
          '--metrics-recording-only',
          '--no-first-run',
          '--safebrowsing-disable-auto-update',
          '--enable-automation',
          '--password-store=basic',
          '--use-mock-keychain'
        ]
      }
    };

    this.browserPool = new BrowserPool(poolConfig);
    this.setupBrowserPoolEvents();
  }

  /**
   * Start the load test
   */
  async startTest(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Test is already running');
    }

    try {
      this.isRunning = true;
      this.startTime = new Date();
      
      // Initialize browser pool
      await this.browserPool.initialize();
      
      // Start monitoring
      this.startMonitoring();
      
      // Set up test timeout
      this.setupTestTimeout();
      
      // Start ramp-up process
      await this.startRampUp();
      
      this.emit('test-started', { testId: this.testId, config: this.config });
      
    } catch (error) {
      this.isRunning = false;
      const testError = error instanceof Error ? error : new Error(String(error));
      this.emit('test-failed', { testId: this.testId, error: testError });
      throw testError;
    }
  }

  /**
   * Stop the load test gracefully
   */
  async stopTest(): Promise<TestResults> {
    if (!this.isRunning && !this.shutdownPromise) {
      throw new Error('No test is currently running');
    }

    // If shutdown is already in progress, wait for it to complete
    if (this.shutdownPromise) {
      await this.shutdownPromise;
      return this.generateResults();
    }

    // If test is still running, initiate shutdown
    if (this.isRunning) {
      this.shutdownPromise = this.performShutdown();
      await this.shutdownPromise;
      // Clear the shutdown promise after completion so subsequent calls will throw
      this.shutdownPromise = undefined;
    }
    
    return this.generateResults();
  }

  /**
   * Get current test monitoring data
   */
  getMonitoringData(): TestMonitoringData {
    const now = Date.now();
    const elapsedTime = this.startTime ? (now - this.startTime.getTime()) / 1000 : 0;
    const remainingTime = Math.max(0, this.config.testDuration - elapsedTime);
    
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.status === 'running').length;
    const completedSessions = Array.from(this.sessions.values()).filter(s => s.status === 'completed').length;
    const failedSessions = Array.from(this.sessions.values()).filter(s => s.status === 'failed').length;
    
    // Aggregate network metrics
    const allNetworkMetrics = this.getAllNetworkMetrics();
    const totalRequests = allNetworkMetrics.length;
    const successfulRequests = allNetworkMetrics.filter(m => m.statusCode >= 200 && m.statusCode < 400).length;
    const failedRequests = totalRequests - successfulRequests;
    const averageResponseTime = totalRequests > 0 
      ? allNetworkMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests 
      : 0;
    
    // Calculate current RPS (requests in last 10 seconds)
    const tenSecondsAgo = now - 10000;
    const recentRequests = allNetworkMetrics.filter(m => m.timestamp.getTime() > tenSecondsAgo);
    const currentRps = recentRequests.length / 10;
    
    // Get resource usage
    const browserMetrics = this.browserPool.getMetrics();
    const memoryUsage = browserMetrics.reduce((sum, m) => sum + m.memoryUsage, 0);
    const cpuUsage = browserMetrics.length > 0 
      ? browserMetrics.reduce((sum, m) => sum + m.cpuUsage, 0) / browserMetrics.length 
      : 0;

    // Get detailed resource utilization data
    const resourceUtilization = this.getResourceUtilizationData();

    return {
      activeSessions,
      completedSessions,
      failedSessions,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      currentRps,
      elapsedTime,
      remainingTime,
      memoryUsage,
      cpuUsage,
      resourceUtilization
    };
  }

  /**
   * Get detailed resource utilization data with alerts
   */
  private getResourceUtilizationData(): ResourceUtilizationData {
    const resourceStats = this.browserPool.getResourceUsageStats();
    const alerts = this.generateResourceAlerts(resourceStats);

    return {
      memoryUtilization: resourceStats.memoryUtilization,
      cpuUtilization: resourceStats.cpuUtilization,
      instancesNearMemoryLimit: resourceStats.instancesNearMemoryLimit,
      instancesNearCpuLimit: resourceStats.instancesNearCpuLimit,
      totalInstances: resourceStats.totalInstances,
      activeInstances: resourceStats.activeInstances,
      resourceAlerts: alerts
    };
  }

  /**
   * Generate resource alerts based on current usage
   */
  private generateResourceAlerts(resourceStats: any): ResourceAlert[] {
    const alerts: ResourceAlert[] = [];
    const now = new Date();

    // Memory utilization alerts
    if (resourceStats.memoryUtilization > 90) {
      alerts.push({
        type: 'memory',
        severity: 'critical',
        message: `Critical memory utilization: ${resourceStats.memoryUtilization.toFixed(1)}%`,
        timestamp: now,
        value: resourceStats.memoryUtilization,
        limit: 90
      });
    } else if (resourceStats.memoryUtilization > 80) {
      alerts.push({
        type: 'memory',
        severity: 'warning',
        message: `High memory utilization: ${resourceStats.memoryUtilization.toFixed(1)}%`,
        timestamp: now,
        value: resourceStats.memoryUtilization,
        limit: 80
      });
    }

    // CPU utilization alerts
    if (resourceStats.cpuUtilization > 90) {
      alerts.push({
        type: 'cpu',
        severity: 'critical',
        message: `Critical CPU utilization: ${resourceStats.cpuUtilization.toFixed(1)}%`,
        timestamp: now,
        value: resourceStats.cpuUtilization,
        limit: 90
      });
    } else if (resourceStats.cpuUtilization > 80) {
      alerts.push({
        type: 'cpu',
        severity: 'warning',
        message: `High CPU utilization: ${resourceStats.cpuUtilization.toFixed(1)}%`,
        timestamp: now,
        value: resourceStats.cpuUtilization,
        limit: 80
      });
    }

    // Instance limit alerts
    const instanceUtilization = (resourceStats.totalInstances / this.config.resourceLimits.maxConcurrentInstances) * 100;
    if (instanceUtilization > 90) {
      alerts.push({
        type: 'instance_limit',
        severity: 'critical',
        message: `Near maximum instance limit: ${resourceStats.totalInstances}/${this.config.resourceLimits.maxConcurrentInstances}`,
        timestamp: now,
        value: resourceStats.totalInstances,
        limit: this.config.resourceLimits.maxConcurrentInstances
      });
    } else if (instanceUtilization > 80) {
      alerts.push({
        type: 'instance_limit',
        severity: 'warning',
        message: `High instance usage: ${resourceStats.totalInstances}/${this.config.resourceLimits.maxConcurrentInstances}`,
        timestamp: now,
        value: resourceStats.totalInstances,
        limit: this.config.resourceLimits.maxConcurrentInstances
      });
    }

    // Performance alerts based on response times
    const recentMetrics = this.getAllNetworkMetrics().filter(m => 
      (Date.now() - m.timestamp.getTime()) < 30000 // Last 30 seconds
    );
    
    if (recentMetrics.length > 0) {
      const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
      if (avgResponseTime > 5000) {
        alerts.push({
          type: 'performance',
          severity: 'critical',
          message: `Very slow response times: ${avgResponseTime.toFixed(0)}ms average`,
          timestamp: now,
          value: avgResponseTime,
          limit: 5000
        });
      } else if (avgResponseTime > 2000) {
        alerts.push({
          type: 'performance',
          severity: 'warning',
          message: `Slow response times: ${avgResponseTime.toFixed(0)}ms average`,
          timestamp: now,
          value: avgResponseTime,
          limit: 2000
        });
      }
    }

    return alerts;
  }

  /**
   * Force cleanup of idle browser instances to free resources
   */
  async cleanupIdleInstances(maxIdleTime: number = 300000): Promise<number> {
    return await this.browserPool.cleanupIdleInstances(maxIdleTime);
  }

  /**
   * Get detailed resource usage statistics
   */
  getResourceUsageStats() {
    return this.browserPool.getResourceUsageStats();
  }

  /**
   * Get test ID
   */
  getTestId(): string {
    return this.testId;
  }

  /**
   * Check if test is currently running
   */
  isTestRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Set up browser pool event listeners
   */
  private setupBrowserPoolEvents(): void {
    this.browserPool.on('instanceCreationFailed', ({ error }) => {
      this.logError('Browser instance creation failed', error);
    });

    this.browserPool.on('instanceDisconnected', ({ instanceId }) => {
      this.handleBrowserDisconnect(instanceId);
    });

    this.browserPool.on('resourceLimitExceeded', ({ instanceId, type, usage, limit }) => {
      this.logError(`Resource limit exceeded for instance ${instanceId}`, null, {
        type,
        usage,
        limit
      });
    });

    // Error recovery events
    this.browserPool.on('circuitBreakerOpened', ({ instanceId }) => {
      this.logError(`Circuit breaker opened for instance ${instanceId}`, null, {
        instanceId,
        event: 'circuit-breaker-opened'
      });
    });

    this.browserPool.on('circuitBreakerClosed', ({ instanceId }) => {
      this.logError(`Circuit breaker closed for instance ${instanceId}`, null, {
        instanceId,
        event: 'circuit-breaker-closed',
        level: 'info'
      });
    });

    this.browserPool.on('instanceBlacklisted', ({ instanceId, reason }) => {
      this.logError(`Browser instance blacklisted: ${reason}`, null, {
        instanceId,
        reason,
        event: 'instance-blacklisted'
      });
    });

    this.browserPool.on('instanceRestarted', ({ originalInstanceId, newInstanceId }) => {
      this.logError(`Browser instance restarted successfully`, null, {
        originalInstanceId,
        newInstanceId,
        event: 'instance-restarted',
        level: 'info'
      });
    });

    this.browserPool.on('instanceRestartFailed', ({ instanceId, originalError, restartError }) => {
      this.logError(`Browser instance restart failed`, restartError, {
        instanceId,
        originalError: originalError.message,
        event: 'instance-restart-failed'
      });
    });

    this.browserPool.on('errorLogged', (errorLog) => {
      // Forward error logs from browser pool
      this.emit('error-logged', errorLog);
    });

    // Resource management events
    this.browserPool.on('resourceLimitWarning', ({ instanceId, type, usage, limit, isActive }) => {
      this.logError(`Resource limit warning for ${isActive ? 'active' : 'idle'} instance ${instanceId}`, null, {
        instanceId,
        type,
        usage,
        limit,
        isActive,
        event: 'resource-limit-warning',
        level: 'warning'
      });
    });

    this.browserPool.on('instanceCleanedForResourceLimit', ({ instanceId }) => {
      this.logError(`Instance cleaned due to resource limits`, null, {
        instanceId,
        event: 'instance-cleaned-resource-limit',
        level: 'info'
      });
    });

    this.browserPool.on('instanceCleanedForIdle', ({ instanceId }) => {
      this.logError(`Idle instance cleaned up`, null, {
        instanceId,
        event: 'instance-cleaned-idle',
        level: 'info'
      });
    });
  }

  /**
   * Start the ramp-up process
   */
  private async startRampUp(): Promise<void> {
    const rampUpIntervalMs = (this.config.rampUpTime * 1000) / this.config.concurrentUsers;
    let startedSessions = 0;

    return new Promise((resolve, _reject) => {
      const startNextSession = async () => {
        try {
          if (startedSessions >= this.config.concurrentUsers || !this.isRunning) {
            if (this.rampUpInterval) {
              clearInterval(this.rampUpInterval);
            }
            this.emit('ramp-up-completed', { testId: this.testId });
            resolve();
            return;
          }

          await this.startSession();
          startedSessions++;
        } catch (error) {
          this.logError('Failed to start session during ramp-up', error);
        }
      };

      // Start first session immediately
      startNextSession();

      // Start remaining sessions with interval
      if (this.config.concurrentUsers > 1) {
        this.rampUpInterval = setInterval(startNextSession, rampUpIntervalMs);
      }
    });
  }

  /**
   * Start a single test session
   */
  private async startSession(): Promise<TestSession> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      // Acquire browser instance
      const browserInstance = await this.browserPool.acquireInstance();
      
      // Create request interceptor
      const interceptor = new RequestInterceptor(
        browserInstance.page,
        this.config.requestParameters,
        { sessionId },
        this.config.streamingOnly || false,
        this.config.allowedUrls || [],
        this.config.blockedUrls || []
      );
      
      // Create session
      const session: TestSession = {
        id: sessionId,
        browserInstance,
        interceptor,
        startTime: new Date(),
        status: 'starting',
        errors: []
      };
      
      this.sessions.set(sessionId, session);
      
      // Start request interception
      await interceptor.startInterception();
      
      // Navigate to streaming URL
      session.status = 'running';
      interceptor.startStreamingMonitoring();
      
      await browserInstance.page.goto(this.config.streamingUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      this.emit('session-started', { sessionId, testId: this.testId });
      
      // Set up session completion handling
      this.scheduleSessionCompletion(session);
      
      return session;
      
    } catch (error) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.endTime = new Date();
        session.errors.push({
          timestamp: new Date(),
          level: 'error',
          message: 'Session startup failed',
          stack: error instanceof Error ? error.stack : undefined,
          context: { sessionId }
        });
      }
      
      this.emit('session-failed', { 
        sessionId, 
        testId: this.testId, 
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      throw error;
    }
  }

  /**
   * Schedule session completion based on test duration
   */
  private scheduleSessionCompletion(session: TestSession): void {
    const remainingTime = this.config.testDuration * 1000 - (Date.now() - this.startTime!.getTime());
    
    if (remainingTime > 0) {
      setTimeout(async () => {
        await this.completeSession(session.id);
      }, remainingTime);
    }
  }

  /**
   * Complete a test session
   */
  private async completeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'completed' || session.status === 'failed') {
      return;
    }

    try {
      session.status = 'stopping';
      
      // Stop request interception
      await session.interceptor.stopInterception();
      
      // Release browser instance
      await this.browserPool.releaseInstance(session.browserInstance.id);
      
      session.status = 'completed';
      session.endTime = new Date();
      
      this.emit('session-completed', { sessionId, testId: this.testId });
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date();
      session.errors.push({
        timestamp: new Date(),
        level: 'error',
        message: 'Session completion failed',
        stack: error instanceof Error ? error.stack : undefined,
        context: { sessionId }
      });
      
      this.emit('session-failed', { 
        sessionId, 
        testId: this.testId, 
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  /**
   * Handle browser disconnect events
   */
  private handleBrowserDisconnect(instanceId: string): void {
    // Find sessions using this browser instance
    const affectedSessions = Array.from(this.sessions.values())
      .filter(session => session.browserInstance.id === instanceId);
    
    for (const session of affectedSessions) {
      if (session.status === 'running') {
        session.status = 'failed';
        session.endTime = new Date();
        session.errors.push({
          timestamp: new Date(),
          level: 'error',
          message: 'Browser instance disconnected',
          context: { sessionId: session.id, instanceId }
        });
        
        this.emit('session-failed', { 
          sessionId: session.id, 
          testId: this.testId, 
          error: new Error('Browser instance disconnected')
        });
      }
    }
  }

  /**
   * Start monitoring and emit periodic updates
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const monitoringData = this.getMonitoringData();
      this.emit('monitoring-update', { testId: this.testId, data: monitoringData });
    }, 2000); // Update every 2 seconds
  }

  /**
   * Set up test timeout
   */
  private setupTestTimeout(): void {
    this.testTimeout = setTimeout(async () => {
      if (this.isRunning) {
        await this.stopTest();
      }
    }, this.config.testDuration * 1000);
  }

  /**
   * Perform shutdown cleanup
   */
  private async performShutdown(): Promise<void> {
    this.isRunning = false;
    this.endTime = new Date();
    
    // Clear intervals and timeouts
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.rampUpInterval) {
      clearInterval(this.rampUpInterval);
    }
    if (this.testTimeout) {
      clearTimeout(this.testTimeout);
    }
    
    // Complete all active sessions
    const activeSessions = Array.from(this.sessions.values())
      .filter(session => session.status === 'running' || session.status === 'starting');
    
    const completionPromises = activeSessions.map(session => 
      this.completeSession(session.id).catch(error => {
        this.logError(`Failed to complete session ${session.id}`, error);
      })
    );
    
    await Promise.all(completionPromises);
    
    // Shutdown browser pool
    await this.browserPool.shutdown();
    
    const results = this.generateResults();
    this.emit('test-completed', { testId: this.testId, results });
  }

  /**
   * Generate test results
   */
  private generateResults(): TestResults {
    const allNetworkMetrics = this.getAllNetworkMetrics();
    const allErrors = this.getAllErrors();
    const browserMetrics = this.browserPool.getMetrics();
    
    // Generate summary
    const summary: TestSummary = {
      totalRequests: allNetworkMetrics.length,
      successfulRequests: allNetworkMetrics.filter(m => m.statusCode >= 200 && m.statusCode < 400).length,
      failedRequests: allNetworkMetrics.filter(m => m.statusCode >= 400 || m.statusCode === 0).length,
      averageResponseTime: allNetworkMetrics.length > 0 
        ? allNetworkMetrics.reduce((sum, m) => sum + m.responseTime, 0) / allNetworkMetrics.length 
        : 0,
      peakConcurrentUsers: this.config.concurrentUsers,
      testDuration: this.endTime && this.startTime 
        ? (this.endTime.getTime() - this.startTime.getTime()) / 1000 
        : 0
    };
    
    // Generate DRM metrics
    const drmMetrics = this.generateDRMMetrics(allNetworkMetrics);
    
    return {
      summary,
      browserMetrics,
      drmMetrics,
      networkMetrics: allNetworkMetrics,
      errors: allErrors
    };
  }

  /**
   * Get all network metrics from all sessions
   */
  private getAllNetworkMetrics(): NetworkMetrics[] {
    const allMetrics: NetworkMetrics[] = [];
    
    for (const session of this.sessions.values()) {
      allMetrics.push(...session.interceptor.getNetworkMetrics());
    }
    
    return allMetrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get all errors from all sessions
   */
  private getAllErrors(): ErrorLog[] {
    const allErrors: ErrorLog[] = [];
    
    for (const session of this.sessions.values()) {
      allErrors.push(...session.errors);
      allErrors.push(...session.interceptor.getErrors());
    }
    
    return allErrors.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Generate DRM-specific metrics
   */
  private generateDRMMetrics(networkMetrics: NetworkMetrics[]): DRMMetrics[] {
    if (!this.config.drmConfig) {
      return [];
    }

    const licenseRequests = networkMetrics.filter(m => 
      m.streamingType === 'license' || 
      m.url.toLowerCase().includes('license') ||
      m.url.toLowerCase().includes('drm')
    );

    const successfulLicenseRequests = licenseRequests.filter(m => 
      m.statusCode >= 200 && m.statusCode < 400
    );

    const averageLicenseTime = licenseRequests.length > 0
      ? licenseRequests.reduce((sum, m) => sum + m.responseTime, 0) / licenseRequests.length
      : 0;

    const licenseSuccessRate = licenseRequests.length > 0
      ? (successfulLicenseRequests.length / licenseRequests.length) * 100
      : 0;

    // Collect DRM errors from all sessions
    const drmErrors = [];
    for (const session of this.sessions.values()) {
      const streamingErrors = session.interceptor.getStreamingErrors();
      for (const error of streamingErrors) {
        if (error.errorType === 'license' || (error.url && error.url.toLowerCase().includes('license'))) {
          drmErrors.push({
            timestamp: error.timestamp,
            errorCode: error.errorCode || 'unknown',
            errorMessage: error.errorMessage,
            licenseUrl: error.url || this.config.drmConfig.licenseUrl,
            drmType: this.config.drmConfig.type
          });
        }
      }
    }

    return [{
      licenseRequestCount: licenseRequests.length,
      averageLicenseTime,
      licenseSuccessRate,
      drmType: this.config.drmConfig.type,
      errors: drmErrors
    }];
  }

  /**
   * Log error with context
   */
  private logError(message: string, error: any, context?: Record<string, any>): void {
    const level = (context?.level as 'error' | 'warning' | 'info') || 'error';
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      level,
      message,
      stack: error?.stack,
      context: {
        testId: this.testId,
        component: 'TestRunner',
        ...context
      }
    };

    // Emit error log for external systems
    this.emit('error-logged', errorLog);

    // Console logging for development
    if (level === 'error') {
      console.error(`[TestRunner] ${message}`, error, context);
    } else if (level === 'warning') {
      console.warn(`[TestRunner] ${message}`, error, context);
    } else {
      console.info(`[TestRunner] ${message}`, error, context);
    }
  }
}