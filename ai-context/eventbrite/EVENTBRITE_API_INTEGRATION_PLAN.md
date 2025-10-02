# Eventbrite API Integration for Post-Event Billing
**Created:** October 2, 2025
**Purpose:** Accurate ticket revenue data for billing with intelligent 6-hour caching
**Priority:** HIGH - Billing Accuracy Critical

---

## 🎯 Objectives

1. **Primary:** Provide 100% accurate ticket sales data for post-event billing
2. **Secondary:** Create reusable cached data that could replace current `cached_event_data` system
3. **Performance:** Minimize API calls with 6-hour cache, respect rate limits
4. **Reliability:** Graceful fallback to existing cached data if API unavailable

---

## 📊 Architecture Overview

```
User Request → get-event-post-summary
                    ↓
              Check Cache (eventbrite_api_cache)
                    ↓
         Is cached data < 6 hours old?
            ↙              ↘
          YES              NO
           ↓                ↓
    Return cached    Call Eventbrite API
         data              ↓
                    Store in cache with timestamp
                           ↓
                    Return fresh data
```

---

## 🗄️ Phase 1: Database Schema

### New Table: `eventbrite_api_cache`

```sql
CREATE TABLE eventbrite_api_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identifiers
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  eid VARCHAR(50) NOT NULL,
  eventbrite_id VARCHAR(255) NOT NULL,

  -- API response data (JSONB for flexibility)
  event_data JSONB NOT NULL,           -- Full event details from API
  ticket_classes JSONB NOT NULL,       -- Ticket types with pricing
  sales_summary JSONB NOT NULL,        -- Aggregated sales data
  attendee_summary JSONB,              -- Optional: attendee counts by status

  -- Processed metrics (extracted for quick access)
  total_tickets_sold INTEGER NOT NULL DEFAULT 0,

  -- Financial breakdown (ALL amounts in event currency)
  gross_revenue NUMERIC(10,2) DEFAULT 0,           -- Total charged to buyers
  ticket_revenue NUMERIC(10,2) DEFAULT 0,          -- Face value of tickets only
  taxes_collected NUMERIC(10,2) DEFAULT 0,         -- Sales tax/VAT
  eventbrite_fees NUMERIC(10,2) DEFAULT 0,         -- EB service fees
  payment_processing_fees NUMERIC(10,2) DEFAULT 0, -- Payment gateway fees
  total_fees NUMERIC(10,2) DEFAULT 0,              -- Sum of all fees
  net_deposit NUMERIC(10,2) GENERATED ALWAYS AS     -- What organizer receives
    (ticket_revenue - COALESCE(eventbrite_fees, 0) - COALESCE(payment_processing_fees, 0)) STORED,

  total_capacity INTEGER,
  currency_code VARCHAR(10),

  -- Data quality tracking
  api_response_status VARCHAR(50) NOT NULL,  -- 'success', 'partial', 'error'
  api_response_code INTEGER,
  api_error_message TEXT,
  data_quality_score INTEGER,               -- 0-100 based on completeness
  data_quality_flags JSONB,                 -- Array of issues found

  -- Cache management
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '6 hours',
  fetch_duration_ms INTEGER,                -- How long API call took
  is_stale BOOLEAN GENERATED ALWAYS AS (expires_at < NOW()) STORED,

  -- Metadata
  fetched_by VARCHAR(255),                  -- User/function that triggered fetch
  fetch_reason VARCHAR(50),                 -- 'billing', 'refresh', 'manual'
  api_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  UNIQUE(eventbrite_id, fetched_at),
  CHECK (total_revenue >= 0),
  CHECK (total_tickets_sold >= 0),
  CHECK (data_quality_score >= 0 AND data_quality_score <= 100)
);

-- Indexes for performance
CREATE INDEX idx_eb_cache_event_id ON eventbrite_api_cache(event_id);
CREATE INDEX idx_eb_cache_eid ON eventbrite_api_cache(eid);
CREATE INDEX idx_eb_cache_eventbrite_id ON eventbrite_api_cache(eventbrite_id);
CREATE INDEX idx_eb_cache_expires_at ON eventbrite_api_cache(expires_at);
CREATE INDEX idx_eb_cache_is_stale ON eventbrite_api_cache(is_stale) WHERE is_stale = false;
CREATE INDEX idx_eb_cache_quality ON eventbrite_api_cache(data_quality_score) WHERE data_quality_score < 80;

-- Row Level Security (admin only)
ALTER TABLE eventbrite_api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read eventbrite cache" ON eventbrite_api_cache
  FOR SELECT USING (
    auth.jwt()->>'role' = 'authenticated'
    AND (auth.jwt()->'admin_events')::jsonb ? eid
  );

-- Updated timestamp trigger
CREATE TRIGGER update_eb_cache_updated_at
  BEFORE UPDATE ON eventbrite_api_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE eventbrite_api_cache IS 'Cached Eventbrite API responses for billing accuracy. TTL: 6 hours. Tracks data quality and API performance.';
```

