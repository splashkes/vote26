# Montreal Auction Analysis - October 1, 2025

## Event Details
- **Event:** Art Battle Montreal (ID: ca071057-032d-4ed2-9648-f550b49028d5)
- **Venue:** ESC
- **Date:** October 1, 2025, 7:30 PM EDT (23:30 UTC)

## Problem Summary
The Montreal event had very little bidding activity, with only 6 bids total from 5 bidders across 16 artworks. The auction closed prematurely after only 12 minutes.

## Root Cause Analysis

### Timeline (Montreal EDT)
1. **7:30 PM** - Event started
2. **10:27 PM** - First bid placed (3 hours into event)
3. **10:51 PM** - Last bid placed
4. **11:00 PM** - Admin clicked "Start 12min Auction" button
5. **11:12 PM** - Auction auto-closed (12 minutes after timer started)

### Key Findings

#### 1. Premature Auction Closure
- The auction was set to close only 12 minutes after the timer was started
- This happened at 11:00 PM, approximately 3.5 hours into the event
- The "Start 12min Auction" button was clicked in the admin interface (/root/vote_app/vote26/art-battle-broadcast/src/components/AdminPanel.jsx:2366)
- This button even has a warning note: "Note: Button may have errors - investigate if issues occur" (line 2372)

#### 2. No Auction Timer Set Initially
- The event's `auction_close_starts_at` field is NULL
- No global auction timer was configured for this event
- This meant the auction never had a proper opening/closing schedule

#### 3. Limited Bidding Activity
**Bid Statistics:**
- Total bids: 6
- Unique bidders: 5
- Highest bid: $70.00
- Bid distribution:
  - AB3059-3-2 (Nadiia Polurenko): 4 bids ($55→$60→$65→$70) - Status: paid
  - AB3059-1-2 (Hans Deslauriers): 1 bid ($55) - Status: sold
  - AB3059-2-5 (Pommejm): 1 bid ($55) - Status: sold

**Anomaly:** All artworks show `bid_count = 0` despite having actual bids in the bids table. This is a data consistency issue where the bid counter was not incremented.

#### 4. Auto-Close System Worked Correctly
- Cron job `check-expired-auctions` runs every minute
- It correctly identified expired timers and closed auctions
- Status assignment logic worked properly:
  - Artworks with bids → 'sold'
  - Artworks without bids → 'closed'

## Technical Issues Identified

### Issue 1: 12-Minute Timer Button
**Location:** `/root/vote_app/vote26/art-battle-broadcast/src/components/AdminPanel.jsx:2366`

```javascript
onClick={() => handleTimerAction('start', 12)}
```

**Problem:** This button is too easy to click accidentally and sets an extremely short 12-minute auction duration. There's already a warning comment suggesting it may have errors.

**Impact:** Creates a false sense of urgency and closes auctions before bidders have adequate time to participate.

### Issue 2: Bid Count Not Incrementing
**Location:** Art table `bid_count` column

**Problem:** The `bid_count` field on art records remains at 0 even when bids exist in the bids table.

**Impact:**
- Admin interface may show inaccurate bid statistics
- Potential issues with auction logic that depends on bid_count
- Data inconsistency between tables

### Issue 3: Missing Auction Configuration
**Problem:** The event had no `auction_close_starts_at` value set, meaning there was no planned auction schedule.

**Impact:** Admins had to manually manage auction timing, leading to confusion and potential errors.

## Recommendations

### Immediate Actions
1. **Review 12-Minute Timer Button**
   - Consider removing or hiding this button
   - If kept, add a confirmation dialog: "Are you sure? This will close the auction in only 12 minutes!"
   - Consider increasing default duration to at least 30-60 minutes

2. **Fix Bid Count Issue**
   - Investigate why bid_count is not incrementing
   - Check if there's a trigger or function that should update this
   - Run a script to reconcile existing bid_count values

3. **Add Event Auction Configuration**
   - Require auction_close_starts_at to be set when creating events with auctions enabled
   - Provide clear UI for setting auction duration during event setup

### Long-Term Improvements
1. **Auction Timer UX**
   - Show clear warnings when setting short auction durations
   - Display countdown timer prominently to admins
   - Add "extend auction" option with preset durations (15min, 30min, 1hr)

2. **Admin Audit Logging**
   - No audit log entries were found for this event
   - Implement comprehensive logging of admin actions (especially timer operations)
   - Track who clicked what and when

3. **Monitoring & Alerts**
   - Alert when auction closes with very few bids
   - Notify when auction duration is unusually short
   - Dashboard showing auction health metrics

## Data Queries Used

### Finding the Event
```sql
SELECT e.id, e.name, e.venue, c.name as city, e.enable_auction,
       e.auction_close_starts_at, e.event_start_datetime
FROM events e
LEFT JOIN cities c ON e.city_id = c.id
WHERE c.name = 'Montréal'
  AND e.event_start_datetime BETWEEN '2025-09-28' AND '2025-10-02';
```

### Checking Auction Data
```sql
-- Art pieces
SELECT a.id, a.art_code, a.round, a.easel, a.status, a.current_bid,
       a.bid_count, a.closing_time, ap.name as artist_name
FROM art a
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE a.event_id = 'ca071057-032d-4ed2-9648-f550b49028d5';

-- Bid statistics
SELECT COUNT(*) as total_bids, COUNT(DISTINCT b.person_id) as unique_bidders,
       MAX(b.amount) as highest_bid, MIN(b.created_at) as first_bid,
       MAX(b.created_at) as last_bid
FROM bids b
JOIN art a ON b.art_id = a.id
WHERE a.event_id = 'ca071057-032d-4ed2-9648-f550b49028d5';
```

### Checking Cron Jobs
```sql
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE command LIKE '%auction%' OR command LIKE '%close%';
```

## Files Reviewed
- `/root/vote_app/vote26/supabase-functions/db-functions/manage_auction_timer.sql`
- `/root/vote_app/vote26/supabase-functions/db-functions/check_and_close_expired_auctions.sql`
- `/root/vote_app/vote26/art-battle-broadcast/src/components/AdminPanel.jsx` (partial)

## Conclusion
The Montreal auction problem was caused by an admin clicking the "Start 12min Auction" button at 11:00 PM, which closed the auction at 11:12 PM. This premature closure prevented potential bidders from participating. The button's existence and short duration, combined with lack of confirmation dialogs and auction configuration, created a perfect storm for this issue.
