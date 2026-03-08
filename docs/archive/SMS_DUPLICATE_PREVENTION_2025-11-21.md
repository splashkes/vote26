# SMS Campaign Duplicate Message Prevention - November 21, 2025

## Executive Summary

Implemented critical send-time deduplication logic to prevent users from receiving duplicate SMS messages when multiple campaigns target overlapping audiences. This fix addresses a fundamental architectural issue where phone numbers were "baked in" at campaign creation time without re-checking for recent messages at send time.

**Status**: ✅ Deployed to production
**Impact**: Prevents duplicate messages across ALL campaigns
**Risk Level**: Critical issue - now resolved

---

## The Problem

### Issue Description

The SMS marketing system stored actual phone numbers in campaign metadata at creation time and sent to those exact numbers without checking if they had received recent messages. This created a high-risk scenario for duplicate sends.

### Root Cause

**Campaign Creation Flow (OLD):**
1. Admin selects audience with filters (events, RFM scores, recent message filter)
2. System queries database and gets list of phone numbers **at that moment**
3. System **stores phone numbers** in `metadata.recipient_data`
4. Campaign saved with status `queued` or `scheduled`

**Campaign Send Flow (OLD):**
1. Cron picks up campaign
2. Reads **stored phone numbers** from metadata
3. Sends to each number with only these checks:
   - ✅ Is phone opted out?
   - ✅ Is user blocked?
   - ❌ **NO CHECK for recent messages**

### High-Risk Scenarios

#### Scenario 1: Multiple Scheduled Campaigns
```
Monday 9am:    Campaign A created, scheduled for Wednesday 6pm
               → Stores 5,000 phone numbers
               → Recent message filter checks Monday's data

Tuesday 2pm:   Campaign B created, scheduled for Wednesday 6pm
               → Stores 2,000 phone numbers (800 overlap with A)
               → Recent message filter checks Tuesday's data
               → DOESN'T see Campaign A (not sent yet!)

Wednesday 6pm: Both campaigns fire
               → Campaign A sends to 5,000 people
               → Campaign B sends to 2,000 people
               → 800 PEOPLE GET DUPLICATE MESSAGES ❌
```

#### Scenario 2: Long-Running Campaigns
```
10:00am: Campaign with 10,000 recipients starts (queued)
         → Processes 100/minute = 100 minutes total

10:05am: Another campaign created for overlapping audience
         → Scheduled for 2pm same day

2:00pm:  Second campaign fires
         → First campaign STILL PROCESSING
         → Some people already got message at 10am
         → THEY GET ANOTHER ONE AT 2PM ❌
```

#### Scenario 3: Schedule Days Apart
```
Monday:    Campaign scheduled for Friday 6pm
           → 3,000 recipients stored
           → Recent message filter: last 72 hours (Mon-Wed)

Wednesday: Campaign scheduled for Friday 5pm
           → 2,000 recipients (1,000 overlap)
           → Recent message filter: last 72 hours (Wed-Fri)
           → DOESN'T see Monday's scheduled campaign

Friday:    Both fire within 1 hour
           → 1,000 PEOPLE GET DUPLICATES ❌
```

### Why This Was Critical

- **User Experience**: Frustrated recipients, spam perception
- **Cost**: Paying for duplicate sends (wasted money)
- **Compliance**: Potential violation of messaging best practices
- **Opt-out Risk**: Recipients more likely to block/opt-out
- **Carrier Reputation**: Higher spam complaints could affect deliverability

---

## The Solution

### Design Decision

Implemented **send-time deduplication** using the same `recent_message_hours` value from the campaign's anti-spam filter. This creates consistency: whatever window the admin chose at creation also applies at send time.

### Architecture Overview

```
Campaign Creation:
├─ Admin sets: "Exclude people who got messages in last 72 hours"
├─ System stores: recent_message_hours = 72 in metadata
└─ System stores: phone numbers in metadata.recipient_data

Campaign Send (NEW):
├─ Cron reads campaign metadata
├─ For each phone number:
│  ├─ Check: Is opted out? (existing)
│  ├─ Check: Is blocked? (existing)
│  ├─ Check: Got message in last N hours? (NEW ✅)
│  │  └─ If YES: Skip sending, log as duplicate
│  └─ If all checks pass: Send message
└─ Track: sent count, failed count, skipped count
```

