import { EventEmitter } from 'events';
import { ErrorLog } from '../types';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, rejecting requests
  HALF_OPEN = 'half-open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  recoveryTimeout: number;     // Time in ms before attempting recovery
  successThreshold: number;    // Successes needed to close from half-open
  monitoringWindow: number;    // Time window in ms for failure counting
}

/**
 * Browser instance failure tracking
 */
export interface InstanceFailureInfo {
  instanceId: string;
  failureCount: number;
  lastFailureTime: Date;
  consecutiveFailures: number;
  totalRestarts: number;
  isBlacklisted: boolean;
  blacklistUntil?: Date;
}

/**
 * Recovery attempt result
 */
export interface RecoveryAttempt {
  instanceId: string;
  timestamp: Date;
  success: boolean;
  error?: Error;
  attemptNumber: number;
}

/**
 * Error recovery manager that handles browser instance failures and recovery
 */
export class ErrorRecoveryManager extends EventEmitter {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private failureTracking: Map<string, InstanceFailureInfo> = new Map();
  private recoveryAttempts: Map<string, RecoveryAttempt[]> = new Map();
  private config: CircuitBreakerConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.config = {
      failureThreshold: 3,
      recoveryTimeout: 30000, // 30 seconds
      successThreshold: 2,
      monitoringWindow: 300000, // 5 minutes
      ...config
    };
    
