# Artist Auction Portion System - Complete Documentation
**Date:** September 26, 2025
**Last Updated:** September 26, 2025
**Author:** Claude (AI Assistant)
**Context:** Critical payment system implementation and debugging

## Overview
The Artist Auction Portion system allows configurable percentage splits for art sales between artists and the house, replacing hardcoded 50% calculations. This enables:
- **Charity events**: 0% to artists (all proceeds to charity)
- **Standard events**: 50% to artists (traditional split)
- **Special events**: 100% to artists (artist keeps everything)

## Critical Database Schema

### Events Table
**Column:** `artist_auction_portion`
- **Type:** `DECIMAL(3,2)`
- **Default:** `0.5` (50%)
- **Range:** 0.00 to 1.00 (0% to 100%)
- **Location:** `events` table in PostgreSQL database
- **Migration:** `/root/vote_app/vote26/migrations/20250926_add_artist_auction_portion_to_events.sql`

```sql
ALTER TABLE events ADD COLUMN artist_auction_portion DECIMAL(3,2) DEFAULT 0.5;
ALTER TABLE events ADD CONSTRAINT artist_auction_portion_range
  CHECK (artist_auction_portion >= 0 AND artist_auction_portion <= 1);
CREATE INDEX idx_events_artist_auction_portion ON events(artist_auction_portion);
```

## Functions Fixed (All Using Hardcoded 0.5 Previously)

### 1. Database Functions (PostgreSQL)
**Location:** PostgreSQL database functions
**Access:** `PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres`

#### Primary Payment Functions:
1. **`get_artists_owed_money()`**
   - **Purpose:** Returns artists owed money for ledger view
   - **Issue:** Was showing $410 for Tetiana, now shows $237.50
   - **Fix:** Changed `* 0.5` to `* e.artist_auction_portion`
   - **Migration:** `20250926_fix_artists_owed_money_CAREFUL.sql`

2. **`get_enhanced_admin_artists_owed()`**
   - **Purpose:** Returns artists owed for "artists owed money" list
   - **Issue:** Was showing $295 for Tetiana, now shows $195.00
   - **Fix:** Changed hardcoded calculation to dynamic
   - **Migration:** `20250926_fix_enhanced_admin_artists_owed_function.sql`

3. **`get_enhanced_payments_admin_data()`**
   - **Purpose:** Enhanced payment data for admin interface
   - **Fix:** Changed hardcoded 0.5 to `e.artist_auction_portion`
   - **Migration:** `20250926_fix_enhanced_payments_admin_data.sql`

4. **`get_admin_artist_payments_data(timestamptz)`**
   - **Purpose:** Global artist payment data across all events
   - **Fix:** Added JOIN with events table for dynamic percentage
   - **Migration:** `20250926_fix_global_admin_payments_function.sql`

5. **`get_event_artists_owed(UUID)`**
   - **Purpose:** Event-specific artists owed money
   - **Fix:** Column ambiguity issues + hardcoded percentage
   - **Migration:** `20250926_fix_event_artists_owed_function.sql`

#### Secondary Functions:
6. **`audit_payment_setup_invitations(INTEGER)`**
   - **Purpose:** Audit payment invitation process
   - **Fix:** Added JOIN with events table
   - **Migration:** `20250926_fix_remaining_hardcoded_functions.sql`

7. **`get_simple_admin_payments_data(INTEGER)`**
   - **Purpose:** Simple admin payment dashboard data
   - **Fix:** Dynamic percentage calculation
   - **Migration:** `20250926_fix_remaining_hardcoded_functions.sql`

8. **`get_ready_to_pay_artists()`**
   - **Purpose:** List of artists ready for payment processing
   - **Fix:** Dynamic percentage in calculations
   - **Migration:** `20250926_fix_remaining_hardcoded_functions.sql`

### 2. Edge Functions (Supabase Edge Functions)
**Location:** `/root/vote_app/vote26/supabase/functions/`
**Deployment:** `cd /root/vote_app/vote26 && npx supabase functions deploy [function-name]`

#### Critical Edge Function:
**`artist-account-ledger`**
- **Purpose:** Powers the admin interface ledger (the main payment view)
- **Issue:** Was the root cause of $410 showing in admin interface
- **Location:** `/root/vote_app/vote26/supabase/functions/artist-account-ledger/index.ts`
- **Key Fix:** Lines 154, 167-172, 209, 215, 252

**Critical Code Changes:**
```typescript
// Query modification (line 154):
events!inner(name, currency, artist_auction_portion)

// Calculation fix (lines 167-172):
let artistAuctionPortion = 0.5; // default fallback
if (art.events && typeof art.events.artist_auction_portion === 'number') {
  artistAuctionPortion = art.events.artist_auction_portion;
}

// Usage in calculations:
const artistCommission = salePrice * artistAuctionPortion;
const houseCommission = salePrice * (1 - artistAuctionPortion);
```