### Key Implementation Details

#### 1. Store Anti-Spam Filter Value
**File**: `admin-sms-create-campaign/index.ts`

```typescript
// Line 89: Accept recent_message_hours from frontend
const {
  campaign_name,
  message,
  person_ids = [],
  // ... other fields
  recent_message_hours = 72 // Anti-spam filter from UI
} = await req.json();

// Line 237: Store in campaign metadata
metadata: {
  message_template: message,
  recipient_data: recipientData,
  recent_message_hours: recent_message_hours, // Store for send-time use
  // ... other fields
}
```

**Purpose**: Ensures the same anti-spam threshold applies at both creation and send time.

#### 2. Pass Value to Send Function
**File**: `sms-scheduled-campaigns-cron/index.ts`

```typescript
// Line 93: Read from campaign metadata
const recentMessageHours = campaign.metadata?.recent_message_hours || 72;

// Line 131: Pass to send function
body: JSON.stringify({
  to: person.phone,
  message: message,
  campaign_id: campaign.id,
  recent_message_hours: recentMessageHours, // Pass anti-spam value
  metadata: { campaign_name: campaign.name }
})
```

**Purpose**: Cron passes the stored threshold to each individual send call.

#### 3. Send-Time Deduplication Check
**File**: `send-marketing-sms/index.ts`

```typescript
// Line 34: Accept recent_message_hours parameter
const {
  to,
  message,
  recent_message_hours = 72,
  // ... other fields
} = await req.json();

// Lines 90-125: CRITICAL DEDUPLICATION LOGIC
if (recent_message_hours > 0) {
  const cutoffTime = new Date(
    Date.now() - recent_message_hours * 60 * 60 * 1000
  ).toISOString();

  const { data: recentMessages } = await supabase
    .from('sms_outbound')
    .select('id, sent_at, campaign_id')
    .eq('to_phone', toFormatted)
    .gte('sent_at', cutoffTime)
    .order('sent_at', { ascending: false })
    .limit(1);

  if (recentMessages && recentMessages.length > 0) {
    const lastMessage = recentMessages[0];
    const hoursSince = Math.round(
      (Date.now() - new Date(lastMessage.sent_at).getTime()) / (60 * 60 * 1000)
    );

    console.log(`DUPLICATE PREVENTED: ${toFormatted} received message ${hoursSince}h ago`);

    return new Response(JSON.stringify({
      success: false,
      skipped: true,
      error: 'Duplicate message prevented',
      reason: `Phone received message ${hoursSince} hour(s) ago`,
      phone: toFormatted,
      last_message_at: lastMessage.sent_at,
      last_campaign_id: lastMessage.campaign_id
    }), {
      status: 200, // Return 200 so cron doesn't retry
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
```

**Key Details**:
- Checks `sms_outbound` table for any message sent to this phone in last N hours
- Works across ALL campaigns (not just same-campaign duplicates)
- Returns status 200 with `skipped: true` so cron knows to track it differently
- Logs which campaign sent the previous message for debugging

#### 4. Track Skipped Duplicates
**File**: `sms-scheduled-campaigns-cron/index.ts`

```typescript
// Line 114: Track three categories
let sentCount = 0;
let failedCount = 0;
let skippedCount = 0; // NEW: Track duplicates prevented

const duplicatesSkipped = campaign.metadata?.duplicates_skipped || [];

// Lines 145-157: Handle skipped response
if (sendResponse.ok && sendResult.skipped) {
  // Message skipped due to duplicate prevention
  skippedCount++;
  console.log(`Duplicate skipped for ${person.phone}: ${sendResult.reason}`);

  duplicatesSkipped.push({
    person_id: person.id,
    phone: person.phone,
    name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
    reason: sendResult.reason,
    last_message_at: sendResult.last_message_at,
    last_campaign_id: sendResult.last_campaign_id,
    timestamp: new Date().toISOString()
  });
}

// Lines 189-205: Update campaign with duplicate stats
const totalSkipped = (campaign.metadata?.duplicates_prevented || 0) + skippedCount;

await supabase
  .from('sms_marketing_campaigns')
  .update({
    metadata: {
      ...campaign.metadata,
      duplicates_skipped: duplicatesSkipped, // Array of detailed records
      duplicates_prevented: totalSkipped     // Total count for UI
    }
  })
  .eq('id', campaign.id);
```

