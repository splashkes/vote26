import { useEffect, useRef } from 'react';

/**
 * Automatic WebSocket cleanup to prevent memory leaks
 * - Zero performance impact during normal operation
 * - Automatic cleanup tracking
 * - Browser-agnostic leak prevention
 */
export const useWebSocketCleanup = () => {
  const subscriptionsRef = useRef(new Set());
  const timersRef = useRef(new Set());
  const eventListenersRef = useRef(new Set());

  // Track WebSocket subscription for cleanup
  const trackSubscription = (subscription, cleanupFn) => {
    const id = Math.random().toString(36);
    subscriptionsRef.current.add({ id, subscription, cleanupFn });

    return () => {
      subscriptionsRef.current.forEach(item => {
        if (item.id === id) {
          subscriptionsRef.current.delete(item);
        }
      });
    };
  };

  // Track timer for cleanup
  const trackTimer = (timerId) => {
    timersRef.current.add(timerId);
    return timerId;
  };

  // Track event listener for cleanup
  const trackEventListener = (element, event, handler, options = {}) => {
    element.addEventListener(event, handler, { passive: true, ...options });
    eventListenersRef.current.add({ element, event, handler });

    return () => {
      element.removeEventListener(event, handler);
      eventListenersRef.current.forEach(item => {
        if (item.element === element && item.event === event && item.handler === handler) {
          eventListenersRef.current.delete(item);
        }
      });
    };
  };

  // Cleanup all tracked resources
  const cleanup = () => {
    // Clean up subscriptions
    subscriptionsRef.current.forEach(({ subscription, cleanupFn }) => {
      try {
        if (cleanupFn) {
          cleanupFn();
        } else if (subscription?.unsubscribe) {
          subscription.unsubscribe();
        } else if (subscription?.close) {
          subscription.close();
        }
      } catch (error) {
        console.warn('⚠️ [CLEANUP] Subscription cleanup failed:', error.message);
      }
    });
    subscriptionsRef.current.clear();

    // Clean up timers
    timersRef.current.forEach(timerId => {
      clearTimeout(timerId);
      clearInterval(timerId);
    });
    timersRef.current.clear();

    // Clean up event listeners
    eventListenersRef.current.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler);
      } catch (error) {
        console.warn('⚠️ [CLEANUP] Event listener cleanup failed:', error.message);
      }
    });
    eventListenersRef.current.clear();

    console.log('✅ [CLEANUP] All WebSocket resources cleaned up');
  };

  // Auto-cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, []);

  return {
    trackSubscription,
    trackTimer,
    trackEventListener,
    cleanup,
    getActiveCount: () => ({
      subscriptions: subscriptionsRef.current.size,
      timers: timersRef.current.size,
      eventListeners: eventListenersRef.current.size
    })
  };
};