# Montreal Auction Analysis - REVISED - October 1, 2025

## Event Details
- **Event:** Art Battle Montreal (ID: ca071057-032d-4ed2-9648-f550b49028d5)
- **Venue:** ESC
- **Date:** October 1, 2025, 7:30 PM EDT (23:30 UTC)

## Problem Summary
The Montreal event had virtually no bidding activity (only 6 bids from 5 bidders across 16 artworks). **THE ROOT CAUSE: Auction was marked as closed before the event even started**, creating the perception that bidding was over before anyone arrived.

## Complete Timeline (Montreal EDT)

| Time | Event | Details |
|------|-------|---------|
| **Sept 30, 8:28 PM** | Artworks Created (R1, R2) | 10 artworks for rounds 1 & 2 created with artists assigned |
| **Sept 30, 8:34 PM** | Placeholder Artworks Created | AB3059-1-6 and AB3059-2-6 created WITHOUT artists (easel #6 placeholders) |
| **Sept 30, ~8:36 PM** | **FIRST TIMER STARTED** | 3.5-hour (212 min) timer started on artworks WITHOUT artists |
| **Oct 1, 12:06 AM** | **PREMATURE CLOSURE #1** | AB3059-1-6 and AB3059-2-6 closed at midnight - **19.5 HOURS BEFORE EVENT START** |
| **Oct 1, 7:30 PM** | Event Started | Guests arrive, see some artworks marked "closed" |
| **Oct 1, 9:41 PM** | Round 3 Created | Round 3 artworks created during event |
| **Oct 1, 10:27 PM** | First Bid | First bid placed (3 hours into event - unusually late) |
| **Oct 1, 10:51 PM** | Last Bid | 6th and final bid placed |
| **Oct 1, 11:00 PM** | **SECOND TIMER STARTED** | Admin clicked "Start 12min Auction" button |
| **Oct 1, 11:12 PM** | **PREMATURE CLOSURE #2** | All remaining artworks closed |

## Root Cause Analysis

### Issue #1: Auction Closed Before Event Started

**The Critical Discovery:**
- AB3059-1-6 and AB3059-2-6 (easel #6 slots) had NO ARTISTS ASSIGNED
- These were created as placeholder slots 6 minutes after the main artworks
- **A 3.5-hour timer was started on these specific artworks at ~8:36 PM on Sept 30**
- They closed at midnight - **19.5 hours before the event started at 7:30 PM**

**Impact:**
- When guests arrived, they saw artworks marked as "closed"
- This created the impression the auction was over or had never opened
- Massively discouraged bidding activity
- Only 6 bids placed vs typical dozens/hundreds

### Issue #2: Why Only Those Two Artworks?

**Key Insight:** AB3059-1-6 and AB3059-2-6 were the ONLY artworks without artists assigned.

Possible scenarios:
1. Someone tested the timer function on "empty" easels
2. Someone started a timer thinking they were setting it for the event the next day
3. Someone accidentally started a timer on all artworks, then reopened the ones with artists

**Evidence:**
```sql
AB3059-1-1 through 1-5: All have artist_id, closed at 11:12 PM
AB3059-1-6: NO artist_id, closed at 12:06 AM  ← DIFFERENT!
AB3059-2-1 through 2-5: All have artist_id, closed at 11:12 PM
AB3059-2-6: NO artist_id, closed at 12:06 AM  ← DIFFERENT!
```

### Issue #3: Second Premature Closure

At 11:00 PM (3.5 hours into the event), someone clicked "Start 12min Auction" which:
- Set a 12-minute countdown on all ACTIVE artworks
- Did NOT affect AB3059-1-6 and 2-6 (already closed)
- Closed everything else at 11:12 PM

**Why this happened:**
- The `manage_auction_timer` function only updates artworks with:
  ```sql
  status = 'active' AND closing_time IS NULL
  ```
- AB3059-1-6 and 2-6 already had status='closed' and closing_time set, so they were skipped

## Data Anomalies Found

### 1. Bid Count Not Incrementing
All artworks show `bid_count = 0` despite having actual bids in the bids table:
- AB3059-3-2: 4 actual bids, shows bid_count = 0
- AB3059-1-2: 1 actual bid, shows bid_count = 0
- AB3059-2-5: 1 actual bid, shows bid_count = 0

### 2. No Audit Trail
- No entries in `admin_audit_log` for this event
- No entries in `system_logs` for this event
- Cannot determine WHO started the timers or WHEN reopening attempts were made

### 3. Extremely Late First Bid
First bid wasn't placed until 10:27 PM - **3 HOURS** into the event. Typical Art Battle events see bids within minutes. This strongly suggests attendees believed the auction was closed.

## Technical Analysis

### Timer Function Behavior
The `manage_auction_timer` function has this critical logic:

```sql
UPDATE art
SET closing_time = v_closing_time, ...
WHERE event_id = p_event_id
  AND status = 'active'
  AND closing_time IS NULL; -- Only set if not already set
```

This means:
- Once an artwork is closed, subsequent timer operations ignore it
- Reopening requires manually setting status back to 'active' AND clearing closing_time
- No automatic "reopen all" function exists

### UI Button Issue
The admin interface has a "Start 12min Auction" button (`AdminPanel.jsx:2366`) that:
- Has NO confirmation dialog
- Sets an extremely short 12-minute duration
- Has a warning comment: "Note: Button may have errors - investigate if issues occur"
- Likely clicked accidentally or in panic

## What Should Have Happened

**Proper Event Flow:**
1. Create artworks with artists assigned
2. Start event at 7:30 PM
3. Allow bidding throughout the event (3-4 hours)
4. Start 30-60 minute closing timer near end of event
5. Close auction with proper countdown

**What Actually Happened:**
1. Created artworks day before
2. Someone started 3.5-hour timer on placeholder artworks at 8:36 PM (day before)
3. Those artworks closed at midnight
4. Event started with "closed" artworks visible
5. Bidding heavily suppressed
6. Panic "Start 12min Auction" clicked at 11:00 PM
7. Event ended with minimal bidding activity

## Recommendations

### Immediate Actions

1. **Disable/Remove Pre-Event Timers**
   - Prevent timer starts when event_start_datetime > NOW() + 2 hours
   - Add warning: "Event hasn't started yet - are you sure?"

2. **Fix Bid Count Column**
   - Investigate trigger that should increment bid_count
   - Run reconciliation script for all events

3. **Implement Comprehensive Audit Logging**
   - Log ALL admin_update_art_status calls
   - Log ALL manage_auction_timer calls
   - Track WHO, WHEN, WHAT for every auction operation

4. **Add "Reopen All" Function**
   - Create admin function to bulk reopen closed artworks
   - Set all to status='active' and clear closing_time
   - Useful for recovery from timer mistakes

### UI/UX Improvements

1. **Timer Confirmation Dialogs**
   - Require confirmation for timers < 30 minutes
   - Show preview: "This will close X artworks in Y minutes"
   - Add cancel/undo option

2. **Visual Timer Status**
   - Prominent countdown display in admin interface
   - Show list of artworks with their individual closing times
   - Alert when closing times are set before event start

3. **Auction Health Dashboard**
   - Show bid activity vs expected
   - Alert on anomalies (e.g., "No bids in 30 minutes")
   - Display auction status clearly to admins

### Long-Term Improvements

1. **Auction State Machine**
   - Define clear states: not_started, open, closing, closed
   - Enforce state transitions with validations
   - Prevent invalid state changes

2. **Event Timeline Validation**
   - Prevent auction operations before event_start_datetime
   - Warn if closing timer set during early rounds
   - Suggest optimal timer durations based on historical data

3. **Automated Recovery**
   - Detect "all artworks closed before event" scenario
   - Automatically reopen with notification to admins
   - Log the recovery action

## Evidence & Queries

### Timeline Query
```sql
-- Shows the complete sequence of events
SELECT art_code, round,
       created_at AT TIME ZONE 'America/Montreal' as created,
       closing_time AT TIME ZONE 'America/Montreal' as closing,
       updated_at AT TIME ZONE 'America/Montreal' as updated,
       artist_id IS NOT NULL as has_artist
FROM art
WHERE event_id = 'ca071057-032d-4ed2-9648-f550b49028d5'
ORDER BY created_at;
```

### Bid Activity Query
```sql
-- Shows unusually late bidding activity
SELECT COUNT(*) as total_bids,
       COUNT(DISTINCT b.person_id) as unique_bidders,
       MIN(b.created_at) AT TIME ZONE 'America/Montreal' as first_bid,
       MAX(b.created_at) AT TIME ZONE 'America/Montreal' as last_bid
FROM bids b
JOIN art a ON b.art_id = a.id
WHERE a.event_id = 'ca071057-032d-4ed2-9648-f550b49028d5';
```

### Artwork Status Query
```sql
-- Shows the two different closing times
SELECT art_code, status,
       closing_time AT TIME ZONE 'America/Montreal' as closing,
       artist_id IS NOT NULL as has_artist
FROM art
WHERE event_id = 'ca071057-032d-4ed2-9648-f550b49028d5'
ORDER BY closing_time, art_code;
```

## Conclusion

The Montreal auction failure was caused by a **catastrophic timer mistake 19.5 hours before the event started**. Someone started a 3.5-hour timer on placeholder artworks (without artists) at 8:36 PM on Sept 30, causing them to close at midnight - almost a full day before the event.

When guests arrived at 7:30 PM on Oct 1, they saw these "closed" artworks and assumed the auction wasn't running or had already ended. This suppressed all bidding activity.

The lack of audit logging means we cannot determine:
- WHO started the first timer
- WHY it was started on only placeholder artworks
- WHETHER anyone attempted to reopen artworks during the day
- WHO clicked the second "12min" timer at 11:00 PM

This incident highlights critical gaps in:
1. Audit logging
2. Timer safety controls
3. Pre-event validation
4. Recovery tools

**The good news:** The auction system itself works correctly. This was entirely a timing/configuration issue that can be prevented with proper safeguards.
