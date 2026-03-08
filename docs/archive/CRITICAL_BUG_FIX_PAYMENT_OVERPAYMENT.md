# CRITICAL BUG FIX: Payment Overpayment Issue

**Date**: October 7, 2025
**Severity**: CRITICAL
**Status**: FIXED

## The Bug

When processing artist payments through the "Pay Now" button in the admin interface, the system was sending **incorrect amounts** causing massive overpayments.

### Root Cause

The payment system was using `estimated_balance` (which is the **SUM of balances across ALL currencies**) but sending it in only **ONE currency**.

### Example of the Bug

Artist earnings:
- $100 USD
- $75 CAD
- **Total `estimated_balance` = $175**

When clicking "Pay Now" for USD:
- ❌ **BUG**: System sent **$175 USD** (wrong!)
- ✅ **FIX**: System now sends **$100 USD** (correct!)

### Technical Details

**File**: `art-battle-admin/src/components/PaymentsAdminTabbed.jsx`
**Function**: `handlePayNow()` (line ~557)

**Before (BUGGY CODE)**:
```javascript
const { data, error } = await supabase.functions.invoke('process-artist-payment', {
  body: {
    artist_profile_id: selectedArtist.artist_profiles.id,
    amount: selectedArtist.estimated_balance,  // ❌ WRONG - This is sum of ALL currencies!
    currency: currency,  // Only ONE currency
    payment_type: 'automated',
    description: `Payment for artwork sales - ${currency} balance`
  }
});
```

**After (FIXED CODE)**:
```javascript
// Get currency-specific balance first
const { data: currencyBalance, error: balanceError } = await supabase.rpc('get_artist_balance_for_currency', {
  p_artist_profile_id: selectedArtist.artist_profiles.id,
  p_currency: currency
});

const actualAmount = currencyBalance || 0;

const { data, error } = await supabase.functions.invoke('process-artist-payment', {
  body: {
    artist_profile_id: selectedArtist.artist_profiles.id,
    amount: actualAmount,  // ✅ CORRECT - Currency-specific amount only
    currency: currency,
    payment_type: 'automated',
    description: `Payment for artwork sales - ${currency} balance`
  }
});
```

## The Fix

### 1. Created New Database Function

**File**: `supabase/migrations/20251007_create_get_artist_balance_for_currency.sql`

```sql
CREATE OR REPLACE FUNCTION get_artist_balance_for_currency(
  p_artist_profile_id UUID,
  p_currency TEXT
)
RETURNS NUMERIC
```

This function calculates the balance owed for **ONE SPECIFIC CURRENCY ONLY**, preventing the overpayment bug.

### 2. Updated Payment Processing

Modified `handlePayNow()` in `PaymentsAdminTabbed.jsx` to:
1. Query the currency-specific balance using the new function
2. Validate that there's actually a balance in that currency
3. Only send the correct amount for that specific currency

### 3. Added Error Handling

- Throws error if balance query fails
- Throws error if no balance exists in the specified currency
- Shows clear error messages to admin

## Deployment

- ✅ Database function deployed to production
- ✅ Admin interface deployed to CDN
- ✅ Fix is live: https://artb.tor1.cdn.digitaloceanspaces.com/admin/

## Impact Assessment

### Who Was Affected?

Any artists with earnings in **multiple currencies** who had payments processed via the "Pay Now" button.

### Data Needed for Reconciliation

Run this query to find potentially affected payments:

```sql
SELECT
  ap.id as payment_id,
  ap.artist_profile_id,
  prof.name as artist_name,
  ap.gross_amount,
  ap.currency,
  ap.created_at,
  ap.status,
  ap.metadata
FROM artist_payments ap
JOIN artist_profiles prof ON ap.artist_profile_id = prof.id
WHERE ap.payment_type = 'automated'
  AND ap.created_at >= '2025-10-01'  -- Adjust date range as needed
  AND ap.status IN ('paid', 'processing', 'pending')
ORDER BY ap.created_at DESC;
```

Then for each artist, check if they had multi-currency earnings:

```sql
SELECT
  e.currency,
  SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as earnings_in_currency
FROM art a
JOIN events e ON a.event_id = e.id
WHERE a.artist_id = 'ARTIST_UUID_HERE'
  AND a.status IN ('sold', 'paid')
GROUP BY e.currency
HAVING SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) > 0;
```

If an artist has multiple rows (multiple currencies), they may have been overpaid.

## Prevention

### Going Forward

1. ✅ **Fixed**: Currency-specific balance queries
2. ✅ **Added**: Validation before payment
3. **TODO**: Add warning in UI when artist has mixed currencies
4. **TODO**: Show per-currency breakdown in payment dialog
5. **TODO**: Add unit tests for multi-currency scenarios

### Code Review Checklist

When reviewing payment-related code:
- [ ] Always check if currency conversion is needed
- [ ] Verify that balances match the payment currency
- [ ] Test with multi-currency scenarios
- [ ] Never assume `estimated_balance` = balance in one currency

## Testing

### Manual Test Cases

1. **Single Currency Artist** (should work same as before)
   - Artist with only USD earnings
   - Click "Pay Now" → Should pay correct USD amount

2. **Multi-Currency Artist** (critical test case)
   - Artist with USD + CAD earnings
   - Click "Pay Now" for USD → Should pay ONLY USD balance
   - Click "Pay Now" for CAD → Should pay ONLY CAD balance

3. **Edge Cases**
   - Artist with $0 in selected currency → Should show error
   - Artist with mixed currencies but already paid → Should not appear in "Ready to Pay"

## Related Files

- `art-battle-admin/src/components/PaymentsAdminTabbed.jsx` (line 557)
- `supabase/migrations/20251007_create_get_artist_balance_for_currency.sql`
- `supabase/functions/process-artist-payment/index.ts`

## Lessons Learned

1. **Currency handling is critical** - Always be explicit about which currency
2. **Test multi-currency scenarios** - Single currency testing isn't enough
3. **Database functions are your friend** - Centralize critical calculations
4. **Validate before payment** - Never trust client-side calculations for money

## Action Items

- [x] Fix deployed to production
- [x] Documentation created
- [ ] Reconcile any overpayments from before the fix
- [ ] Add UI warnings for multi-currency artists
- [ ] Create automated tests
- [ ] Update payment processing documentation
