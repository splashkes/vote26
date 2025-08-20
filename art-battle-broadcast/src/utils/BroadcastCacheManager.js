/**
 * Broadcast Cache Manager for V2 System
 * Handles cache invalidation notifications and endpoint refresh
 * Matches /live/ endpoint URLs with perfect event scoping
 */

export class BroadcastCacheManager {
  constructor() {
    this.subscriptions = new Map(); // eventId -> channel
    this.endpointCache = new Map(); // endpoint -> {data, timestamp, isValid}
    this.eventListeners = new Map(); // eventId -> Set of callbacks
    this.debugMode = false;
    
    // Endpoint patterns for URL matching
    this.endpointPatterns = {
      event: (eid) => `/live/event/${eid}`,
      media: (eid) => `/live/event/${eid}/media`,
      artists: (eid) => `/live/event/${eid}/artists`,
      bids: (eid, round, easel) => `/live/event/${eid}-${round}-${easel}/bids`
    };
  }

  /**
   * Subscribe to cache invalidation notifications for a specific event
   * @param {string} eventId - Event ID or EID
   * @param {function} onInvalidation - Callback for cache invalidation
   * @param {object} supabase - Supabase client instance
   */
  subscribeToEvent(eventId, onInvalidation, supabase) {
    if (this.subscriptions.has(eventId)) {
      this.log(`Already subscribed to event ${eventId}`);
      return;
    }

    this.log(`🔔 Subscribing to cache invalidation for event ${eventId}`);
    
    // Create event-specific listener set
    if (!this.eventListeners.has(eventId)) {
      this.eventListeners.set(eventId, new Set());
    }
    this.eventListeners.get(eventId).add(onInvalidation);

    // Listen to realtime.send() broadcasts from database triggers
    const channelName = `cache_invalidate_${eventId}`;
    const channel = supabase.channel(channelName)
      .on('broadcast', { event: 'cache_invalidation' }, (payload) => {
        this.log(`📡 [REALTIME] Received broadcast for event ${eventId}`, payload);
        this.handleRealtimeBroadcast(eventId, payload);
      })
      .subscribe();

    this.subscriptions.set(eventId, channel);
    this.log(`✅ Subscribed to pg_notify broadcasts for event ${eventId} on channel ${channelName}`);
  }

  /**
   * Unsubscribe from cache invalidation notifications
   * @param {string} eventId - Event ID to unsubscribe from
   * @param {object} supabase - Supabase client instance
   */
  unsubscribeFromEvent(eventId, supabase) {
    const channel = this.subscriptions.get(eventId);
    if (channel) {
      supabase.removeChannel(channel);
      this.subscriptions.delete(eventId);
      this.eventListeners.delete(eventId);
      this.log(`🔇 Unsubscribed from event ${eventId}`);
    }
  }

  /**
   * Handle Supabase postgres_changes events (row-level changes)
   * @param {string} type - Event type (bid_placed, vote_cast)
   * @param {string} eventId - Event ID
   * @param {object} payload - Postgres changes payload
   */
  handlePostgresChange(type, eventId, payload) {
    this.log(`📡 [POSTGRES_CHANGES] ${type} notification for event ${eventId}`, payload);

    // Determine which endpoints to invalidate based on the change type
    const endpointsToInvalidate = this.getEndpointsToInvalidate(type, eventId, payload);
    
    this.log(`🔄 [CACHE] Invalidating ${endpointsToInvalidate.length} endpoints for ${type}`);

    // Invalidate cache for each endpoint
    endpointsToInvalidate.forEach(endpoint => {
      this.invalidateEndpoint(endpoint);
    });

    // Notify all listeners for this event
    const listeners = this.eventListeners.get(eventId);
    if (listeners) {
      const callbackData = {
        type,
        eventId,
        endpoints: endpointsToInvalidate,
        timestamp: Date.now()
      };

      listeners.forEach(callback => {
        try {
          callback(callbackData);
        } catch (error) {
          console.error('Error in cache invalidation callback:', error);
        }
      });
    }
  }