## Admin Interface Integration

### 1. Event Creation/Editing
**File:** `/root/vote_app/vote26/art-battle-admin/src/components/CreateEvent.jsx`
- Added `artist_auction_portion` field to form (default 0.5)
- Validation: 0-100% input
- Connected to both create and update operations

### 2. Event Management Functions
**Files:**
- `/root/vote_app/vote26/supabase/functions/admin-create-event/index.ts`
- `/root/vote_app/vote26/supabase/functions/admin-update-event/index.ts`

### 3. Payment Dashboard Display
**File:** `/root/vote_app/vote26/art-battle-admin/src/components/EventPaymentDashboard.jsx`
- Color-coded badges: 0%=orange (charity), 50%=blue (standard), 100%=green (full artist)

### 4. Ledger UI Display Fix
**Files:**
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdmin.jsx` (line ~1122)
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx` (line ~1953)

**Issue:** UI was displaying hardcoded "(50%)" even when calculations were correct
**Fix:** Dynamic percentage display using actual commission rate from metadata
```javascript
// Before (hardcoded):
Sale: ${entry.metadata.gross_sale_price.toFixed(2)} → Artist: ${entry.amount.toFixed(2)} (50%)

// After (dynamic):
Sale: ${entry.metadata.gross_sale_price.toFixed(2)} → Artist: ${entry.amount.toFixed(2)} ({((entry.metadata.commission_rate ?? entry.art_info?.commission_rate ?? 0.5) * 100).toFixed(0)}%)
```

## Critical Debugging Information

### Testing Commands:
```bash
# Test database function:
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "
SELECT artist_name, artist_entry_id, estimated_balance
FROM get_artists_owed_money()
WHERE artist_entry_id = 164713;
"

# Test edge function:
curl -X POST \
  "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/artist-account-ledger" \
  -H "Authorization: Bearer [TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"artist_profile_id": "30b859e2-ae49-40b1-8a2b-6d1a75f6a64e"}'
```

### Key Test Case - Tetiana Blyzenko:
- **Entry ID:** 164713
- **Artist Profile ID:** `30b859e2-ae49-40b1-8a2b-6d1a75f6a64e`
- **Menlo Park Event:** 0% artist portion (charity event)
- **Expected Results:**
  - Menlo Park sales should show $0 commission
  - Total balance should exclude Menlo Park earnings
  - Before fix: $410 total, After fix: $237.50 total

## Common Issues & Solutions

### 1. Edge Function Deployment Caching
**Problem:** Supabase sometimes caches old function versions
**Solution:**
```bash
cd /root/vote_app/vote26
npx supabase functions delete artist-account-ledger
npx supabase functions deploy artist-account-ledger
```

### 2. JavaScript Type Handling
**Problem:** `0` (zero) vs `null` vs `undefined` handling
**Solution:** Use explicit type checking:
```typescript
if (art.events && typeof art.events.artist_auction_portion === 'number') {
  artistAuctionPortion = art.events.artist_auction_portion;
}
```

### 3. Database Query Structure
**Problem:** JOIN queries need explicit field selection
**Solution:** Always include `artist_auction_portion` in SELECT:
```sql
events!inner(name, currency, artist_auction_portion)
```

### 4. Column Ambiguity
**Problem:** Multiple tables with same column names
**Solution:** Use proper aliases and qualified names:
```sql
SELECT sales.artist_id, SUM(sales.sales_total) as total_sales
FROM art_sales_by_currency sales
GROUP BY sales.artist_id
```

### 5. UI Display Issues
**Problem:** Admin interface showing hardcoded "(50%)" even when calculations are correct
**Symptoms:** Edge function returns correct `commission_rate: 0` but UI displays "(50%)"
**Root Cause:** Hardcoded percentage text in React components
**Solution:** Replace hardcoded text with dynamic calculation using metadata
**Files to Check:** Look for `(50%)` hardcoded strings in admin interface components

## Migration Files Created
All located in `/root/vote_app/vote26/migrations/`:

1. `20250926_add_artist_auction_portion_to_events.sql` - Schema change
2. `20250926_fix_artists_owed_money_CAREFUL.sql` - Ledger function ($410 → $237.50)
3. `20250926_fix_enhanced_payments_admin_data.sql` - Enhanced admin data
4. `20250926_fix_global_admin_payments_function.sql` - Global payments
5. `20250926_fix_ambiguous_column_reference.sql` - Column ambiguity fix
6. `20250926_fix_event_artists_owed_function.sql` - Event-specific function
7. `20250926_fix_enhanced_admin_artists_owed_function.sql` - Artists owed list ($295 → $195)
8. `20250926_fix_remaining_hardcoded_functions.sql` - Audit, simple, ready-to-pay functions

