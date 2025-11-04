# SMS Marketing Audience Counting Fixes
**Date:** November 4, 2025
**Issue:** SMS marketing system showing incorrect audience counts, missing QR scan data, and campaigns sending to only 10% of intended recipients

---

## Problems Identified

### 1. **Missing QR Scan Data** (CRITICAL)
- **Symptom:** Toronto showing 1,756 people instead of 7,812
- **Root Cause:** Database function `get_sms_audience_paginated` only queried `event_registrations` table
- **Impact:** Recent events use `people_qr_scans` for attendance tracking, not registrations

### 2. **Supabase Client RPC Limit** (CRITICAL)
- **Symptom:** Results truncated to ~1,000-2,000 records
- **Root Cause:** Supabase JS client has internal pagination limits on RPC calls
- **Impact:** Large audiences (7,000+) were cut off mid-query

### 3. **Event "Enabled" Filter Too Restrictive**
- **Symptom:** Only 9 Toronto events showing instead of 28
- **Root Cause:** Filter `WHERE enabled IS NULL OR enabled = true` excluded 19 disabled events with 5,776 people
- **Impact:** Old/disabled events still have valid SMS audiences but were hidden

### 4. **City Event Counts Mismatch**
- **Symptom:** Dropdown showed "Toronto (65 events)" but only 28 events loaded
- **Root Cause:** City counts included ALL events, but loading filtered to events with people
- **Impact:** Confusing UX - "Select All" didn't match displayed count

### 5. **Campaign Creation Using Wrong Audience** (CRITICAL - DATA INTEGRITY)
- **Symptom:** Campaign button showed "Send to 823 people" but display showed 7,812 total
- **Root Cause:** `createCampaign` function used `audienceResponse.data.people` array (limited to 10k sample)
- **Impact:** **Campaigns would only send to ~10% of intended recipients!**

### 6. **Filtered Count Calculation Wrong**
- **Symptom:** Available count showed 6,429 but send button showed 745
- **Root Cause:** `filtered_count` calculated from 10k sample, not estimated from actual total
- **Impact:** Cost calculator and send button showing wrong numbers

---

## Solutions Implemented

### Database Schema Changes

#### Added `event_id` to `sms_marketing_campaigns`
```sql
ALTER TABLE sms_marketing_campaigns
ADD COLUMN event_id UUID REFERENCES events(id);

CREATE INDEX idx_sms_campaigns_event_id ON sms_marketing_campaigns(event_id);
```
**Purpose:** Associate each campaign with an event for later lookup

---

### Database Function Updates

#### 1. Updated `get_sms_audience_paginated` - Include QR Scans
**File:** Database function (deployed via psql)
**Change:** UNION queries to combine `event_registrations` + `people_qr_scans`

```sql
-- OLD (registrations only)
SELECT er.person_id
FROM event_registrations er
WHERE er.event_id = ANY(p_event_ids)

-- NEW (registrations + QR scans)
SELECT person_id FROM (
  SELECT er.person_id FROM event_registrations er WHERE er.event_id = ANY(p_event_ids)
  UNION
  SELECT pqs.person_id FROM people_qr_scans pqs
  WHERE pqs.event_id = ANY(p_event_ids) AND pqs.is_valid = true
) combined_sources
```

**Result:** Toronto went from 1,756 to 7,812 people ✅

#### 2. Created `get_events_with_people_counts_by_city`
**File:** Database function (deployed via psql)
**Purpose:** Return only events that have actual people (registrations + QR scans)

```sql
CREATE OR REPLACE FUNCTION get_events_with_people_counts_by_city(
  p_city_id UUID,
  p_min_people INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  event_start_datetime TIMESTAMP WITH TIME ZONE,
  people_count BIGINT
)
```

**Key Details:**
- Removed `enabled` filter - includes ALL events for SMS marketing
- Combines registrations + QR scans with LEFT JOIN LATERAL
- Filters to `HAVING COUNT(DISTINCT people.person_id) >= p_min_people`
- Returns people_count for each event

**Result:** Toronto shows 28 events (all with people) instead of 65 (many empty) ✅