  /**
   * Handle Supabase realtime broadcast from database trigger (LEGACY)
   * @param {string} eventId - Event ID
   * @param {object} payload - Broadcast payload from realtime.broadcast_changes()
   */
  handleRealtimeBroadcast(eventId, payload) {
    this.log(`📡 [REALTIME] Broadcast notification for event ${eventId}`, payload);

    try {
      // The payload might be nested - check both direct and nested structure
      let broadcastData = payload;
      if (payload.payload) {
        broadcastData = payload.payload;
      }
      
      const { type, endpoints, timestamp } = broadcastData;

      this.log(`🔄 [CACHE] Invalidating ${endpoints?.length || 0} endpoints for ${type}`);

      // Invalidate cache for each endpoint specified in the notification
      if (endpoints && Array.isArray(endpoints)) {
        endpoints.forEach(endpoint => {
          this.invalidateEndpoint(endpoint);
        });
      }

      // Notify all listeners for this event
      const listeners = this.eventListeners.get(eventId);
      if (listeners) {
        const callbackData = {
          type,
          eventId,
          endpoints: endpoints || [],
          timestamp: timestamp || Date.now()
        };

        listeners.forEach(callback => {
          try {
            callback(callbackData);
          } catch (error) {
            console.error('Error in cache invalidation callback:', error);
          }
        });
      }
    } catch (error) {
      console.error('Error handling realtime broadcast:', error, payload);
    }
  }

  /**
   * Handle broadcast notification and invalidate relevant endpoints (LEGACY)
   * @param {string} type - Notification type (vote_cast, bid_placed, etc.)
   * @param {string} eventId - Event ID
   * @param {object} payload - Broadcast payload
   */
  handleBroadcastNotification(type, eventId, payload) {
    this.log(`📡 [BROADCAST] ${type} notification for event ${eventId}`, payload);

    // Determine which endpoints to invalidate based on notification type
    const endpointsToInvalidate = this.getEndpointsToInvalidate(type, eventId, payload);
    
    // Invalidate cache for each endpoint
    endpointsToInvalidate.forEach(endpoint => {
      this.invalidateEndpoint(endpoint);
    });

    // Notify all listeners for this event
    const listeners = this.eventListeners.get(eventId);
    if (listeners) {
      const notificationData = {
        type,
        eventId,
        endpoints: endpointsToInvalidate,
        payload,
        timestamp: Date.now()
      };

      listeners.forEach(callback => {
        try {
          callback(notificationData);
        } catch (error) {
          console.error('Error in cache invalidation callback:', error);
        }
      });
    }
  }

  /**
   * Determine which endpoints need invalidation based on notification type
   * @param {string} type - Notification type
   * @param {string} eventId - Event ID
   * @param {object} payload - Notification payload
   * @returns {Array} Array of endpoint URLs to invalidate
   */
  getEndpointsToInvalidate(type, eventId, payload) {
    const endpoints = [];
    
    switch (type) {
      case 'vote_cast':
        // Vote changes affect main event endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        break;
        
      case 'bid_placed':
        // Bid changes affect main event endpoint and specific bid endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        
        // If we have round/easel info, also invalidate specific bid endpoint
        if (payload.new?.art_id) {
          // We'd need to resolve art_id to round/easel, for now invalidate all bid endpoints
          endpoints.push(`/live/event/${eventId}/bids`); // Generic bid endpoint
        }
        break;
        
      case 'art_updated':
        // Art changes affect main event endpoint and media endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        endpoints.push(this.endpointPatterns.media(eventId));
        break;
        
      case 'media_updated':
        // Media changes affect media endpoint
        endpoints.push(this.endpointPatterns.media(eventId));
        break;
        
      case 'artists_updated':
        // Artist assignments affect main event endpoint and artists endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        endpoints.push(this.endpointPatterns.artists(eventId));
        break;
        
      case 'round_contestants_updated':
        // Round contestant changes affect main event endpoint and artists endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        endpoints.push(this.endpointPatterns.artists(eventId));
        break;
        
      default:
        // Unknown type, invalidate main event endpoint as fallback
        endpoints.push(this.endpointPatterns.event(eventId));
    }
    
    return endpoints;
  }

