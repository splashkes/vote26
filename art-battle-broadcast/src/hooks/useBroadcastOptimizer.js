import { useCallback } from 'react';
import { useVisibilityReconnect } from './useVisibilityReconnect';
import { useConnectionHealth } from './useConnectionHealth';
import { useSmartFallback } from './useSmartFallback';
import { useWebSocketCleanup } from './useWebSocketCleanup';

/**
 * Master hook that combines all broadcast optimizations
 * - Lightweight performance monitoring
 * - Automatic fallback strategies
 * - Memory leak prevention
 * - Browser-specific optimizations
 */
export const useBroadcastOptimizer = ({
  onReconnect,
  onFallback,
  enabled = true
}) => {
  const cleanup = useWebSocketCleanup();

  // Handle connection health issues
  const handleUnhealthy = useCallback((reason, details) => {
    console.log(`⚠️ [OPTIMIZER] Connection unhealthy: ${reason}`, details);

    // Start fallback if available
    if (reason === 'errors' || reason === 'rapid_reconnect') {
      fallback.startFallback(reason);
    }
  }, []);

  const connectionHealth = useConnectionHealth(handleUnhealthy);

  const fallback = useSmartFallback(onFallback, enabled);

  // Enhanced reconnect that also stops fallback
  const handleReconnect = useCallback(() => {
    console.log('🔄 [OPTIMIZER] Initiating optimized reconnect');

    // Stop fallback polling since we're reconnecting
    fallback.stopFallback();

    // Mark recovery in health tracker
    connectionHealth.trackRecovery();

    // Execute reconnect
    onReconnect?.();
  }, [onReconnect, fallback, connectionHealth]);

  // Set up visibility-based reconnection
  useVisibilityReconnect(handleReconnect, enabled);

  // Enhanced error tracking
  const trackError = useCallback((error, context = '') => {
    console.log(`❌ [OPTIMIZER] Error in ${context}:`, error.message);
    connectionHealth.trackError('websocket_error');
  }, [connectionHealth]);

  // Enhanced closure tracking
  const trackClosure = useCallback((reason) => {
    console.log(`🔌 [OPTIMIZER] Connection closed: ${reason}`);
    connectionHealth.trackClosure(reason);
  }, [connectionHealth]);

  // Track subscription with cleanup
  const trackSubscription = useCallback((subscription, cleanupFn) => {
    return cleanup.trackSubscription(subscription, cleanupFn);
  }, [cleanup]);

  // Get comprehensive status
  const getStatus = useCallback(() => {
    return {
      health: connectionHealth.getHealth(),
      isPolling: fallback.isPolling(),
      resources: cleanup.getActiveCount(),
      enabled
    };
  }, [connectionHealth, fallback, cleanup, enabled]);

  return {
    trackError,
    trackClosure,
    trackSubscription,
    trackTimer: cleanup.trackTimer,
    trackEventListener: cleanup.trackEventListener,
    startFallback: fallback.startFallback,
    stopFallback: fallback.stopFallback,
    getStatus,
    cleanup: cleanup.cleanup
  };
};