---

## 🔌 Phase 2: Eventbrite API Integration

### API Endpoints Needed

**⭐ 1. Sales Report API** (PRIMARY - Use this for billing!)
```
GET https://www.eventbriteapi.com/v3/reports/sales/?event_ids={eventbrite_id}
```
Returns: Complete financial breakdown including:
- Gross sales (total charged to buyers)
- Net sales (what organizer receives after fees)
- Eventbrite fees
- Payment processing fees
- Taxes collected
- Quantity sold

**This is the GOLD STANDARD for billing - gives you net deposit directly!**

**2. Event Details** (Supporting data)
```
GET https://www.eventbriteapi.com/v3/events/{eventbrite_id}/
```
Returns: Event name, dates, status, currency, venue details

**3. Ticket Classes** (For capacity & pricing breakdown)
```
GET https://www.eventbriteapi.com/v3/events/{eventbrite_id}/ticket_classes/
```
Returns: All ticket types, pricing, quantity sold, quantity total

**4. Orders** (Fallback if Sales Report unavailable)
```
GET https://www.eventbriteapi.com/v3/events/{eventbrite_id}/orders/?status=placed
```
Returns: Individual order details for manual aggregation

**See `EVENTBRITE_FINANCIAL_ENDPOINTS.md` for complete details on financial data structure.**

### Authentication
```
Authorization: Bearer {EVENTBRITE_PRIVATE_TOKEN}
```
- Store token in Supabase secrets: `EVENTBRITE_API_TOKEN`
- Never expose in client-side code
- Rotate regularly

### Rate Limits
- **Eventbrite Standard:** 1,000 requests/hour per organization
- **With caching:** ~4 requests per event per day (6-hour TTL)
- **For 461 events:** ~1,844 requests/day = well under limit

---

## ⚙️ Phase 3: Edge Function Implementation

### Function: `fetch-eventbrite-data`

**Location:** `/root/vote_app/vote26/supabase/functions/fetch-eventbrite-data/`

**Purpose:** Fetch and cache Eventbrite data with quality validation

**Input:**
```typescript
{
  event_id?: UUID,           // Either event_id...
  eventbrite_id?: string,    // ...or eventbrite_id required
  force_refresh?: boolean,   // Bypass cache
  fetch_reason?: string      // 'billing', 'refresh', 'manual'
}
```

**Output:**
```typescript
{
  success: boolean,
  source: 'cache' | 'api' | 'fallback',
  cache_age_hours: number,

  ticket_data: {
    // Quantities
    total_sold: number,
    total_capacity: number,
    percentage_sold: number,

    // Revenue breakdown (CRITICAL FOR BILLING)
    gross_revenue: number,              // Total charged to buyers
    ticket_revenue: number,             // Face value of tickets
    taxes_collected: number,            // Sales tax/VAT
    eventbrite_fees: number,            // EB service fees
    payment_processing_fees: number,    // Payment gateway fees
    total_fees: number,                 // Sum of all fees
    net_deposit: number,                // ⭐ What organizer receives

    currency_code: string,
    currency_symbol: string,

    // Per-ticket averages
    average_ticket_price: number,
    average_net_per_ticket: number,     // Net deposit ÷ tickets sold

    // Breakdown by ticket type
    by_ticket_class: [
      {
        name: string,
        price: number,
        quantity_sold: number,
        quantity_total: number,
        ticket_revenue: number,
        fees: number,
        net_revenue: number,
        on_sale_status: string
      }
    ],

    // Payout information
    payout_status: 'pending' | 'processing' | 'completed',
    payout_date: timestamp | null
  },

  quality: {
    score: number,              // 0-100
    flags: string[],            // Issues found
    confidence: 'high' | 'medium' | 'low',
    validated_at: timestamp
  },

  metadata: {
    fetched_at: timestamp,
    expires_at: timestamp,
    api_call_duration_ms: number,
    eventbrite_last_changed: timestamp
  }
}
```

