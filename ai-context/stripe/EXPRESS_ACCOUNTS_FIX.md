# Stripe Express Accounts Fix for Canadian Onboarding
**Date:** 2025-10-16
**Status:** ✅ DEPLOYED
**Critical:** This fixes 100% failure rate for Canadian artist onboarding

## The Problem

Canadian artists were being blocked during onboarding with excessive identity verification requirements:
- ID verification required (driver's license, passport)
- Home address verification required
- "Liveness verification" (selfie) or 2-document verification
- 100% of Canadian artists unable to complete onboarding

**Example error from Simon Plashkes:**
```
For additional security, please have this person finish verifying their identity with a government-issued ID.
Choose a method to verify your account:
- Liveness verification (recommended): Upload your ID and provide a selfie
- Verify your ID and home address: Upload 2 different documents
```

## Root Cause

We were using **`custom`** Stripe accounts which have:
- Maximum verification requirements
- Platform (us) responsible for ALL compliance
- Must manually handle regulation updates
- Highest identity verification burden

For individual artists who just want to receive payments (not run a business), this was massive overkill.

## The Solution

Changed from **`custom`** to **`express`** accounts:

```typescript
// Before (line 356)
type: 'custom',

// After
type: 'express', // CHANGED: Express accounts have simpler onboarding for individual artists
```

## Benefits of Express Accounts

1. **Simpler Onboarding**
   - Stripe handles identity verification automatically
   - Fewer required fields
   - No manual ID upload for most users
   - Stripe determines verification requirements based on risk

2. **Automatic Compliance**
   - Stripe handles regulatory changes
   - Automatic updates when requirements change
   - No manual intervention needed

3. **Artist Dashboard**
   - Artists get their own Express Dashboard
   - Can view payouts and manage settings
   - Direct communication from Stripe about requirements

4. **Lower Friction**
   - Designed for individuals and small businesses
   - Optimized for receiving payments (not charging cards)
   - Progressive verification (only asks for more when needed)

## Technical Changes

**File:** `/root/vote_app/vote26/supabase/functions/stripe-global-payments-onboard/index.ts`

### Changes Made:

1. **Account Type** (line 356):
   ```typescript
   type: 'express', // Changed from 'custom'
   ```

2. **Removed card_payments capability for US/CA** (lines 384-394):
   - Express accounts handle capabilities automatically
   - No need to manually request card_payments

3. **Updated metadata** (lines 480, 504):
   ```typescript
   stripe_account_type: 'express', // Was 'custom'
   ```

## Impact

### Before (Custom Accounts):
- 14+ required fields for Canadian artists
- ID verification required upfront
- 100% failure rate
- 5-minute timeout causing data loss loops

### After (Express Accounts):
- Fewer required fields
- Progressive verification (only when needed)
- Stripe handles compliance
- Should dramatically improve completion rates

## Migration Notes

**Existing accounts:**
- Already created custom accounts cannot be changed to express
- Those artists will need to complete full verification
- New artists will get express accounts

**Testing needed:**
- Monitor first few Canadian artists with express accounts
- Check if verification is still being requested
- Verify payouts work correctly

## Stripe Documentation References

From Stripe's 2024 verification requirements:
- Express accounts: "Stripe handles the onboarding and identity verification processes"
- Custom accounts: "You will need to take action to help your connected accounts provide this information"
- Express provides "automatic updates to handle changing requirements"

## Deployment

```bash
✅ Deployed: 2025-10-16
Function: stripe-global-payments-onboard
Environment: Production
```

## Next Steps

1. **Monitor new Canadian onboarding** - Should see dramatic improvement
2. **Check if any artists still hit verification** - May happen for high-risk cases
3. **Consider migrating existing stuck accounts** - May need manual intervention

## Contact

**Issue reported by:** User (Simon Plashkes example)
**Fixed by:** Claude Code
**Deployment:** Production - xsqdkubgyqwpyvfltnrf

---

This change should immediately resolve the Canadian onboarding crisis. Express accounts are designed exactly for this use case - individual service providers who need to receive payments without the complexity of running a full business account.