/**
 * Broadcast Cache Manager for V2 System
 * Handles cache invalidation notifications and endpoint refresh
 * Matches /live/ endpoint URLs with perfect event scoping
 */

export class BroadcastCacheManager {
  constructor() {
    // SINGLETON PATTERN: Prevent multiple instances
    if (BroadcastCacheManager.instance) {
      console.log('🔄 [BCM] BroadcastCacheManager already exists, returning existing instance');
      return BroadcastCacheManager.instance;
    }

    this.subscriptions = new Map(); // eventId -> channel
    this.endpointCache = new Map(); // endpoint -> {data, timestamp, isValid}
    this.eventListeners = new Map(); // eventId -> Set of callbacks
    this.debugMode = false;
    this.instanceId = `BCM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // PERFORMANCE: Global broadcast deduplication - prevent multiple components from processing same broadcast
    if (!window.__broadcastManagerDeduplication) {
      window.__broadcastManagerDeduplication = new Set();
    }

    // Store singleton instance
    BroadcastCacheManager.instance = this;
    console.log(`🚀 [BCM] BroadcastCacheManager initialized as singleton: ${this.instanceId}`);

    // Endpoint patterns for URL matching
    this.endpointPatterns = {
      event: (eid) => `/live/event/${eid}`,
      media: (eid) => `/live/event/${eid}/media`,
      artists: (eid) => `/live/event/${eid}/artists`,
      bids: (eid, round, easel) => `/live/event/${eid}-${round}-${easel}/bids`
    };
  }

  /**
   * Check if broadcast has already been processed globally (across all components)
   * @param {string} type - Broadcast type
   * @param {string} eventId - Event ID
   * @param {number} timestamp - Broadcast timestamp
   * @param {Array} endpoints - Affected endpoints
   * @returns {boolean} - True if already processed
   */
  isGloballyProcessed(type, eventId, timestamp, endpoints) {
    const broadcastKey = `${type}-${eventId}-${timestamp}-${endpoints?.join(',') || ''}`;

    if (window.__broadcastManagerDeduplication.has(broadcastKey)) {
      this.log(`🔄 [DEDUPLICATION] Broadcast already processed globally: ${type} for ${eventId}`, null, 'DEBUG');
      return true;
    }

    // Add to processed set
    window.__broadcastManagerDeduplication.add(broadcastKey);

    // Cleanup old entries to prevent memory leak
    if (window.__broadcastManagerDeduplication.size > 100) {
      const entries = Array.from(window.__broadcastManagerDeduplication);
      window.__broadcastManagerDeduplication.clear();
      entries.slice(50).forEach(key => window.__broadcastManagerDeduplication.add(key)); // Keep last 50
    }

    return false;
  }

  /**
   * Subscribe to cache invalidation notifications for a specific event
   * @param {string} eventId - Event ID or EID
   * @param {function} onInvalidation - Callback for cache invalidation
   * @param {object} supabase - Supabase client instance
   */
  subscribeToEvent(eventId, onInvalidation, supabase) {
    // Check if already subscribed and cleanup if channel is in error state
    if (this.subscriptions.has(eventId)) {
      const existingChannel = this.subscriptions.get(eventId);
      const channelState = existingChannel?.state;

      if (channelState === 'CHANNEL_ERROR' || channelState === 'CLOSED') {
        this.log(`🔄 Resubscribing to event ${eventId} - previous channel in ${channelState} state`);
        this.unsubscribeFromEvent(eventId, supabase);
      } else {
        this.log(`Already subscribed to event ${eventId} with healthy channel (${channelState})`);
        // Just add the listener to existing subscription
        if (!this.eventListeners.has(eventId)) {
          this.eventListeners.set(eventId, new Set());
        }
        this.eventListeners.get(eventId).add(onInvalidation);
        console.log(`📡 [BCM] Added additional listener for ${eventId}. Total listeners: ${this.eventListeners.get(eventId).size}`);
        return;
      }
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
        // Add dedupe check to prevent double processing
        const eventKey = `${eventId}-${payload?.payload?.timestamp || Date.now()}`;
        if (this.processedEvents?.has(eventKey)) {
          this.log(`🔄 [REALTIME] Skipping duplicate broadcast for ${eventId}`, eventKey, 'DEBUG');
          return;
        }

        // Track processed events (clean up old ones periodically)
        if (!this.processedEvents) {
          this.processedEvents = new Map();
        }
        this.processedEvents.set(eventKey, Date.now());

        // Clean up old processed events (keep last 100)
        if (this.processedEvents.size > 100) {
          const oldestKeys = Array.from(this.processedEvents.keys()).slice(0, 50);
          oldestKeys.forEach(key => this.processedEvents.delete(key));
        }

        // PERFORMANCE: Reduce log noise - only log broadcast reception in debug mode
        this.log(`📡 [REALTIME] Received broadcast for event ${eventId}`, payload, 'DEBUG');
        this.handleRealtimeBroadcast(eventId, payload).catch(error => {
          console.error('Error in handleRealtimeBroadcast:', error);
        });
      })
      .subscribe((status) => {
        this.log(`📡 [REALTIME] Channel ${channelName} status: ${status}`, null, 'DEBUG');

        // Handle channel errors by attempting reconnection
        if (status === 'CHANNEL_ERROR') {
          this.log(`❌ [REALTIME] Channel error for ${eventId}, will retry connection`, null, 'ERROR');
          setTimeout(() => {
            this.log(`🔄 [REALTIME] Retrying connection for ${eventId}`);
            this.subscribeToEvent(eventId, onInvalidation, supabase);
          }, 3000); // 3 second delay before retry
        }
      });

    this.subscriptions.set(eventId, channel);
    this.log(`✅ Subscribed to pg_notify broadcasts for event ${eventId} on channel ${channelName}`, null, 'DEBUG');
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
  async handlePostgresChange(type, eventId, payload) {
    this.log(`📡 [POSTGRES_CHANGES] ${type} notification for event ${eventId}`, payload);

    // Determine which endpoints to invalidate based on the change type
    const endpointsToInvalidate = this.getEndpointsToInvalidate(type, eventId, payload);

    this.log(`🔄 [CACHE] Invalidating ${endpointsToInvalidate.length} endpoints for ${type}`);

    // Invalidate cache for each endpoint
    await Promise.all(endpointsToInvalidate.map(endpoint => this.invalidateEndpoint(endpoint)));

    // Notify all listeners for this event
    const listeners = this.eventListeners.get(eventId);
    if (listeners) {
      const timestamp = Date.now();
      const callbackData = {
        type,
        eventId,
        endpoints: endpointsToInvalidate,
        timestamp
      };

      // PERFORMANCE: Check global deduplication before notifying any listeners
      if (this.isGloballyProcessed(type, eventId, timestamp, endpointsToInvalidate)) {
        return; // Skip if already processed by another component
      }

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
  async handleRealtimeBroadcast(eventId, payload) {
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
        const callbackTimestamp = timestamp || Date.now();
        const callbackData = {
          type,
          eventId,
          endpoints: endpoints || [],
          timestamp: callbackTimestamp
        };

        // PERFORMANCE: Check global deduplication before notifying any listeners
        if (this.isGloballyProcessed(type, eventId, callbackTimestamp, endpoints || [])) {
          return; // Skip if already processed by another component
        }

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
  async handleBroadcastNotification(type, eventId, payload) {
    this.log(`📡 [BROADCAST] ${type} notification for event ${eventId}`, payload);

    // Determine which endpoints to invalidate based on notification type
    const endpointsToInvalidate = this.getEndpointsToInvalidate(type, eventId, payload);

    // Invalidate cache for each endpoint
    await Promise.all(endpointsToInvalidate.map(endpoint => this.invalidateEndpoint(endpoint)));

    // Notify all listeners for this event
    const listeners = this.eventListeners.get(eventId);
    if (listeners) {
      const timestamp = Date.now();
      const notificationData = {
        type,
        eventId,
        endpoints: endpointsToInvalidate,
        payload,
        timestamp
      };

      // PERFORMANCE: Check global deduplication before notifying any listeners
      if (this.isGloballyProcessed(type, eventId, timestamp, endpointsToInvalidate)) {
        return; // Skip if already processed by another component
      }

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

      case 'payment_made':
      case 'artwork_purchased':
      case 'deposit_paid':
        // Payment changes affect main event endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        break;

      case 'auction_opened':
      case 'auction_closed':
      case 'auction_extended':
      case 'timer_updated':
        // Auction status changes affect main event endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        break;

      case 'winner_announced':
      case 'winner_updated':
      case 'round_winner_set':
        // Winner announcements affect main event endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        break;

      case 'round_changed':
      case 'event_status_updated':
        // Event-level changes affect main event endpoint
        endpoints.push(this.endpointPatterns.event(eventId));
        break;

      default:
        // Unknown type, invalidate main event endpoint as fallback
        endpoints.push(this.endpointPatterns.event(eventId));
    }
    
    return endpoints;
  }

  /**
   * Mark an endpoint as invalid in both local cache and PublicDataManager cache
   * @param {string} endpoint - Endpoint URL to invalidate (relative or full URL)
   */
  async invalidateEndpoint(endpoint) {
    // CRITICAL FIX: Coordinate with PublicDataManager's cache system
    // Import PublicDataManager to invalidate its cache too
    let publicDataManagerInvalidated = false;

    try {
      // Dynamic import to avoid circular dependencies
      const { publicDataManager } = await import('../lib/PublicDataManager');

      // Map endpoint paths to PublicDataManager cache keys
      const cacheKeyMappings = [
        // Main event endpoint
        { pattern: /^\/live\/event\/([^\/]+)$/, keyFn: (match) => `event-${match[1]}` },
        { pattern: /^https:\/\/artb\.art\/live\/event\/([^\/]+)$/, keyFn: (match) => `event-${match[1]}` },

        // Media endpoint
        { pattern: /^\/live\/event\/([^\/]+)\/media$/, keyFn: (match) => `event-media-${match[1]}` },
        { pattern: /^https:\/\/artb\.art\/live\/event\/([^\/]+)\/media$/, keyFn: (match) => `event-media-${match[1]}` },

        // Artists endpoint (CRITICAL FIX: Missing pattern for round_contestants updates)
        { pattern: /^\/live\/event\/([^\/]+)\/artists$/, keyFn: (match) => `event-artists-${match[1]}` },
        { pattern: /^https:\/\/artb\.art\/live\/event\/([^\/]+)\/artists$/, keyFn: (match) => `event-artists-${match[1]}` },

        // Bid endpoints
        { pattern: /^\/live\/event\/([^-]+)-(\d+)-(\d+)\/bids$/, keyFn: (match) => `artwork-bids-${match[1]}-${match[2]}-${match[3]}` },
        { pattern: /^https:\/\/artb\.art\/live\/event\/([^-]+)-(\d+)-(\d+)\/bids$/, keyFn: (match) => `artwork-bids-${match[1]}-${match[2]}-${match[3]}` }
      ];

      for (const mapping of cacheKeyMappings) {
        const match = endpoint.match(mapping.pattern);
        if (match) {
          const cacheKey = mapping.keyFn(match);
          publicDataManager.invalidateCache(cacheKey);
          this.log(`✅ [CACHE] Invalidated PublicDataManager cache: ${cacheKey} for endpoint ${endpoint}`);
          publicDataManagerInvalidated = true;
          break;
        }
      }
    } catch (error) {
      this.log(`⚠️ [CACHE] Failed to invalidate PublicDataManager cache:`, error.message, 'WARN');
    }

    // Also invalidate local BroadcastCacheManager cache (existing logic)
    const variants = [
      endpoint,  // Original (usually relative path like "/live/event/AB3028-2-3/bids")
      `https://artb.art${endpoint}`, // Full URL variant
    ];

