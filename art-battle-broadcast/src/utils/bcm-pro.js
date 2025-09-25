/**
 * Broadcast Cache Manager for V2 System - PRODUCTION OPTIMIZED
 * Handles cache invalidation notifications and endpoint refresh
 * Performance optimized: Minimal logging, efficient deduplication
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

    // OPTIMIZED: Use Set for faster deduplication, automatic cleanup
    this.processedEvents = new Set();
    this.lastCleanup = Date.now();
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
        this.log(`Resubscribing to event ${eventId} - channel ${channelState}`, null, 'WARN');
        this.unsubscribeFromEvent(eventId, supabase);
      } else {
        // Just add the listener to existing subscription
        if (!this.eventListeners.has(eventId)) {
          this.eventListeners.set(eventId, new Set());
        }
        this.eventListeners.get(eventId).add(onInvalidation);
        return;
      }
    }

    // Create event-specific listener set
    if (!this.eventListeners.has(eventId)) {
      this.eventListeners.set(eventId, new Set());
    }
    this.eventListeners.get(eventId).add(onInvalidation);

    // Listen to realtime.send() broadcasts from database triggers
    const channelName = `cache_invalidate_${eventId}`;
    const channel = supabase.channel(channelName)
      .on('broadcast', { event: 'cache_invalidation' }, (payload) => {
        // OPTIMIZED: Fast deduplication with Set
        const eventKey = `${eventId}-${payload?.payload?.timestamp || Date.now()}`;
        if (this.processedEvents.has(eventKey)) {
          return; // Skip duplicate
        }

        // Track processed events
        this.processedEvents.add(eventKey);

        // OPTIMIZED: Efficient cleanup every 5 minutes instead of every 100 events
        const now = Date.now();
        if (now - this.lastCleanup > 300000) { // 5 minutes
          this.processedEvents.clear(); // Simple clear - more efficient than selective deletion
          this.lastCleanup = now;
          this.log('Cleaned processed events cache', null, 'INFO');
        }

        // PRODUCTION: Keep essential broadcast logging for issue tracking
        this.log(`Broadcast received for ${eventId}: ${payload?.payload?.type}`, null, 'INFO');
        this.handleRealtimeBroadcast(eventId, payload);
      })
      .subscribe((status) => {
        this.log(`Channel ${channelName} status: ${status}`, null, 'INFO');

        // Handle channel errors by attempting reconnection
        if (status === 'CHANNEL_ERROR') {
          this.log(`Channel error for ${eventId}, retrying in 3s`, null, 'ERROR');
          setTimeout(() => {
            this.subscribeToEvent(eventId, onInvalidation, supabase);
          }, 3000); // 3 second delay before retry
        }
      });

    this.subscriptions.set(eventId, channel);
    this.log(`Subscribed to broadcasts for event ${eventId}`, null, 'INFO');
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
      this.log(`Unsubscribed from event ${eventId}`, null, 'INFO');
    }
  }

  /**
   * Handle realtime broadcast notifications
   * @param {string} eventId - Event ID
   * @param {object} payload - Broadcast payload
   */
  handleRealtimeBroadcast(eventId, payload) {
    const notificationData = payload?.payload;
    if (!notificationData) {
      this.log('Invalid broadcast payload received', payload, 'WARN');
      return;
    }

    const { type, endpoints = [] } = notificationData;

    // Invalidate cache endpoints efficiently
    let invalidatedCount = 0;
    endpoints.forEach(endpoint => {
      if (this.endpointCache.has(endpoint)) {
        this.endpointCache.delete(endpoint);
        invalidatedCount++;
      }
    });

    this.log(`Cache invalidated: ${invalidatedCount} endpoints for ${type}`, null, 'INFO');

    // Notify listeners
    const listeners = this.eventListeners.get(eventId);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(notificationData);
        } catch (error) {
          this.log('Error in broadcast callback', error.message, 'ERROR');
        }
      });
    }
  }

  /**
   * PRODUCTION: Structured logging with levels
   */
  log(message, data = null, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logPrefix = `[${level}] [BroadcastCache] ${timestamp}`;

    switch (level) {
      case 'ERROR':
        console.error(`${logPrefix} ${message}`, data);
        break;
      case 'WARN':
        console.warn(`${logPrefix} ${message}`, data);
        break;
      case 'INFO':
        // Only log INFO in debug mode or critical events
        if (this.debugMode || message.includes('error') || message.includes('retry')) {
          console.log(`${logPrefix} ${message}`, data);
        }
        break;
    }
  }

  /**
   * Set debug mode - enables verbose logging
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`, null, 'INFO');
  }

  /**
   * Clear all endpoint cache - useful for full refresh
   */
  clearCache() {
    this.endpointCache.clear();
    this.log('All endpoint cache cleared', null, 'INFO');
  }

  /**
   * Get current subscription count - for monitoring
   */
  getSubscriptionCount() {
    return this.subscriptions.size;
  }

  /**
   * Get performance stats - for monitoring
   */
  getStats() {
    return {
      subscriptions: this.subscriptions.size,
      processedEvents: this.processedEvents.size,
      cachedEndpoints: this.endpointCache.size,
      lastCleanup: new Date(this.lastCleanup).toISOString()
    };
  }
}

// Export singleton instance
export const broadcastCacheManager = new BroadcastCacheManager();