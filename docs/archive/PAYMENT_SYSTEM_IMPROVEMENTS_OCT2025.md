# Payment System Improvements - October 2025

## Critical Bug Fixes and Major Enhancements

### 1. CRITICAL: Multi-Currency Payment Overpayment Bug Fixed

**Issue**: When processing payments through "Pay Now", the system was sending the TOTAL balance across ALL currencies but only in ONE currency, causing massive overpayments.

**Example of the bug**:
- Artist earned: $100 USD + $75 CAD
- System sent: **$175 USD** ❌ (should be $100 USD)

**Root Cause**:
- `get_ready_to_pay_artists()` returned ONE row per artist with `estimated_balance` = sum of all currencies
- `balance_currency` was set to the "primary currency" (highest balance)
- Payment processing used `estimated_balance` directly without checking per-currency amounts

**Solution**:
1. Created database function `get_artist_balance_for_currency(artist_profile_id UUID, currency TEXT)`
   - Returns balance owed for ONE SPECIFIC CURRENCY only
   - Migration: `20251007_create_get_artist_balance_for_currency.sql`

2. Updated `handlePayNow()` in PaymentsAdminTabbed.jsx to:
   - Query the currency-specific balance BEFORE creating payment
   - Validate there's actually a balance in that currency
   - Only send the correct amount for that specific currency

3. Updated `get_ready_to_pay_artists()` to return ONE ROW PER CURRENCY
   - If artist has USD + CAD balances, they appear as 2 separate rows
   - Each row shows exact balance for that specific currency
   - Migration: `20251007_update_get_ready_to_pay_artists_per_currency.sql`

**Files Changed**:
- `art-battle-admin/src/components/PaymentsAdminTabbed.jsx` (lines 557-593)
- `supabase/migrations/20251007_create_get_artist_balance_for_currency.sql`
- `supabase/migrations/20251007_update_get_ready_to_pay_artists_per_currency.sql`

**Documentation**: `/root/vote_app/vote26/CRITICAL_BUG_FIX_PAYMENT_OVERPAYMENT.md`

---

### 2. Manual Credits/Debits System

**Feature**: Added ability to add manual credits or debits to artist accounts for special circumstances (prizes, private events, supplies reimbursement).

**Database Changes**:
- Added `reason_category` field to `artist_payments` table
  - Categories: `prize`, `private_event`, `supplies_reimbursement`, `adjustment`, `other`
- Credits stored as NEGATIVE amounts (owed TO artist)
- Debits stored as POSITIVE amounts (paid OUT to artist)
- Created view `artist_manual_adjustments` for easy querying
- Migration: `20251007_add_manual_credits_support.sql`

**Edge Function**: `admin-add-manual-adjustment`
- Endpoint: `/functions/v1/admin-add-manual-adjustment`
- Requires ABHQ admin access
- Parameters:
  - `artist_profile_id` (UUID)
  - `amount` (positive number)
  - `adjustment_type` ('credit' or 'debit')
  - `currency` (defaults to USD)
  - `reason_category` (required)
  - `description` (required)
  - `reference` (optional)

**Integration**:
- Updated `artist-account-ledger` to display manual credits/debits correctly
- Credits show as separate entries increasing balance
- Debits show as separate entries decreasing balance

**Files Changed**:
- `supabase/migrations/20251007_add_manual_credits_support.sql`
- `supabase/functions/admin-add-manual-adjustment/index.ts`
- `supabase/functions/artist-account-ledger/index.ts` (lines 268-298)

**Documentation**: `/root/vote_app/vote26/supabase/MANUAL_ADJUSTMENTS.md`

---

### 3. Manual Payment Ready vs Eligible System

**Issue**: "Ready to Pay" tab was showing ALL artists with `manual_payment_override = true`, even if they hadn't submitted payment information.

**Solution**:
- "Manual Ready" = Has submitted payment info (has record in `artist_manual_payment_requests`)
- "Manual Eligible" = Override enabled but no payment info submitted

**Database Changes**:
- `get_ready_to_pay_artists()` now only includes artists who have SUBMITTED manual payment request info
- Uses JOIN (not LEFT JOIN) on `artist_manual_payment_requests` table
- Excludes artists who already have Stripe accounts ready (to avoid duplicates)

**UI Changes**:
- EventDetail: Shows "Manual Ready" (pink) or "Manual Eligible" (violet) badges
- PaymentsAdminTabbed: Only shows in "Ready to Pay" if manual ready (has info)
- Badge colors distinguish between ready and eligible states

**Files Changed**:
- `supabase/migrations/20251007_update_get_ready_to_pay_artists_per_currency.sql` (lines 73-77, 149)
- `art-battle-admin/src/components/EventDetail.jsx` (lines 3855-3864)

---

### 4. Manual Payment Modal Enhancements

**Improvements**:
1. **Shows Artist's Current Balance**: Displays balance owed at top of modal with currency
2. **Reveals Payment Details**: "Reveal Payment Info" button to view artist's banking details (audit logged)
3. **Pre-populated Currency**: Uses artist's balance currency instead of defaulting to USD
4. **Unified Modal**: Same full-featured modal used in all three locations:
   - "Pay Now" button in Ready to Pay tab (for manual ready artists)
   - "Record Manual Payment" button in artist detail view
   - EventDetail artist payments section

**Features**:
- Amount and Currency fields
- Payment Method dropdown (bank_transfer, check, cash, paypal, zelle, interac, WISE, etc.)
- Paid By selector (Art Battle or Local Producer)
- Reference/Transaction ID field
- Description text area
- Artist's banking info section with reveal functionality (security + audit logging)