  /**
   * Mark an endpoint as invalid in local cache
   * @param {string} endpoint - Endpoint URL to invalidate (relative or full URL)
   */
  invalidateEndpoint(endpoint) {
    // Try both relative path and full URL formats since PublicDataManager uses full URLs
    const variants = [
      endpoint,  // Original (usually relative path like "/live/event/AB3028-2-3/bids")
      `https://artb.art${endpoint}`, // Full URL variant
    ];
    
    let invalidated = false;
    
    for (const variant of variants) {
      const cacheEntry = this.endpointCache.get(variant);
      if (cacheEntry) {
        cacheEntry.isValid = false;
        cacheEntry.invalidatedAt = Date.now();
        this.log(`❌ [CACHE] Invalidated endpoint: ${variant}`);
        invalidated = true;
      }
    }
    
    if (!invalidated) {
      this.log(`⚠️  [CACHE] Endpoint not in cache (tried ${variants.length} variants): ${endpoint}`);
    }
  }

  /**
   * Cache endpoint data
   * @param {string} endpoint - Endpoint URL
   * @param {any} data - Data to cache
   * @param {number} ttl - Time to live in milliseconds (default: 30 seconds)
   */
  cacheEndpointData(endpoint, data, ttl = 30000) {
    this.endpointCache.set(endpoint, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      isValid: true
    });
    this.log(`💾 [CACHE] Cached data for endpoint: ${endpoint}`);
  }

  /**
   * Get cached data for endpoint if valid
   * @param {string} endpoint - Endpoint URL
   * @returns {any|null} Cached data or null if invalid/expired
   */
  getCachedData(endpoint) {
    const cacheEntry = this.endpointCache.get(endpoint);
    
    if (!cacheEntry) {
      this.log(`📭 [CACHE] No cached data for: ${endpoint}`);
      return null;
    }

    const now = Date.now();
    
    // Check if cache is expired
    if (now > cacheEntry.expiresAt) {
      this.log(`⏰ [CACHE] Expired cache for: ${endpoint}`);
      this.endpointCache.delete(endpoint);
      return null;
    }

    // Check if cache was invalidated
    if (!cacheEntry.isValid) {
      this.log(`❌ [CACHE] Invalidated cache for: ${endpoint}`);
      this.endpointCache.delete(endpoint);
      return null;
    }

    this.log(`✅ [CACHE] Using valid cached data for: ${endpoint}`);
    return cacheEntry.data;
  }

  /**
   * Clear all cached data for an event
   * @param {string} eventId - Event ID to clear cache for
   */
  clearEventCache(eventId) {
    const eventEndpoints = Array.from(this.endpointCache.keys())
      .filter(endpoint => endpoint.includes(`/live/event/${eventId}`));
    
    eventEndpoints.forEach(endpoint => {
      this.endpointCache.delete(endpoint);
    });
    
    this.log(`🗑️  [CACHE] Cleared cache for event ${eventId}: ${eventEndpoints.length} endpoints`);
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    const entries = Array.from(this.endpointCache.values());
    
    return {
      totalEntries: entries.length,
      validEntries: entries.filter(e => e.isValid && now <= e.expiresAt).length,
      expiredEntries: entries.filter(e => now > e.expiresAt).length,
      invalidatedEntries: entries.filter(e => !e.isValid).length,
      subscriptions: this.subscriptions.size,
      eventListeners: this.eventListeners.size
    };
  }

  /**
   * Enable/disable debug logging
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * Internal logging method
   * @param {string} message - Log message
   * @param {any} data - Optional data to log
   */
  log(message, data = null) {
    if (this.debugMode) {
      if (data) {
        console.log(`[BroadcastCacheManager] ${message}`, data);
      } else {
        console.log(`[BroadcastCacheManager] ${message}`);
      }
    }
  }
}

// Create singleton instance
export const broadcastCacheManager = new BroadcastCacheManager();

// Debug mode disabled for production performance
broadcastCacheManager.setDebugMode(false);