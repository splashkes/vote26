# Console Logging Reference

This document tracks console logging statements that were removed from the codebase and explains their purpose for future debugging needs.

## Removed Console Logs from EventDetails.jsx

### Data Fetching & Processing Logs (Lines ~289-301)
**Removed:**
```javascript
console.log('Art IDs for bid lookup:', artIds);
console.log('Filtered artworks debug:', filteredArtworks);
console.log('Bids data received:', bidsData?.length || 0, 'bids');
console.log('Bids sample:', bidsData?.[0]);
console.log('Current bids set:', Object.keys(bidsByArt).length, 'artworks with actual bids');
console.log('About to check for auto payment modal - person:', person?.id, 'artworks with sold status:', artworks.filter(a => a.status === 'sold').map(a => a.art_code));
```

**Purpose:** These logs were useful for:
- Debugging bid data fetching and RPC function responses
- Verifying artwork filtering logic
- Monitoring bid history processing
- Tracking auto-payment modal trigger conditions

**When to Re-enable:** 
- When debugging bid history display issues
- When troubleshooting RPC function responses
- When investigating auto-payment modal not appearing

### Auto Payment Modal Debug Logs (Lines ~338-360)
**Removed:**
```javascript
console.log('checkForAutoPaymentModal called - person:', person?.id, 'user:', user?.id, 'user.phone:', user?.phone, 'artworks:', artworks.length, 'bidHistory keys:', Object.keys(bidHistory));
console.log('DETAILED DEBUG - artworks to check:', artworks.map(a => ({code: a.art_code, status: a.status, id: a.id})));
console.log('DETAILED DEBUG - bidHistory keys:', Object.keys(bidHistory));
console.log('DETAILED DEBUG - person.id:', person.id);
console.log('Checking artwork:', artwork.art_code, 'status:', artwork.status, 'artwork.id:', artwork.id);
console.log('Not sold or closed:', artwork.art_code);
console.log('Closed status - bid history for', artwork.id, ':', history);
console.log('Bid history for', artwork.art_code, '- top bid:', history[0], 'current person:', person.id);
console.log('FULL BID HISTORY for', artwork.art_code, ':', history);
console.log('Found winning artwork!', artwork.art_code);
console.log('Setting auto payment modal for:', artwork.art_code);
console.log('Early return - missing data. person:', !!person, 'artworks.length:', artworks.length, 'bidHistory keys:', Object.keys(bidHistory).length);
```

**Purpose:** These logs were critical for:
- Debugging auto-payment modal logic for winning bidders
- Verifying artwork status filtering
- Checking bid history data structure
- Identifying why payment modals weren't appearing
- Tracking user authentication state

**When to Re-enable:**
- When auto-payment modal fails to appear for winners
- When debugging bid history association issues
- When troubleshooting user authentication problems
- When investigating artwork status filtering logic

### Vote & Range Data Logs (Lines ~301)
**Removed:**
```javascript
console.log('Vote data from RPC:', voteData);
console.log('Vote weight map:', voteWeightMap);
console.log('Range data from RPC:', rangeData);
```

**Purpose:** These logs helped with:
- Debugging vote weight calculations
- Verifying RPC function responses for voting data
- Monitoring vote range calculations

**When to Re-enable:**
- When vote weights appear incorrect
- When debugging voting system issues
- When troubleshooting RPC vote functions

### Round Winners Debug Log (Line ~346)
**Removed:**
```javascript
console.log('Winners data from round_contestants:', winners);
```

**Purpose:** 
- Debugging round winner determination
- Verifying round_contestants data structure

**When to Re-enable:**
- When round winners aren't displaying correctly
- When debugging tournament/round logic

## Logs to Keep

**Recently Removed (Round 2 - Production Console Cleanup):**

### EventDetails.jsx Auto Payment Modal Log
**Removed:**
```javascript
console.log('All dependencies ready, checking for auto payment modal...');
```

**Purpose:** Tracked when auto-payment modal dependency check was ready
**When to Re-enable:** If auto-payment modal fails to appear for winners

### EventList.jsx Event Categorization Logs
**Removed:**
```javascript
console.log('Current date:', now);
console.log('Events received:', data?.length || 0, 'events');
console.log('Categorized events:', {
  active: categorized.active.length,
  recent: categorized.recent.length,
  future: categorized.future.length,
  total: categorized.active.length + categorized.recent.length + categorized.future.length
});
```

**Purpose:** 
- Debug event date categorization (active/recent/future)
- Monitor event fetching and processing
- Verify event count distribution

**When to Re-enable:** 
- When events appear in wrong categories
- When event list loading fails
- When debugging date-based event filtering

**Kept these important logs for ongoing debugging:**
- `console.log('Bid realtime update:', payload);` - Real-time bid subscription debugging  
- `console.error('Error fetching...', error);` - All error logging
- Real-time subscription logs for live updates

## How to Re-enable Logging

1. **For Production Debugging:** Add `const DEBUG = true;` at component top, wrap logs in `if (DEBUG)`
2. **For Specific Features:** Use targeted logging like `const DEBUG_BIDS = true;`
3. **For Real-time Issues:** Focus on subscription and state update logs
4. **For Payment Issues:** Re-enable auto-payment modal debug section

## Common Debug Scenarios

1. **Bid History Not Showing:** Re-enable bid data fetching logs
2. **Payment Modal Missing:** Re-enable auto payment modal debug logs
3. **Real-time Updates Failing:** Check subscription logs (already kept)
4. **Vote Counts Wrong:** Re-enable vote data logs
5. **Winner Detection Issues:** Re-enable winner and round contestant logs

## Performance Impact

Removing these logs should improve:
- Console performance (was very noisy)
- Browser DevTools responsiveness
- Production bundle performance (though console.log is typically optimized out)

## Future Considerations

- Consider implementing a proper logging system with levels (debug, info, warn, error)
- Use environment variables to control logging in different environments
- Implement structured logging for better debugging capabilities