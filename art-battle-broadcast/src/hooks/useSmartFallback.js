import { useRef, useCallback, useEffect } from 'react';

/**
 * Smart fallback polling that only activates when WebSocket is unhealthy
 * - Adaptive intervals (faster during active auctions)
 * - Auto-disables when WebSocket recovers
 * - Minimal overhead when not needed
 */
export const useSmartFallback = (fallbackFn, isActive = true) => {
  const pollIntervalRef = useRef(null);
  const isPollingRef = useRef(false);
  const adaptiveIntervalRef = useRef(30000); // Start with 30s
  const lastPollRef = useRef(0);

  // Calculate adaptive interval based on auction activity
  const getInterval = useCallback(() => {
    const now = Date.now();
    const timeSinceLastPoll = now - lastPollRef.current;

    // If recently active, poll more frequently
    if (timeSinceLastPoll < 60000) { // Within last minute
      return 15000; // 15 seconds
    } else if (timeSinceLastPoll < 300000) { // Within last 5 minutes
      return 30000; // 30 seconds
    } else {
      return 60000; // 1 minute
    }
  }, []);

  // Start fallback polling (only when WebSocket fails)
  const startFallback = useCallback((reason) => {
    if (isPollingRef.current || !isActive) return;

    isPollingRef.current = true;
    adaptiveIntervalRef.current = getInterval();

    console.log(`📡 [FALLBACK] Starting smart polling (${adaptiveIntervalRef.current}ms) - reason: ${reason}`);

    const poll = async () => {
      if (!isPollingRef.current) return;

      try {
        lastPollRef.current = Date.now();
        await fallbackFn();

        // Adaptive interval adjustment
        adaptiveIntervalRef.current = getInterval();

        // Schedule next poll
        pollIntervalRef.current = setTimeout(poll, adaptiveIntervalRef.current);
      } catch (error) {
        console.warn('⚠️ [FALLBACK] Poll failed:', error.message);
        // Exponential backoff on error
        adaptiveIntervalRef.current = Math.min(adaptiveIntervalRef.current * 1.5, 120000);
        pollIntervalRef.current = setTimeout(poll, adaptiveIntervalRef.current);
      }
    };

    // Start first poll immediately
    poll();
  }, [fallbackFn, getInterval, isActive]);

  // Stop fallback polling (when WebSocket recovers)
  const stopFallback = useCallback(() => {
    if (!isPollingRef.current) return;

    isPollingRef.current = false;
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    console.log('✅ [FALLBACK] Smart polling stopped - WebSocket recovered');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFallback();
    };
  }, [stopFallback]);

  return {
    startFallback,
    stopFallback,
    isPolling: () => isPollingRef.current
  };
};