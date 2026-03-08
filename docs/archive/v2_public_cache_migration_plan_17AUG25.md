# Art Battle Vote V2: Public Cache Migration Plan
**Date**: August 17, 2025  
**Objective**: Eliminate WAL lag by migrating 87% of users to cached endpoints  
**Strategy**: Parallel V2 system with public cached data and client-side authentication

---

## Executive Summary

This plan creates a **V2 parallel system** that eliminates realtime subscriptions for non-admin users while preserving all authentication and admin functionality from V1. Based on analysis in `comprehensive_rpc_functions_17AUG25.md`, we identified that **admin vote monitoring accounts for 13.5% of database load** despite being only 7.7% of users. By moving 87% of users (non-admins) to cached endpoints, we eliminate the majority of WAL lag while keeping admins on the proven V1 system.

**Key Insight**: Art Battle event data is essentially public during events (attendees can see artworks, votes, bids), so we can cache this data publicly while maintaining security on write operations (vote, bid, payment).

---

## Context: Previous Authentication Work

### **Critical Constraint: Preserve Auth Architecture**
This migration **MUST respect** the authentication troubleshooting documented in:
- `17aug25-seattle.md` - Session management improvements for long-term login persistence
- `CRITICAL_AUTH_ARCHITECTURE_DOCUMENTATION.md` - QR code validation and OTP authentication fixes

**Non-negotiable requirements:**
1. **Shared authentication system** between V1 and V2
2. **Zero changes** to QR scan authentication flow
3. **Zero changes** to direct OTP authentication flow  
4. **Zero changes** to person linking and auth webhook systems
5. **Preserve session management** improvements for weeks-long login sessions

### **Authentication Components to Preserve**
From `CRITICAL_AUTH_ARCHITECTURE_DOCUMENTATION.md`:
- **QR Code System**: `create_event_qr_secret`, `get_event_from_qr_secret`, `has_valid_qr_scan`
- **Person Linking**: `ensure_person_exists`, `ensure_person_linked`, auth webhook triggers
- **Session Management**: JWT refresh, automatic token renewal, session persistence

From `17aug25-seattle.md`:
- **Session refresh mechanisms**: `refreshSessionIfNeeded()`, automatic 45-minute refresh cycles
- **Visibility change handlers**: Session refresh on window focus/visibility
- **Session warning system**: Early expiry warnings for users

---

## Problem Analysis: WAL Lag Root Cause

### **Current Realtime Load (from comprehensive_rpc_functions_17AUG25.md)**
```
Total realtime.list_changes() calls: 402,957 (3-hour event)
Admin vote monitoring: 54,364 calls (13.5% of total load)
├─ get_event_weighted_votes: 5,759 calls (32/minute)
├─ get_event_vote_ranges: 5,737 calls (32/minute) 
└─ check_event_admin_permission: 42,259 calls (235/minute)

Admin efficiency: 57.5 database calls per vote cast (EXTREME OVERHEAD)
Regular users: ~350,000 calls (87% of total load)
```

### **User Distribution Impact**
```
Total Users: 84 (78 voters + 6 admins)
Admin Impact: 6 users (7.7%) = 13.5% of database load (18x per-user impact)
Regular Users: 78 users (92.8%) = 87% of database load
```

**Migration Opportunity**: Moving 87% of users to cached endpoints eliminates majority of WAL lag.

---

## V2 Architecture: Public Cache with Client-Side Auth

### **Core Strategy**
1. **V2 System**: Parallel implementation with public cached endpoints
2. **Shared Authentication**: V1 and V2 use identical auth system (AuthContext.jsx)
3. **Client-Side Access Control**: Authentication enforced in frontend, not on cached endpoints
4. **Public Data**: Event data served publicly with aggressive rate limiting
5. **Secure Write Operations**: Vote, bid, payment endpoints remain unchanged and authenticated

### **Request Flow Comparison**
```
V1 (Current):
User → Auth → Realtime Subscription → postgres_changes polling → Database

V2 (New):
User → Client Auth Check → Public Cache → Ultra-fast Response
                ↓ (only on cache miss)
            Database (5-second cache)

Write Operations (Both V1 & V2):
User → Auth → Secure RPC (vote/bid/payment) → Database
```

---

## Implementation Architecture

