import { useRef, useCallback } from 'react';

/**
 * Lightweight connection health monitoring
 * - Event-driven, no polling timers
 * - Tracks patterns without UI blocking
 * - Minimal memory footprint
 */
export const useConnectionHealth = (onUnhealthy) => {
  const healthRef = useRef({
    errors: 0,
    lastError: 0,
    closures: 0,
    lastClosure: 0,
    isHealthy: true
  });

  // Lightweight error tracking
  const trackError = useCallback((errorType) => {
    const now = Date.now();
    const health = healthRef.current;

    health.errors++;
    health.lastError = now;

    // Simple unhealthy detection: 3+ errors in 30 seconds
    if (health.errors >= 3 && (now - health.lastError) < 30000) {
      if (health.isHealthy) {
        health.isHealthy = false;
        console.log('⚠️ [CONNECTION] Connection health degraded');
        onUnhealthy?.('errors', health.errors);
      }
    }

    // Reset error count after 60 seconds of no errors
    if (now - health.lastError > 60000) {
      health.errors = 0;
      if (!health.isHealthy) {
        health.isHealthy = true;
        console.log('✅ [CONNECTION] Connection health restored');
      }
    }
  }, [onUnhealthy]);

  // Track connection closures
  const trackClosure = useCallback((reason) => {
    const now = Date.now();
    const health = healthRef.current;

    health.closures++;
    health.lastClosure = now;

    // Detect rapid reconnection pattern (background tab issue)
    if (health.closures >= 2 && (now - health.lastClosure) < 10000) {
      console.log('🔄 [CONNECTION] Rapid reconnection detected, possible background throttling');
      onUnhealthy?.('rapid_reconnect', health.closures);
    }
  }, [onUnhealthy]);

  // Recovery indicator
  const trackRecovery = useCallback(() => {
    const health = healthRef.current;
    health.errors = Math.max(0, health.errors - 1);

    if (!health.isHealthy && health.errors === 0) {
      health.isHealthy = true;
      console.log('✅ [CONNECTION] Connection recovered');
    }
  }, []);

  return {
    trackError,
    trackClosure,
    trackRecovery,
    getHealth: () => healthRef.current
  };
};