**Files Changed**:
- `art-battle-admin/src/components/PaymentsAdminTabbed.jsx`:
  - Lines 1397-1418: Pay Now button logic
  - Lines 2411-2567: Manual payment modal UI
  - Lines 313-350: `fetchManualPaymentRequest()` function
  - Lines 381-410: `revealPaymentDetails()` function
- `art-battle-admin/src/components/EventDetail.jsx`:
  - Lines 180-188: Added state for currency, reference, paid_by
  - Lines 1211-1228: Updated manual payment insert with new fields

---

### 5. Completed Payments Tab - Manual Payment Indicator

**Issue**: Manual payments were showing "View API Logs" link even though there are no API logs for manual payments.

**Solution**:
- Check `payment_type` field
- Manual payments show: `✅ Completed (Manual)` (not clickable)
- Automated payments show: `✅ Completed - View API Logs` (clickable)

**Files Changed**:
- `art-battle-admin/src/components/PaymentsAdminTabbed.jsx` (lines 1878-1893)

---

### 6. Event Detail - Account Status Badges

**Enhancement**: Shows clear account status for each artist in the payments list.

**Badge Logic**:
- **"PAID"** (green) - If artist has earnings and balance owed ≤ $0.01
- **"Ready"** (green/orange) - Stripe account ready/pending (clickable)
- **"Manual Ready"** (pink) - Has manual override AND submitted payment info (clickable)
- **"Manual Eligible"** (violet) - Has manual override but NO payment info yet (clickable)
- **"Not Set Up"** (gray) - No Stripe and no manual override

All badges are clickable and open the artist payment detail modal.

**Files Changed**:
- `art-battle-admin/src/components/EventDetail.jsx` (lines 3829-3875)
- `supabase/functions/admin-event-artist-payments/index.ts`:
  - Lines 81: Added `manual_payment_override` to query
  - Lines 148-163: Added `manual_payment_requests` fetch
  - Lines 167-179: Map manual payment requests
  - Lines 334-341: Include in response

---

## Database Schema Changes

### New Functions

1. **`get_artist_balance_for_currency(p_artist_profile_id UUID, p_currency TEXT)`**
   - Returns: NUMERIC (balance for specific currency)
   - Purpose: Prevent multi-currency overpayment bugs
   - Security: Granted to service_role, authenticated, anon

2. **Updated `get_ready_to_pay_artists()`**
   - Now returns ONE ROW PER ARTIST PER CURRENCY
   - Filters manual payments to only those with submitted info
   - Excludes artists with both Stripe and manual ready (shows only Stripe)
   - Per-currency balance calculations prevent overpayment

### Table Modifications

**`artist_payments`**:
- Added: `reason_category VARCHAR(50)` with check constraint
- Index: `idx_artist_payments_reason_category`
- Comments updated to document negative amounts = credits

### Views Created

**`artist_manual_adjustments`**:
- Shows manual adjustments with clear credit/debit labels
- Converts negative amounts to credits
- Security: Granted to authenticated, service_role

---

## Edge Functions

### New Functions

**`admin-add-manual-adjustment`** (`/functions/v1/admin-add-manual-adjustment`)
- Purpose: Add manual credits/debits for special circumstances
- Auth: ABHQ admin only
- Audit: Logs admin email, timestamp
- Returns: Updated balance after adjustment

### Updated Functions

**`admin-event-artist-payments`** (`/functions/v1/admin-event-artist-payments`)
- Now fetches `manual_payment_requests` data
- Returns `manual_payment_request` object for each artist
- Used by EventDetail to show Manual Ready vs Eligible

**`artist-account-ledger`** (`/functions/v1/artist-account-ledger`)
- Updated to handle manual credits (negative amounts)
- Shows credits as separate ledger entries
- Includes reason_category in display

---

## Migration Files

1. `20251007_create_get_artist_balance_for_currency.sql` - Currency-specific balance function
2. `20251007_update_get_ready_to_pay_artists_per_currency.sql` - Per-currency rows
3. `20251007_add_manual_credits_support.sql` - Manual credits system

---

## Testing Recommendations

### Multi-Currency Payments
1. Find artist with multiple currencies (USD + CAD)
2. Verify they appear as 2 rows in "Ready to Pay"
3. Click "Pay Now" for USD - should only pay USD balance
4. Click "Pay Now" for CAD - should only pay CAD balance

### Manual Payments
1. Find artist with manual payment request
2. Verify shows "Manual Ready" (pink) in EventDetail
3. Click "Pay Now" - should show full modal with:
   - Current balance
   - Pre-populated currency
   - "Reveal Payment Info" button
4. Reveal payment info - should audit log the access

### Manual Credits
1. Use `admin-add-manual-adjustment` to add prize credit
2. Verify appears in artist ledger as credit
3. Verify increases artist balance

---

## Security Considerations

1. **Payment Info Reveal**:
   - Audit logged via `admin-get-manual-payment-request`
   - Only ABHQ admins can access
   - Logged: admin email, timestamp, artist ID

2. **Manual Adjustments**:
   - Only ABHQ admins can create
   - All adjustments logged with creator email
   - Cannot be deleted, only cancelled

3. **Payment Processing**:
   - Currency validation prevents wrong currency payments
   - Balance checks prevent overpayment
   - All payments logged with metadata

---

## Performance Notes

- Per-currency queries are indexed on `(artist_profile_id, currency)`
- Manual payment requests table has index on `artist_profile_id`
- UNION ALL used in ready-to-pay function (faster than UNION)
- Only fetches payment request data when needed (on modal open)

---

## Future Improvements

1. Add UI warning when artist has mixed currencies
2. Show per-currency breakdown in payment dialog
3. Add unit tests for multi-currency scenarios
4. Create automated reconciliation reports for overpayments
5. Add currency conversion rates for reporting
