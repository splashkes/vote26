import { useEffect, useRef } from 'react';

/**
 * Lightweight hook to handle background tab reconnection
 * - Only triggers on tab becoming visible (user returns)
 * - Debounced to prevent rapid calls
 * - Zero UI blocking, minimal performance impact
 */
export const useVisibilityReconnect = (onReconnect, enabled = true) => {
  const reconnectTimeoutRef = useRef(null);
  const lastReconnectRef = useRef(0);
  const RECONNECT_DEBOUNCE = 2000; // 2 seconds minimum between reconnects

  useEffect(() => {
    if (!enabled || typeof onReconnect !== 'function') return;

    const handleVisibilityChange = () => {
      // Only act when tab becomes visible (user returns)
      if (document.visibilityState === 'visible') {
        const now = Date.now();

        // Debounce rapid visibility changes
        if (now - lastReconnectRef.current < RECONNECT_DEBOUNCE) {
          return;
        }

        // Clear any pending reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Delay reconnect slightly to let browser settle
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 [VISIBILITY] Tab active, triggering reconnection');
          lastReconnectRef.current = Date.now();
          onReconnect();
        }, 100); // 100ms delay for browser settling
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [onReconnect, enabled]);
};