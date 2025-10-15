# FX Quotes API Integration for International Payments

**Date:** 2025-10-15
**Status:** ✅ Deployed and Active

## Overview

Integrated Stripe's FX Quotes API (Preview) to enable transparent currency conversion for international artist payments. Artists now receive exact amounts in their local currency (AUD, THB, EUR, etc.) while the platform pays from USD balance.

## What Changed

### 1. Payment Flow Update

**Before:**
- Send USD to international artists → unpredictable local currency amount
- OR Send local currency → insufficient funds error (no multi-currency balance)

**After:**
1. Create FX Quote with 1-hour locked rate
2. Calculate exact USD amount needed for target local currency amount
3. Send USD transfer with calculated amount
4. Stripe automatically converts to artist's local currency
5. Artist receives **exact** expected amount

### 2. Updated Functions

#### `stripe-global-payments-payout/index.ts`
- **Changed from:** `stripe.payouts.create()` → `stripe.transfers.create()`
- **Added:** FX Quotes API integration
- **Added:** Automatic currency detection from artist's Stripe account
- **Added:** Exchange rate locking (1-hour duration)
- **Updated:** Metadata tracking for FX details

**Key Features:**
- Detects US/CA vs International artists
- For international: Gets FX quote and calculates USD amount
- For US/CA: Sends USD directly (no conversion needed)
- Records exchange rate, quote ID, and all FX details in metadata
- Handles FX API errors gracefully

### 3. How It Works

```typescript
// For international payment (e.g., 50 AUD to Australian artist)
Target: 50.00 AUD
↓
Create FX Quote (USD→AUD, 1-hour lock)
Rate: 1.51867 (from Stripe)
↓
Calculate: 50.00 / 1.51867 = $32.92 USD needed
↓
Send transfer: $32.92 USD to artist's account
↓
Stripe converts: $32.92 USD → 50.00 AUD
↓
Artist receives: Exactly 50.00 AUD ✅
```

## Service Agreement Configuration

### Updated: `stripe-global-payments-onboard/index.ts`

```typescript
// US/CA artists
service_agreement: 'full'
capabilities: ['transfers', 'card_payments']

// International artists
service_agreement: 'recipient'
capabilities: ['transfers']
```

**Key Point:** Recipient service agreement is **required** for cross-border transfers.

## FX Costs

### Stripe FX Quotes API Pricing

| Lock Duration | Group 1 Currencies* | Group 2 Currencies |
|---------------|---------------------|-------------------|
| None (live)   | **FREE**           | **FREE**          |
| 5 minutes     | 0.07%              | 0.12%             |
| **1 hour**    | **0.10%**          | **0.15%**         |
| 24 hours      | 0.20%              | 0.30%             |

*Group 1: AUD, CAD, CHF, EUR, GBP, HKD, JPY, NZD, SGD, THB, USD, etc.

### Total Platform Cost

For typical transaction:
- **FX fee (built-in):** ~1%
- **Duration premium (1-hour):** 0.10%
- **Total platform cost:** ~2% for currency conversion

**Example:** Sending 50 AUD costs platform ~$33.50 USD (vs $32.50 at pure market rate)

## Database Schema

### `artist_global_payments` Table
No schema changes needed - existing fields support new flow.

### `global_payment_requests` Table
**Metadata now includes:**
```json
{
  "fx_quote_id": "fxq_xxx",
  "exchange_rate": 1.51867,
  "target_currency": "AUD",
  "target_amount": 50.00,
  "usd_amount_calculated": 32.92,
  "fx_rate_details": {
    "base_rate": 1.53556,
    "duration_premium": 0.001,
    "fx_fee_rate": 0.01,
    "reference_rate": 1.53493
  },
  "fx_quote_expires_at": "2025-10-15T17:56:54.000Z"
}
```

## Testing Results

### Test 1: AUD Payment
- Target: 5.00 AUD
- Exchange rate: 1.51867
- USD sent: $3.29
- Result: ✅ 5.00 AUD received

### Test 2: THB Payment
- Target: 1,617.50 THB
- Exchange rate: 1.5202 (per balance transaction)
- Result: ✅ Converted successfully

### Test 3: USD Payment (Domestic)
- Target: 50.00 USD
- No FX needed
- Result: ✅ Direct transfer

## Migration Status

### Artists Migrated to Recipient Accounts

**Reset and re-onboarded (7 artists):**
- 🇦🇺 Vicki Soar (now on acct_1SIIx6AxQ7p3rywp)
- 🇦🇺 Antra Johri
- 🇦🇺 Wido Alessandro
- 🇹🇭 Assadawut Sooksee
- 🇹🇭 Qandle
- 🇹🇭 Sasiwimol Chonlabut
- 🇳🇱 Gaby

**Issue resolved:** Vicki Soar had duplicate record - cleaned up, now pointing to new recipient account.

## API Versions

- **Standard operations:** `2023-10-16`
- **FX Quotes API:** `2025-07-30.preview` (preview version)

## Next Steps

1. ✅ **Monitor first production payments** - Watch for any FX API errors
2. ⏳ **Track FX costs** - Calculate actual platform costs vs estimates
3. ⏳ **Update admin UI** - Show currency and FX details in payment records
4. ⏳ **Set up alerts** - Notify if FX API becomes unavailable

## Rollback Plan

If issues occur:
1. Revert to `stripe-global-payments-payout/index_old.ts`
2. Redeploy: `supabase functions deploy stripe-global-payments-payout`
3. International payments will fail (expected) until fix deployed

## Documentation Links

- [FX Quotes API Docs](https://docs.stripe.com/payments/currencies/localize-prices/fx-quotes-api)
- [Recipient Service Agreement](https://docs.stripe.com/connect/service-agreement-types)
- [Cross-Border Payouts](https://docs.stripe.com/connect/cross-border-payouts)

## Support Contacts

- **Stripe Support:** If FX API access issues occur
- **Issue:** FX Quotes API is in preview - may need explicit account enablement
- **Form:** Available at bottom of FX Quotes API documentation page
