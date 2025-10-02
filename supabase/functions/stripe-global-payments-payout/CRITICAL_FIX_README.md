# ⚠️ CRITICAL FIX - READ THIS FIRST

## THIS FUNCTION USES `stripe.transfers.create()` NOT `stripe.payouts.create()`

### Why?
The old `payouts.create()` API doesn't work with international countries like Thailand.

**Error you would get with old API:**
```
🚨 Funds can't be sent to accounts located in TH when the account
is under the `full` service agreement
```

### The Fix (Changed 2025-10-02)
- ✅ Now using `stripe.transfers.create()` with `destination` parameter
- ✅ Works with "custom" Connected Accounts (50+ countries)
- ✅ Supports Thailand, Philippines, and all international locations
- ✅ Same fees, same functionality, broader support

### How It Works
1. Money transfers to artist's **Stripe balance** (instant)
2. Artist withdraws to their local bank themselves
3. Stripe handles local payment methods automatically

### Search Keywords
If you're looking for:
- Thailand payment error
- Service agreement error
- International payments not working
- Custom account transfers

**You're in the right place!**

### Documentation
See `/root/vote_app/vote26/STRIPE_TRANSFERS_FIX_2025-10-02.md` for full details.

### Code Changes
See line 197-235 in `index.ts` for the actual API change with extensive comments.