#### 3. Created `get_cities_with_event_people_counts`
**File:** Database function (deployed via psql)
**Purpose:** Return cities with accurate event counts (only events with people)

```sql
CREATE OR REPLACE FUNCTION get_cities_with_event_people_counts(
  p_min_people INT DEFAULT 1
)
RETURNS TABLE (
  city_id UUID,
  city_name TEXT,
  event_count BIGINT
)
```

**Result:** City dropdown shows accurate counts that match "Select All" ✅

---

### Edge Function Changes

#### 1. `admin-sms-promotion-audience` - Chunked Pagination
**File:** `/root/vote_app/vote26/supabase/functions/admin-sms-promotion-audience/index.ts`

**Added Parameter:**
```typescript
ids_only: false // For campaign creation - return all IDs without details
```

**Chunked Fetching:**
```typescript
const chunkSize = 5000;
const maxRecords = ids_only ? 100000 : 10000; // 100k for campaigns, 10k for UI

while (allPeople.length < maxRecords) {
  const { data: pageData } = await serviceClient.rpc('get_sms_audience_paginated', {
    p_offset: offset,
    p_limit: chunkSize
  });

  allPeople = allPeople.concat(pageData);
  offset += chunkSize;

  if (pageData.length < chunkSize) break; // No more data
}
```

**Estimated Count Calculation:**
```typescript
// For UI display (10k sample)
const blockedCount = Math.round((blockedCountInSample / sampleCount) * totalCount);
const availableCount = totalCount - blockedCount;

// For filtered count (RFM filters applied)
let estimatedFilteredCount = availableCount;
if (rfm_filters) {
  const rfmFilteredProportion = filteredPeople.length / availableCountInSample;
  estimatedFilteredCount = Math.round(availableCount * rfmFilteredProportion);
}
```

**Result:**
- UI shows accurate estimated totals from 10k sample ✅
- Campaign creation fetches all IDs (up to 100k) ✅
- Send button and cost calculator use estimated totals ✅

#### 2. `admin-get-events-for-sms` - New Endpoints
**File:** `/root/vote_app/vote26/supabase/functions/admin-get-events-for-sms/index.ts`

**Added Endpoints:**
- `GET_ALL_CITIES` - Returns cities with accurate event counts
- Updated city query to use `get_events_with_people_counts_by_city`

**Changed `min_registrations` default:**
```typescript
// OLD: min_registrations = 10 (too restrictive)
// NEW: min_registrations = 1 (any event with people)
```

**Result:** Shows all relevant events with people counts ✅

#### 3. `admin-sms-create-campaign` - Event Association
**File:** `/root/vote_app/vote26/supabase/functions/admin-sms-create-campaign/index.ts`

**Added Parameter:**
```typescript
event_id = null // Associate campaign with specific event
```

**Campaign Record:**
```typescript
.insert({
  name: campaign_name,
  message_template: message,
  event_id: event_id, // NEW: track which event this is for
  targeting_criteria: targeting_criteria,
  // ...
})
```

---

### Frontend Changes

#### 1. `PromotionSystem.jsx` - Event Association UI
**File:** `/root/vote_app/vote26/art-battle-admin/src/components/PromotionSystem.jsx`

**Added State:**
```javascript
const [associatedEventId, setAssociatedEventId] = useState('');
const [futureEvents, setFutureEvents] = useState([]);
```

**New UI Element:**
```jsx
<Box>
  <Text size="3" weight="bold" mb="2">Associated Event (for tracking)</Text>
  <Select.Root value={associatedEventId} onValueChange={setAssociatedEventId}>
    <Select.Trigger placeholder="Select an upcoming event..." />
    <Select.Content>
      {futureEvents.map(event => (
        <Select.Item key={event.value} value={event.value}>
          {event.label}
        </Select.Item>
      ))}
    </Select.Content>
  </Select.Root>
  <Text size="1" color="gray" mt="1">
    This allows you to lookup messages later by event
  </Text>
</Box>
```

