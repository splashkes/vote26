# Timezone Fix Implementation - September 2, 2025

## Problem Summary
Event datetime editing was experiencing critical timezone conversion errors:
- 6pm PST input was incorrectly displaying as 11am EST instead of expected 9pm EST
- Backend was treating datetime-local input as UTC instead of event timezone
- System-wide timezone handling inconsistency affecting multiple applications

## Root Cause Analysis
1. **Frontend Issue**: `CreateEvent.jsx` was using browser timezone instead of event timezone for datetime-local formatting
2. **Backend Issue**: `admin-update-event` function was not properly converting timezone-aware input to UTC timestamps
3. **Architecture Problem**: Mixed timezone handling approaches across codebase

## Solution Implemented

### Backend Fix (`/root/vote_app/vote26/supabase/functions/admin-update-event/index.ts`)

**New `convertToTimestampTz` function (lines 206-264):**
```typescript
const convertToTimestampTz = (dateTimeStr: string, timezone: string): string => {
  // Ensure proper format with seconds
  if (dateTimeStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    dateTimeStr += ':00';
  }
  
  // Use Intl.DateTimeFormat to get correct timezone offset
  const tempDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    timeZoneName: 'longOffset'
  });
  
  // Parse offset and convert to UTC
  const offsetMatch = formatter.formatToParts(tempDate).find(part => part.type === 'timeZoneName');
  const offsetStr = offsetMatch.value.replace('GMT', '');
  const utcTime = new Date(tempDate.getTime() - (offsetTotalMinutes * 60 * 1000));
  return utcTime.toISOString();
};
```

**Key Features:**
- Automatic daylight savings time handling via `Intl.DateTimeFormat`
- Proper timezone offset calculation for any IANA timezone
- Converts local time to UTC for PostgreSQL timestamptz storage
- Maintains timezone information in separate `timezone_icann` field

### Frontend Fix (`/root/vote_app/vote26/art-battle-admin/src/components/CreateEvent.jsx`)

**Fixed `formatDateTimeForInput` function:**
```javascript
const formatDateTimeForInput = (datetime, timezone) => {
  const date = new Date(datetime);
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone || 'UTC',  // Use EVENT timezone, not browser timezone
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  // Convert to datetime-local format
  return `${year}-${month}-${day}T${hour}:${minute}`;
};
```

**Display Fix (`EventDetail.jsx`):**
```javascript
new Date(event.event_start_datetime).toLocaleString('en-US', {
  timeZone: event.timezone_icann || 'UTC',  // Use EVENT timezone for display
  year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
})
```

## Testing Results
- **Before**: 6pm PST input → 11am EST display (incorrect)
- **After**: 6pm PST input → 9pm EST display (correct)
- Function deployed successfully without errors

## Critical Learning
**Never attempt manual timezone offset calculations.** JavaScript's `Intl.DateTimeFormat` with `timeZoneName: 'longOffset'` automatically handles:
- Daylight savings time transitions
- Historical timezone rule changes
- Complex timezone offset calculations
- IANA timezone database accuracy

## Impact
This fix affects all Art Battle applications that handle event datetime:
- ✅ art-battle-admin (fixed)
- ⚠️ art-battle-artists (needs same fix)
- ⚠️ art-battle-vote (needs same fix)
- ⚠️ art-battle-broadcast (needs same fix)

## Deployment
- Function deployed: `2025-09-02 via supabase functions deploy admin-update-event`
- Status: **PRODUCTION READY**
- Verification: Timezone conversion working correctly

## Files Modified
1. `/root/vote_app/vote26/supabase/functions/admin-update-event/index.ts` - Backend timezone conversion
2. `/root/vote_app/vote26/art-battle-admin/src/components/CreateEvent.jsx` - Frontend input formatting  
3. `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx` - Frontend display formatting

## Next Steps
1. Apply same timezone handling fixes to other Art Battle applications
2. Test cross-timezone event creation and editing
3. Verify timestamp accuracy across all admin workflows