# Timezone Date Display Fix - January 16, 2026

## Problem

Event dates were being displayed incorrectly in two areas:
1. **Artist Portal "My Confirmed Events"** - dates shown in user's browser timezone instead of event's local timezone
2. **Email notifications** - dates relied on a hardcoded city-to-timezone map with only 12 cities, falling back to UTC for unmapped cities

## Root Cause

- The `events` table has a `timezone_icann` field (e.g., `America/Toronto`, `Europe/Amsterdam`) but it wasn't being used
- Frontend and email templates were either:
  - Using `new Date()` without timezone consideration (frontend)
  - Using a limited city name mapping (emails)

---

## Changes Made

### 1. Frontend: EventApplications.jsx

**File:** `/root/vote_app/vote26/art-battle-artists/src/components/EventApplications.jsx`

**Changes:**
- Updated `formatDateTime` function to accept optional `timezone` parameter
- Updated events query to include `timezone_icann` field
- Updated all `formatDateTime` calls to pass `event.timezone_icann`

**Key code (lines 389-406):**
```javascript
const formatDateTime = (dateString, timezone) => {
  const date = new Date(dateString);
  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timezone && { timeZone: timezone })
  };
  const dateStr = date.toLocaleDateString('en-US', options);
  const timeOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timezone && { timeZone: timezone })
  };
  const timeStr = date.toLocaleTimeString('en-US', timeOptions);
  return `${dateStr} at ${timeStr}`;
};
```

**Usage locations:**
- Line 585: Confirmed events section
- Line 687: Available events section
- Line 887: Selected event modal

---

### 2. Edge Function: get-artist-profile-data

**File:** `/root/vote_app/vote26/supabase/functions/get-artist-profile-data/index.ts`

**Changes:**
Added `timezone_icann` to all three event queries:
- Line 136: Applications query
- Line 212: Invitations query
- Line 267: Confirmations query

**Example query change:**
```typescript
// Before
.select('id, eid, name, event_start_datetime, event_end_datetime, venue, applications_open, winner_prize, winner_prize_currency, other_prizes, advances_to_event_eid, cities(name)')

// After
.select('id, eid, name, event_start_datetime, event_end_datetime, venue, applications_open, winner_prize, winner_prize_currency, other_prizes, advances_to_event_eid, timezone_icann, cities(name)')
```

---

### 3. Email Templates: emailTemplates.ts

**File:** `/root/vote_app/vote26/supabase/functions/_shared/emailTemplates.ts`

**Changes:**
- Updated `formatEventDateTime` function signature to accept optional `timezoneIcann` parameter
- Added `timezoneIcann?: string` to all template data type definitions
- Updated all `formatEventDateTime` calls to pass the timezone

**Key code (lines 3-37):**
```typescript
// Utility function to convert UTC datetime to local venue time
// Prefers timezoneIcann (e.g., 'America/Toronto') if provided, falls back to city name mapping
export const formatEventDateTime = (utcDateTime: string, cityName: string, timezoneIcann?: string): string => {
  if (!utcDateTime) return 'TBD';

  // Fallback city-to-timezone map for backwards compatibility
  const timezoneMap: Record<string, string> = {
    'Toronto': 'America/Toronto',
    'Amsterdam': 'Europe/Amsterdam',
    'Bangkok': 'Asia/Bangkok',
    'San Francisco': 'America/Los_Angeles',
    'Oakland': 'America/Los_Angeles',
    'Boston': 'America/New_York',
    'Seattle': 'America/Los_Angeles',
    'Sydney': 'Australia/Sydney',
    'Auckland': 'Pacific/Auckland',
    'Ottawa': 'America/Toronto',
    'Wilmington': 'America/New_York',
    'Lancaster': 'America/New_York'
  };

  // Use timezoneIcann if provided, otherwise fall back to city mapping
  const venueTimezone = timezoneIcann || timezoneMap[cityName] || 'UTC';

  return new Date(utcDateTime).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: venueTimezone
  });
};
```

**Templates updated:**
| Template | Line | Purpose |
|----------|------|---------|
| `applicationReceived` | 50 | Application confirmation email |
| `artistInvited` | 127 | Invitation email |
| `artistConfirmed` | 204 | Confirmation email |
| `artistCancelled` | 296 | Cancellation email |
| `paymentNotification` | 396 | Payment notification email |