#### 2. City Loading - Use Edge Function
**Changed from direct Supabase query to edge function:**
```javascript
// OLD: Direct query
const { data: citiesData } = await supabase
  .from('cities')
  .select('id, name, events!fk_events_city(id)')
  .not('events', 'is', null);

// NEW: Edge function with accurate counts
const { data: citiesResult } = await supabase.functions.invoke(
  'admin-get-events-for-sms',
  { body: { city_id: 'GET_ALL_CITIES', min_registrations: 1 } }
);
```

#### 3. Event Loading - Show People Counts
```javascript
// OLD: No people counts
label: `${event.name} (${date})`

// NEW: Show people counts
label: `${event.name} (${event.people_count} people, ${date})`
```

#### 4. Campaign Creation - CRITICAL FIX
```javascript
// OLD: Used limited sample
const audienceResponse = await supabase.functions.invoke('admin-sms-promotion-audience', {
  body: { event_ids: selectedEvents }
});
const finalAudience = audienceResponse.data.people.filter(p => !p.blocked);
// ❌ Only ~10% of people!

// NEW: Fetch all IDs
const audienceResponse = await supabase.functions.invoke('admin-sms-promotion-audience', {
  body: {
    event_ids: selectedEvents,
    ids_only: true  // ✅ Fetches up to 100k IDs
  }
});
const finalAudience = audienceResponse.data.people.filter(p => !p.blocked);

console.log('Campaign creation:', {
  total_from_api: audienceResponse.data.total_count,
  people_returned: audienceResponse.data.people.length,
  final_audience_size: finalAudience.length
});
```

---

## Testing & Verification

### Toronto Test Case
**Before:**
- Display: 2,035 total (wrong)
- Blocked: 85 (wrong)
- Send button: 823 people (wrong)

**After:**
- Display: 7,812 total ✅
- Blocked: 1,383 ✅
- Available: 6,429 ✅
- Send button: 6,429 people ✅
- Cost calculator: 6,429 × segments ✅

### San Francisco Test Case
**Before:**
- Display: 3,420 total
- Send button: 745 people (wrong - only 22% shown!)

**After:**
- Display: 3,420 total ✅
- Available: ~2,870 ✅
- Send button: ~2,870 people ✅

### Database Verification Queries
```sql
-- Verify Toronto totals
WITH toronto_people AS (
  SELECT DISTINCT person_id FROM (
    SELECT er.person_id FROM event_registrations er
    JOIN events e ON er.event_id = e.id
    WHERE e.city_id = '41cbe3ec-e493-4f31-9b98-debfcabe8556'
    UNION
    SELECT pqs.person_id FROM people_qr_scans pqs
    JOIN events e ON pqs.event_id = e.id
    WHERE e.city_id = '41cbe3ec-e493-4f31-9b98-debfcabe8556'
    AND pqs.is_valid = true
  ) combined
)
SELECT
  COUNT(*) as total_people,
  COUNT(CASE WHEN p.message_blocked > 0 THEN 1 END) as blocked_count
FROM toronto_people tp
JOIN people p ON tp.person_id = p.id;
-- Result: 7,812 total / 1,389 blocked ✅
```

---

## Key Learnings & Pitfalls

### 1. **Always Check for Multiple Data Sources**
- Modern events use QR scans, old events use registrations
- Must UNION both sources for complete audience
- **Pitfall:** Assuming one table has all the data

### 2. **Supabase Client Has Hidden Limits**
- RPC calls truncate at ~1,000-2,000 rows
- Must implement chunked pagination in edge functions
- **Pitfall:** Trusting that `.rpc()` returns all data

### 3. **Sample vs. Total Distinction is Critical**
- UI can show 10k sample with estimated totals
- Campaign creation MUST fetch all IDs (not sample)
- Use proportions from sample to estimate actual totals
- **Pitfall:** Using `people.length` instead of `totalCount` or estimated counts

### 4. **Enabled/Disabled Filters in Wrong Context**
- Public-facing: Filter by `enabled = true`
- SMS marketing: Include ALL events (people are still valid)
- **Pitfall:** Applying public filters to admin tools

### 5. **Count Consistency Matters for UX**
- City dropdown counts must match "Select All" behavior
- Display counts must match send button counts
- **Pitfall:** Showing one count source in UI, using another for actions

