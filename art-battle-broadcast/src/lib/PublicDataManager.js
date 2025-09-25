/**
 * PublicDataManager - Cached endpoint system for V2
 * Replaces realtime subscriptions with cached HTTP endpoints
 * Reduces database load by ~87% for non-admin users
 * SECURITY: NO DIRECT DATABASE QUERIES - CACHED ENDPOINTS ONLY
 */

class PublicDataManager {
  constructor() {
    // Prevent duplicate initialization - true singleton pattern
    if (PublicDataManager.instance) {
      console.log('🔄 [V2-BROADCAST-DEBUG] PublicDataManager already exists, returning existing instance');
      console.log('🔍 [V2-BROADCAST-DEBUG] Existing instance ID:', PublicDataManager.instance._instanceId);
      return PublicDataManager.instance;
    }

    // DEBUG: Track instance creation
    this._instanceId = Math.random().toString(36).substr(2, 9);
    console.log('🆔 [V2-BROADCAST-DEBUG] Creating new PublicDataManager instance:', this._instanceId);

    this.cache = new Map();
    this.subscribers = new Map();
    this.refreshIntervals = new Map();
    this.broadcastChannel = new BroadcastChannel('artbattle-data');
    this.initialized = true;

    // GLOBAL STATE: Single source of truth for ALL components
    this.globalState = new Map(); // eventId -> { currentBids, artworks, artworksByRound, bidHistory, event, roundWinners }
    this.stateSubscribers = new Map(); // eventId -> Set of callback functions
    this.updateCounter = new Map(); // eventId -> update count for debugging

    // Listen for cache invalidation from other tabs/admin actions
    this.broadcastChannel.addEventListener('message', (event) => {
      if (event.data.type === 'invalidate') {
        console.log('🔄 [V2-BROADCAST] Cache invalidated:', event.data.key);
        this.invalidateCache(event.data.key);
      }
    });

    // Store instance reference
    PublicDataManager.instance = this;

    // SINGLETON ENFORCEMENT: Store on window for absolute global uniqueness
    if (typeof window !== 'undefined') {
      if (window._artBattlePublicDataManager && window._artBattlePublicDataManager._instanceId !== this._instanceId) {
        console.error('🚨 [SINGLETON-ERROR] Multiple PublicDataManager instances detected!', {
          existing: window._artBattlePublicDataManager._instanceId,
          new: this._instanceId
        });
      }
      window._artBattlePublicDataManager = this;
      console.log('🌍 [SINGLETON-DEBUG] PublicDataManager registered globally:', this._instanceId);
    }

    console.log('🚀 [V2-BROADCAST] PublicDataManager initialized - Using cached endpoints instead of realtime subscriptions');
  }