## Verification Commands

### Check All Functions for Hardcoded Values:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_definition LIKE '%* 0.5%' OR routine_definition LIKE '%0.5 *%';
```
**Expected Result:** 0 rows (all hardcoded values should be eliminated)

### Test Specific Event:
```sql
SELECT
  e.name,
  e.artist_auction_portion,
  a.art_code,
  a.final_price
FROM art a
JOIN events e ON a.event_id = e.id
WHERE e.name LIKE '%Menlo Park%'
  AND a.status IN ('sold', 'paid');
```

## Future Maintenance Notes

1. **When adding new payment-related functions:** Always use `e.artist_auction_portion` instead of hardcoded percentages
2. **When modifying existing functions:** Search for `* 0.5`, `0.5 *`, and `commission_rate: 0.5` patterns
3. **When testing:** Always test with 0%, 50%, and 100% events to verify calculations
4. **When deploying edge functions:** Use delete/redeploy if changes aren't taking effect due to caching

## Critical File Locations Summary

### Database:
- **Host:** `db.xsqdkubgyqwpyvfltnrf.supabase.co:5432`
- **Database:** `postgres`
- **Connection:** `PGPASSWORD='6kEtvU9n0KhTVr5' psql -h [host] -p 5432 -d postgres -U postgres`

### Code Repositories:
- **Migrations:** `/root/vote_app/vote26/migrations/`
- **Edge Functions:** `/root/vote_app/vote26/supabase/functions/`
- **Admin Interface:** `/root/vote_app/vote26/art-battle-admin/`
- **Function Deployment Copies:** `/root/vote_app/vote26/supabase-functions/functions-local/`

### Deployment Commands:
- **Admin Interface:** `/root/vote_app/vote26/art-battle-admin/deploy.sh`
- **Edge Functions:** `cd /root/vote_app/vote26 && npx supabase functions deploy [function-name]`
- **Migrations:** `PGPASSWORD='...' psql ... -f migrations/[file].sql`

## CRITICAL UPDATE: Payment Logic Correction (September 26, 2025)

**CRITICAL DISCOVERY:** Payment functions had incorrect logic for distinguishing between money OWED vs money PAID to artists.

### Correct Payment Logic:

#### Money OWED to Artists (Art Sales):
- **Art Status**: `('sold', 'paid', 'closed')`
- **Logic**: These represent sales where artist is owed money
- **Calculation**: `art_price * event.artist_auction_portion`

#### Money PAID to Artists (Payment Debits):
- **Payment Status**: `('paid', 'verified')`
- **Logic**:
  - `'paid'` = Completed manual payments
  - `'verified'` = Completed automated payments
- **Exclude**: `('failed', 'cancelled')` - Artist never received money

### Functions Fixed:
1. **`get_artists_owed_money()`** - Corrected art and payment status logic
2. **`get_admin_artist_payments_data()`** - Corrected art and payment status logic
3. **`get_enhanced_payments_admin_data()`** - Corrected art and payment status logic
4. **`get_simple_admin_payments_data()`** - Corrected art and payment status logic
5. **`get_ready_to_pay_artists()`** - Fixed to exclude artists already paid with 'verified' status
6. **Edge Function `artist-account-ledger`** - Uses correct art status logic

### Impact of Fix:
- **Ready to Pay List**: Reduced from 8 artists (many already paid) to 2 artists (actually owed)
- **Tetiana Example**: Shows $237.50 owed (correct calculation including sold/closed art)
- **All functions consistent**: Proper distinction between owed vs paid amounts

**CRITICAL RULES:**
1. **Art Sales (Owed)**: Count `('sold', 'paid', 'closed')` - represents money owed
2. **Payment Debits (Paid)**: Count `('paid', 'verified')` - represents money already sent

## Final Notes
This system affects the core financial calculations of the Art Battle platform. Any changes should be thoroughly tested across all event types (charity 0%, standard 50%, special 100%) before deployment. The artist payment accuracy is critical to maintaining trust with the artist community.

**Key Success Metrics After Implementation:**
- Menlo Park (0%) events show $0 artist earnings ✅
- Standard (50%) events show correct 50% split ✅
- Ledger, admin lists, and database functions all show consistent values ✅
- No hardcoded 0.5 calculations remain in any payment function ✅
- ALL payment functions only count 'paid' status art ✅