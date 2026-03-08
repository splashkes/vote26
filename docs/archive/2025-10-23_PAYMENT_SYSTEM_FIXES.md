# Payment System Fixes - October 23, 2025

## Overview
Fixed critical bugs in the Art Battle payment processing system affecting multi-currency payments, artist balance calculations, and admin UI functionality.

## Issues Fixed

### 1. AU Transaction FX Lookup Failure
**Problem:** Australian artist Antra Johri's AUD payment failing with "balance_insufficient" error. Payment system was attempting to send AUD directly instead of using FX conversion from USD.

**Root Cause:** Admin interface (`PaymentsAdminTabbed.jsx`) was calling the deprecated `process-pending-payments` function instead of the new `stripe-global-payments-payout` function that includes FX quote conversion.

**Solution:**
- Updated 3 payment processing functions in `PaymentsAdminTabbed.jsx`:
  - `handlePaySingleArtist()` (line 909-936)
  - `handleProcessInProgressPayments()` (line 779-889)
  - `handleProcessPayments()` (line 646-777)
- All now call `stripe-global-payments-payout` which properly handles FX conversion using Stripe's FX Quotes API

**Files Modified:**
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx`

---

### 2. Artists Showing in "Ready to Pay" with $0 Balance
**Problem:** Gabriel Antonio (#310249) appearing in "Ready to Pay" tab despite having $0 ledger balance. Database showed $50 estimated balance when ledger showed $0.

**Root Cause:** `get_ready_to_pay_artists()` function was counting 'closed' art (art that didn't sell) as credits to the artist. The function included: `WHERE a.status IN ('sold', 'paid', 'closed')` which was incorrect.

**Correct Logic:** Artist account ledger only counts art with status = 'paid' as actual credits.
```typescript
const ledgerAmount = art.status === 'paid' ? artistCommission : 0;
```

**Solution:**
- Created migration `20251019_fix_ready_to_pay_exclude_closed_art.sql`
- Changed art credits query to exclude 'closed' status
- Changed from: `WHERE a.status IN ('sold', 'paid', 'closed')`
- Changed to: `WHERE a.status IN ('sold', 'paid')`

**Files Created:**
- `/root/vote_app/vote26/migrations/20251019_fix_ready_to_pay_exclude_closed_art.sql`

---

### 3. Artists Showing Balance for Unpaid Auction Wins
**Problem:** Julio (#310276) showing $87.50 in "Ready to Pay" but $0 in account ledger.

**Root Cause:** Function was counting 'sold' art (auction won but artist NOT YET PAID) as credits. The ledger only counts art with status = 'paid' because that represents money the artist has actually earned and been credited for.

**Art Status Meanings:**
- `'paid'` - Artist has been paid their commission (counts as credit)
- `'sold'` - Auction won but artist not yet paid (does NOT count as credit)
- `'closed'` - No sale, art returned (does NOT count as credit)

**Solution:**
- Created migration `20251019_fix_ready_to_pay_only_paid_art.sql`
- Changed art credits query to ONLY count 'paid' status
- Changed from: `WHERE a.status IN ('sold', 'paid')`
- Changed to: `WHERE a.status = 'paid'`
- Also fixed payment_debits to exclude cancelled payments: `WHERE ap.status != 'cancelled'`

**Files Created:**
- `/root/vote_app/vote26/migrations/20251019_fix_ready_to_pay_only_paid_art.sql`

---

### 4. "Artists Owed Money" Tab Using Incorrect Calculation
**Problem:** "Artists Owed Money" tab had the same bugs as "Ready to Pay" tab - counting 'sold' and 'closed' art as credits.

**Root Cause:** `get_enhanced_admin_artists_owed()` function using same incorrect art status filters.

**Solution:**
- Created migration `20251019_fix_artists_owed_match_ledger.sql`
- Applied same fixes as ready_to_pay function:
  - Changed to: `WHERE a.status = 'paid'`
  - Excluded cancelled payments: `WHERE ap.status != 'cancelled'`
- Now matches ledger calculation exactly

**Files Created:**
- `/root/vote_app/vote26/migrations/20251019_fix_artists_owed_match_ledger.sql`

---

### 5. CAD Payment Failures
**Problem:**
- Alex Torch (USD) - "No payment ID found"
- Rosalie angelillo (USD) - "No payment ID found"
- Hans Deslauriers (CAD) - 400 error: "You cannot create a transfer to an account in a different currency than the balance currency (account: CAD, balance_transaction currency: USD)"

**Root Cause:** `stripe-global-payments-payout` function was:
1. Hardcoded to use USD as platform currency
2. Always using international Stripe secret key (even for CAD)
3. Attempting FX conversion for all payments (even CAD→CAD)

**Key Insight:** Canadian Stripe account only has CAD balance. CAD payments must be sent as CAD from CAD balance without FX conversion.

**Solution:**
Updated `/root/vote_app/vote26/supabase/functions/stripe-global-payments-payout/index.ts`:

1. **Added CAD detection and Stripe key selection** (lines 196-206):
```typescript
const isCanadian = (paymentCurrency.toUpperCase() === 'CAD');
const stripeSecretKey = isCanadian
  ? Deno.env.get('stripe_canada_secret_key')
  : Deno.env.get('stripe_intl_secret_key');