### **V2 Folder Structure**
```
/art-battle-vote-v2/
├── src/
│   ├── components/
│   │   ├── EventDetails.jsx         # No admin features, cached data only
│   │   ├── EventList.jsx            # Cached event list
│   │   ├── AuthModal.jsx            # SHARED with V1 (identical)
│   │   └── PaymentButton.jsx        # SHARED with V1 (identical)
│   ├── contexts/
│   │   └── AuthContext.jsx          # SHARED with V1 (identical)
│   ├── utils/
│   │   ├── publicDataManager.js     # NEW: Public cache fetching
│   │   ├── broadcastClient.js       # NEW: Minimal cache invalidation
│   │   └── realtimeFlash.js         # SHARED with V1 (identical)
│   └── lib/
│       └── supabase.js              # SHARED with V1 (identical)
```

### **Shared Components Strategy**
```javascript
// Import shared components to maintain consistency
import AuthModal from '../art-battle-vote/src/components/AuthModal';
import PaymentButton from '../art-battle-vote/src/components/PaymentButton';
import { useAuth } from '../art-battle-vote/src/contexts/AuthContext';
```

---

## Public Cache Endpoint Design

### **Edge Function Architecture**
```typescript
// supabase/functions/public-event/index.ts
const cache = new Map();
const cacheExpiry = new Map();

serve(async (req) => {
  const url = new URL(req.url);
  const eventId = url.pathname.split('/').pop();
  
  // NO authentication required - truly public endpoint
  // Security handled by client-side auth and rate limiting
  
  // Check internal cache (5-second TTL)
  const cacheKey = `public-event-${eventId}`;
  const now = Date.now();
  
  if (cache.has(cacheKey) && cacheExpiry.get(cacheKey) > now) {
    return new Response(cache.get(cacheKey), {
      headers: { 
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'Cache-Control': 'public, max-age=5'
      }
    });
  }
  
  // Generate public event data (no sensitive information)
  const eventData = await generatePublicEventData(eventId);
  const responseBody = JSON.stringify(eventData);
  
  // Cache for 5 seconds
  cache.set(cacheKey, responseBody);
  cacheExpiry.set(cacheKey, now + 5000);
  
  return new Response(responseBody, {
    headers: { 
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'Cache-Control': 'public, max-age=5'
    }
  });
});

const generatePublicEventData = async (eventId: string) => {
  // Use existing RPC functions from comprehensive_rpc_functions_17AUG25.md
  const [eventInfo, artworks, publicVotes, currentBids] = await Promise.all([
    supabase.from('events').select('*').eq('eid', eventId).single(),
    supabase.from('art').select('*, artist_profiles(*)').eq('event_id', eventId),
    supabase.rpc('get_voting_summary', { p_event_id: eventId }), // Public vote counts only
    supabase.from('bids').select('art_id, amount, created_at').eq('event_id', eventId)
  ]);
  
  return {
    event: eventInfo.data,
    artworks: artworks.data,
    vote_summary: publicVotes.data,
    current_bids: processBidsForPublic(currentBids.data),
    generated_at: new Date().toISOString()
  };
};
```

### **Public Endpoint URLs**
```
https://artb.art/public/event/AB3028           # Complete event data + artworks
https://artb.art/public/bids/AB3028            # All current bids for event  
https://artb.art/public/votes/AB3028           # Public vote summaries (no admin ranges)
https://artb.art/public/media/AB3028           # All artwork media for event
https://artb.art/public/events                 # Event list (first page users see)
```

---

## Client-Side Authentication Strategy

### **V2 EventDetails Component**
```javascript
// art-battle-vote-v2/src/components/EventDetails.jsx
import { useAuth } from '../../art-battle-vote/src/contexts/AuthContext'; // SHARED
import { publicDataManager } from '../utils/publicDataManager';

const EventDetailsV2 = () => {
  const { user, person } = useAuth(); // Same auth system as V1
  const { eventId } = useParams();
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // CLIENT-SIDE authentication enforcement
  useEffect(() => {
    if (!user) {
      // Redirect to login - same as V1 behavior
      navigate('/login');
      return;
    }
    
    // User is authenticated, load public data
    loadEventData();
  }, [user, eventId]);
  
  const loadEventData = async () => {
    try {
      setLoading(true);
      
      // Fetch from public cache endpoints (no auth headers needed)
      const data = await publicDataManager.fetchEventData(eventId);
      setEventData(data);
      
    } catch (error) {
      console.error('Failed to load event data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // SHARED write operations - same endpoints as V1
  const handleVote = async (artId) => {
    const result = await supabase.rpc('cast_vote_secure', { p_art_id: artId });
    if (result.data?.success) {
      // Trigger cache refresh after successful vote
      await loadEventData();
    }
  };
  
  const handleBid = async (artId, amount) => {
    const result = await supabase.rpc('place_bid_secure', { 
      p_art_id: artId, 
      p_amount: amount 
    });
    if (result.data?.success) {
      // Trigger cache refresh after successful bid
      await loadEventData();
    }
  };
  
  // UI identical to V1, just no admin features
  if (loading) return <LoadingScreen />;
  
  return (
    <div>
      {/* Same UI as V1 EventDetails, minus admin components */}
      <EventHeader event={eventData.event} />
      <ArtworkGrid 
        artworks={eventData.artworks}
        onVote={handleVote}
        onBid={handleBid}
      />
      <PaymentButton /> {/* SHARED component */}
    </div>
  );
};
```