**Implementation Logic:**

```typescript
async function fetchEventbriteData(input) {
  const startTime = Date.now();

  // 1. Get event details from database
  const event = await getEventDetails(input);
  if (!event.eventbrite_id) {
    return { error: 'No Eventbrite ID for this event' };
  }

  // 2. Check cache
  if (!input.force_refresh) {
    const cached = await getCachedData(event.eventbrite_id);
    if (cached && !cached.is_stale) {
      return formatResponse(cached, 'cache');
    }
  }

  // 3. Fetch from Eventbrite API
  try {
    const [eventDetails, ticketClasses, orders] = await Promise.all([
      fetchEventbriteAPI(`/events/${event.eventbrite_id}/`),
      fetchEventbriteAPI(`/events/${event.eventbrite_id}/ticket_classes/`),
      fetchEventbriteAPI(`/events/${event.eventbrite_id}/orders/?status=placed`)
    ]);

    // 4. Process and validate data
    const processed = processEventbriteData({
      eventDetails,
      ticketClasses,
      orders
    });

    // 5. Calculate quality score
    const quality = calculateDataQuality(processed);

    // 6. Store in cache
    const cached = await storeInCache({
      event_id: event.id,
      eid: event.eid,
      eventbrite_id: event.eventbrite_id,
      data: processed,
      quality,
      fetch_duration_ms: Date.now() - startTime,
      fetched_by: input.user_id,
      fetch_reason: input.fetch_reason
    });

    // 7. Return formatted response
    return formatResponse(cached, 'api');

  } catch (error) {
    // 8. On API error, try fallback to old cached data or cached_event_data
    console.error('Eventbrite API error:', error);
    const fallback = await getFallbackData(event);
    return formatResponse(fallback, 'fallback', error);
  }
}
```

### Data Quality Scoring

```typescript
function calculateDataQuality(data) {
  let score = 0;
  const flags = [];

  // Check 1: Revenue data present (40 points)
  if (data.total_revenue > 0) {
    score += 40;
  } else if (data.total_tickets_sold > 0) {
    flags.push('ZERO_REVENUE_WITH_SALES');
  } else {
    score += 40; // OK if no sales
  }

  // Check 2: Ticket classes detailed (20 points)
  if (data.ticket_classes?.length > 0) {
    score += 20;
  } else {
    flags.push('NO_TICKET_CLASSES');
  }

  // Check 3: Pricing consistency (20 points)
  const calculatedRevenue = data.ticket_classes.reduce(
    (sum, tc) => sum + (tc.quantity_sold * tc.price), 0
  );
  if (Math.abs(calculatedRevenue - data.total_revenue) < 1) {
    score += 20;
  } else {
    flags.push('REVENUE_MISMATCH');
  }

  // Check 4: Capacity data (10 points)
  if (data.total_capacity > 0) {
    score += 10;
  } else {
    flags.push('NO_CAPACITY_DATA');
  }

  // Check 5: Currency specified (10 points)
  if (data.currency_code) {
    score += 10;
  } else {
    flags.push('NO_CURRENCY');
  }

  return {
    score,
    flags,
    confidence: score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low'
  };
}
```

---

## 🔄 Phase 4: Integration with get-event-post-summary

Update existing function to use new Eventbrite cache:

```typescript
// In get-event-post-summary/index.ts

// Priority 1: Try Eventbrite API cache (< 6 hours old)
const eventbriteData = await supabaseClient
  .from('eventbrite_api_cache')
  .select('*')
  .eq('eid', event.eid)
  .eq('is_stale', false)
  .gte('data_quality_score', 70)  // Only use quality data
  .order('fetched_at', { ascending: false })
  .limit(1)
  .single();

if (eventbriteData && !eventbriteData.error) {
  // Use high-quality Eventbrite data
  return {
    total_sold: eventbriteData.total_tickets_sold,
    total_revenue: eventbriteData.total_revenue,
    currency_code: eventbriteData.currency_code,
    data_source: `Eventbrite API (${formatAge(eventbriteData.fetched_at)})`,
    data_quality: eventbriteData.data_quality_score,
    confidence: eventbriteData.sales_summary.quality?.confidence
  };
}

// Priority 2: Trigger fresh API call if cache is stale
if (!eventbriteData || eventbriteData.is_stale) {
  try {
    const freshData = await supabaseClient.functions.invoke('fetch-eventbrite-data', {
      body: {
        event_id: event.id,
        fetch_reason: 'billing'
      }
    });

    if (freshData.data?.success) {
      return formatTicketSalesFromEventbrite(freshData.data);
    }
  } catch (error) {
    console.error('Failed to fetch fresh Eventbrite data:', error);
  }
}

// Priority 3: Fallback to cached_event_data (existing logic)
const cachedEventData = await supabaseClient
  .from('cached_event_data')
  .select('*')
  .eq('eid', event.eid)
  .single();

// ... existing fallback logic
```

---

## 🎯 Phase 5: Data Quality Validation

### Admin Dashboard View

Create view for monitoring data quality:

```sql
CREATE VIEW eventbrite_data_quality_summary AS
SELECT
  e.eid,
  e.name,
  e.event_start_datetime,
  eac.total_tickets_sold,
  eac.total_revenue,
  eac.currency_code,
  eac.data_quality_score,
  eac.data_quality_flags,
  eac.fetched_at,
  eac.expires_at,
  eac.is_stale,
  CASE
    WHEN eac.data_quality_score >= 90 THEN 'excellent'
    WHEN eac.data_quality_score >= 70 THEN 'good'
    WHEN eac.data_quality_score >= 50 THEN 'fair'
    ELSE 'poor'
  END as quality_rating,
  eac.api_response_status
FROM events e
LEFT JOIN LATERAL (
  SELECT * FROM eventbrite_api_cache
  WHERE eventbrite_api_cache.event_id = e.id
  ORDER BY fetched_at DESC
  LIMIT 1
) eac ON true
WHERE e.eventbrite_id IS NOT NULL
ORDER BY e.event_start_datetime DESC;
```

### Alert Function

```sql
CREATE OR REPLACE FUNCTION alert_on_poor_data_quality()
RETURNS TRIGGER AS $$
BEGIN
  -- Alert if quality score is low for billing-critical requests
  IF NEW.fetch_reason = 'billing' AND NEW.data_quality_score < 70 THEN
    -- Log to Slack or notification system
    PERFORM log_to_slack(
      'eventbrite-quality-alert',
      format('Low data quality (%s%%) for event %s (EID: %s). Flags: %s',
        NEW.data_quality_score,
        NEW.eid,
        NEW.eid,
        NEW.data_quality_flags::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER eventbrite_quality_alert
  AFTER INSERT ON eventbrite_api_cache
  FOR EACH ROW
  EXECUTE FUNCTION alert_on_poor_data_quality();
```

---

## 🔒 Phase 6: Security & Configuration

### Environment Variables (Supabase Secrets)

```bash
# Add to Supabase project secrets
supabase secrets set EVENTBRITE_API_TOKEN=YOUR_PRIVATE_TOKEN_HERE

# Verify
supabase secrets list
```

### API Token Permissions Required

Eventbrite OAuth app needs:
- `event:read` - Read event details
- `order:read` - Read order/sales data
- `attendee:read` - Read attendee data (optional)

### Testing Credentials

Create a test event in Eventbrite to validate:
- API connectivity
- Data parsing accuracy
- Cache behavior
- Error handling

---

## 📈 Phase 7: Monitoring & Maintenance

### Key Metrics to Track

```sql
-- Daily API usage
SELECT
  DATE(fetched_at) as date,
  COUNT(*) as api_calls,
  AVG(fetch_duration_ms) as avg_duration_ms,
  COUNT(*) FILTER (WHERE api_response_status = 'success') as success_count,
  COUNT(*) FILTER (WHERE api_response_status = 'error') as error_count,
  AVG(data_quality_score) as avg_quality
FROM eventbrite_api_cache
WHERE fetched_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(fetched_at)
ORDER BY date DESC;

-- Cache hit rate
SELECT
  COUNT(*) FILTER (WHERE source = 'cache') * 100.0 / COUNT(*) as cache_hit_rate
FROM (
  -- Would need to log all requests, not just cached results
  SELECT 'cache' as source FROM eventbrite_api_cache WHERE fetched_at > NOW() - INTERVAL '1 day'
) requests;

-- Data quality issues
SELECT
  eid,
  name,
  data_quality_score,
  data_quality_flags,
  total_tickets_sold,
  total_revenue
FROM eventbrite_data_quality_summary
WHERE data_quality_score < 80
ORDER BY data_quality_score ASC;
```

