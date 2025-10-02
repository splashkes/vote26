# Eventbrite API Integration - Deployment Instructions
**Created:** October 2, 2025

---

## ✅ What's Been Deployed

1. **Database Table:** `eventbrite_api_cache` - Ready to store API responses
2. **Edge Function:** `fetch-eventbrite-data` - Deployed and live
3. **Helper Views:**
   - `eventbrite_latest_fresh_cache` - Latest fresh data per event
   - `eventbrite_data_quality_summary` - Quality monitoring

---

## 🔐 REQUIRED: Set up Eventbrite API Token

The function is deployed but **NEEDS the API token** to work.

### Step 1: Get Eventbrite API Token

If you don't have one yet:
1. Go to https://www.eventbrite.com/platform/api-keys
2. Create a new Private Token or OAuth app
3. Required scopes: `event:read`, `order:read`, `attendee:read`
4. Copy the Private Token

### Step 2: Add Token to Supabase Secrets

```bash
# Set the token (replace YOUR_TOKEN_HERE with actual token)
supabase secrets set EVENTBRITE_API_TOKEN=YOUR_EVENTBRITE_PRIVATE_TOKEN_HERE

# Verify it's set
supabase secrets list
```

---

## 🧪 How to Test

### Test 1: Call by EID
```bash
curl -X POST 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/fetch-eventbrite-data' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"eid": "AB3059"}' | jq '.'
```

### Test 2: Force Refresh (Bypass Cache)
```bash
curl -X POST 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/fetch-eventbrite-data' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"eid": "AB3059", "force_refresh": true, "fetch_reason": "testing"}' | jq '.'
```

### Test 3: Check Cache Behavior
```bash
# First call - should hit API
curl -X POST 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/fetch-eventbrite-data' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"eid": "AB3010"}' | jq '.source'
# Should return: "api"

# Second call immediately after - should use cache
curl -X POST 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/fetch-eventbrite-data' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"eid": "AB3010"}' | jq '.source'
# Should return: "cache"
```

---

## 📊 Expected Response

```json
{
  "success": true,
  "source": "api",  // or "cache"
  "cache_age_hours": 0,
  "event_eid": "AB3059",
  "event_name": "Art Battle Montreal",

  "ticket_data": {
    "total_sold": 50,
    "total_capacity": 300,
    "percentage_sold": 16.7,

    "gross_revenue": 2250.00,
    "ticket_revenue": 1750.00,
    "taxes_collected": 140.00,
    "eventbrite_fees": 258.50,
    "payment_processing_fees": 65.25,
    "total_fees": 323.75,
    "net_deposit": 1426.25,

    "currency_code": "CAD",
    "average_ticket_price": 35.00,
    "average_net_per_ticket": 28.53,

    "by_ticket_class": [...]
  },

  "quality": {
    "score": 90,
    "flags": [],
    "confidence": "high",
    "validated_at": "2025-10-02T15:30:00Z"
  },

  "metadata": {
    "fetched_at": "2025-10-02T15:30:00Z",
    "expires_at": "2025-10-02T21:30:00Z",
    "api_call_duration_ms": 850
  }
}
```

---

## 🔍 Verify Database

### Check cache entries
```sql
SELECT
  eid,
  total_tickets_sold,
  gross_revenue,
  net_deposit,
  currency_code,
  data_quality_score,
  fetched_at,
  expires_at,
  (expires_at < NOW()) as is_stale
FROM eventbrite_api_cache
ORDER BY fetched_at DESC
LIMIT 10;
```

### Check latest fresh data per event
```sql
SELECT * FROM eventbrite_latest_fresh_cache;
```

### Check data quality
```sql
SELECT * FROM eventbrite_data_quality_summary
WHERE quality_rating != 'excellent'
ORDER BY data_quality_score ASC;
```

---

## 🎯 Integration with get-event-post-summary

NEXT STEP: Update `get-event-post-summary` to use this new function:

```typescript
// In get-event-post-summary/index.ts

// Option 1: Check cache directly
const { data: eventbriteCache } = await supabaseClient
  .from('eventbrite_api_cache')
  .select('*')
  .eq('eid', event.eid)
  .gt('expires_at', new Date().toISOString())
  .gte('data_quality_score', 70)
  .order('fetched_at', { ascending: false })
  .limit(1)
  .single();

if (eventbriteCache) {
  // Use cached Eventbrite data
  ticket_sales = formatFromEventbriteCache(eventbriteCache);
} else {
  // Option 2: Call fetch function to get fresh data
  const { data: freshData } = await supabaseClient.functions.invoke('fetch-eventbrite-data', {
    body: { eid: event.eid, fetch_reason: 'billing' }
  });

  if (freshData?.success) {
    ticket_sales = freshData.ticket_data;
  } else {
    // Fallback to cached_event_data
    ticket_sales = getFallbackData(event.eid);
  }
}
```

---

## 📈 Monitoring

### API Usage
```sql
-- API calls per day
SELECT
  DATE(fetched_at) as date,
  COUNT(*) as api_calls,
  AVG(fetch_duration_ms) as avg_duration_ms,
  COUNT(*) FILTER (WHERE api_response_status = 'success') as success_count
FROM eventbrite_api_cache
WHERE fetched_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(fetched_at)
ORDER BY date DESC;
```

### Cache Hit Rate
```sql
-- Check cache reuse
SELECT
  eid,
  COUNT(*) as fetch_count,
  MIN(fetched_at) as first_fetch,
  MAX(fetched_at) as last_fetch
FROM eventbrite_api_cache
WHERE fetched_at > NOW() - INTERVAL '24 hours'
GROUP BY eid
HAVING COUNT(*) > 1
ORDER BY fetch_count DESC;
```

---

## ⚠️ Troubleshooting

### "EVENTBRITE_API_TOKEN not configured"
Run: `supabase secrets set EVENTBRITE_API_TOKEN=YOUR_TOKEN`

### "Event has no Eventbrite ID"
The event in the database needs an `eventbrite_id` field populated.

### "Eventbrite Sales Report API error: 401"
The API token is invalid or expired. Get a new token.

### "Eventbrite Sales Report API error: 404"
The event doesn't exist in Eventbrite, or the ID is wrong.

### Data quality score < 70
Check the `data_quality_flags` field to see what's wrong.
Common issues:
- `ZERO_REVENUE_WITH_SALES` - Free tickets or data error
- `NO_TICKET_CLASSES` - Event setup incomplete
- `REVENUE_MISMATCH` - Calculation discrepancy

---

## 🚀 Next Steps

1. **Set the API token** (see above)
2. **Test with 3-5 real events** to verify data accuracy
3. **Compare with Eventbrite dashboard** manually
4. **Update get-event-post-summary** to use this data
5. **Monitor for 24 hours** to verify cache behavior
6. **Roll out to production**

---

**Status:** Deployed, waiting for API token setup
