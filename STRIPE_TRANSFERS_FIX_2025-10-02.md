# CRITICAL FIX: Stripe Payments API Change (2025-10-02)

## 🔍 SEARCH KEYWORDS
- Thailand payment error
- Stripe service agreement error
- Custom account transfers
- stripe.transfers.create vs stripe.payouts.create
- "Funds can't be sent to accounts located in TH"
- International artist payments
- Global Payments system

---

## ❌ THE PROBLEM

When trying to pay a Thai artist (or artists from other international countries), we received this error:

```
🚨 STRIPE ERROR: Funds can't be sent to accounts located in TH when
the account is under the `full` service agreement
```

**Root Cause:**
- Using `stripe.payouts.create()` API with `recipient` parameter
- This API only works with "full" service agreement accounts
- "Full" service agreement only supports ~40 countries (US, CA, UK, etc.)
- Does NOT support: Thailand (TH), Philippines (PH), many other countries

---

## ✅ THE SOLUTION

**Changed from:** `stripe.payouts.create()` **to:** `stripe.transfers.create()`

### Key Differences:

| Feature | Old (payouts.create) | New (transfers.create) |
|---------|---------------------|------------------------|
| **Parameter** | `recipient` | `destination` |
| **Account Type** | "full" service agreement | "custom" accounts |
| **Countries Supported** | ~40 countries | 50+ countries |
| **Payment Flow** | Direct to bank | To Stripe balance → artist withdraws |
| **Works with Thailand?** | ❌ NO | ✅ YES |
| **Works with Philippines?** | ❌ NO | ✅ YES |
| **Same Fees?** | ✅ YES | ✅ YES |

---

## 📁 FILES CHANGED

### `/root/vote_app/vote26/supabase/functions/stripe-global-payments-payout/index.ts`

**Line 1-29:** Added extensive header documentation explaining the change

**Lines 197-235:** Changed API call:
```typescript
// OLD CODE (BROKEN)
const payout = await stripe.payouts.create({
  recipient: globalPaymentAccount.stripe_recipient_id,  // ❌ WRONG
  ...
});

// NEW CODE (WORKS)
const transfer = await stripe.transfers.create({
  destination: globalPaymentAccount.stripe_recipient_id,  // ✅ CORRECT
  ...
});
```

**Lines 237-254:** Updated database records to track which API was used:
```typescript
metadata: {
  api_used: 'transfers.create',  // Track for future debugging
  transfer_type: 'stripe_connect_transfer',
  ...
}
```

**Lines 321-375:** Updated production notes with transfer-specific guidance

---

## 💰 HOW IT WORKS NOW

1. **Platform → Artist Stripe Balance** (instant)
   - We call `stripe.transfers.create()`
   - Money moves from our platform balance to artist's Stripe balance
   - This happens instantly

2. **Artist Stripe Balance → Their Bank** (artist controls)
   - Artist logs into their Stripe dashboard
   - They choose when to withdraw
   - Stripe handles local payment methods:
     - Thailand: Bank transfer, PromptPay
     - Philippines: Bank transfer, InstaPay
     - US/Canada: ACH, wire transfer
     - Etc.

**We only handle step 1. Stripe handles step 2 automatically.**

---

## 🌍 CURRENCY NOTES

**IMPORTANT:** Currency is based on **EVENT LOCATION**, not artist country!

- Thai artist selling in Canada event → Gets paid in CAD
- Canadian artist selling in Thailand event → Gets paid in THB
- Artist's Stripe account must support the transfer currency
- See: `/root/vote_app/vote26/migrations/20251002_fix_ready_to_pay_currency_by_event.sql`

---

## 🔄 BACKWARD COMPATIBILITY

### Database Column Names
- Still using `stripe_payout_id` column name (no schema change needed)
- Old records have `po_xxx` IDs (payout IDs from old API)
- New records have `tr_xxx` IDs (transfer IDs from new API)

### How to Tell Which API Was Used
Check the `metadata` field in `global_payment_requests` table:
```json
{
  "api_used": "transfers.create",  // New system
  "transfer_type": "stripe_connect_transfer"
}
```

