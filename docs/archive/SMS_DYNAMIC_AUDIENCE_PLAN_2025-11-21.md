# SMS Campaign Dynamic Audience Reprocessing - Implementation Plan
**Date**: November 21, 2025
**Status**: 📋 PLANNING - DO NOT IMPLEMENT YET

---

## Executive Summary

Add optional "reprocess audience at send time" feature for campaigns scheduled for future events where the audience will grow between campaign creation and send time.

**Use Case**:
- Schedule "congrats to WINNER" message for Sunday morning
- Event happens Saturday night
- At creation time (Friday): 50 people registered
- At send time (Sunday): 500 people attended via QR scans
- **Want to send to all 500, not just the 50**

**Approach**:
- Add opt-in checkbox "Re-process audience at time of send"
- Store targeting criteria (already doing this)
- At send time: Re-run audience query to get current list
- Still respect: anti-spam, blocked, opt-outs, duplicate prevention
- **Backward compatible**: Default is OFF (current behavior)

---

## Problem Statement

### Current System Behavior

```
Campaign Creation (Friday 5pm):
├─ Query database with filters
├─ Find 50 phone numbers
├─ Store in metadata.recipient_data: ["+1555...", "+1666...", ...]
├─ Set total_recipients: 50
└─ Save campaign (scheduled for Sunday 10am)

Event Happens (Saturday 8pm):
├─ 450 more people attend
├─ QR scans create people_qr_scans records
└─ Campaign doesn't know about them!

Campaign Sends (Sunday 10am):
├─ Read metadata.recipient_data (50 numbers)
├─ Send to those 50 people
└─ 450 attendees don't get message ❌
```

### Why This Is a Problem

1. **Post-Event Messages**: "Thanks for coming!" messages scheduled before event happens
2. **Winner Announcements**: Scheduled for next morning, audience grows during event
3. **Next Event Promotions**: "Join us again!" - want to include everyone who attended
4. **Late Arrivals**: People who scan QR codes late in evening miss scheduled morning message

### Real-World Example

```
Event: Art Battle Toronto - Saturday 7pm
Campaign Created: Friday 2pm
Scheduled For: Sunday 10am
Message: "Congrats to WINNER Sarah! Join us next month [LINK] for 50% off"

At Creation Time:
  - 78 pre-registered attendees
  - Campaign stores 78 phone numbers

At Event Time (Saturday 7pm-10pm):
  - 412 people attend and scan QR codes
  - Total audience: 490 people

At Send Time (Sunday 10am):
  - Sends to 78 people (the original list) ❌
  - 412 attendees don't get winner announcement ❌
  - Missed opportunity for 50% off promo ❌
```

---

## Proposed Solution

### Feature Overview

Add **optional** checkbox in campaign creation UI:

```
☐ Re-process audience at time of send

When enabled, the audience will be recalculated just before sending
based on your selected events and filters. This ensures you reach all
attendees, including those who register or scan QR codes after you
create this campaign.

⚠️ Warning: The actual audience size may differ significantly from
the current estimate. The final audience will be determined when the
campaign sends.

Current estimated audience: 78 people
Final audience will be calculated at: Sunday, Nov 24 at 10:00 AM
```

### How It Works

**When Checkbox is UNCHECKED (Default - Current Behavior):**
```
1. Query audience at creation time
2. Store phone numbers in metadata.recipient_data
3. At send time: Use stored list
4. ✅ Audience is locked in at creation time
```

**When Checkbox is CHECKED (New Behavior):**
```
1. Query audience at creation time (for cost estimate only)
2. Store targeting criteria in metadata
3. Store: reprocess_audience_at_send: true
4. At send time:
   ├─ Re-run audience query with CURRENT data
   ├─ Apply all filters (RFM, blocked, opt-out, anti-spam)
   ├─ Get updated phone list
   └─ Send to updated audience
5. ✅ Audience reflects latest event data
```

### Key Design Principles

1. **Opt-in Only**: Default is OFF to maintain current behavior
2. **Backward Compatible**: Existing campaigns unaffected
3. **Safety First**: Apply all safety checks at send time
4. **Transparent**: Show clear warnings about potential size changes
5. **Cost Aware**: Provide estimates but acknowledge uncertainty

---

## Technical Architecture

### Data Flow Comparison

#### Current System (Checkbox OFF)
```
┌─────────────────────────────────────────────────────────────┐
│ CAMPAIGN CREATION                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Query audience with filters                               │
│    └─ admin-sms-promotion-audience(events, rfm, hours)       │
│ 2. Get phone list: ["+1555...", "+1666...", ...]            │
│ 3. Store in metadata.recipient_data                          │
│ 4. Store total_recipients: 50                                │
│ 5. Store targeting_criteria (for reference only)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Campaign saved with locked audience
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ CAMPAIGN SEND (Cron)                                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Read metadata.recipient_data (50 phones)                  │
│ 2. For each phone:                                           │
│    └─ Send with deduplication check                          │
│ 3. Send to exactly 50 people                                 │
└─────────────────────────────────────────────────────────────┘
```