### **Public Data Manager**
```javascript
// art-battle-vote-v2/src/utils/publicDataManager.js
class PublicDataManager {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = new Map();
  }
  
  async fetchEventData(eventId) {
    const cacheKey = `event-${eventId}`;
    
    // Local cache to avoid repeated API calls within 30 seconds
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      // Direct fetch to public endpoint - no auth headers
      const response = await fetch(`https://artb.art/public/event/${eventId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache locally for 30 seconds to reduce API calls
      this.cache.set(cacheKey, data);
      this.cacheExpiry.set(cacheKey, Date.now() + 30000);
      
      return data;
    } catch (error) {
      console.error(`Failed to fetch event ${eventId}:`, error);
      
      // Return stale cache if available
      const staleData = this.cache.get(cacheKey);
      if (staleData) {
        console.warn('Using stale cached data due to fetch error');
        return staleData;
      }
      
      throw error;
    }
  }
  
  isCacheValid(key) {
    const expiry = this.cacheExpiry.get(key);
    return expiry && Date.now() < expiry;
  }
  
  invalidateCache(pattern) {
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }
}

export const publicDataManager = new PublicDataManager();
```

---

## Auth-Based Routing Implementation

### **Shared App.jsx Enhancement**
```javascript
// art-battle-vote/src/App.jsx (enhanced, not replaced)
import { useAuth } from './contexts/AuthContext';
import EventDetailsV1 from './components/EventDetails';
import EventDetailsV2 from '../art-battle-vote-v2/src/components/EventDetails';

const App = () => {
  const { user, person, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckComplete, setAdminCheckComplete] = useState(false);
  
  useEffect(() => {
    if (user && person) {
      checkAdminStatus();
    }
  }, [user, person]);
  
  const checkAdminStatus = async () => {
    try {
      // Use existing admin permission function from comprehensive_rpc_functions_17AUG25.md
      const { data } = await supabase.rpc('check_event_admin_permission', {
        p_event_id: getCurrentEventId(),
        p_required_level: 'moderator',
        p_user_phone: person?.phone
      });
      
      setIsAdmin(!!data);
    } catch (error) {
      console.error('Admin check failed:', error);
      setIsAdmin(false); // Default to non-admin on error (safe fallback)
    } finally {
      setAdminCheckComplete(true);
    }
  };
  
  if (loading || !adminCheckComplete) return <LoadingScreen />;
  
  return (
    <Router>
      <Routes>
        {/* Dynamic routing based on admin status */}
        <Route path="/event/:eid" element={
          isAdmin ? <EventDetailsV1 /> : <EventDetailsV2 />
        } />
        
        {/* Admin-only routes stay on V1 */}
        <Route path="/admin/*" element={
          isAdmin ? <AdminPanel /> : <Navigate to="/" />
        } />
        
        {/* Shared routes use same components */}
        <Route path="/login" element={<AuthModal />} />
        <Route path="/payment/*" element={<PaymentFlow />} />
      </Routes>
    </Router>
  );
};
```

---

## Anti-Scraping Protection

### **Nginx Rate Limiting Configuration**
```nginx
http {
    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=public_api:10m rate=20r/m;
    limit_req_zone $binary_remote_addr zone=burst_protection:10m rate=5r/s;
    
    # Cache configuration
    proxy_cache_path /var/cache/nginx/artbattle levels=1:2 keys_zone=artbattle_cache:10m max_size=1g inactive=1h;
}