Old records won't have this field (or will have different values).

---

## 🚀 DEPLOYMENT

```bash
cd /root/vote_app/vote26
supabase functions deploy stripe-global-payments-payout
```

**Deployed:** 2025-10-02

---

## 🧪 TESTING

### How to Test Thailand Payment:
1. Go to Admin Payments interface
2. Find artist with country = 'TH' and status = 'ready'
3. Click "Process Payment" with THB amount
4. Should succeed with `tr_xxx` transfer ID
5. Check artist's Stripe dashboard to verify funds in balance

### Expected Success Response:
```json
{
  "success": true,
  "message": "Transfer sent successfully - funds available immediately in artist Stripe balance",
  "payout": {
    "stripe_transfer_id": "tr_1ABC123...",
    "transfer_type": "stripe_connect_transfer",
    "status": "sent"
  }
}
```

---

## 📚 RELATED FILES & SYSTEMS

### Onboarding Systems
- **OLD:** `/root/vote_app/vote26/supabase/functions/stripe-connect-onboard/index.ts`
  - Hardcoded to US accounts ❌
  - Should NOT be used for international artists

- **NEW:** `/root/vote_app/vote26/supabase/functions/stripe-global-payments-onboard/index.ts`
  - Uses artist's actual country ✅
  - Creates "custom" accounts that work with transfers.create()

### Database Functions
- `get_ready_to_pay_artists()` - Returns artists ready for payment
- `get_enhanced_admin_artists_owed()` - Shows artists owed money with currency info

### Frontend
- `/root/vote_app/vote26/art-battle-admin/src/components/PaymentsAdminTabbed.jsx`
- Displays payment info with proper currency formatting

---

## ⚠️ IMPORTANT WARNINGS

1. **INSTANT PAYOUTS ARE DISABLED (2025-10-02)**
   - The `process-instant-payout` function is disabled
   - Instant payouts only work with express/full accounts, not custom accounts
   - This was causing Thailand and other international artist errors
   - Use regular transfers (`process-pending-payments`) instead
   - Regular transfers work with ALL countries

2. **Never use the old `stripe-connect-onboard` function for international artists**
   - It hardcodes country to 'US'
   - Will create accounts that don't work with transfers

3. **Always use `stripe-global-payments-onboard` for new artist onboarding**
   - Uses artist's real country
   - Creates proper "custom" accounts

4. **Platform must maintain Stripe balance**
   - Transfers require prefunded platform balance
   - Monitor balance and top up as needed
   - Set up alerts for low balance

---

## 🐛 TROUBLESHOOTING

### "Instant Payouts are currently disabled" error
- **This is expected!** Instant payouts have been disabled (2025-10-02)
- Instant payouts don't work with custom accounts (international artists)
- **Solution:** Use the "Process Payment" button instead
- Regular transfers work with all countries and are instant to artist Stripe balance

### "Insufficient funds" error
- Platform Stripe balance is too low
- Add funds to platform account
- Try transfer again

### "Account not ready" error
- Artist hasn't completed Stripe onboarding
- Send them onboarding link again
- Check `artist_global_payments.status` = 'ready'

### "Invalid currency" error
- Make sure artist's account country supports the currency
- Thai accounts support THB
- Check Stripe docs for currency support by country

### "Funds can't be sent to accounts located in TH" error (SHOULD BE FIXED)
- If you still see this, check which function is being called
- Should be using `process-pending-payments` (regular transfers)
- Should NOT be using instant payouts or old payout API
- Check `stripe_api_conversations` table to see API endpoint used

---

## 📞 SUPPORT RESOURCES

- **Stripe Transfers API Docs:** https://stripe.com/docs/connect/charges-transfers
- **Custom Accounts:** https://stripe.com/docs/connect/custom-accounts
- **Country Support:** https://stripe.com/docs/connect/accounts#country-support

---

## 👤 CHANGE AUTHOR

**Date:** 2025-10-02
**Developer:** Claude Code
**Ticket/Issue:** Thailand artist payment failure
**Deployed:** Yes - production ready