    let localInvalidated = false;

    for (const variant of variants) {
      const cacheEntry = this.endpointCache.get(variant);
      if (cacheEntry) {
        cacheEntry.isValid = false;
        cacheEntry.invalidatedAt = Date.now();
        this.log(`❌ [CACHE] Invalidated local cache: ${variant}`, null, 'DEBUG');
        localInvalidated = true;
      }
    }

    // Log results
    if (publicDataManagerInvalidated || localInvalidated) {
      this.log(`✅ [CACHE] Successfully invalidated endpoint ${endpoint} (PublicDataManager: ${publicDataManagerInvalidated}, Local: ${localInvalidated})`, null, 'DEBUG');
    } else {
      this.log(`⚠️  [CACHE] Endpoint not found in any cache (tried ${variants.length} variants): ${endpoint}`, null, 'DEBUG');
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
   * Internal logging method with log levels
   * @param {string} message - Log message
   * @param {any} data - Optional data to log
   * @param {string} level - Log level: DEBUG, INFO, WARN, ERROR
   */
  log(message, data = null, level = 'DEBUG') {
    const levelTag = `[${level}]`;
    const fullMessage = `${levelTag} [BroadcastCacheManager] ${message}`;

    if (level === 'ERROR') {
      if (data) {
        console.error(fullMessage, data);
      } else {
        console.error(fullMessage);
      }
    } else if (level === 'WARN') {
      if (data) {
        console.warn(fullMessage, data);
      } else {
        console.warn(fullMessage);
      }
    } else if (level === 'INFO') {
      // PRODUCTION: Only show INFO logs for critical broadcast events
      if (data) {
        console.log(fullMessage, data);
      } else {
        console.log(fullMessage);
      }
    }
    // PRODUCTION: DEBUG logs disabled to reduce console spam
  }

  /**
   * Get singleton instance (static method)
   */
  static getInstance() {
    if (!BroadcastCacheManager.instance) {
      new BroadcastCacheManager();
    }
    return BroadcastCacheManager.instance;
  }
}

// Create singleton instance
export const broadcastCacheManager = new BroadcastCacheManager();

// Debug mode disabled for production performance
broadcastCacheManager.setDebugMode(false);