  /**
   * Get events data with caching
   */
  async getEvents() {
    const cacheKey = 'events';
    const cached = this.cache.get(cacheKey);
    
    if (cached) { // Use cached data if available - no expiration
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

      // SECURITY FIX: NO DIRECT DATABASE QUERIES FROM FRONTEND
      // The cached endpoint should already include id, enable_auction, vote_by_link
      // If these fields are missing, the cached endpoint needs to be updated, not bypassed
      const data = cachedEvents.map(event => ({
        ...event,
        // Ensure required fields exist with fallback values if cached endpoint doesn't provide them
        id: event.id || event.uuid || null,
        enable_auction: event.enable_auction !== undefined ? event.enable_auction : true,
        vote_by_link: event.vote_by_link !== undefined ? event.vote_by_link : false
      })).filter(event => event.id || event.eid); // Include events with either UUID or EID
      
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
   * Get cache versions for all endpoints related to an event
   * SECURITY: NO DATABASE QUERIES - Return empty versions to use basic URLs
   */
  async getCacheVersions(eventEid) {
    console.log(`📋 [V2-BROADCAST] Cache versions disabled for security - using basic URLs for event ${eventEid}`);
    return new Map(); // Always return empty map - will use basic URLs without versioning
  }

  /**
   * Build URL with cache version if available
   */
  buildVersionedUrl(baseUrl, cacheVersions, endpointPath) {
    const version = cacheVersions.get(endpointPath);
    if (version) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}v=${version}`;
    }
    return baseUrl; // No cache version - use basic URL
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

      // CRITICAL: Notify subscribers that fresh media data is available
      this.notifySubscribers(cacheKey, data);

      return data;
    } catch (error) {
      console.error(`❌ [V2-BROADCAST] Failed to fetch media for ${eventEid}:`, error);
      return null;
    }
  }

  /**
   * Get artwork bids with cache versions
   */
  async getArtworkBidsWithVersions(eventEid, round, easel, cacheVersions) {
    const endpointPath = `/live/event/${eventEid}-${round}-${easel}/bids`;
    const baseUrl = `https://artb.art${endpointPath}`;
    const versionedUrl = this.buildVersionedUrl(baseUrl, cacheVersions, endpointPath);
    
    try {
      console.log(`🌐 [V2-BROADCAST] Fetching bids for ${eventEid}-${round}-${easel} with versioned URL: ${versionedUrl}`);
      const response = await fetch(versionedUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`✅ [V2-BROADCAST] Bid data for ${eventEid}-${round}-${easel} loaded with cache version`);

      // CRITICAL: Notify subscribers that fresh bid data is available
      const cacheKey = `artwork-bids-${eventEid}-${round}-${easel}`;
      this.notifySubscribers(cacheKey, data);

      return data;
    } catch (error) {
      console.warn(`⚠️ [V2-BROADCAST] Versioned bid fetch failed, falling back to basic method:`, error);
      return await this.getArtworkBids(eventEid, round, easel);
    }
  }

  /**
   * Get artwork bids with caching (fallback method)
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

      // CRITICAL: Notify subscribers that fresh bid data is available
      this.notifySubscribers(cacheKey, data);

      return data;
    } catch (error) {
      console.error(`❌ [V2-BROADCAST] Failed to fetch bids for ${eventEid}-${round}-${easel}:`, error);
      return null;
    }
  }

  /**
   * Get event details with cache versions (preferred for initial loads)
   */
  async getEventWithVersions(eventId) {
    try {
      // First, get basic event data to resolve EID (if eventId is UUID)
      console.log(`🌐 [V2-BROADCAST] Fetching basic event data to resolve EID for ${eventId}`);
      const basicResponse = await fetch(`https://artb.art/live/event/${eventId}`);
      
      if (!basicResponse.ok) {
        throw new Error(`HTTP ${basicResponse.status}: ${basicResponse.statusText}`);
      }
      
      const basicEventData = await basicResponse.json();
      const eventEid = basicEventData.event?.eid || eventId; // Use EID if available, fallback to original eventId
      
      console.log(`🌐 [V2-BROADCAST] Resolved EID: ${eventEid} for eventId: ${eventId}`);
      
      // Now get cache versions using the EID
      const cacheVersions = await this.getCacheVersions(eventEid);
      
      // Use versioned URLs for all requests (using original eventId for URLs, EID for cache versions)
      const eventUrl = this.buildVersionedUrl(`https://artb.art/live/event/${eventId}`, cacheVersions, `/live/event/${eventEid}`);
      const mediaUrl = this.buildVersionedUrl(`https://artb.art/live/event/${eventId}/media`, cacheVersions, `/live/event/${eventEid}/media`);
      
      console.log(`🌐 [V2-BROADCAST] Fetching event ${eventId} with versioned URLs using EID ${eventEid}`);
      console.log(`🌐 [V2-BROADCAST] Event URL: ${eventUrl}`);
      console.log(`🌐 [V2-BROADCAST] Media URL: ${mediaUrl}`);
      
      // Fetch event data with cache version (if same as basic fetch, use that data)
      let eventData = basicEventData;
      if (eventUrl !== `https://artb.art/live/event/${eventId}`) {
        const response = await fetch(eventUrl);
        if (response.ok) {
          eventData = await response.json();
        }
      }
      
      // Fetch media data with cache version
      let mediaData = null;
      try {
        const mediaResponse = await fetch(mediaUrl);
        if (mediaResponse.ok) {
          mediaData = await mediaResponse.json();
        }
      } catch (mediaError) {
        console.warn('⚠️ [V2-BROADCAST] Media fetch failed, continuing without images:', mediaError);
      }
      
      // Return combined data
      return {
        ...eventData,
        media: mediaData,
        cacheVersions // Include versions for bid loading
      };
      
    } catch (error) {
      console.warn('⚠️ [V2-BROADCAST] Versioned fetch failed, falling back to basic getEvent:', error);
      return await this.getEvent(eventId);
    }
  }

  /**
   * Get event details with caching (fallback method)
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
    
    // No auto-polling - removed to prevent constant API calls and flickering
    console.log(`📡 [V2-BROADCAST] Subscribed to ${key} (manual refresh only)`);
    
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
      } else if (key.startsWith('event-media-')) {
        // Handle media cache keys: event-media-AB6091 -> getEventMedia(AB6091)
        const eventEid = key.replace('event-media-', '');
        await this.getEventMedia(eventEid);
      } else if (key.startsWith('event-artists-')) {
        // Handle artist cache keys: event-artists-AB6091 -> getEvent(AB6091)
        const eventEid = key.replace('event-artists-', '');
        await this.getEvent(eventEid);
      } else if (key.startsWith('artwork-bids-')) {
        // Handle bid cache keys: artwork-bids-AB6091-2-1 -> getArtworkBids(AB6091, 2, 1)
        const parts = key.replace('artwork-bids-', '').split('-');
        if (parts.length >= 3) {
          const eventEid = parts[0];
          const round = parseInt(parts[1]);
          const easel = parseInt(parts[2]);
          await this.getArtworkBids(eventEid, round, easel);
        }
      } else if (key.startsWith('event-')) {
        // Handle main event cache keys: event-AB6091 -> getEvent(AB6091)
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
   * Get singleton instance (static method)
   */
  static getInstance() {
    if (!PublicDataManager.instance) {
      new PublicDataManager();
    }
    return PublicDataManager.instance;
  }

  // ==================== GLOBAL STATE MANAGEMENT ====================

  /**
   * Initialize global state for an event
   */
  initializeEventState(eventId) {
    if (!this.globalState.has(eventId)) {
      this.globalState.set(eventId, {
        currentBids: {},
        artworks: [],
        artworksByRound: {},
        bidHistory: {},
        event: null,
        roundWinners: {},
        loading: true,
        error: null
      });
      this.stateSubscribers.set(eventId, new Set());
      console.log(`🎯 [GLOBAL-STATE] Initialized state for event ${eventId}`);
    }
    return this.globalState.get(eventId);
  }

  /**
   * Get current state for an event
   */
  getEventState(eventId) {
    return this.globalState.get(eventId) || this.initializeEventState(eventId);
  }

  /**
   * Update global state and notify all subscribers
   */
  updateEventState(eventId, updates) {
    const currentState = this.getEventState(eventId);

    // DEBUG: Check for array corruption
    if (Array.isArray(currentState)) {
      console.error('🚨 [GLOBAL-STATE] currentState is unexpectedly an array:', currentState);
    }
    if (Array.isArray(updates)) {
      console.error('🚨 [GLOBAL-STATE] updates is unexpectedly an array:', updates);
    }

    const newState = { ...currentState, ...updates };
    this.globalState.set(eventId, newState);

    // DEBUG: Track update frequency
    const currentCount = (this.updateCounter.get(eventId) || 0) + 1;
    this.updateCounter.set(eventId, currentCount);

    console.log(`🔄 [GLOBAL-STATE] Updated state for ${eventId} (${currentCount}):`, Array.isArray(updates) ? `ARRAY (${updates.length})` : Object.keys(updates));

    // DEBUG: Show call stack for excessive updates
    if (currentCount > 10) {
      console.trace('📍 [STATE-DEBUG] EXCESSIVE UPDATES - called from:');
    }

    // Notify all subscribed components
    const subscribers = this.stateSubscribers.get(eventId) || new Set();

    subscribers.forEach((callback, index) => {
      try {
        callback(newState);
      } catch (error) {
        console.error(`❌ [GLOBAL-STATE] Error in subscriber callback:`, error);
      }
    });
  }

  /**
   * Subscribe to state changes for an event
   */
  subscribeToEventState(eventId, callback) {
    const state = this.getEventState(eventId);
    const subscribers = this.stateSubscribers.get(eventId) || new Set();

    // DEBUG: Add callback tracking to identify competing components
    const callbackId = Math.random().toString(36).substr(2, 9);
    callback._debugId = callbackId;

    subscribers.add(callback);
    this.stateSubscribers.set(eventId, subscribers);

    console.log(`📡 [GLOBAL-STATE] Component subscribed to event ${eventId} (${subscribers.size} total)`);

    // Return current state immediately
    try {
      callback(state);
    } catch (error) {
      console.error(`❌ [GLOBAL-STATE] Error delivering initial state:`, error);
    }

    // Return unsubscribe function
    return () => {
      subscribers.delete(callback);
      console.log(`🔇 [GLOBAL-STATE] Component unsubscribed from event ${eventId} (${subscribers.size} remaining)`);
    };
  }

  /**
   * Update current bids for an event
   */
  updateCurrentBids(eventId, artworkId, bidData) {
    console.log(`💰 [GLOBAL-STATE] Updated bid for ${artworkId}: $${bidData.amount}`);

    const currentState = this.getEventState(eventId);
    const newCurrentBids = {
      ...currentState.currentBids,
      [artworkId]: bidData
    };

    this.updateEventState(eventId, { currentBids: newCurrentBids });
  }

  /**
   * Update artworks data for an event
   */
  updateArtworks(eventId, artworks, artworksByRound = null) {
    const updates = { artworks };
    if (artworksByRound) {
      updates.artworksByRound = artworksByRound;
    }
    this.updateEventState(eventId, updates);
    console.log(`🎨 [GLOBAL-STATE] Updated ${artworks.length} artworks for ${eventId}`);
  }

  /**
   * Update bid history for an artwork
   */
  updateBidHistory(eventId, artworkId, bids) {
    const currentState = this.getEventState(eventId);
    const newBidHistory = {
      ...currentState.bidHistory,
      [artworkId]: bids
    };

    this.updateEventState(eventId, { bidHistory: newBidHistory });
    console.log(`📊 [GLOBAL-STATE] Updated bid history for ${artworkId}: ${bids.length} bids`);
  }

  /**
   * Update round winners for an event
   */
  updateRoundWinners(eventId, roundWinners) {
    this.updateEventState(eventId, { roundWinners });
    console.log(`🏆 [GLOBAL-STATE] Updated round winners for ${eventId}:`, Object.keys(roundWinners).length, 'rounds');
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
    this.globalState.clear();
    this.stateSubscribers.clear();

    // Close broadcast channel
    this.broadcastChannel.close();

    // Clear singleton instance reference
    PublicDataManager.instance = null;
  }
}

// SINGLETON PATTERN: Create a single instance at module load time
// This ensures only one instance exists regardless of import patterns
let singletonInstance = null;

// Check for existing global instance first
if (typeof window !== 'undefined' && window._artBattlePublicDataManager) {
  console.log('♻️ [SINGLETON-DEBUG] Using existing global singleton:', window._artBattlePublicDataManager._instanceId);
  singletonInstance = window._artBattlePublicDataManager;
} else if (!singletonInstance) {
  console.log('🚀 [SINGLETON-DEBUG] Creating module-level PublicDataManager singleton');
  singletonInstance = new PublicDataManager();
  console.log('✅ [SINGLETON-DEBUG] Module-level singleton created:', singletonInstance._instanceId);
} else {
  console.log('♻️ [SINGLETON-DEBUG] Using existing module-level singleton:', singletonInstance._instanceId);
}

// Export singleton instance
export const publicDataManager = singletonInstance;
export default singletonInstance;