    this.startCleanupProcess();
  }

  /**
   * Record a failure for a browser instance
   */
  recordFailure(instanceId: string, error: Error, context?: Record<string, any>): void {
    const now = new Date();
    
    // Update failure tracking
    let failureInfo = this.failureTracking.get(instanceId);
    if (!failureInfo) {
      failureInfo = {
        instanceId,
        failureCount: 0,
        lastFailureTime: now,
        consecutiveFailures: 0,
        totalRestarts: 0,
        isBlacklisted: false
      };
      this.failureTracking.set(instanceId, failureInfo);
    }

    failureInfo.failureCount++;
    failureInfo.consecutiveFailures++;
    failureInfo.lastFailureTime = now;

    // Log the error with comprehensive context
    this.logError('Browser instance failure recorded', error, {
      instanceId,
      failureCount: failureInfo.failureCount,
      consecutiveFailures: failureInfo.consecutiveFailures,
      ...context
    });

    // Check if circuit breaker should open
    this.evaluateCircuitBreaker(instanceId, failureInfo);

    // Check if instance should be blacklisted due to too many consecutive failures
    if (failureInfo.consecutiveFailures >= this.config.failureThreshold * 2) {
      this.blacklistInstance(instanceId, 'Too many consecutive failures');
    }

    this.emit('failure-recorded', { instanceId, error, failureInfo });
  }

  /**
   * Record a successful operation for a browser instance
   */
  recordSuccess(instanceId: string): void {
    const failureInfo = this.failureTracking.get(instanceId);
    if (failureInfo) {
      failureInfo.consecutiveFailures = 0;
    }

    // Handle circuit breaker state transitions
    const currentState = this.circuitBreakers.get(instanceId);
    if (currentState === CircuitBreakerState.HALF_OPEN) {
      // Count recent successful operations (not just restart attempts)
      let successCount = 1; // This current success
      
      // Also count recent successful restart attempts
      const attempts = this.recoveryAttempts.get(instanceId) || [];
      const recentSuccessfulAttempts = attempts
        .filter(a => a.success && (Date.now() - a.timestamp.getTime()) < this.config.monitoringWindow)
        .length;
      
      successCount += recentSuccessfulAttempts;

      if (successCount >= this.config.successThreshold) {
        this.circuitBreakers.set(instanceId, CircuitBreakerState.CLOSED);
        this.emit('circuit-breaker-closed', { instanceId });
      }
    }

    this.emit('success-recorded', { instanceId });
  }

  /**
   * Check if an instance should be allowed to operate
   */
  canUseInstance(instanceId: string): boolean {
    const failureInfo = this.failureTracking.get(instanceId);
    
    // Check if blacklisted
    if (failureInfo?.isBlacklisted) {
      if (failureInfo.blacklistUntil && new Date() > failureInfo.blacklistUntil) {
        failureInfo.isBlacklisted = false;
        failureInfo.blacklistUntil = undefined;
        this.emit('instance-unblacklisted', { instanceId });
      } else {
        return false;
      }
    }

    // Check circuit breaker state
    const circuitState = this.circuitBreakers.get(instanceId) || CircuitBreakerState.CLOSED;
    
    if (circuitState === CircuitBreakerState.OPEN) {
      // Check if recovery timeout has passed
      if (failureInfo && (Date.now() - failureInfo.lastFailureTime.getTime()) > this.config.recoveryTimeout) {
        this.circuitBreakers.set(instanceId, CircuitBreakerState.HALF_OPEN);
        this.emit('circuit-breaker-half-open', { instanceId });
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Determine if an instance should be restarted
   */
  shouldRestartInstance(instanceId: string): boolean {
    const failureInfo = this.failureTracking.get(instanceId);
    if (!failureInfo) {
      return false;
    }

    // Don't restart if blacklisted
    if (failureInfo.isBlacklisted) {
      return false;
    }

    // Don't restart if too many consecutive failures
    if (failureInfo.consecutiveFailures >= this.config.failureThreshold * 2) {
      this.blacklistInstance(instanceId, 'Too many consecutive failures');
      return false;
    }

    // Don't restart if too many total restarts
    if (failureInfo.totalRestarts >= 10) {
      this.blacklistInstance(instanceId, 'Maximum restart attempts exceeded');
      return false;
    }

    return failureInfo.consecutiveFailures > 0;
  }

  /**
   * Record a restart attempt
   */
  recordRestartAttempt(instanceId: string, success: boolean, error?: Error): void {
    const failureInfo = this.failureTracking.get(instanceId);
    if (failureInfo) {
      failureInfo.totalRestarts++;
      
      if (success) {
        failureInfo.consecutiveFailures = 0;
        this.recordSuccess(instanceId);
      }
    }

    // Record recovery attempt
    const attempts = this.recoveryAttempts.get(instanceId) || [];
    const attempt: RecoveryAttempt = {
      instanceId,
      timestamp: new Date(),
      success,
      error,
      attemptNumber: attempts.length + 1
    };
    
    attempts.push(attempt);
    this.recoveryAttempts.set(instanceId, attempts);

    this.logError(
      success ? 'Browser instance restart succeeded' : 'Browser instance restart failed',
      error || null,
      {
        instanceId,
        success,
        attemptNumber: attempt.attemptNumber,
        totalRestarts: failureInfo?.totalRestarts || 0
      }
    );

    this.emit('restart-attempted', { instanceId, success, error, attempt });
  }

  /**
   * Get failure statistics for an instance
   */
  getInstanceStats(instanceId: string): InstanceFailureInfo | null {
    return this.failureTracking.get(instanceId) || null;
  }

  /**
   * Get circuit breaker state for an instance
   */
  getCircuitBreakerState(instanceId: string): CircuitBreakerState {
    return this.circuitBreakers.get(instanceId) || CircuitBreakerState.CLOSED;
  }

  /**
   * Get all recovery attempts for an instance
   */
  getRecoveryAttempts(instanceId: string): RecoveryAttempt[] {
    return this.recoveryAttempts.get(instanceId) || [];
  }

  /**
   * Get comprehensive error recovery statistics
   */
  getRecoveryStats(): {
    totalInstances: number;
    failingInstances: number;
    blacklistedInstances: number;
    openCircuitBreakers: number;
    halfOpenCircuitBreakers: number;
    totalFailures: number;
    totalRestarts: number;
  } {
    const instances = Array.from(this.failureTracking.values());
    const circuitStates = Array.from(this.circuitBreakers.values());
    
    return {
      totalInstances: instances.length,
      failingInstances: instances.filter(i => i.consecutiveFailures > 0).length,
      blacklistedInstances: instances.filter(i => i.isBlacklisted).length,
      openCircuitBreakers: circuitStates.filter(s => s === CircuitBreakerState.OPEN).length,
      halfOpenCircuitBreakers: circuitStates.filter(s => s === CircuitBreakerState.HALF_OPEN).length,
      totalFailures: instances.reduce((sum, i) => sum + i.failureCount, 0),
      totalRestarts: instances.reduce((sum, i) => sum + i.totalRestarts, 0)
    };
  }

  /**
   * Reset failure tracking for an instance
   */
  resetInstance(instanceId: string): void {
    this.failureTracking.delete(instanceId);
    this.circuitBreakers.delete(instanceId);
    this.recoveryAttempts.delete(instanceId);
    this.emit('instance-reset', { instanceId });
  }

  /**
   * Cleanup old tracking data
   */
  cleanup(): void {
    const now = Date.now();
    const cutoffTime = now - this.config.monitoringWindow;

    // Clean up old failure tracking
    for (const [instanceId, failureInfo] of this.failureTracking.entries()) {
      if (failureInfo.lastFailureTime.getTime() < cutoffTime && 
          failureInfo.consecutiveFailures === 0 && 
          !failureInfo.isBlacklisted) {
        this.failureTracking.delete(instanceId);
        this.circuitBreakers.delete(instanceId);
      }
    }

    // Clean up old recovery attempts
    for (const [instanceId, attempts] of this.recoveryAttempts.entries()) {
      const recentAttempts = attempts.filter(a => (now - a.timestamp.getTime()) < this.config.monitoringWindow);
      if (recentAttempts.length === 0) {
        this.recoveryAttempts.delete(instanceId);
      } else if (recentAttempts.length < attempts.length) {
        this.recoveryAttempts.set(instanceId, recentAttempts);
      }
    }

    this.emit('cleanup-completed', { 
      remainingInstances: this.failureTracking.size,
      remainingAttempts: this.recoveryAttempts.size
    });
  }

  /**
   * Shutdown the error recovery manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.emit('shutdown');
  }

  /**
   * Evaluate circuit breaker state based on failure info
   */
  private evaluateCircuitBreaker(instanceId: string, failureInfo: InstanceFailureInfo): void {
    const currentState = this.circuitBreakers.get(instanceId) || CircuitBreakerState.CLOSED;
    
    if (currentState === CircuitBreakerState.CLOSED && 
        failureInfo.consecutiveFailures >= this.config.failureThreshold) {
      this.circuitBreakers.set(instanceId, CircuitBreakerState.OPEN);
      this.emit('circuit-breaker-opened', { instanceId, failureInfo });
    }
  }

  /**
   * Blacklist an instance temporarily
   */
  private blacklistInstance(instanceId: string, reason: string): void {
    const failureInfo = this.failureTracking.get(instanceId);
    if (failureInfo) {
      failureInfo.isBlacklisted = true;
      failureInfo.blacklistUntil = new Date(Date.now() + this.config.recoveryTimeout * 3); // 3x recovery timeout
      
      this.logError('Browser instance blacklisted', null, {
        instanceId,
        reason,
        blacklistUntil: failureInfo.blacklistUntil,
        consecutiveFailures: failureInfo.consecutiveFailures,
        totalRestarts: failureInfo.totalRestarts
      });

      this.emit('instance-blacklisted', { instanceId, reason, failureInfo });
    }
  }

  /**
   * Start periodic cleanup process
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Log error with comprehensive context
   */
  private logError(message: string, error: Error | null, context?: Record<string, any>): void {
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      level: 'error',
      message,
      stack: error?.stack,
      context: {
        component: 'ErrorRecoveryManager',
        ...context
      }
    };

    // Emit error for external logging systems
    this.emit('error-logged', errorLog);

    // Console logging for development
    console.error(`[ErrorRecoveryManager] ${message}`, error, context);
  }
}