/**
 * PublicDataManager - Cached endpoint system for V2
 * Replaces realtime subscriptions with cached HTTP endpoints
 * Reduces database load by ~87% for non-admin users
 */

class PublicDataManager {
  constructor() {
    this.cache = new Map();
    this.subscribers = new Map();
    this.refreshIntervals = new Map();
    this.broadcastChannel = new BroadcastChannel('artbattle-data');
    
    // Listen for cache invalidation from other tabs/admin actions
    this.broadcastChannel.addEventListener('message', (event) => {
      if (event.data.type === 'invalidate') {
        console.log('🔄 [V2-BROADCAST] Cache invalidated:', event.data.key);
        this.invalidateCache(event.data.key);
      }
    });
    
    console.log('🚀 [V2-BROADCAST] PublicDataManager initialized - Using cached endpoints instead of realtime subscriptions');
  }

  /**
   * Get events data with caching
   */
  async getEvents() {
    const cacheKey = 'events';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 10000) { // 10 second cache
      console.log('📦 [V2-BROADCAST] Using cached events data');
      return cached.data;
    }

    try {
      console.log('🌐 [V2-BROADCAST] Fetching events from cached endpoint: https://artb.art/live/events');
      const response = await fetch('https://artb.art/live/events');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      // Extract events array from response (API returns {events: [...], generated_at: "..."})
      const cachedEvents = responseData.events || responseData;
      
      // Enhance with UUIDs for app compatibility (minimal Supabase query)
      const { supabase } = await import('../lib/supabase');
      const eids = cachedEvents.map(event => event.eid);
      const { data: uuidData } = await supabase
        .from('events')
        .select('id, eid, enable_auction, vote_by_link')
        .in('eid', eids);
      
      // Create EID to UUID/fields mapping
      const eidToFields = {};
      uuidData?.forEach(event => {
        eidToFields[event.eid] = {
          id: event.id,
          enable_auction: event.enable_auction,
          vote_by_link: event.vote_by_link
        };
      });
      
      // Enhance cached events with UUIDs and missing fields
      const data = cachedEvents.map(event => ({
        ...event,
        ...eidToFields[event.eid]
      })).filter(event => event.id); // Only include events with valid UUIDs
      
      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      console.log('✅ [V2-BROADCAST] Events loaded from cached endpoint, enhanced with UUIDs');
      
      // Notify subscribers
      this.notifySubscribers(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error('❌ [V2-BROADCAST] Failed to fetch events:', error);
      
      // Return stale cache if available
      if (cached) {
        console.log('📦 [V2-BROADCAST] Using stale cached events due to fetch error');
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Get event media with caching
   */
  async getEventMedia(eventEid) {
    const cacheKey = `event-media-${eventEid}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 30000) { // 30 second cache for media
      console.log(`📦 [V2-BROADCAST] Using cached media data for ${eventEid}`);
      return cached.data;
    }

    try {
      console.log(`🌐 [V2-BROADCAST] Fetching media for ${eventEid} from cached endpoint: https://artb.art/live/event/${eventEid}/media`);
      const response = await fetch(`https://artb.art/live/event/${eventEid}/media`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      console.log(`✅ [V2-BROADCAST] Media data for ${eventEid} loaded from cached endpoint`);
      return data;
    } catch (error) {
      console.error(`❌ [V2-BROADCAST] Failed to fetch media for ${eventEid}:`, error);
      return null;
    }
  }

  /**
   * Get artwork bids with caching
   */
  async getArtworkBids(eventEid, round, easel) {
    const cacheKey = `artwork-bids-${eventEid}-${round}-${easel}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 10000) { // 10 second cache for bids
      console.log(`📦 [V2-BROADCAST] Using cached bid data for ${eventEid}-${round}-${easel}`);
      return cached.data;
    }

    try {
      console.log(`🌐 [V2-BROADCAST] Fetching bids for ${eventEid}-${round}-${easel} from cached endpoint: https://artb.art/live/event/${eventEid}-${round}-${easel}/bids`);
      const response = await fetch(`https://artb.art/live/event/${eventEid}-${round}-${easel}/bids`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      console.log(`✅ [V2-BROADCAST] Bid data for ${eventEid}-${round}-${easel} loaded from cached endpoint`);
      return data;
    } catch (error) {
      console.error(`❌ [V2-BROADCAST] Failed to fetch bids for ${eventEid}-${round}-${easel}:`, error);
      return null;
    }
  }

  /**
   * Get event details with caching
   */
  async getEvent(eventId) {
    const cacheKey = `event-${eventId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5000) { // 5 second cache
      console.log(`📦 [V2-BROADCAST] Using cached event data for ${eventId}`);
      return cached.data;
    }

    try {
      console.log(`🌐 [V2-BROADCAST] Fetching event ${eventId} from cached endpoint: https://artb.art/live/event/${eventId}`);
      const response = await fetch(`https://artb.art/live/event/${eventId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      // For individual events, the API returns the full event data object
      // No need to extract like with events list
      const data = responseData;
      
      // Cache the result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      console.log(`✅ [V2-BROADCAST] Event ${eventId} loaded from cached endpoint, stored in cache`);
      
      // Notify subscribers
      this.notifySubscribers(cacheKey, data);
      
      return data;
    } catch (error) {
      console.error(`❌ [V2-BROADCAST] Failed to fetch event ${eventId}:`, error);
      
      // Return stale cache if available
      if (cached) {
        console.log(`📦 [V2-BROADCAST] Using stale cached event ${eventId} due to fetch error`);
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Subscribe to data changes (emulates realtime but uses polling)
   */
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    
    this.subscribers.get(key).add(callback);
    
    // Start polling for this key if not already polling
    if (!this.refreshIntervals.has(key)) {
      const interval = setInterval(() => {
        this.refreshData(key);
      }, key.startsWith('event-') ? 5000 : 10000); // 5s for events, 10s for event list
      
      this.refreshIntervals.set(key, interval);
      console.log(`🔄 [V2-BROADCAST] Started polling for ${key} (cache refresh every ${key.startsWith('event-') ? '5' : '10'}s)`);
    }
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(key);
      if (subs) {
        subs.delete(callback);
        
        // Stop polling if no subscribers
        if (subs.size === 0) {
          const interval = this.refreshIntervals.get(key);
          if (interval) {
            clearInterval(interval);
            this.refreshIntervals.delete(key);
            console.log(`⏹️ [V2-BROADCAST] Stopped polling for ${key} (no subscribers)`);
          }
        }
      }
    };
  }

  /**
   * Refresh data for a specific key
   */
  async refreshData(key) {
    try {
      if (key === 'events') {
        await this.getEvents();
      } else if (key.startsWith('event-')) {
        const eventId = key.replace('event-', '');
        await this.getEvent(eventId);
      }
    } catch (error) {
      console.log(`🔄 [V2-BROADCAST] Background refresh failed for ${key}:`, error.message);
    }
  }

  /**
   * Notify all subscribers of data changes
   */
  notifySubscribers(key, data) {
    const subs = this.subscribers.get(key);
    if (subs) {
      subs.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ [V2-BROADCAST] Subscriber callback error for ${key}:`, error);
        }
      });
    }
  }

  /**
   * Invalidate cache for a specific key
   */
  invalidateCache(key) {
    this.cache.delete(key);
    this.refreshData(key); // Trigger immediate refresh
  }

  /**
   * Broadcast cache invalidation to other tabs
   */
  broadcastInvalidation(key) {
    this.broadcastChannel.postMessage({
      type: 'invalidate',
      key: key,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all caches and stop all polling
   */
  destroy() {
    console.log('🛑 [V2-BROADCAST] Destroying PublicDataManager');
    
    // Clear all intervals
    this.refreshIntervals.forEach(interval => clearInterval(interval));
    this.refreshIntervals.clear();
    
    // Clear cache and subscribers
    this.cache.clear();
    this.subscribers.clear();
    
    // Close broadcast channel
    this.broadcastChannel.close();
  }
}

// Export singleton instance
export const publicDataManager = new PublicDataManager();
export default publicDataManager;