### Automated Refresh (Optional)

```sql
-- pg_cron job to refresh stale data for upcoming events
SELECT cron.schedule(
  'refresh-eventbrite-upcoming',
  '0 */6 * * *',  -- Every 6 hours
  $$
  SELECT fetch_eventbrite_data(event_id::text, 'refresh')
  FROM events
  WHERE eventbrite_id IS NOT NULL
    AND event_start_datetime BETWEEN NOW() - INTERVAL '1 day' AND NOW() + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM eventbrite_api_cache
      WHERE eventbrite_api_cache.event_id = events.id
        AND eventbrite_api_cache.is_stale = false
    )
  $$
);
```

---

## 🚀 Implementation Timeline

### Week 1: Foundation
- [ ] Create database schema
- [ ] Set up Eventbrite API credentials
- [ ] Test API endpoints with sample events
- [ ] Document API response structures

### Week 2: Core Function
- [ ] Build `fetch-eventbrite-data` edge function
- [ ] Implement caching logic
- [ ] Add data quality scoring
- [ ] Create comprehensive error handling

### Week 3: Integration
- [ ] Update `get-event-post-summary` to use new cache
- [ ] Add fallback mechanisms
- [ ] Create admin monitoring views
- [ ] Set up quality alerts

### Week 4: Testing & Validation
- [ ] Test with 10+ real events
- [ ] Compare with Eventbrite dashboard manually
- [ ] Load test cache performance
- [ ] Document accuracy improvements

### Week 5: Rollout
- [ ] Deploy to production
- [ ] Monitor for 1 week with parallel systems
- [ ] Gather feedback from billing team
- [ ] Create runbook for troubleshooting

---

## 🎓 Benefits of This Approach

### Accuracy
✅ Direct API access = source of truth
✅ Quality scoring prevents bad data from being used
✅ Fallback chain ensures data always available

### Performance
✅ 6-hour cache = 4x API calls vs real-time
✅ Indexed queries = fast cache lookups
✅ Parallel API calls = sub-second refresh

### Reliability
✅ Graceful degradation to existing cache
✅ Error tracking and alerting
✅ Historical data preservation

### Future-Proof
✅ JSONB storage = flexible schema
✅ Quality tracking = continuous improvement
✅ Can replace existing cached_event_data system
✅ Extensible to other API data sources

---

## ⚠️ Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Eventbrite API downtime | Multi-tier fallback to cached_event_data |
| Rate limit exceeded | 6-hour cache + monitoring + queue system if needed |
| API token expires | Automated alerts, documented refresh process |
| Data quality issues persist | Manual override system, flag for review |
| High latency on first call | Pre-warm cache for upcoming events via cron |
| Cost of API usage | Monitor usage, Eventbrite free tier = 1000/hr |

---

## 📝 Success Criteria

1. **Accuracy:** 99%+ match with Eventbrite dashboard for completed events
2. **Coverage:** 95%+ of events have valid Eventbrite data
3. **Quality:** 90%+ of cached data has quality score ≥80
4. **Performance:** <500ms average response time (cache hits)
5. **Reliability:** <1% API failure rate with successful fallbacks

---

## 🔍 Next Steps

1. **Immediate:** Get Eventbrite API credentials
2. **Review:** Confirm billing requirements with stakeholders
3. **Test:** Run sample API calls for 3-5 events
4. **Decision:** Approve schema and proceed with implementation

---

**Questions for Product/Engineering:**

1. Do we have existing Eventbrite API credentials/app?
2. What's the acceptable data freshness for billing? (6 hours OK?)
3. Should we backfill historical events or only future ones?
4. Any specific ticket classes or fees to exclude from revenue?
5. Should net revenue (after EB fees) or gross revenue be reported?
6. Who should receive data quality alerts?

---

*Last Updated: October 2, 2025*
*Owner: Engineering Team*
*Status: Planning - Ready for Implementation*
