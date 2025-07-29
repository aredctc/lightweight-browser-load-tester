import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorRecoveryManager, CircuitBreakerState } from './error-recovery';

describe('ErrorRecoveryManager', () => {
  let errorRecovery: ErrorRecoveryManager;
  let mockDate: Date;

  beforeEach(() => {
    mockDate = new Date('2023-01-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
    
    errorRecovery = new ErrorRecoveryManager({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      successThreshold: 2,
      monitoringWindow: 300000
    });
  });

  afterEach(() => {
    errorRecovery.shutdown();
    vi.useRealTimers();
  });

  describe('failure recording', () => {
    it('should record failures for browser instances', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      errorRecovery.recordFailure(instanceId, error);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats).toBeDefined();
      expect(stats!.failureCount).toBe(1);
      expect(stats!.consecutiveFailures).toBe(1);
      expect(stats!.instanceId).toBe(instanceId);
    });

    it('should increment failure counts on multiple failures', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.failureCount).toBe(3);
      expect(stats!.consecutiveFailures).toBe(3);
    });

    it('should emit failure-recorded event', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('failure-recorded', eventSpy);
      errorRecovery.recordFailure(instanceId, error);
      
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        error,
        failureInfo: expect.objectContaining({
          instanceId,
          failureCount: 1,
          consecutiveFailures: 1
        })
      });
    });
  });

  describe('success recording', () => {
    it('should reset consecutive failures on success', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      // Record some failures
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      // Record success
      errorRecovery.recordSuccess(instanceId);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.failureCount).toBe(2); // Total failures remain
      expect(stats!.consecutiveFailures).toBe(0); // Consecutive failures reset
    });

    it('should emit success-recorded event', () => {
      const instanceId = 'test-instance-1';
      const eventSpy = vi.fn();
      
      errorRecovery.on('success-recorded', eventSpy);
      errorRecovery.recordSuccess(instanceId);
      
      expect(eventSpy).toHaveBeenCalledWith({ instanceId });
    });
  });

  describe('circuit breaker functionality', () => {
    it('should open circuit breaker after threshold failures', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('circuit-breaker-opened', eventSpy);
      
      // Record failures up to threshold
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      expect(errorRecovery.getCircuitBreakerState(instanceId)).toBe(CircuitBreakerState.OPEN);
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        failureInfo: expect.objectContaining({
          consecutiveFailures: 3
        })
      });
    });

    it('should transition to half-open after recovery timeout', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      // Open circuit breaker
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      expect(errorRecovery.getCircuitBreakerState(instanceId)).toBe(CircuitBreakerState.OPEN);
      expect(errorRecovery.canUseInstance(instanceId)).toBe(false);
      
      // Advance time past recovery timeout
      vi.advanceTimersByTime(31000);
      
      expect(errorRecovery.canUseInstance(instanceId)).toBe(true);
      expect(errorRecovery.getCircuitBreakerState(instanceId)).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should close circuit breaker after successful operations in half-open state', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('circuit-breaker-closed', eventSpy);
      
      // Open circuit breaker
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordFailure(instanceId, error);
      
      // Advance time to half-open
      vi.advanceTimersByTime(31000);
      errorRecovery.canUseInstance(instanceId); // Triggers half-open
      
      // Record successful operations
      errorRecovery.recordSuccess(instanceId);
      errorRecovery.recordSuccess(instanceId);
      
      // Need to record recovery attempts to track successes in half-open state
      errorRecovery.recordRestartAttempt(instanceId, true);
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      expect(errorRecovery.getCircuitBreakerState(instanceId)).toBe(CircuitBreakerState.CLOSED);
      expect(eventSpy).toHaveBeenCalledWith({ instanceId });
    });
  });

  describe('instance restart logic', () => {
    it('should recommend restart for instances with failures', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      errorRecovery.recordFailure(instanceId, error);
      
      expect(errorRecovery.shouldRestartInstance(instanceId)).toBe(true);
    });

    it('should not recommend restart for blacklisted instances', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      // Generate enough failures to trigger blacklisting
      for (let i = 0; i < 7; i++) {
        errorRecovery.recordFailure(instanceId, error);
      }
      
      expect(errorRecovery.shouldRestartInstance(instanceId)).toBe(false);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.isBlacklisted).toBe(true);
    });

    it('should record restart attempts', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('restart-attempted', eventSpy);
      
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      const attempts = errorRecovery.getRecoveryAttempts(instanceId);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].success).toBe(true);
      expect(attempts[0].instanceId).toBe(instanceId);
      
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        success: true,
        error: undefined,
        attempt: expect.objectContaining({
          success: true,
          attemptNumber: 1
        })
      });
    });

    it('should track total restarts in failure info', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      // First record a failure to create the failure info
      errorRecovery.recordFailure(instanceId, error);
      
      errorRecovery.recordRestartAttempt(instanceId, true);
      errorRecovery.recordRestartAttempt(instanceId, false, new Error('Restart failed'));
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.totalRestarts).toBe(3);
    });

    it('should blacklist instances with too many restart attempts', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('instance-blacklisted', eventSpy);
      
      // Record initial failure
      errorRecovery.recordFailure(instanceId, error);
      
      // Simulate many failed restart attempts
      for (let i = 0; i < 11; i++) {
        errorRecovery.recordRestartAttempt(instanceId, false, new Error('Restart failed'));
      }
      
      expect(errorRecovery.shouldRestartInstance(instanceId)).toBe(false);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.isBlacklisted).toBe(true);
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        reason: 'Maximum restart attempts exceeded',
        failureInfo: expect.objectContaining({
          isBlacklisted: true,
          totalRestarts: 11
        })
      });
    });
  });

  describe('blacklisting functionality', () => {
    it('should blacklist instances with too many consecutive failures', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('instance-blacklisted', eventSpy);
      
      // Generate enough consecutive failures to trigger blacklisting (threshold * 2)
      for (let i = 0; i < 6; i++) {
        errorRecovery.recordFailure(instanceId, error);
      }
      
      expect(errorRecovery.shouldRestartInstance(instanceId)).toBe(false);
      expect(errorRecovery.canUseInstance(instanceId)).toBe(false);
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.isBlacklisted).toBe(true);
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        reason: 'Too many consecutive failures',
        failureInfo: expect.objectContaining({
          isBlacklisted: true
        })
      });
    });

    it('should automatically unblacklist instances after timeout', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('instance-unblacklisted', eventSpy);
      
      // Blacklist instance
      for (let i = 0; i < 6; i++) {
        errorRecovery.recordFailure(instanceId, error);
      }
      
      expect(errorRecovery.canUseInstance(instanceId)).toBe(false);
      
      // Advance time past blacklist timeout (3x recovery timeout)
      vi.advanceTimersByTime(91000);
      
      // Call canUseInstance to trigger the unblacklisting check
      const canUse = errorRecovery.canUseInstance(instanceId);
      expect(canUse).toBe(true);
      expect(eventSpy).toHaveBeenCalledWith({ instanceId });
      
      const stats = errorRecovery.getInstanceStats(instanceId);
      expect(stats!.isBlacklisted).toBe(false);
    });
  });

  describe('statistics and monitoring', () => {
    it('should provide comprehensive recovery statistics', () => {
      const instance1 = 'test-instance-1';
      const instance2 = 'test-instance-2';
      const error = new Error('Test error');
      
      // Create different failure scenarios
      errorRecovery.recordFailure(instance1, error);
      errorRecovery.recordFailure(instance1, error);
      
      errorRecovery.recordFailure(instance2, error);
      errorRecovery.recordFailure(instance2, error);
      errorRecovery.recordFailure(instance2, error); // Opens circuit breaker
      
      errorRecovery.recordRestartAttempt(instance1, true);
      errorRecovery.recordRestartAttempt(instance2, false, new Error('Restart failed'));
      
      const stats = errorRecovery.getRecoveryStats();
      
      expect(stats.totalInstances).toBe(2);
      expect(stats.failingInstances).toBe(1); // instance2 still has consecutive failures
      expect(stats.openCircuitBreakers).toBe(1);
      expect(stats.totalFailures).toBe(5);
      expect(stats.totalRestarts).toBe(2);
    });

    it('should reset instance tracking', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('instance-reset', eventSpy);
      
      // Create some tracking data
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      expect(errorRecovery.getInstanceStats(instanceId)).toBeDefined();
      expect(errorRecovery.getRecoveryAttempts(instanceId)).toHaveLength(1);
      
      // Reset instance
      errorRecovery.resetInstance(instanceId);
      
      expect(errorRecovery.getInstanceStats(instanceId)).toBeNull();
      expect(errorRecovery.getRecoveryAttempts(instanceId)).toHaveLength(0);
      expect(errorRecovery.getCircuitBreakerState(instanceId)).toBe(CircuitBreakerState.CLOSED);
      expect(eventSpy).toHaveBeenCalledWith({ instanceId });
    });
  });

  describe('cleanup functionality', () => {
    it('should clean up old tracking data', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('cleanup-completed', eventSpy);
      
      // Create tracking data
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordSuccess(instanceId); // Reset consecutive failures
      errorRecovery.recordRestartAttempt(instanceId, true);
      
      // Advance time past monitoring window
      vi.advanceTimersByTime(301000);
      
      // Trigger cleanup
      errorRecovery.cleanup();
      
      expect(errorRecovery.getInstanceStats(instanceId)).toBeNull();
      expect(errorRecovery.getRecoveryAttempts(instanceId)).toHaveLength(0);
      expect(eventSpy).toHaveBeenCalledWith({
        remainingInstances: 0,
        remainingAttempts: 0
      });
    });

    it('should not clean up blacklisted instances', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      // Blacklist instance
      for (let i = 0; i < 6; i++) {
        errorRecovery.recordFailure(instanceId, error);
      }
      
      // Verify instance is blacklisted
      const statsBeforeCleanup = errorRecovery.getInstanceStats(instanceId);
      expect(statsBeforeCleanup!.isBlacklisted).toBe(true);
      
      // Advance time past monitoring window
      vi.advanceTimersByTime(301000);
      
      // Trigger cleanup
      errorRecovery.cleanup();
      
      // Blacklisted instance should not be cleaned up
      const statsAfterCleanup = errorRecovery.getInstanceStats(instanceId);
      expect(statsAfterCleanup).toBeDefined();
      expect(statsAfterCleanup!.isBlacklisted).toBe(true);
    });

    it('should automatically run cleanup periodically', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      
      // Create tracking data that will be cleaned up
      errorRecovery.recordFailure(instanceId, error);
      errorRecovery.recordSuccess(instanceId);
      
      // Advance time past monitoring window and cleanup interval
      vi.advanceTimersByTime(301000);
      vi.advanceTimersByTime(60000); // Cleanup runs every minute
      
      expect(errorRecovery.getInstanceStats(instanceId)).toBeNull();
    });
  });

  describe('error logging', () => {
    it('should emit error-logged events with comprehensive context', () => {
      const instanceId = 'test-instance-1';
      const error = new Error('Test error');
      const eventSpy = vi.fn();
      
      errorRecovery.on('error-logged', eventSpy);
      
      errorRecovery.recordFailure(instanceId, error, { customContext: 'test' });
      
      expect(eventSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date),
        level: 'error',
        message: 'Browser instance failure recorded',
        stack: error.stack,
        context: {
          component: 'ErrorRecoveryManager',
          instanceId,
          failureCount: 1,
          consecutiveFailures: 1,
          customContext: 'test'
        }
      });
    });
  });

  describe('edge cases', () => {
    it('should handle recording success for non-existent instance', () => {
      const instanceId = 'non-existent-instance';
      
      expect(() => {
        errorRecovery.recordSuccess(instanceId);
      }).not.toThrow();
      
      expect(errorRecovery.getInstanceStats(instanceId)).toBeNull();
    });

    it('should handle canUseInstance for non-existent instance', () => {
      const instanceId = 'non-existent-instance';
      
      expect(errorRecovery.canUseInstance(instanceId)).toBe(true);
      expect(errorRecovery.getCircuitBreakerState(instanceId)).toBe(CircuitBreakerState.CLOSED);
    });

    it('should handle shouldRestartInstance for non-existent instance', () => {
      const instanceId = 'non-existent-instance';
      
      expect(errorRecovery.shouldRestartInstance(instanceId)).toBe(false);
    });
  });
});