server {
    location /public/ {
        proxy_pass https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/;
        
        # Aggressive caching
        proxy_cache artbattle_cache;
        proxy_cache_valid 200 5s;
        proxy_cache_key "$request_uri";
        
        # Rate limiting protection
        limit_req zone=public_api burst=10 nodelay;
        limit_req zone=burst_protection burst=10 nodelay;
        limit_req_status 429;
        
        # Block common scrapers
        if ($http_user_agent ~* (bot|crawler|spider|scraper|wget|curl)) {
            return 429 '{"error": "Rate limited"}';
        }
        
        # Security headers
        add_header X-Cache-Status $upstream_cache_status;
        add_header X-Rate-Limit "20 requests per minute";
        add_header Access-Control-Allow-Origin "https://vote.artbattle.com";
    }
    
    # Rate limit error page
    error_page 429 /rate-limit.json;
    location = /rate-limit.json {
        return 429 '{"error": "Rate limit exceeded. Max 20 requests per minute."}';
    }
}
```

### **Rate Limiting Strategy**
```
Per IP Address Limits:
├─ 20 requests per minute (normal usage)
├─ 5 requests per second (burst protection)
└─ User agent filtering (block obvious scrapers)

Cache Protection:
├─ 5-second cache TTL (maximum freshness)
├─ Shared cache across all users
└─ 95%+ cache hit rate during events
```

---

## Broadcast Cache Invalidation

### **Minimal Broadcast Triggers**
```sql
-- Broadcast trigger for cache invalidation notifications
CREATE OR REPLACE FUNCTION broadcast_cache_invalidation()
RETURNS TRIGGER AS $$
DECLARE
  v_event_eid VARCHAR;