#### New System (Checkbox ON)
```
┌─────────────────────────────────────────────────────────────┐
│ CAMPAIGN CREATION                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Query audience with filters                               │
│    └─ admin-sms-promotion-audience(events, rfm, hours)       │
│ 2. Get estimated size: 50 people                             │
│ 3. Store targeting_criteria: {events, rfm_filters, hours}    │
│ 4. Store metadata:                                           │
│    ├─ reprocess_audience_at_send: true ✨ NEW               │
│    ├─ estimated_recipients: 50 (at creation time)            │
│    ├─ recipient_data: [...] (for preview/estimate only)      │
│    └─ recent_message_hours: 72                               │
│ 5. Store total_recipients: 50 (estimate)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Campaign saved with CRITERIA, not locked list
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ CAMPAIGN SEND (Cron) - REPROCESS MODE                       │
├─────────────────────────────────────────────────────────────┤
│ 1. Check: metadata.reprocess_audience_at_send === true?     │
│    └─ If YES: Continue with reprocessing                     │
│                                                               │
│ 2. Re-run audience query ✨ NEW                              │
│    ├─ Read targeting_criteria from metadata                  │
│    ├─ Call admin-sms-promotion-audience with:                │
│    │  ├─ event_ids: from targeting_criteria.events           │
│    │  ├─ rfm_filters: from targeting_criteria.rfm_filters    │
│    │  ├─ recent_message_hours: from metadata                 │
│    │  └─ ids_only: true (get full list)                      │
│    └─ Get CURRENT phone list: ["+1555...", "+1666...", ...] │
│                                                               │
│ 3. Now have: 490 phones (vs 50 estimated!) ✨                │
│                                                               │
│ 4. Log audience change:                                      │
│    └─ "Audience reprocessed: 50 → 490 (+880%)"              │
│                                                               │
│ 5. Update campaign metadata:                                 │
│    ├─ actual_recipients: 490                                 │
│    ├─ audience_change_percent: +880%                         │
│    └─ reprocessed_at: timestamp                              │
│                                                               │
│ 6. Process batch (100 at a time):                            │
│    └─ Send with all safety checks (dedup, opt-out, blocked)  │
│                                                               │
│ 7. Track results:                                            │
│    ├─ messages_sent: X                                       │
│    ├─ messages_failed: Y                                     │
│    └─ duplicates_prevented: Z                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### Campaign Metadata Extensions

**Current metadata structure:**
```json
{
  "message_template": "Congrats to WINNER!...",
  "recipient_data": [
    {"id": "uuid", "phone": "+1555...", "first_name": "John", ...},
    ...
  ],
  "recent_message_hours": 72,
  "estimated_segments": 1,
  "blocked_count": 5
}
```

**New metadata fields (when reprocess enabled):**
```json
{
  "message_template": "Congrats to WINNER!...",

  // NEW FIELDS FOR REPROCESSING
  "reprocess_audience_at_send": true,           // Flag to enable reprocessing
  "estimated_recipients": 50,                    // Size at creation time
  "recipient_data": [...],                       // For preview only

  // Populated at send time:
  "actual_recipients": 490,                      // Actual size after reprocessing
  "audience_change_percent": 880,                // Percent change
  "audience_change_absolute": 440,               // Absolute change
  "reprocessed_at": "2025-11-24T10:00:00Z",     // When reprocessed
  "reprocess_duration_ms": 2341,                 // How long query took

  // Existing fields (still used)
  "recent_message_hours": 72,
  "estimated_segments": 1,
  "blocked_count": 5
}
```

### No Table Schema Changes Required

All changes use existing `metadata` JSONB field. No migrations needed.

**Reasoning**:
- Flexible schema evolution
- Backward compatible
- Easy to add/remove features
- Existing indexes work

---

## Implementation Details

### 1. Frontend Changes (PromotionSystem.jsx)

#### Add Checkbox UI

**Location**: Campaign creation form, after scheduling section

```javascript
// NEW STATE
const [reprocessAudienceAtSend, setReprocessAudienceAtSend] = useState(false);

// NEW UI SECTION (after scheduling fields)
<Box>
  <Flex align="center" gap="2">
    <Checkbox
      checked={reprocessAudienceAtSend}
      onCheckedChange={setReprocessAudienceAtSend}
      disabled={!scheduledAt} // Only for scheduled campaigns
    />
    <Text size="2" weight="bold">
      Re-process audience at time of send
    </Text>
  </Flex>

  {reprocessAudienceAtSend && (
    <Callout.Root color="orange" mt="2">
      <Callout.Icon>
        <InfoCircledIcon />
      </Callout.Icon>
      <Callout.Text>
        <Text size="2">
          <strong>Dynamic Audience Mode:</strong> The audience will be
          recalculated just before sending. This ensures you reach all
          attendees, including those who register or scan QR codes after
          creating this campaign.
        </Text>
        <Box mt="2">
          <Text size="1" color="gray">
            • Current estimated audience: <strong>{audienceData.filtered_count} people</strong><br/>
            • Final audience will be calculated at: <strong>{formatScheduledTime(scheduledAt)}</strong><br/>
            • The actual size may differ significantly from this estimate<br/>
            • All safety filters (anti-spam, blocked, opt-out) will still apply
          </Text>
        </Box>
      </Callout.Text>
    </Callout.Root>
  )}
</Box>
```

#### Update Campaign Creation Call

```javascript
// In createCampaign function, add new parameter
body: JSON.stringify({
  campaign_name: campaignName,
  message: message,
  person_ids: personIds,
  event_id: associatedEventId || null,
  targeting_criteria: {
    cities: [],
    events: selectedEvents,
    rfm_filters: rfmFilters.enabled ? rfmFilters : null
  },
  estimated_segments: messageSegments,
  scheduled_at: scheduledAtUTC,
  scheduled_timezone: scheduleTimezone,
  scheduled_local_time: scheduledAt,
  dry_run_mode: dryRunMode,
  dry_run_phone: dryRunMode ? '+14163025959' : null,
  recent_message_hours: recentMessageHours,
  reprocess_audience_at_send: reprocessAudienceAtSend // NEW
})
```

#### Validation Rules

```javascript
// Only allow reprocess for scheduled campaigns
if (reprocessAudienceAtSend && !scheduledAt) {
  throw new Error('Audience reprocessing only available for scheduled campaigns');
}