### 6. **Edge Functions vs. Direct RPC**
- Complex queries with large result sets: Use edge functions
- Edge functions can paginate, add business logic, transform data
- **Pitfall:** Using direct RPC for queries that will scale up

---

## Files Modified

### Database
- `sms_marketing_campaigns` table - Added `event_id` column
- `get_sms_audience_paginated` function - Added QR scan support
- `get_events_with_people_counts_by_city` function - Created new
- `get_cities_with_event_people_counts` function - Created new

### Edge Functions
- `/supabase/functions/admin-sms-promotion-audience/index.ts` - Chunked pagination, ids_only mode, estimated counts
- `/supabase/functions/admin-get-events-for-sms/index.ts` - City counts endpoint, people counts
- `/supabase/functions/admin-sms-create-campaign/index.ts` - Event association

### Frontend
- `/art-battle-admin/src/components/PromotionSystem.jsx` - Event association UI, city loading, campaign fix

---

## Deployment Commands

```bash
# Database changes (run from anywhere)
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres << 'EOF'
-- Paste SQL here
EOF

# Edge functions (from /root/vote_app/vote26)
cd /root/vote_app/vote26
supabase functions deploy admin-sms-promotion-audience
supabase functions deploy admin-get-events-for-sms
supabase functions deploy admin-sms-create-campaign

# Frontend (from /root/vote_app/vote26/art-battle-admin)
cd /root/vote_app/vote26/art-battle-admin
./deploy.sh
```

---

## Future Considerations

### 1. **Monitor Campaign Sizes**
- Current limit: 100k recipients per campaign
- If audiences grow beyond 100k, will need further chunking
- Consider adding campaign size warnings in UI

### 2. **RFM Filter Estimation Accuracy**
- Currently estimates filtered count from 10k sample proportion
- For very large audiences with RFM filters, consider fetching full filtered list
- Trade-off: Accuracy vs. performance

### 3. **QR Scan Validity**
- Currently filters `pqs.is_valid = true`
- May need to understand what makes a scan invalid
- Document scan validation logic

### 4. **Event Association Required?**
- Currently optional (`event_id` can be NULL)
- Consider making required for better campaign tracking
- Add validation if required

### 5. **Caching Strategy**
- City/event lists are relatively static
- Consider caching with TTL for performance
- Current approach: Load on page load (acceptable for now)

---

## Known Issues & Limitations

### 1. **10k UI Display Limit**
- Modal shows max 10,000 people with details
- Not an issue for campaigns (which fetch all IDs)
- Consider adding warning if audience > 10k

### 2. **Estimated Counts for Display**
- Available/blocked counts are estimated from sample
- Accurate enough for decision-making
- True counts only known during campaign creation

### 3. **No Pagination in Event Selection**
- All events for city loaded at once (max 200)
- Works fine for current scale
- If cities have >200 relevant events, will need pagination

### 4. **Recent Message Filter**
- Checks `sms_outbound` table for messages in last N hours
- Query could be slow for very large `sms_outbound` table
- Consider adding index on `sent_at` if performance degrades

---

## Questions for Future Sessions

1. **What defines a "valid" QR scan?** (`people_qr_scans.is_valid`)
2. **Should event association be required for campaigns?**
3. **Do we need campaign size warnings/confirmations?**
4. **Should we cache city/event data?**
5. **Is 100k recipient limit per campaign acceptable long-term?**

---

## Contact for Issues

If issues arise with audience counting:
1. Check browser console for debug logs (campaign creation shows counts)
2. Verify database functions return expected totals (use SQL queries in this doc)
3. Check edge function logs (though as noted, `supabase functions logs` doesn't work - see `/root/vote_app/vote26/EDGE_FUNCTION_DEBUGGING_SECRET.md`)
4. Compare display counts with database query results

**Critical files to check:**
- Database: `get_sms_audience_paginated` function
- Edge: `admin-sms-promotion-audience/index.ts` (chunked pagination logic)
- Frontend: `PromotionSystem.jsx` (createCampaign function, line ~490)
