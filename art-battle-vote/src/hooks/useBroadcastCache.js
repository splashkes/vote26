/**
 * React Hook for Broadcast Cache Management
 * Integrates BroadcastCacheManager with React components
 * Provides automatic cache invalidation and refresh
 */

import { useEffect, useRef, useCallback } from 'react';
import { broadcastCacheManager } from '../utils/BroadcastCacheManager';
import { supabase } from '../lib/supabase'; // Use existing Supabase client

/**
 * Hook for managing broadcast cache invalidation
 * @param {string} eventId - Event ID to monitor
 * @param {function} onCacheInvalidation - Callback when cache is invalidated
 * @param {object} options - Configuration options
 */
export const useBroadcastCache = (eventId, onCacheInvalidation, options = {}) => {
  const {
    autoRefresh = true,
    refreshDelay = 1000, // 1 second delay before refresh
    debugMode = false
  } = options;

  const refreshTimeoutRef = useRef(null);
  const isSubscribedRef = useRef(false);
  const callbackRef = useRef(onCacheInvalidation);
  const currentEventIdRef = useRef(eventId);

  // Update refs when props change
  useEffect(() => {
    callbackRef.current = onCacheInvalidation;
  }, [onCacheInvalidation]);

  // Handle cache invalidation with optional auto-refresh
  const handleCacheInvalidation = useCallback((notificationData) => {
    const { type, endpoints, timestamp } = notificationData;
    
    console.log(`🌐 [V2-BROADCAST] Cache invalidated for event ${eventId}:`, {
      type,
      endpoints,
      timestamp: new Date(timestamp).toISOString()
    });

    // Clear any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    if (autoRefresh && callbackRef.current) {
      // Delay refresh slightly to batch multiple rapid notifications
      refreshTimeoutRef.current = setTimeout(() => {
        console.log(`🔄 [V2-BROADCAST] Auto-refreshing after cache invalidation`);
        callbackRef.current(notificationData);
      }, refreshDelay);
    } else if (callbackRef.current) {
      // Call immediately if auto-refresh is disabled
      callbackRef.current(notificationData);
    }
  }, [eventId, autoRefresh, refreshDelay]); // Removed onCacheInvalidation dependency

  // Subscribe to broadcast notifications
  useEffect(() => {
    // Skip if no eventId or if we're already subscribed to this event
    if (!eventId || (isSubscribedRef.current && currentEventIdRef.current === eventId)) {
      return;
    }

    // If we're subscribed to a different event, clean up first
    if (isSubscribedRef.current && currentEventIdRef.current !== eventId) {
      console.log(`🔇 [V2-BROADCAST] Switching events: unsubscribing from ${currentEventIdRef.current}`);
      broadcastCacheManager.unsubscribeFromEvent(currentEventIdRef.current, supabase);
      isSubscribedRef.current = false;
    }

    console.log(`🔔 [V2-BROADCAST] Setting up cache invalidation for event ${eventId}`);
    
    // Enable debug mode if requested
    if (debugMode) {
      broadcastCacheManager.setDebugMode(true);
    }

    // Subscribe to event notifications
    broadcastCacheManager.subscribeToEvent(eventId, handleCacheInvalidation, supabase);
    isSubscribedRef.current = true;
    currentEventIdRef.current = eventId;

    // Cleanup on unmount or event change
    return () => {
      console.log(`🔇 [V2-BROADCAST] Cleaning up cache invalidation for event ${eventId}`);
      
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      broadcastCacheManager.unsubscribeFromEvent(eventId, supabase);
      isSubscribedRef.current = false;
      currentEventIdRef.current = null;
    };
  }, [eventId, debugMode]); // Removed handleCacheInvalidation dependency

  // Cache management functions
  const cacheData = useCallback((endpoint, data, ttl) => {
    broadcastCacheManager.cacheEndpointData(endpoint, data, ttl);
  }, []);

  const getCachedData = useCallback((endpoint) => {
    return broadcastCacheManager.getCachedData(endpoint);
  }, []);

  const clearEventCache = useCallback(() => {
    broadcastCacheManager.clearEventCache(eventId);
  }, [eventId]);

  const getCacheStats = useCallback(() => {
    return broadcastCacheManager.getCacheStats();
  }, []);

  return {
    cacheData,
    getCachedData,
    clearEventCache,
    getCacheStats,
    isSubscribed: isSubscribedRef.current
  };
};

/**
 * Hook for fetching data with broadcast cache integration
 * @param {string} url - URL to fetch
 * @param {string} eventId - Event ID for cache scoping
 * @param {object} options - Fetch options
 */
export const useCachedFetch = (url, eventId, options = {}) => {
  const {
    cacheTTL = 30000, // 30 seconds default
    autoRefresh = true,
    refreshOnMount = true
  } = options;

  const { cacheData, getCachedData } = useBroadcastCache(
    eventId,
    () => {
      // Auto-refresh when cache is invalidated
      if (autoRefresh) {
        fetchData();
      }
    },
    { autoRefresh }
  );

  const fetchData = useCallback(async () => {
    if (!url) return null;

    console.log(`🌐 [V2-BROADCAST] Fetching data from ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the data
      cacheData(url, data, cacheTTL);
      
      console.log(`✅ [V2-BROADCAST] Successfully fetched and cached data from ${url}`);
      return data;
    } catch (error) {
      console.error(`❌ [V2-BROADCAST] Failed to fetch ${url}:`, error);
      
      // Try to return stale cached data as fallback
      const cachedData = getCachedData(url);
      if (cachedData) {
        console.warn(`⚠️  [V2-BROADCAST] Using stale cached data for ${url}`);
        return cachedData;
      }
      
      throw error;
    }
  }, [url, cacheData, getCachedData, cacheTTL]);

  const getCachedOrFetch = useCallback(async () => {
    if (!url) return null;

    // Try cache first
    const cachedData = getCachedData(url);
    if (cachedData) {
      console.log(`💾 [V2-BROADCAST] Using cached data for ${url}`);
      return cachedData;
    }

    // Fetch if not in cache
    return await fetchData();
  }, [url, getCachedData, fetchData]);

  // Auto-fetch on mount if requested
  useEffect(() => {
    if (refreshOnMount && url) {
      getCachedOrFetch();
    }
  }, [url, refreshOnMount, getCachedOrFetch]);

  return {
    fetchData,
    getCachedOrFetch,
    getCachedData: () => getCachedData(url)
  };
};

/**
 * Hook for monitoring broadcast system health
 */
export const useBroadcastHealth = () => {
  const getCacheStats = useCallback(() => {
    return broadcastCacheManager.getCacheStats();
  }, []);

  const clearAllCaches = useCallback(() => {
    // Get all cached endpoints and clear them
    const stats = getCacheStats();
    Object.keys(broadcastCacheManager.endpointCache).forEach(endpoint => {
      broadcastCacheManager.endpointCache.delete(endpoint);
    });
    
    console.log(`🗑️  [V2-BROADCAST] Cleared all caches (${stats.totalEntries} entries)`);
  }, [getCacheStats]);

  return {
    getCacheStats,
    clearAllCaches
  };
};