// Warning if immediate send with reprocess enabled
if (reprocessAudienceAtSend && !scheduledAt) {
  // Show warning dialog
}
```

### 2. Backend Changes (admin-sms-create-campaign)

#### Accept New Parameter

```typescript
// Line 89: Add new parameter
const {
  campaign_name,
  message,
  person_ids = [],
  event_id = null,
  targeting_criteria = {},
  estimated_segments = 1,
  test_mode = false,
  scheduled_at = null,
  scheduled_timezone = null,
  scheduled_local_time = null,
  dry_run_mode = false,
  dry_run_phone = null,
  recent_message_hours = 72,
  reprocess_audience_at_send = false // NEW
} = await req.json();
```

#### Validation

```typescript
// Validate reprocess option
if (reprocess_audience_at_send) {
  // Must be scheduled (not immediate)
  if (!scheduled_at) {
    return new Response(JSON.stringify({
      error: 'Audience reprocessing requires a scheduled send time'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Must have targeting criteria
  if (!targeting_criteria.events || targeting_criteria.events.length === 0) {
    return new Response(JSON.stringify({
      error: 'Audience reprocessing requires event selection'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  console.log('Campaign will reprocess audience at send time');
}
```

#### Store Metadata

```typescript
// Line 227-238: Update metadata storage
metadata: {
  message_template: message,
  dry_run_mode: dry_run_mode,
  dry_run_phone: dry_run_mode ? dry_run_phone : null,
  blocked_count: blockedCount,
  valid_recipients: validRecipients.length,
  scheduled_timezone: scheduled_timezone,
  scheduled_local_time: scheduled_local_time,

  // If reprocessing, recipient_data is for estimate only
  recipient_data: recipientData,
  estimated_recipients: reprocess_audience_at_send ? validRecipients.length : null,

  estimated_segments: estimated_segments,
  recent_message_hours: recent_message_hours,

  // NEW: Reprocessing flag and targeting criteria
  reprocess_audience_at_send: reprocess_audience_at_send,
  targeting_criteria_snapshot: reprocess_audience_at_send ? {
    events: targeting_criteria.events,
    rfm_filters: targeting_criteria.rfm_filters,
    recent_message_hours: recent_message_hours
  } : null
}
```

### 3. Cron Changes (sms-scheduled-campaigns-cron)

#### Check for Reprocess Flag

```typescript
// Line 91-97: After reading campaign metadata
const message = campaign.metadata?.message_template;
const recipientData = campaign.metadata?.recipient_data || [];
const recentMessageHours = campaign.metadata?.recent_message_hours || 72;
const shouldReprocess = campaign.metadata?.reprocess_audience_at_send === true; // NEW

// NEW: Reprocessing logic
if (shouldReprocess) {
  console.log(`Campaign ${campaign.id} requires audience reprocessing`);

  try {
    // Re-run audience query
    const criteriaSnapshot = campaign.metadata?.targeting_criteria_snapshot;

    if (!criteriaSnapshot) {
      throw new Error('Missing targeting_criteria_snapshot for reprocessing');
    }

    const reprocessStartTime = Date.now();

    // Call admin-sms-promotion-audience to get current audience
    const audienceResponse = await fetch(
      `${supabaseUrl}/functions/v1/admin-sms-promotion-audience`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_ids: criteriaSnapshot.events,
          rfm_filters: criteriaSnapshot.rfm_filters,
          recent_message_hours: criteriaSnapshot.recent_message_hours,
          ids_only: true // Get full list
        })
      }
    );

    const audienceResult = await audienceResponse.json();

    if (!audienceResponse.ok) {
      throw new Error(`Audience reprocessing failed: ${audienceResult.error}`);
    }

    // Get updated person IDs
    const updatedPersonIds = audienceResult.people
      .filter(p => !p.blocked)
      .map(p => p.id);

    console.log(`Audience reprocessed: ${campaign.metadata.estimated_recipients || recipientData.length} → ${updatedPersonIds.length}`);

    // Fetch full person data for updated IDs (in chunks)
    const chunkSize = 5000;
    let allPeople = [];

    for (let i = 0; i < updatedPersonIds.length; i += chunkSize) {
      const chunk = updatedPersonIds.slice(i, i + chunkSize);
      const { data: chunkPeople } = await supabase
        .rpc('get_people_for_campaign', { person_ids: chunk });

      if (chunkPeople && chunkPeople.length > 0) {
        allPeople = allPeople.concat(chunkPeople);
      }
    }

    // Convert to recipient data format
    const reprocessedRecipientData = allPeople.map(person => ({
      id: person.id,
      phone: person.phone || person.phone_number,
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      hash: person.hash || ''
    }));

    // Calculate change metrics
    const originalCount = campaign.metadata?.estimated_recipients || recipientData.length;
    const newCount = reprocessedRecipientData.length;
    const changeAbsolute = newCount - originalCount;
    const changePercent = originalCount > 0
      ? Math.round((changeAbsolute / originalCount) * 100)
      : 0;

    const reprocessDuration = Date.now() - reprocessStartTime;

    // Log the change
    console.log(`Audience change: ${changeAbsolute > 0 ? '+' : ''}${changeAbsolute} (${changePercent > 0 ? '+' : ''}${changePercent}%)`);
    console.log(`Reprocessing took ${reprocessDuration}ms`);

    // Update campaign with reprocessing results
    await supabase
      .from('sms_marketing_campaigns')
      .update({
        total_recipients: newCount, // Update total
        metadata: {
          ...campaign.metadata,
          actual_recipients: newCount,
          audience_change_absolute: changeAbsolute,
          audience_change_percent: changePercent,
          reprocessed_at: new Date().toISOString(),
          reprocess_duration_ms: reprocessDuration
        }
      })
      .eq('id', campaign.id);

    // Replace recipientData with reprocessed list
    recipientData = reprocessedRecipientData;

  } catch (reprocessError) {
    console.error('Audience reprocessing failed:', reprocessError);

    // Log error in metadata
    await supabase
      .from('sms_marketing_campaigns')
      .update({
        metadata: {
          ...campaign.metadata,
          reprocess_error: reprocessError.message,
          reprocess_failed_at: new Date().toISOString()
        }
      })
      .eq('id', campaign.id);

    // Decision: Fail campaign or fall back to original list?
    // OPTION A: Fail the campaign (safer)
    throw new Error(`Campaign ${campaign.id} reprocessing failed: ${reprocessError.message}`);

    // OPTION B: Fall back to original recipient_data (more resilient)
    // console.log('Falling back to original recipient list');
    // Continue with campaign.metadata.recipient_data
  }
}

// Continue with normal batch processing using recipientData
// (either original or reprocessed)
```

#### Safety Checks

```typescript
// NEW: Audience size safety check
const MAX_AUDIENCE_CHANGE = 1000; // Max 1000% increase (10x)
const MAX_ABSOLUTE_CHANGE = 50000; // Max 50k new recipients

if (shouldReprocess) {
  const changePercent = Math.abs(campaign.metadata?.audience_change_percent || 0);
  const changeAbsolute = Math.abs(campaign.metadata?.audience_change_absolute || 0);

  if (changePercent > MAX_AUDIENCE_CHANGE) {
    throw new Error(
      `Audience change too large: ${changePercent}% (max: ${MAX_AUDIENCE_CHANGE}%). ` +
      `Original: ${originalCount}, New: ${newCount}. Campaign requires manual review.`
    );
  }

  if (changeAbsolute > MAX_ABSOLUTE_CHANGE) {
    throw new Error(
      `Audience change too large: ${changeAbsolute} recipients (max: ${MAX_ABSOLUTE_CHANGE}). ` +
      `Campaign requires manual review.`
    );
  }
}
```

---

## Safety & Edge Cases

### 1. Audience Shrinks Dramatically

**Scenario**: Created with 500 people, at send time only 50 qualify

**Cause**:
- RFM filters became more restrictive
- Most people received messages since creation (anti-spam filter)
- Events were disabled or removed

**Handling**:
```typescript
if (changePercent < -90) { // 90% decrease
  console.warn(`Large audience decrease: ${originalCount} → ${newCount} (-${Math.abs(changePercent)}%)`);
  // Continue but log warning
  // Could add: Send notification to admin
}
```

### 2. Audience Explodes

**Scenario**: Created with 50 people, at send time 5,000 qualify

**Cause**:
- Event had massive turnout
- Multiple events selected and all had high attendance

**Handling**:
```typescript
// Option A: Hard limit
if (newCount > 100000) {
  throw new Error('Audience exceeds maximum (100,000). Campaign requires manual review.');
}

// Option B: Percentage-based limit
if (changePercent > 1000) { // 10x increase
  throw new Error(`Audience increased ${changePercent}%: ${originalCount} → ${newCount}. Too large, requires review.`);
}
```

### 3. Targeting Criteria Missing

**Scenario**: Campaign created before this feature, marked for reprocessing

**Handling**:
```typescript
if (shouldReprocess && !campaign.metadata?.targeting_criteria_snapshot) {
  // Fall back to original recipient list
  console.warn('Reprocessing requested but no targeting criteria stored. Using original list.');
  shouldReprocess = false;
}
```

### 4. Audience Query Fails

**Scenario**: Database error, edge function timeout, etc.

**Handling**:
```typescript
try {
  // Reprocess audience
} catch (error) {
  // OPTION A: Fail campaign (safer)
  throw new Error(`Reprocessing failed: ${error.message}`);

  // OPTION B: Fall back to original list (more resilient)
  console.error('Reprocessing failed, using original recipient list');
  recipientData = campaign.metadata.recipient_data;
}
```

**Recommendation**: Option A (fail) for first version, Option B (fallback) after testing.

### 5. Variable Substitution

**Scenario**: New attendees may have incomplete profile data

**Handling**: Already handled by existing variable substitution logic in `send-marketing-sms`:
```typescript
// Existing code gracefully handles missing data
const fullName = personData.first_name && personData.last_name
  ? `${personData.first_name} ${personData.last_name}`.trim()
  : (personData.name || '');

processedMessage = processedMessage
  .replace(/%%HASH%%/gi, personData.hash || '')
  .replace(/%%NAME%%/gi, fullName)
  .replace(/%%FIRST_NAME%%/gi, personData.first_name || '')
  .replace(/%%LAST_NAME%%/gi, personData.last_name || '');
```

### 6. Cost Estimation

**Problem**: Can't accurately estimate cost at creation time

**Solution**: Show ranges in UI
```javascript
{reprocessAudienceAtSend ? (
  <Text>
    Estimated cost: ${estimatedCostLow} - ${estimatedCostHigh}
    (based on current audience of {audienceData.filtered_count} people,
    actual cost will be calculated at send time)
  </Text>
) : (
  <Text>
    Estimated cost: ${estimatedCost}
    (based on {audienceData.filtered_count} people)
  </Text>
)}
```

### 7. Dry Run Mode

**Behavior**: Dry run should ALWAYS use current data (always reprocess)

```typescript
if (dry_run_mode) {
  shouldReprocess = true; // Force reprocessing for dry runs
  console.log('Dry run mode: Forcing audience reprocessing');
}
```

---

## UI/UX Considerations

### Campaign Creation Experience

#### Initial State (Checkbox Unchecked)
```
┌─────────────────────────────────────────────────────────┐
│ Send Campaign                                            │
├─────────────────────────────────────────────────────────┤
│ Schedule:                                                │
│   [x] Schedule for later                                 │
│   Date: Nov 24, 2025   Time: 10:00 AM                   │
│   Timezone: America/Toronto                              │
│                                                           │
│ [ ] Re-process audience at time of send                  │
│                                                           │
│ Campaign will send to: 78 people                         │
│ Estimated cost: $0.78                                    │
│                                                           │
│ [Create Campaign]                                        │
└─────────────────────────────────────────────────────────┘
```

#### Reprocess Enabled (Checkbox Checked)
```
┌─────────────────────────────────────────────────────────┐
│ Send Campaign                                            │
├─────────────────────────────────────────────────────────┤
│ Schedule:                                                │
│   [x] Schedule for later                                 │
│   Date: Nov 24, 2025   Time: 10:00 AM                   │
│   Timezone: America/Toronto                              │
│                                                           │
│ [x] Re-process audience at time of send                  │
│                                                           │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ⚠️  Dynamic Audience Mode                         │   │
│ │                                                    │   │
│ │ The audience will be recalculated just before     │   │
│ │ sending. This ensures you reach all attendees,    │   │
│ │ including those who register or scan QR codes     │   │
│ │ after creating this campaign.                     │   │
│ │                                                    │   │
│ │ • Current estimated audience: 78 people           │   │
│ │ • Final audience calculated at: Sun, Nov 24 10am  │   │
│ │ • Actual size may differ significantly            │   │
│ │ • All safety filters still apply                  │   │
│ └───────────────────────────────────────────────────┘   │
│                                                           │
│ Campaign will send to: ~78 people (estimate)             │
│ Estimated cost: $0.78 - $5.00 (based on audience growth) │
│                                                           │
│ [Create Campaign]                                        │
└─────────────────────────────────────────────────────────┘
```

### Campaign Details View

**For Standard Campaigns:**
```
┌─────────────────────────────────────────────────────────┐
│ Campaign: "Winner Announcement - Toronto Nov 23"        │
├─────────────────────────────────────────────────────────┤
│ Status: Scheduled                                        │
│ Scheduled for: Sunday, Nov 24 at 10:00 AM               │
│                                                           │
│ Recipients: 78 people                                    │
│ Estimated cost: $0.78                                    │
└─────────────────────────────────────────────────────────┘
```

**For Reprocessing Campaigns (Before Send):**
```
┌─────────────────────────────────────────────────────────┐
│ Campaign: "Winner Announcement - Toronto Nov 23"        │
├─────────────────────────────────────────────────────────┤
│ Status: Scheduled (Dynamic Audience)                    │
│ Scheduled for: Sunday, Nov 24 at 10:00 AM               │
│                                                           │
│ 🔄 Audience will be recalculated at send time           │
│                                                           │
│ Estimated recipients: ~78 people (at creation)          │
│ Final audience: Will be determined at 10:00 AM          │
│ Estimated cost: $0.78 - $5.00                            │
└─────────────────────────────────────────────────────────┘
```

**For Reprocessing Campaigns (After Send):**
```
┌─────────────────────────────────────────────────────────┐
│ Campaign: "Winner Announcement - Toronto Nov 23"        │
├─────────────────────────────────────────────────────────┤
│ Status: Completed                                        │
│ Sent: Sunday, Nov 24 at 10:03 AM                        │
│                                                           │
│ 🔄 Audience was reprocessed at send time                │
│                                                           │
│ Original estimate: 78 people                             │
│ Actual audience: 412 people (+428%, +334 people)        │
│                                                           │
│ Results:                                                 │
│ ✓ 398 sent                                               │
│ ⊘ 12 duplicates prevented                                │
│ ✗ 2 failed                                               │
│                                                           │
│ Final cost: $3.98                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Backward Compatibility

### Existing Campaigns

**Will NOT be affected:**
- All existing campaigns have `reprocess_audience_at_send: undefined`
- Cron checks: `if (metadata?.reprocess_audience_at_send === true)`
- `undefined` and `false` both skip reprocessing
- Existing campaigns use stored `recipient_data` (current behavior)

### Migration Path

**No migration needed:**
- New field is opt-in
- Stored in flexible JSONB metadata
- No database schema changes
- No breaking changes to existing code

### Testing Backward Compatibility

```sql
-- Test query: Ensure old campaigns still work
SELECT
  id,
  name,
  status,
  total_recipients,
  metadata->>'reprocess_audience_at_send' as reprocess_flag,
  CASE
    WHEN metadata->>'reprocess_audience_at_send' = 'true' THEN 'REPROCESS'
    ELSE 'STANDARD'
  END as mode
FROM sms_marketing_campaigns
WHERE created_at >= '2025-11-01'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Testing Strategy

### Unit Tests

1. **Frontend Validation**
   - Checkbox only enabled for scheduled campaigns
   - Warning appears when checkbox checked
   - Cost estimate shows range when reprocess enabled

2. **Backend Validation**
   - Rejects reprocess with immediate send
   - Requires targeting criteria for reprocess
   - Stores correct metadata structure

3. **Cron Logic**
   - Correctly identifies reprocess flag
   - Skips reprocess when flag is false
   - Handles missing criteria gracefully

### Integration Tests

**Test Case 1: Growing Audience (Happy Path)**
```
1. Create campaign with 10 test users, scheduled 5 minutes from now
2. Enable reprocess checkbox
3. Add 40 more test users to event (via QR scans or registrations)
4. Wait for campaign to send
5. Verify: All 50 users received message
6. Verify: Metadata shows audience change (10 → 50, +400%)
```

**Test Case 2: Shrinking Audience**
```
1. Create campaign with 100 test users, scheduled 5 minutes from now
2. Enable reprocess checkbox
3. Block 90 of the users
4. Wait for campaign to send
5. Verify: Only 10 users received message
6. Verify: Metadata shows audience change (100 → 10, -90%)
```

**Test Case 3: Duplicate Prevention with Reprocess**
```
1. Send Campaign A to 50 users immediately
2. Create Campaign B with reprocess enabled, scheduled 5 minutes from now
3. Campaign B targets same events (same 50 users)
4. Add 25 new users to events
5. Wait for Campaign B to send
6. Verify: 25 new users received message (not the original 50)
7. Verify: 50 duplicates prevented
```

**Test Case 4: Reprocess Failure (Fallback)**
```
1. Create campaign with reprocess enabled
2. Simulate edge function failure (mock)
3. Verify: Campaign either fails gracefully or falls back to original list
4. Verify: Error logged in metadata
```

**Test Case 5: Backward Compatibility**
```
1. Query existing campaign (created before feature)
2. Trigger cron processing
3. Verify: Campaign sends normally to stored recipient_data
4. Verify: No reprocessing attempted
5. Verify: No errors
```

### Load Tests

1. **Large Audience Reprocess**
   - Create campaign with 100 recipients
   - Add 10,000 recipients before send
   - Measure: Reprocess query time, memory usage
   - Verify: Completes within timeout limits

2. **Multiple Concurrent Reprocesses**
   - Create 5 campaigns with reprocess enabled
   - Schedule all for same time
   - Verify: All reprocess successfully
   - Verify: No database deadlocks

### Performance Benchmarks

**Acceptable Performance:**
- Reprocess query: < 5 seconds for 10k recipients
- Reprocess query: < 30 seconds for 100k recipients
- Memory usage: < 500MB for full reprocess
- No impact on campaigns without reprocess enabled

---

## Monitoring & Alerts

### Metrics to Track

1. **Reprocess Usage**
```sql
SELECT
  DATE(created_at) as day,
  COUNT(*) FILTER (WHERE metadata->>'reprocess_audience_at_send' = 'true') as reprocess_campaigns,
  COUNT(*) as total_campaigns,
  ROUND(100.0 * COUNT(*) FILTER (WHERE metadata->>'reprocess_audience_at_send' = 'true') / COUNT(*), 2) as reprocess_percent
FROM sms_marketing_campaigns
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

2. **Audience Change Distribution**
```sql
SELECT
  CASE
    WHEN (metadata->>'audience_change_percent')::int < -50 THEN 'Large Decrease (>50%)'
    WHEN (metadata->>'audience_change_percent')::int < 0 THEN 'Small Decrease'
    WHEN (metadata->>'audience_change_percent')::int = 0 THEN 'No Change'
    WHEN (metadata->>'audience_change_percent')::int < 50 THEN 'Small Increase'
    WHEN (metadata->>'audience_change_percent')::int < 200 THEN 'Moderate Increase (50-200%)'
    ELSE 'Large Increase (>200%)'
  END as change_category,
  COUNT(*) as count,
  AVG((metadata->>'audience_change_percent')::int) as avg_change_percent
FROM sms_marketing_campaigns
WHERE metadata->>'reprocessed_at' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY change_category
ORDER BY change_category;
```

3. **Reprocess Performance**
```sql
SELECT
  AVG((metadata->>'reprocess_duration_ms')::int) as avg_duration_ms,
  MAX((metadata->>'reprocess_duration_ms')::int) as max_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metadata->>'reprocess_duration_ms')::int) as p95_duration_ms
FROM sms_marketing_campaigns
WHERE metadata->>'reprocessed_at' IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days';
```

4. **Reprocess Failures**
```sql
SELECT
  id,
  name,
  metadata->>'reprocess_error' as error_message,
  metadata->>'reprocess_failed_at' as failed_at
FROM sms_marketing_campaigns
WHERE metadata->>'reprocess_failed_at' IS NOT NULL
ORDER BY (metadata->>'reprocess_failed_at')::timestamp DESC
LIMIT 20;
```

### Alerts

**Alert 1: Reprocess Failure Rate > 5%**
```sql
SELECT
  COUNT(*) FILTER (WHERE metadata->>'reprocess_failed_at' IS NOT NULL) as failures,
  COUNT(*) FILTER (WHERE metadata->>'reprocess_audience_at_send' = 'true') as total_reprocess,
  ROUND(100.0 * COUNT(*) FILTER (WHERE metadata->>'reprocess_failed_at' IS NOT NULL) /
    NULLIF(COUNT(*) FILTER (WHERE metadata->>'reprocess_audience_at_send' = 'true'), 0), 2) as failure_rate
FROM sms_marketing_campaigns
WHERE created_at >= NOW() - INTERVAL '24 hours';
-- Alert if failure_rate > 5
```

**Alert 2: Large Unexpected Audience Changes**
```sql
SELECT
  id,
  name,
  metadata->>'estimated_recipients' as estimated,
  metadata->>'actual_recipients' as actual,
  metadata->>'audience_change_percent' as change_percent
FROM sms_marketing_campaigns
WHERE metadata->>'reprocessed_at' IS NOT NULL
  AND ABS((metadata->>'audience_change_percent')::int) > 500 -- 5x change
  AND created_at >= NOW() - INTERVAL '24 hours';
-- Alert if any results
```

**Alert 3: Reprocess Taking Too Long**
```sql
SELECT
  id,
  name,
  metadata->>'reprocess_duration_ms' as duration_ms,
  metadata->>'actual_recipients' as audience_size
FROM sms_marketing_campaigns
WHERE metadata->>'reprocessed_at' IS NOT NULL
  AND (metadata->>'reprocess_duration_ms')::int > 30000 -- 30 seconds
  AND created_at >= NOW() - INTERVAL '24 hours';
-- Alert if any results
```

---

## Cost Analysis

### Development Effort

**Estimated Time: 16-20 hours**

| Task | Estimated Hours |
|------|----------------|
| Frontend UI (checkbox, warnings, validation) | 3-4 hours |
| Backend parameter handling & validation | 2-3 hours |
| Cron reprocessing logic | 6-8 hours |
| Testing (unit + integration) | 3-4 hours |
| Documentation updates | 1-2 hours |
| Code review & deployment | 1 hour |

### Operational Cost

**Additional Costs:**
- Database queries: ~$0.001 per reprocess (negligible)
- Edge function execution: ~$0.0001 per reprocess (negligible)
- Storage: No significant increase (metadata only)

**Savings:**
- Prevents missed opportunities (reaching all attendees)
- Reduces need for duplicate campaigns
- Improves campaign effectiveness

### Risk Assessment

**Low Risk:**
- Opt-in only (doesn't affect existing campaigns)
- Backward compatible
- Uses existing safety infrastructure

**Medium Risk:**
- Large audience changes could surprise admins
- Reprocess failures need graceful handling

**Mitigation:**
- Clear UI warnings
- Audience change limits
- Detailed logging
- Fallback to original list option

---

## Rollout Plan

### Phase 1: Development & Testing (Week 1-2)
- [ ] Implement frontend checkbox and UI
- [ ] Implement backend parameter handling
- [ ] Implement cron reprocessing logic
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Internal testing with test campaigns

### Phase 2: Beta Testing (Week 3)
- [ ] Deploy to staging environment
- [ ] Test with real event data (past events)
- [ ] Invite 2-3 trusted admins to test
- [ ] Monitor performance and errors
- [ ] Gather feedback

### Phase 3: Limited Production Release (Week 4)
- [ ] Deploy to production
- [ ] Enable for single event (low risk)
- [ ] Monitor closely for 48 hours
- [ ] Check metrics and alerts

### Phase 4: Full Release (Week 5)
- [ ] Document feature in admin guide
- [ ] Announce to all admins
- [ ] Add to campaign creation tips/hints
- [ ] Monitor for 1 week
- [ ] Collect feedback

### Phase 5: Enhancements (Week 6+)
- [ ] Add UI display of audience changes
- [ ] Add admin notification for large changes
- [ ] Implement audience change dashboard
- [ ] Consider auto-enabling for specific event types

---

## Future Enhancements

### 1. Admin Notifications

**Feature**: Email admin if audience changes significantly

```javascript
if (Math.abs(changePercent) > 200) {
  await sendEmailNotification({
    to: campaign.created_by_email,
    subject: `Campaign "${campaign.name}" audience changed significantly`,
    body: `
      Your scheduled campaign has been sent with a significantly different
      audience than estimated:

      Original estimate: ${estimatedRecipients} people
      Actual audience: ${actualRecipients} people
      Change: ${changePercent > 0 ? '+' : ''}${changePercent}%

      Messages sent: ${messagesSent}
      Duplicates prevented: ${duplicatesPrevented}
      Failed: ${messagesFailed}
    `
  });
}
```

### 2. Preview Current Audience

**Feature**: Button to preview current audience size before campaign sends

```javascript
// UI Button
<Button onClick={previewCurrentAudience}>
  Preview Current Audience
</Button>

// Calls admin-sms-promotion-audience with campaign's targeting criteria
// Shows: "If this campaign sent now, it would reach X people (vs Y estimated)"
```

### 3. Audience Change Limits Per Admin

**Feature**: Different limits for different admin levels

```javascript
const MAX_CHANGE_BY_LEVEL = {
  'super': 2000,  // 20x change allowed
  'admin': 500,   // 5x change allowed
  'staff': 100    // 2x change allowed (double)
};
```

### 4. Auto-Enable for Certain Event Types

**Feature**: Automatically suggest reprocessing for post-event campaigns

```javascript
// If message scheduled for after event end time
// And event hasn't happened yet
// Suggest enabling reprocess
if (scheduledAt > eventEndTime && now < eventEndTime) {
  showSuggestion('This message is scheduled after the event. ' +
                 'Consider enabling "Re-process audience at send time" ' +
                 'to reach all attendees.');
}
```

### 5. Audience Snapshot Comparison

**Feature**: Show before/after comparison of audience

```sql
-- Store audience snapshot at creation time
metadata: {
  audience_snapshot: {
    at_creation: {
      timestamp: "2025-11-22T14:00:00Z",
      total: 78,
      by_source: {
        registrations: 50,
        qr_scans: 28
      }
    },
    at_send: {
      timestamp: "2025-11-24T10:00:00Z",
      total: 412,
      by_source: {
        registrations: 52,
        qr_scans: 360
      }
    }
  }
}
```

### 6. Conditional Reprocessing

**Feature**: Only reprocess if audience grew by X%

```javascript
// UI Option
<Checkbox>
  Only reprocess if audience grew by at least 50%
</Checkbox>

// Implementation
if (shouldReprocess) {
  const currentSize = await getAudienceSize();
  const growthPercent = ((currentSize - estimatedSize) / estimatedSize) * 100;

  if (growthPercent < minGrowthThreshold) {
    console.log(`Audience growth (${growthPercent}%) below threshold, using original list`);
    shouldReprocess = false;
  }
}
```

---

## Documentation Updates Needed

### 1. Update SMS Campaign Guide
- Add section: "Dynamic Audience Reprocessing"
- Explain use cases
- Show checkbox location
- Explain limitations

### 2. Update Admin Training Materials
- Add tutorial video
- Include example scenarios
- Best practices guide

### 3. Update API Documentation
- Document new `reprocess_audience_at_send` parameter
- Update metadata schema documentation
- Add examples

### 4. Create Troubleshooting Guide
- What to do if audience doesn't grow
- What to do if audience explodes
- How to check reprocess status

---

## Questions for Product/Business Review

Before implementation, answer these questions:

1. **Audience Size Limits**
   - What's the maximum reasonable audience change? (Currently proposing 1000% = 10x)
   - Should we have absolute limits? (Currently proposing 50k recipients)
   - What happens when limit is exceeded? (Fail campaign or send notification?)

2. **Cost Controls**
   - Should we have per-campaign cost limits?
   - Should we require approval for campaigns over $X?
   - How do we handle cost estimation ranges in UI?

3. **Failure Handling**
   - If reprocessing fails, should we:
     - A) Fail the campaign (safer)
     - B) Fall back to original list (more resilient)
     - C) Send notification and let admin decide?

4. **Admin Permissions**
   - Should all admins have access to this feature?
   - Should there be different limits by admin level?

5. **User Experience**
   - Is the checkbox placement intuitive?
   - Are the warnings clear enough?
   - Should we add a confirmation dialog for large changes?

6. **Analytics**
   - What metrics matter most for this feature?
   - Should we track ROI (engagement rate for reprocessed vs standard)?

---

## Success Criteria

### MVP Launch Success
- [ ] Feature deployed without breaking existing campaigns
- [ ] Zero complaints about missed messages for post-event campaigns
- [ ] At least 10% of scheduled campaigns use reprocessing
- [ ] No reprocess failures in first week
- [ ] Performance metrics within acceptable range

### 30-Day Success
- [ ] Positive feedback from admins
- [ ] Measurably higher engagement on post-event campaigns
- [ ] No major issues or rollbacks
- [ ] Clear use cases documented

### Long-Term Success
- [ ] Feature becomes standard practice for post-event messages
- [ ] Reduces need for duplicate campaigns
- [ ] Improves attendee communication coverage
- [ ] Admin satisfaction scores improve

---

## Appendix A: Alternative Approaches Considered

### Alternative 1: Always Reprocess (No Checkbox)
**Pros**: Simpler, always uses latest data
**Cons**: Breaks current predictability, unexpected costs, too risky
**Decision**: Rejected - Need opt-in for safety

### Alternative 2: Store Criteria Only (Never Store Phone Numbers)
**Pros**: Always fresh data, no staleness possible
**Cons**: Can't estimate costs, unpredictable audience size, scary for admins
**Decision**: Rejected - Need estimates for planning

### Alternative 3: Auto-Reprocess Within X Hours of Event
**Pros**: Automatic, no admin decision needed
**Cons**: What if admin wants old behavior? Hard to communicate
**Decision**: Rejected - Prefer explicit opt-in

### Alternative 4: Hybrid - Store Phones + Criteria
**Pros**: Fallback option if reprocess fails
**Cons**: More complex, more storage
**Decision**: **SELECTED** - Best of both worlds

---

## Appendix B: Database Queries Reference

```sql
-- Find campaigns using reprocessing
SELECT id, name, status, created_at,
       metadata->>'reprocess_audience_at_send' as reprocess
FROM sms_marketing_campaigns
WHERE metadata->>'reprocess_audience_at_send' = 'true';

-- Check reprocessing performance
SELECT
  name,
  metadata->>'estimated_recipients' as estimated,
  metadata->>'actual_recipients' as actual,
  metadata->>'audience_change_percent' as change_pct,
  metadata->>'reprocess_duration_ms' as duration_ms
FROM sms_marketing_campaigns
WHERE metadata->>'reprocessed_at' IS NOT NULL
ORDER BY (metadata->>'reprocess_duration_ms')::int DESC;

-- Find campaigns with large audience changes
SELECT
  name,
  metadata->>'estimated_recipients' as estimated,
  metadata->>'actual_recipients' as actual,
  metadata->>'audience_change_percent' as change_pct
FROM sms_marketing_campaigns
WHERE metadata->>'reprocessed_at' IS NOT NULL
  AND ABS((metadata->>'audience_change_percent')::int) > 200;

-- Check for reprocessing failures
SELECT
  id,
  name,
  metadata->>'reprocess_error' as error,
  metadata->>'reprocess_failed_at' as failed_at
FROM sms_marketing_campaigns
WHERE metadata->>'reprocess_failed_at' IS NOT NULL;
```

---

**Document Version**: 1.0 - PLANNING ONLY
**Created**: November 21, 2025
**Status**: 📋 Awaiting Approval - DO NOT IMPLEMENT
**Estimated Implementation**: 16-20 hours
**Risk Level**: Low (opt-in, backward compatible)