```

2. **Dynamic platform currency** (lines 232-312):
```typescript
const platformCurrency = isCanadian ? 'CAD' : 'USD';

// For Canadian payments: CAD → CAD (no FX)
if (isCanadian && targetCurrency === 'CAD') {
  platformAmountToSend = targetAmount;
  fxMetadata = {
    payment_type: 'canadian_domestic',
    note: 'Direct CAD to CAD transfer, no FX conversion needed'
  };
}
```

3. **Updated transfer creation** (line 354):
```typescript
currency: platformCurrency.toLowerCase(), // Use platform currency (CAD for Canadian, USD for International)
```

**Result:**
- USD payments to international accounts: USD → (FX conversion) → Target currency
- CAD payments to Canadian accounts: CAD → CAD (no FX)
- AUD payments: USD → (FX conversion) → AUD

**Files Modified:**
- `/root/vote_app/vote26/supabase/functions/stripe-global-payments-payout/index.ts`

---

### 6. Processing Results Showing on Wrong Tab
**Problem:** After clicking "Process In Progress Payments" button, results appeared on "Ready to Pay" tab instead of "Payment Attempts" tab, and user had to manually switch tabs to see results.

**Root Cause:**
1. Processing Results block was duplicated in both "Ready to Pay" and "Payment Attempts" tabs
2. Tabs component was using uncontrolled `defaultValue` instead of controlled state
3. No automatic tab switching after processing

**Solution:**
Updated `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx`:

1. **Removed duplicate Processing Results block** from "Ready to Pay" tab (deleted lines 1634-1783)

2. **Added controlled tab state** (line 78):
```javascript
const [activeTab, setActiveTab] = useState('ready-to-pay');
```

3. **Updated Tabs.Root** (line 1307):
```javascript
<Tabs.Root value={activeTab} onValueChange={setActiveTab}>
```

4. **Auto-switch to Payment Attempts tab** after processing (line 865):
```javascript
setActiveTab('payment-attempts');
```

**Result:**
- Processing Results only appear on "Payment Attempts" tab
- Tab automatically switches after processing so results are immediately visible
- No manual tab switching required

**Files Modified:**
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx`

---

## Database Migrations Applied

All migrations applied using:
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres -f migrations/[MIGRATION_FILE].sql
```

1. `20251019_fix_ready_to_pay_exclude_closed_art.sql` - Excluded 'closed' art from ready to pay
2. `20251019_fix_ready_to_pay_only_paid_art.sql` - Only count 'paid' art as credits
3. `20251019_fix_artists_owed_match_ledger.sql` - Applied same fixes to artists owed function

---

## Deployments

### Admin Interface
```bash
cd /root/vote_app/vote26/art-battle-admin
./deploy.sh
```
Deployed to: https://artb.tor1.cdn.digitaloceanspaces.com/admin/

### Edge Functions
Supabase edge functions automatically updated via database connection.

---

## Testing Results

### USD Payments ✅
- Alex Torch - Successfully processed
- Rosalie angelillo - Successfully processed

### CAD Payments ✅
- Hans Deslauriers - Successfully processed after fix

### AUD Payments ✅
- Antra Johri - Successfully processed with FX conversion

### UI Functionality ✅
- Processing results now appear on correct tab
- Tab auto-switches after processing
- Results immediately visible without manual interaction

---

## Key Learnings

1. **Art Status is Critical:** Only art with status = 'paid' should count as artist credits. 'sold' means auction won but unpaid, 'closed' means no sale.

2. **Multi-Currency Stripe Setup:**
   - Canadian account holds CAD balance → use for CAD payments
   - International account holds USD balance → use for international payments with FX
   - Must match account currency to transfer currency or use FX conversion

3. **Database Function Consistency:** All artist balance calculation functions must match the ledger logic exactly to avoid discrepancies between different admin tabs.

4. **Controlled vs Uncontrolled Components:** UI components that need programmatic state changes must use controlled state (value + onChange) rather than uncontrolled (defaultValue).

---

## Related Files Reference

### Edge Functions
- `/root/vote_app/vote26/supabase/functions/stripe-global-payments-payout/index.ts` - Main payment processor with FX
- `/root/vote_app/vote26/supabase/functions/artist-account-ledger/index.ts` - Source of truth for ledger logic
- `/root/vote_app/vote26/supabase/functions/working-admin-payments/index.ts` - Admin payments data aggregator

### Admin Interface
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx` - Payment admin UI

### Database Functions (Modified via Migrations)
- `get_ready_to_pay_artists()` - Returns artists with verified Stripe accounts and positive balance
- `get_enhanced_admin_artists_owed()` - Returns all artists owed money
- `get_payment_attempts()` - Returns in-progress payment attempts
- `get_completed_payments()` - Returns completed payments

---

## Date: October 23, 2025
**Status:** All fixes deployed and tested successfully ✅
