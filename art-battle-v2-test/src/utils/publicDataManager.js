class PublicDataManager {
  constructor() {
    this.cache = new Map()
    this.cacheExpiry = new Map()
    this.baseUrl = 'https://artb.art/live'
    this.broadcastChannel = null
    this.broadcastSubscriptions = new Set()
    this.isInitialized = false
    
    console.log('🔧 [PublicDataManager] Initializing V2 Public Data Manager')
    console.log('🔧 [PublicDataManager] Base URL:', this.baseUrl)
    console.log('🔧 [PublicDataManager] Cache TTL: event=30s, events-list=60s, bids=15s, votes=20s')
    
    this.initializeBroadcastListener()
  }
  
  initializeBroadcastListener() {
    try {
      // Initialize broadcast channel for real-time cache invalidation
      this.broadcastChannel = new BroadcastChannel('art-battle-cache')
      
      this.broadcastChannel.onmessage = (event) => {
        const { type, payload, timestamp } = event.data
        console.log('📡 [PublicDataManager] Broadcast received:', {
          type,
          payload,
          timestamp: new Date(timestamp).toISOString(),
          receivedAt: new Date().toISOString()
        })
        
        this.handleBroadcastMessage(type, payload)
      }
      
      console.log('📡 [PublicDataManager] Broadcast channel initialized successfully')
      console.log('📡 [PublicDataManager] Listening on channel: art-battle-cache')
      this.isInitialized = true
    } catch (error) {
      console.warn('📡 [PublicDataManager] Broadcast channel not supported:', error)
      this.isInitialized = true
    }
  }
  
  handleBroadcastMessage(type, payload) {
    switch (type) {
      case 'CACHE_INVALIDATE':
        console.log('🗑️  [PublicDataManager] Cache invalidation requested:', payload)
        if (payload.pattern) {
          this.invalidateCache(payload.pattern)
          console.log('🗑️  [PublicDataManager] Cache invalidated for pattern:', payload.pattern)
        } else if (payload.eventId) {
          this.invalidateEventCache(payload.eventId)
          console.log('🗑️  [PublicDataManager] Event cache invalidated:', payload.eventId)
        }
        break
        
      case 'VOTE_UPDATE':
        console.log('🗳️  [PublicDataManager] Vote update broadcast received:', payload)
        this.invalidateEventCache(payload.eventId)
        break
        
      case 'BID_UPDATE':
        console.log('💰 [PublicDataManager] Bid update broadcast received:', payload)
        this.invalidateEventCache(payload.eventId)
        break
        
      case 'EVENT_UPDATE':
        console.log('🎨 [PublicDataManager] Event update broadcast received:', payload)
        this.invalidateEventCache(payload.eventId)
        this.invalidateCache('events-list')
        break
        
      default:
        console.log('❓ [PublicDataManager] Unknown broadcast type:', type, payload)
    }
  }
  
  invalidateEventCache(eventId) {
    const patterns = [`event-${eventId}`, `bids-${eventId}`, `votes-${eventId}`]
    patterns.forEach(pattern => {
      if (this.cache.has(pattern)) {
        this.cache.delete(pattern)
        this.cacheExpiry.delete(pattern)
        console.log('🗑️  [PublicDataManager] Invalidated cache entry:', pattern)
      }
    })
  }
  
  async fetchEventData(eventId) {
    const cacheKey = `event-${eventId}`
    const cacheStatus = this.getCacheEntryStatus(cacheKey)
    
    console.log(`🎨 [PublicDataManager] fetchEventData(${eventId})`, cacheStatus)
    
    if (this.isCacheValid(cacheKey)) {
      console.log(`✅ [PublicDataManager] Cache HIT for ${cacheKey}`, {
        expiresIn: Math.round((this.cacheExpiry.get(cacheKey) - Date.now()) / 1000) + 's'
      })
      return this.cache.get(cacheKey)
    }
    
    try {
      console.log(`🌐 [PublicDataManager] Cache MISS - fetching ${this.baseUrl}/event/${eventId}`)
      const response = await fetch(`${this.baseUrl}/event/${eventId}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      const expiryTime = Date.now() + 30000
      
      this.cache.set(cacheKey, data)
      this.cacheExpiry.set(cacheKey, expiryTime)
      
      console.log(`💾 [PublicDataManager] Cached ${cacheKey}`, {
        dataSize: JSON.stringify(data).length + ' chars',
        expiresAt: new Date(expiryTime).toISOString(),
        ttl: '30s'
      })
      
      return data
    } catch (error) {
      console.error(`❌ [PublicDataManager] Failed to fetch event ${eventId}:`, error)
      
      const staleData = this.cache.get(cacheKey)
      if (staleData) {
        console.warn(`⚠️  [PublicDataManager] Using stale cached data for ${cacheKey}`)
        return staleData
      }
      
      throw error
    }
  }
  
  async fetchEventsList() {
    const cacheKey = 'events-list'
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/events`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      this.cache.set(cacheKey, data)
      this.cacheExpiry.set(cacheKey, Date.now() + 60000)
      
      return data
    } catch (error) {
      console.error('Failed to fetch events list:', error)
      
      const staleData = this.cache.get(cacheKey)
      if (staleData) {
        console.warn('Using stale cached events list due to fetch error')
        return staleData
      }
      
      throw error
    }
  }
  
  async fetchEventBids(eventId) {
    const cacheKey = `bids-${eventId}`
    const cacheStatus = this.getCacheEntryStatus(cacheKey)
    
    console.log(`💰 [PublicDataManager] fetchEventBids(${eventId})`, cacheStatus)
    
    if (this.isCacheValid(cacheKey)) {
      console.log(`✅ [PublicDataManager] Cache HIT for ${cacheKey}`, {
        expiresIn: Math.round((this.cacheExpiry.get(cacheKey) - Date.now()) / 1000) + 's'
      })
      return this.cache.get(cacheKey)
    }
    
    try {
      console.log(`🌐 [PublicDataManager] Cache MISS - fetching ${this.baseUrl}/bids/${eventId}`)
      const response = await fetch(`${this.baseUrl}/bids/${eventId}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      const expiryTime = Date.now() + 15000
      
      this.cache.set(cacheKey, data)
      this.cacheExpiry.set(cacheKey, expiryTime)
      
      console.log(`💾 [PublicDataManager] Cached ${cacheKey}`, {
        bidsCount: data.bids?.length || 0,
        expiresAt: new Date(expiryTime).toISOString(),
        ttl: '15s'
      })
      
      return data
    } catch (error) {
      console.error(`❌ [PublicDataManager] Failed to fetch bids for event ${eventId}:`, error)
      
      const staleData = this.cache.get(cacheKey)
      if (staleData) {
        console.warn(`⚠️  [PublicDataManager] Using stale cached bids for ${cacheKey}`)
        return staleData
      }
      
      throw error
    }
  }
  
  async fetchEventVotes(eventId) {
    const cacheKey = `votes-${eventId}`
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/votes/${eventId}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      this.cache.set(cacheKey, data)
      this.cacheExpiry.set(cacheKey, Date.now() + 20000)
      
      return data
    } catch (error) {
      console.error(`Failed to fetch votes for event ${eventId}:`, error)
      
      const staleData = this.cache.get(cacheKey)
      if (staleData) {
        console.warn('Using stale cached votes due to fetch error')
        return staleData
      }
      
      throw error
    }
  }
  
  isCacheValid(key) {
    const expiry = this.cacheExpiry.get(key)
    return expiry && Date.now() < expiry
  }
  
  getCacheEntryStatus(key) {
    const hasEntry = this.cache.has(key)
    const expiry = this.cacheExpiry.get(key)
    const isValid = this.isCacheValid(key)
    
    return {
      exists: hasEntry,
      valid: isValid,
      expired: hasEntry && !isValid,
      expiresAt: expiry ? new Date(expiry).toISOString() : null,
      age: expiry ? Math.round((Date.now() - (expiry - 30000)) / 1000) + 's' : null
    }
  }
  
  invalidateCache(pattern) {
    console.log(`🗑️  [PublicDataManager] Invalidating cache pattern: ${pattern}`)
    let invalidatedCount = 0
    
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
        this.cacheExpiry.delete(key)
        invalidatedCount++
        console.log(`🗑️  [PublicDataManager] Invalidated: ${key}`)
      }
    }
    
    console.log(`🗑️  [PublicDataManager] Invalidated ${invalidatedCount} cache entries for pattern: ${pattern}`)
  }
  
  clearAllCache() {
    const entriesBefore = this.cache.size
    this.cache.clear()
    this.cacheExpiry.clear()
    console.log(`🗑️  [PublicDataManager] Cleared all cache (${entriesBefore} entries)`)
  }
  
  sendBroadcast(type, payload) {
    if (this.broadcastChannel) {
      const message = {
        type,
        payload,
        timestamp: Date.now()
      }
      this.broadcastChannel.postMessage(message)
      console.log(`📡 [PublicDataManager] Broadcast sent:`, message)
    }
  }
  
  getCacheStats() {
    const stats = {
      totalEntries: this.cache.size,
      broadcastChannel: !!this.broadcastChannel,
      initialized: this.isInitialized,
      entries: Array.from(this.cache.keys()).map(key => ({
        key,
        expires: new Date(this.cacheExpiry.get(key)),
        isExpired: !this.isCacheValid(key),
        expiresIn: this.isCacheValid(key) ? Math.round((this.cacheExpiry.get(key) - Date.now()) / 1000) : 0
      }))
    }
    
    console.log('📊 [PublicDataManager] Cache Stats:', stats)
    return stats
  }
  
  logCacheStatus() {
    console.log('📊 [PublicDataManager] === CACHE STATUS ===')
    console.log('📊 [PublicDataManager] Total entries:', this.cache.size)
    console.log('📊 [PublicDataManager] Broadcast channel:', this.broadcastChannel ? 'ACTIVE' : 'INACTIVE')
    console.log('📊 [PublicDataManager] Initialized:', this.isInitialized)
    
    this.cache.forEach((value, key) => {
      const expiry = this.cacheExpiry.get(key)
      const isValid = this.isCacheValid(key)
      const expiresIn = isValid ? Math.round((expiry - Date.now()) / 1000) : 0
      
      console.log(`📊 [PublicDataManager] ${key}:`, {
        status: isValid ? 'VALID' : 'EXPIRED',
        expiresIn: isValid ? `${expiresIn}s` : 'expired',
        expiresAt: new Date(expiry).toISOString()
      })
    })
    
    console.log('📊 [PublicDataManager] === END CACHE STATUS ===')
  }
}

export const publicDataManager = new PublicDataManager()