---

### 4. Edge Functions Updated

#### accept-invitation/index.ts
**File:** `/root/vote_app/vote26/supabase/functions/accept-invitation/index.ts`
- Line 411: Added `timezone_icann` to event query
- Line 421: Added `timezoneIcann` to email template data

#### submit-application/index.ts
**File:** `/root/vote_app/vote26/supabase/functions/submit-application/index.ts`
- Line 58: Added `timezone_icann` to event query
- Line 111: Added `timezoneIcann` to email template data

#### admin-send-invitation/index.ts
**File:** `/root/vote_app/vote26/supabase/functions/admin-send-invitation/index.ts`
- Line 195: Added `timezone_icann` to event query
- Line 209: Added `timezoneIcann` to email template data

#### cancel-confirmation/index.ts
**File:** `/root/vote_app/vote26/supabase/functions/cancel-confirmation/index.ts`
- Line 104: Added `timezone_icann` to event query
- Line 165: Added `timezoneIcann` to email template data
- Line 195: Updated Slack notification `formatEventDateTime` call to pass timezone

#### populate-email-queue/index.ts
**File:** `/root/vote_app/vote26/supabase/functions/populate-email-queue/index.ts`
- Line 33: Added `timezone_icann` to event query
- Line 176: Added `timezoneIcann` to template data stored in queue

---

## Deployment

**Frontend:**
```bash
cd /root/vote_app/vote26/art-battle-artists && ./deploy.sh
```

**Edge Functions:**
```bash
cd /root/vote_app/vote26/supabase
supabase functions deploy get-artist-profile-data --project-ref xsqdkubgyqwpyvfltnrf
supabase functions deploy accept-invitation --project-ref xsqdkubgyqwpyvfltnrf
supabase functions deploy submit-application --project-ref xsqdkubgyqwpyvfltnrf
supabase functions deploy admin-send-invitation --project-ref xsqdkubgyqwpyvfltnrf
supabase functions deploy cancel-confirmation --project-ref xsqdkubgyqwpyvfltnrf
supabase functions deploy populate-email-queue --project-ref xsqdkubgyqwpyvfltnrf
```

---

## Troubleshooting

### Dates still showing wrong timezone

1. **Check if event has `timezone_icann` set:**
   ```sql
   SELECT eid, name, timezone_icann, city_id FROM events WHERE eid = 'EVENT_EID';
   ```

2. **If `timezone_icann` is NULL:**
   - The system falls back to city name mapping
   - If city is not in the map, defaults to UTC
   - Fix: Set the `timezone_icann` field on the event

3. **Valid IANA timezone examples:**
   - `America/Toronto`
   - `America/New_York`
   - `America/Los_Angeles`
   - `Europe/Amsterdam`
   - `Australia/Sydney`
   - `Pacific/Auckland`

### Email shows wrong time

1. **For new emails:** Check that the edge function was deployed
2. **For queued payment emails:** The `timezoneIcann` is stored in `artist_payment_email_queue.email_data`
   - Old queue entries won't have `timezoneIcann` and will fall back to city mapping
   - Re-running `populate-email-queue` for an event will update the stored data

### Frontend shows wrong time

1. Clear browser cache or hard refresh
2. Check browser console for any JavaScript errors
3. Verify the event data includes `timezone_icann`:
   ```javascript
   // In browser console on /profile page
   console.log(event.timezone_icann);
   ```

---

## Backwards Compatibility

- All changes are backwards compatible
- `timezoneIcann` parameter is optional everywhere
- Falls back to existing city name mapping if not provided
- Falls back to UTC if city is not in mapping

---

## Files Changed

| File | Type |
|------|------|
| `art-battle-artists/src/components/EventApplications.jsx` | Frontend |
| `supabase/functions/_shared/emailTemplates.ts` | Shared |
| `supabase/functions/get-artist-profile-data/index.ts` | Edge Function |
| `supabase/functions/accept-invitation/index.ts` | Edge Function |
| `supabase/functions/submit-application/index.ts` | Edge Function |
| `supabase/functions/admin-send-invitation/index.ts` | Edge Function |
| `supabase/functions/cancel-confirmation/index.ts` | Edge Function |
| `supabase/functions/populate-email-queue/index.ts` | Edge Function |