BEGIN
  -- Get event EID for notification
  SELECT eid INTO v_event_eid FROM events WHERE id = NEW.event_id;
  
  -- Minimal cache invalidation notification
  PERFORM pg_notify(
    CONCAT('cache_invalidate:', NEW.event_id),
    json_build_object(
      'type', TG_TABLE_NAME || '_changed',
      'event_eid', v_event_eid,
      'timestamp', NEW.created_at
    )::text
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to key tables
CREATE TRIGGER cache_invalidate_votes_trigger
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_bids_trigger  
  AFTER INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();

CREATE TRIGGER cache_invalidate_art_trigger
  AFTER UPDATE ON art
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_cache_invalidation();
```

### **V2 Broadcast Client (Optional Enhancement)**
```javascript
// art-battle-vote-v2/src/utils/broadcastClient.js
export const useCacheInvalidation = (eventId, onInvalidate) => {
  useEffect(() => {
    if (!eventId) return;
    
    // Subscribe to cache invalidation notifications
    const channel = supabase.channel(`cache-invalidate-${eventId}`)
      .on('broadcast', { event: '*_changed' }, (payload) => {
        console.log('Cache invalidation received:', payload.type);
        
        // Trigger cache refresh
        onInvalidate?.(payload);
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);
};

// Usage in V2 components
const EventDetailsV2 = () => {
  useCacheInvalidation(eventId, async (notification) => {
    // Invalidate local cache and refresh data
    publicDataManager.invalidateCache(eventId);
    await loadEventData();
  });
};
```

---

## Performance Projections

### **Load Reduction Analysis**
```
Current System (V1 Only):
├─ Total users: 84 (78 regular + 6 admin)
├─ Realtime calls: 402,957 per event
├─ Database load: 100% (all users hit database)
└─ WAL lag: 15MB spikes every 2 minutes

V2 Migration (87% users to cache):
├─ V2 users: 78 regular users (92.8%)
├─ V1 users: 6 admin users (7.2%)  
├─ V2 database calls: ~2,000 cached endpoint misses
├─ V1 database calls: ~54,000 admin calls
├─ Total reduction: 87% of database load eliminated
└─ WAL lag: Should eliminate 2-minute spikes
```

### **Cache Performance Expectations**
```
V2 Public Cache Performance:
├─ Cache hit rate: 95%+ (5-second TTL)
├─ Response time: <50ms (cached responses)
├─ Database queries: 1 per 5 seconds per endpoint
└─ Concurrent user support: 10,000+ (limited by rate limiting, not database)

Write Operation Performance (Unchanged):
├─ Vote casting: Same as V1 (authenticated RPC)
├─ Bid placement: Same as V1 (authenticated RPC)
├─ Payment processing: Same as V1 (authenticated flow)
└─ Admin functions: Same as V1 (full realtime dashboard)
```

---

## Migration Strategy

### **Phase 1: V2 Infrastructure (Week 1)**
**Objective**: Build V2 system with zero user impact

**Tasks**:
1. Create V2 folder structure alongside V1
2. Build public cache edge functions
3. Set up nginx caching configuration  
4. Create public data manager utility
5. Test with manual API calls

**Success Criteria**:
- ✅ Public endpoints respond correctly
- ✅ 5-second caching works
- ✅ Rate limiting blocks excessive requests
- ✅ V1 system completely unchanged

### **Phase 2: V2 Frontend (Week 2)**
**Objective**: Build V2 frontend using shared auth

**Tasks**:
1. Build V2 EventDetails component (no admin features)
2. Implement public data manager integration
3. Add auth-based routing logic to V1 App.jsx
4. Create broadcast cache invalidation (optional)
5. Test V2 with feature flag

**Success Criteria**:
- ✅ V2 UI identical to V1 (minus admin features)
- ✅ Shared authentication works correctly
- ✅ Vote/bid/payment functions work identically
- ✅ Admin users still route to V1

### **Phase 3: Gradual Rollout (Week 3)**
**Objective**: Migrate non-admin users with monitoring

**Tasks**:
1. Enable V2 for 10% of non-admin users
2. Monitor cache hit rates and error rates
3. Compare V1 vs V2 performance metrics
4. Scale to 50% then 100% of non-admin users
5. Monitor WAL lag reduction

**Success Criteria**:
- ✅ 95%+ cache hit rate for V2 users
- ✅ Zero authentication issues
- ✅ Vote/bid success rates identical to V1
- ✅ Measurable WAL lag reduction

### **Phase 4: Optimization (Ongoing)**
**Objective**: Fine-tune performance and add features

**Tasks**:
1. Optimize cache TTLs based on usage patterns
2. Add more cached endpoints as needed
3. Monitor rate limiting effectiveness
4. Plan potential admin migration to V3
5. Remove V1 code (future consideration)

---

## Risk Assessment

### **Ultra-Low Risk Elements** ✅
```
Authentication: SHARED - respects all QR/OTP work from recent fixes
Backend APIs: SHARED - zero changes to proven vote/bid/payment logic  
Admin Functions: UNCHANGED - admins stay on stable V1 system
Session Management: SHARED - preserves weeks-long login improvements
Rollback: INSTANT - redirect non-admins back to V1 via routing change
```

### **Monitoring & Rollback Plan**
```
Key Metrics to Monitor:
├─ Cache hit rate (target: 95%+)
├─ V2 error rate (target: <1%)
├─ Vote/bid success rate (must match V1)
├─ WAL lag reduction (target: eliminate 2-minute spikes)
└─ Rate limit violations (acceptable: <5% of requests)

Instant Rollback Triggers:
├─ V2 error rate > 5%
├─ Authentication failures
├─ Vote/bid success rate drops
└─ User complaints about performance

Rollback Procedure:
1. Change auth-based routing to send all users to V1
2. Deploy routing change (takes <5 minutes)
3. All users back on proven V1 system
4. Zero data loss or user impact
```

---

## Success Criteria

### **Technical Metrics**
- ✅ **87% database load reduction** (non-admin users to cache)
- ✅ **95%+ cache hit rate** for public endpoints
- ✅ **Sub-50ms response times** for cached data
- ✅ **Zero WAL lag spikes** during events
- ✅ **Rate limiting effectiveness** (<5% violations)

### **User Experience Metrics**
- ✅ **Identical functionality** for non-admin users
- ✅ **Zero authentication issues** (shared auth system)
- ✅ **Same vote/bid success rates** as V1
- ✅ **Faster page load times** due to caching
- ✅ **Preserved admin dashboard** functionality

### **Operational Metrics**
- ✅ **Zero admin user impact** (stay on V1)
- ✅ **Simplified debugging** (clear V1/V2 separation)
- ✅ **Reduced server costs** (lower database load)
- ✅ **Scalable architecture** (support 10,000+ users)

---

## Conclusion

This V2 migration plan provides a **zero-risk path** to eliminate the WAL lag crisis while preserving all the authentication and session management work completed in the last 36 hours. By moving 87% of users to public cached endpoints, we eliminate the majority of database load while keeping the complex admin functionality on the proven V1 system.

**Key advantages:**
- **Preserves authentication architecture** documented in recent MD files
- **Zero changes** to proven vote/bid/payment logic
- **Eliminates 87% of database load** through intelligent caching
- **Instant rollback capability** via routing changes
- **Future-proof scaling** to 10,000+ concurrent users

**Implementation can begin immediately** with Phase 1 infrastructure deployment, followed by gradual frontend migration with comprehensive monitoring and instant rollback capabilities.

---

**References:**
- `comprehensive_rpc_functions_17AUG25.md` - Complete RPC function analysis
- `17aug25-seattle.md` - Session management implementation details  
- `CRITICAL_AUTH_ARCHITECTURE_DOCUMENTATION.md` - QR/OTP authentication architecture
- `good_broadcast_plan_17AUG25.md` - Original broadcast migration analysis

**Generated**: August 17, 2025  
**Status**: Ready for implementation approval