**Purpose**: Provides full visibility into which messages were prevented and why.

#### 5. Database Performance Optimization

```sql
CREATE INDEX IF NOT EXISTS idx_sms_outbound_to_phone_sent_at
ON sms_outbound(to_phone, sent_at DESC)
WHERE sent_at IS NOT NULL;
```

**Purpose**:
- Optimizes the duplicate check query
- Composite index on (to_phone, sent_at) makes lookups extremely fast
- Filtered index (WHERE sent_at IS NOT NULL) reduces index size
- Descending order on sent_at matches query pattern (most recent first)

**Performance**:
- Without index: Full table scan (slow with millions of messages)
- With index: Direct lookup in microseconds

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ CAMPAIGN CREATION (UI)                                       │
├─────────────────────────────────────────────────────────────┤
│ Admin sets: recent_message_hours = 72                        │
│ System stores in metadata:                                   │
│   - recipient_data: [{phone: "+1555...", ...}, ...]         │
│   - recent_message_hours: 72                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Campaign saved with status: queued/scheduled
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ CRON PROCESSING (Every 60 seconds)                          │
├─────────────────────────────────────────────────────────────┤
│ 1. Load campaigns (queued/scheduled)                         │
│ 2. Read metadata.recipient_data (phone list)                 │
│ 3. Read metadata.recent_message_hours (72)                   │
│ 4. For each recipient (100 per minute):                      │
│    └─ Call send-marketing-sms with recent_message_hours      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ For each phone number
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ SEND FUNCTION (send-marketing-sms)                          │
├─────────────────────────────────────────────────────────────┤
│ Check 1: Is opted out?                                       │
│   └─ If YES: Return error (don't send)                       │
│                                                               │
│ Check 2: Got message in last N hours? (NEW!)                 │
│   ├─ Query: sms_outbound WHERE to_phone = X                  │
│   │          AND sent_at >= (now - N hours)                  │
│   ├─ If FOUND: Return {skipped: true}                        │
│   └─ If NOT FOUND: Continue...                               │
│                                                               │
│ Check 3: Is blocked?                                         │
│   └─ If YES: Return error (don't send)                       │
│                                                               │
│ All checks passed:                                           │
│   ├─ Send via Telnyx API                                     │
│   └─ Log to sms_outbound                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Return result
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ CRON TRACKING                                                │
├─────────────────────────────────────────────────────────────┤
│ Categorize result:                                           │
│   ├─ success: true → sentCount++                             │
│   ├─ skipped: true → skippedCount++                          │
│   └─ error → failedCount++                                   │
│                                                               │
│ Update campaign:                                             │
│   ├─ messages_sent: total sent                               │
│   ├─ messages_failed: total failed                           │
│   └─ metadata.duplicates_prevented: total skipped            │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing & Verification

### Test Case 1: Overlapping Scheduled Campaigns

**Setup:**
1. Create Campaign A with 5,000 recipients, scheduled for Friday 6pm
2. Create Campaign B with 3,000 recipients (2,000 overlap), scheduled for Friday 6pm
3. Both use 72-hour anti-spam filter

**Expected Result:**
- Campaign A: 5,000 sent, 0 skipped
- Campaign B (fires after A): 1,000 sent, 2,000 skipped

**Verification Query:**
```sql
SELECT
  name,
  messages_sent,
  metadata->'duplicates_prevented' as duplicates_prevented,
  scheduled_at
FROM sms_marketing_campaigns
WHERE name IN ('Campaign A', 'Campaign B')
ORDER BY scheduled_at;
```

### Test Case 2: Immediate + Scheduled

**Setup:**
1. Create Campaign A with 1,000 recipients, send immediately (queued)
2. 30 minutes later: Create Campaign B with 500 recipients (300 overlap), send immediately
3. Both use 72-hour anti-spam filter

**Expected Result:**
- Campaign A: 1,000 sent, 0 skipped
- Campaign B: 200 sent, 300 skipped (duplicates from Campaign A)

### Test Case 3: Different Anti-Spam Windows

**Setup:**
1. Campaign A: 24-hour window, sends to 100 people
2. 12 hours later: Campaign B: 72-hour window, targets same 100 people
3. 26 hours later: Campaign C: 24-hour window, targets same 100 people

**Expected Result:**
- Campaign A: 100 sent
- Campaign B (12h later): 0 sent, 100 skipped (within 72h of A)
- Campaign C (26h later): 100 sent, 0 skipped (outside 24h window)

### Verification Commands

```sql
-- Check recent campaign results
SELECT
  id,
  name,
  status,
  total_recipients,
  messages_sent,
  messages_failed,
  metadata->'duplicates_prevented' as duplicates_prevented,
  created_at,
  completed_at
FROM sms_marketing_campaigns
WHERE created_at >= NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- See duplicate details for specific campaign
SELECT
  jsonb_pretty(metadata->'duplicates_skipped')
FROM sms_marketing_campaigns
WHERE id = 'campaign-id-here';

-- Check index is being used
EXPLAIN ANALYZE
SELECT id, sent_at, campaign_id
FROM sms_outbound
WHERE to_phone = '+15551234567'
  AND sent_at >= NOW() - INTERVAL '72 hours'
ORDER BY sent_at DESC
LIMIT 1;
-- Should show "Index Scan using idx_sms_outbound_to_phone_sent_at"
```

---

## Configuration

### Admin UI Setting

The deduplication uses the value from:

**PromotionSystem.jsx → Anti-Spam Filter Section:**
```
Exclude people who received messages in the last [N] hours
(0 = disabled, default: 72h)
```

**Recommended Values:**
- **72 hours (default)**: Good balance for most campaigns
- **48 hours**: For more frequent campaigns (bi-weekly promos)
- **24 hours**: For daily campaigns (event reminders)
- **0 hours**: Disables deduplication (NOT RECOMMENDED)

### Edge Cases

#### Case 1: Admin Sets recent_message_hours = 0

**Behavior**: Deduplication is disabled
```typescript
if (recent_message_hours > 0) {
  // Skip check if value is 0
}
```

**When to use**:
- Testing campaigns
- Urgent system-wide announcements
- When you explicitly WANT to send to everyone regardless of recent messages

**Warning**: Should be rare! Most campaigns should use 24+ hours.

#### Case 2: Old Campaigns Without recent_message_hours

**Behavior**: Defaults to 72 hours
```typescript
const recentMessageHours = campaign.metadata?.recent_message_hours || 72;
```

**Impact**: Existing scheduled campaigns created before this deployment will use 72-hour deduplication.

#### Case 3: Manual SMS from Conversations Interface

**Current Behavior**: Manual messages from `SMSConversations.jsx` do NOT currently pass `recent_message_hours`

**Recommendation**: Consider adding deduplication to manual sends in future update (lower priority since admins send these intentionally).

---

## Impact on Existing Campaigns

### Scheduled Campaigns (Already Created)

**Status**: ✅ Automatically protected

Any campaign with status `scheduled` or `queued` that hasn't sent yet will use the new deduplication logic when it fires.

**Default Behavior**: Will use 72-hour window if campaign was created before this deployment.

### In-Progress Campaigns

**Status**: ✅ Automatically protected

Campaigns currently processing (status: `in_progress`) will use deduplication for all remaining messages.

### Completed Campaigns

**Status**: N/A - Already finished

No impact on campaigns that already completed.

### Retroactive Analysis

To find potential duplicates that occurred BEFORE this fix:

```sql
WITH duplicate_sends AS (
  SELECT
    to_phone,
    campaign_id,
    sent_at,
    LAG(sent_at) OVER (PARTITION BY to_phone ORDER BY sent_at) as prev_sent_at,
    LAG(campaign_id) OVER (PARTITION BY to_phone ORDER BY sent_at) as prev_campaign_id
  FROM sms_outbound
  WHERE sent_at >= '2025-11-01'  -- Adjust date range
    AND status = 'sent'
)
SELECT
  to_phone,
  campaign_id as current_campaign,
  prev_campaign_id as previous_campaign,
  sent_at,
  prev_sent_at,
  EXTRACT(EPOCH FROM (sent_at - prev_sent_at)) / 3600 as hours_between
FROM duplicate_sends
WHERE prev_sent_at IS NOT NULL
  AND sent_at - prev_sent_at < INTERVAL '72 hours'
ORDER BY sent_at DESC
LIMIT 100;
```

---

## Monitoring & Alerting

### Key Metrics to Track

**1. Duplicate Prevention Rate**
```sql
SELECT
  DATE(created_at) as day,
  COUNT(*) as total_campaigns,
  SUM(messages_sent) as total_sent,
  SUM((metadata->>'duplicates_prevented')::int) as total_prevented,
  ROUND(
    100.0 * SUM((metadata->>'duplicates_prevented')::int) /
    NULLIF(SUM(total_recipients), 0),
    2
  ) as prevention_rate_percent
FROM sms_marketing_campaigns
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND status = 'completed'
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

**Expected**: 5-15% prevention rate is normal for overlapping campaigns. >50% might indicate over-scheduling.

**2. Campaign Overlap Analysis**
```sql
-- Find campaigns scheduled within 24 hours of each other
WITH scheduled_campaigns AS (
  SELECT
    id,
    name,
    scheduled_at,
    targeting_criteria->'events' as event_list
  FROM sms_marketing_campaigns
  WHERE status IN ('scheduled', 'queued')
)
SELECT
  a.name as campaign_1,
  b.name as campaign_2,
  a.scheduled_at as time_1,
  b.scheduled_at as time_2,
  EXTRACT(EPOCH FROM (b.scheduled_at - a.scheduled_at)) / 3600 as hours_apart,
  a.event_list = b.event_list as same_events
FROM scheduled_campaigns a
CROSS JOIN scheduled_campaigns b
WHERE a.id < b.id
  AND ABS(EXTRACT(EPOCH FROM (b.scheduled_at - a.scheduled_at))) < 86400 -- 24 hours
ORDER BY hours_apart;
```

**Alert if**: Multiple campaigns for same events scheduled within 24 hours.

**3. Performance Check (Index Usage)**
```sql
-- Run EXPLAIN on duplicate check query
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sent_at, campaign_id
FROM sms_outbound
WHERE to_phone = '+15551234567'
  AND sent_at >= NOW() - INTERVAL '72 hours'
ORDER BY sent_at DESC
LIMIT 1;
```

**Expected**: `Index Scan using idx_sms_outbound_to_phone_sent_at` with execution time < 1ms

**Alert if**: Query takes > 10ms or shows `Seq Scan`.

---

## Known Limitations & Future Considerations

### 1. Manual SMS from Conversations Interface

**Current State**: Manual messages sent via `SMSConversations.jsx` do NOT use deduplication.

**Reasoning**: Admins send these intentionally in response to customer messages.

**Future Enhancement**: Add optional deduplication with shorter window (e.g., 1 hour) to prevent accidental double-sends.

### 2. Cross-Campaign Type Deduplication

**Current State**: Deduplication works across all marketing campaigns.

**Question**: Should we deduplicate against transactional messages (order confirmations, tickets)?

**Recommendation**: Keep separate for now. Marketing vs. transactional are different message types.

### 3. Per-Event Deduplication

**Current State**: Deduplication is global across all campaigns.

**Future Enhancement**: Could add option to deduplicate "per event" - allowing someone to get messages about different events even if within threshold.

**Example Use Case**:
- User gets message about Toronto event on Monday
- User gets message about Vancouver event on Tuesday (within 72h)
- Currently: Second message would be blocked
- Future: Could allow if different events

### 4. UI Display of Duplicate Stats

**Current State**: Duplicate counts stored in metadata but not displayed in UI.

**Future Enhancement**: Add to campaign results display:
```
Campaign Results:
✓ 8,500 messages sent
✗ 23 failed
⊘ 1,200 duplicates prevented
```

**File to modify**: `PromotionSystem.jsx` (campaign details section)

### 5. Duplicate Prevention Reporting

**Future Enhancement**: Add admin dashboard showing:
- Duplicate prevention trends over time
- Which campaigns had highest duplicate rates
- Which event combinations cause most overlaps
- Suggested optimal scheduling to minimize duplicates

---

## Troubleshooting

### Issue: Campaign shows 0 sent, all skipped

**Possible Causes:**
1. Another campaign targeting same audience just completed
2. `recent_message_hours` set too high (e.g., 720 hours = 30 days)
3. Test campaign sent to same audience recently

**Investigation:**
```sql
-- Check campaign metadata
SELECT
  name,
  messages_sent,
  metadata->'duplicates_prevented' as prevented_count,
  metadata->'recent_message_hours' as dedup_window,
  metadata->'duplicates_skipped' as skip_details
FROM sms_marketing_campaigns
WHERE id = 'campaign-id-here';

-- Check what campaigns recently sent to these people
SELECT DISTINCT
  c.name,
  c.completed_at,
  COUNT(*) as messages_sent
FROM sms_marketing_campaigns c
JOIN sms_outbound o ON o.campaign_id = c.id
WHERE o.to_phone IN (
  SELECT phone FROM jsonb_to_recordset(
    (SELECT metadata->'recipient_data'
     FROM sms_marketing_campaigns
     WHERE id = 'campaign-id-here')
  ) AS x(phone text)
)
AND c.completed_at >= NOW() - INTERVAL '7 days'
GROUP BY c.name, c.completed_at
ORDER BY c.completed_at DESC;
```

**Solution:** Adjust `recent_message_hours` or wait for threshold to pass.

### Issue: Duplicate prevention not working

**Possible Causes:**
1. Index not being used (performance issue)
2. `recent_message_hours` set to 0 (disabled)
3. Messages sent from different source (not via marketing campaigns)

**Investigation:**
```sql
-- Check if index exists
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'sms_outbound'
  AND indexname = 'idx_sms_outbound_to_phone_sent_at';

-- Check if function is checking correctly (look at edge function logs)
-- Edge function should log: "DUPLICATE PREVENTED: +1555... received message Xh ago"

-- Check recent_message_hours for campaign
SELECT metadata->'recent_message_hours'
FROM sms_marketing_campaigns
WHERE id = 'campaign-id-here';
```

**Solution:**
- If index missing: Run CREATE INDEX command from this doc
- If recent_message_hours = 0: Campaign has deduplication disabled
- Check edge function logs for "DUPLICATE PREVENTED" messages

### Issue: Performance degradation during campaign send

**Symptoms**: Campaign processing slower than 100 messages/minute

**Investigation:**
```sql
-- Check query performance
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, sent_at, campaign_id
FROM sms_outbound
WHERE to_phone = '+15551234567'
  AND sent_at >= NOW() - INTERVAL '72 hours'
ORDER BY sent_at DESC
LIMIT 1;

-- Check table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_live_tup,
  n_dead_tup
FROM pg_stat_user_tables
WHERE tablename = 'sms_outbound';
```

**Solution:**
- If query slow: Reindex `idx_sms_outbound_to_phone_sent_at`
- If table bloated: Run `VACUUM ANALYZE sms_outbound;`
- If indexes fragmented: `REINDEX INDEX idx_sms_outbound_to_phone_sent_at;`

---

## Files Modified

### Edge Functions (Backend)

**1. `/root/vote_app/vote26/supabase/functions/admin-sms-create-campaign/index.ts`**
- Line 89: Accept `recent_message_hours` from request body
- Line 237: Store in campaign metadata
- Purpose: Persist anti-spam threshold with campaign

**2. `/root/vote_app/vote26/supabase/functions/sms-scheduled-campaigns-cron/index.ts`**
- Line 93: Read `recent_message_hours` from campaign metadata
- Line 114: Track `skippedCount` separately from failures
- Line 131: Pass `recent_message_hours` to send function
- Lines 145-157: Handle `skipped` response from send function
- Lines 189-205: Update campaign with duplicate statistics
- Purpose: Coordinate deduplication and track results

**3. `/root/vote_app/vote26/supabase/functions/send-marketing-sms/index.ts`**
- Line 34: Accept `recent_message_hours` parameter
- Lines 90-125: **CRITICAL** - Send-time deduplication check
- Purpose: Prevent duplicate sends at the point of delivery

### Frontend

**4. `/root/vote_app/vote26/art-battle-admin/src/components/PromotionSystem.jsx`**
- Line 797: Pass `recent_message_hours` to campaign creation API
- Purpose: Send UI filter value to backend

### Database

**5. Database Index**
```sql
CREATE INDEX idx_sms_outbound_to_phone_sent_at
ON sms_outbound(to_phone, sent_at DESC)
WHERE sent_at IS NOT NULL;
```
- Purpose: Optimize duplicate detection query
- Impact: Makes lookups extremely fast

---

## Deployment Details

**Date**: November 21, 2025
**Time**: ~17:00 UTC
**Deployed By**: Claude + User

**Deployment Sequence:**
1. ✅ Database index created
2. ✅ Edge functions deployed:
   - `admin-sms-create-campaign`
   - `sms-scheduled-campaigns-cron`
   - `send-marketing-sms`
3. ✅ Frontend deployed (admin interface)

**Rollback Plan:**
If issues arise, can revert by:
1. Redeploying previous edge function versions
2. Index can stay (doesn't hurt)
3. Old campaigns without `recent_message_hours` will default to 72h (safe)

**Validation:**
```sql
-- Confirm new campaigns have recent_message_hours stored
SELECT
  name,
  metadata->'recent_message_hours' as dedup_window
FROM sms_marketing_campaigns
WHERE created_at >= '2025-11-21'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Success Metrics

### Short-term (1 week)

- [ ] Zero duplicate messages reported by users
- [ ] Duplicate prevention rate: 5-15% (indicates it's working but not over-blocking)
- [ ] No performance degradation (campaigns still process at 100 msg/min)
- [ ] Edge function logs show "DUPLICATE PREVENTED" messages

### Medium-term (1 month)

- [ ] Cost savings from prevented duplicates (measure: prevented_count × $0.01)
- [ ] No increase in opt-out rate
- [ ] Positive feedback from admin users (fewer "duplicate" complaints)

### Long-term (3 months)

- [ ] Campaign coordination improves (fewer overlapping schedules)
- [ ] Enhanced UI showing duplicate stats implemented
- [ ] Analytics dashboard for duplicate prevention trends

---

## Related Documentation

- `SMS_MARKETING_SYSTEM_IMPROVEMENTS_2025-11-14.md` - Previous SMS improvements including async processing
- `SMS_AUDIENCE_COUNTING_FIXES_2025-11-04.md` - Audience calculation and QR scan integration
- `SMS_CAMPAIGN_IMPLEMENTATION_2024-11-13.md` - Original campaign system implementation

---

## Contact & Support

**If duplicate messages occur after this fix:**
1. Check campaign metadata: Does it have `recent_message_hours` set?
2. Check edge function logs: Are duplicates being detected?
3. Run investigation queries from Troubleshooting section
4. Check database index: Is it being used?

**For future enhancements:**
- UI display of duplicate stats
- Per-event deduplication option
- Manual message deduplication
- Cross-campaign coordination dashboard

---

**Document Version**: 1.0
**Last Updated**: November 21, 2025
**Status**: ✅ Deployed and Active
