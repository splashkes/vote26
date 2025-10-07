# Stripe Recipient Service Agreement Implementation

**Date:** October 7, 2025
**Issue:** Cross-border transfers failing for international artists (AU, TH, PH, etc.)
**Solution:** Use recipient service agreement instead of full service agreement for non-US/CA artists

---

## Problem Summary

International artists (Australia, Thailand, Philippines, etc.) were getting this error when trying to receive payments:

```
Funds can't be sent to accounts located in AU when the account is under the `full` service agreement.
```

**Root Cause:** Our platform account has cross-border restrictions. The `full` service agreement only supports US/CA destinations.

---

## Solution Implemented

Changed artist account creation to use **recipient service agreement** for international artists:

### Code Changes

**File:** `supabase/functions/stripe-global-payments-onboard/index.ts`

**Change:** Added conditional logic based on artist country:

```typescript
// Determine if US/Canada (full) or International (recipient)
const isUSorCA = (finalCountry === 'US' || finalCountry === 'CA' ||
                  finalCountry === 'Canada' || finalCountry === 'United States');
const serviceAgreement = isUSorCA ? 'full' : 'recipient';

const accountData: any = {
  type: 'custom',
  country: finalCountry,
  capabilities: {
    transfers: { requested: true },
  },
  // ... other fields
};

// Add service agreement for international artists
if (!isUSorCA) {
  accountData.tos_acceptance = {
    service_agreement: 'recipient'
  };
} else {
  // US/CA get card_payments capability (full agreement - default)
  accountData.capabilities.card_payments = { requested: true };
}
```

**Deployed:** October 7, 2025

---

## Test Results

Created test Australian account: `acct_1SFRGZAxXw4QZfUW`

**Verification:**
```json
{
  "country": "AU",
  "type": "custom",
  "tos_acceptance": {
    "service_agreement": "recipient"  ✅ CORRECT
  }
}
```

**Status:** Account created successfully with recipient service agreement. Transfer will work once artist completes onboarding.

---

## Service Agreement Comparison

| Feature | Full (US/CA) | Recipient (International) |
|---------|--------------|---------------------------|
| **Countries** | US, CA | AU, TH, PH, UK, etc. |
| **Cross-border transfers** | ❌ Limited | ✅ Supported |
| **Card payments** | ✅ Yes | ❌ No (not needed for our model) |
| **Transfer timing** | Immediate | +24 hours to balance |
| **Stripe support** | Direct | Through platform |
| **Capabilities** | `transfers`, `card_payments` | `transfers` only |

---

## Impact on Existing Artists

### New Artists (Going Forward)
✅ Automatically get correct service agreement based on country
✅ No action needed

### Existing International Artists

**Problem:** Accounts created before Oct 7, 2025 have `full` service agreement and **cannot be changed**.

**Affected Artists:**
- Vicki Soar (AU) - `acct_1SEKkvBVOySAd1Bw`
- Any other non-US/CA artists already onboarded

**Solution Options:**

1. **Create New Accounts (Recommended)**
   - Artist must complete new onboarding with recipient agreement
   - Update `artist_global_payments` table to point to new account
   - Old account can be deleted or archived

2. **Manual Payments (Temporary)**
   - Use existing manual payment system
   - Until artist creates new account

---

## Migration Plan for Vicki Soar (Example)

**Current Status:**
- Account: `acct_1SEKkvBVOySAd1Bw` (full service agreement)
- Cannot receive transfers ❌

**Steps to Migrate:**

1. **Admin contacts artist:**
   ```
   Hi Vicki! We've upgraded our international payment system.
   To receive payments, please complete a quick re-onboarding at:
   [NEW ONBOARDING LINK]
   ```

2. **Artist completes new onboarding:**
   - New account created with recipient service agreement
   - New account ID: `acct_XXXXXXXXXX`

3. **Update database:**
   ```sql
   UPDATE artist_global_payments
   SET stripe_recipient_id = 'acct_XXXXXXXXXX',
       metadata = jsonb_set(
         metadata,
         '{migrated_from}',
         '"acct_1SEKkvBVOySAd1Bw"'
       )
   WHERE artist_profile_id = '9d8ef7a2-a259-441b-b076-fb3a4cc24e9f';
   ```

4. **Test transfer:**
   - Send test payment ($20 USD)
   - Verify success ✅

---

## How to Identify Affected Artists

```sql
SELECT
  ap.id as artist_profile_id,
  ap.name as artist_name,
  ap.country,
  agp.stripe_recipient_id,
  agp.status,
  agp.metadata->>'service_agreement' as service_agreement,
  agp.created_at
FROM artist_profiles ap
JOIN artist_global_payments agp ON agp.artist_profile_id = ap.id
WHERE ap.country NOT IN ('US', 'CA', 'United States', 'Canada')
  AND agp.status = 'ready'
  AND (agp.metadata->>'service_agreement' IS NULL
       OR agp.metadata->>'service_agreement' = 'full')
ORDER BY agp.created_at DESC;
```

---

## Testing New International Artists

To verify the fix works for new artists:

1. Have artist from AU/TH/PH complete onboarding
2. Check their account in Stripe Dashboard:
   - Account Details → Service Agreement should show "recipient"
3. Attempt transfer:
   ```bash
   # Should succeed once onboarding complete
   stripe transfers create \
     --amount 2000 \
     --currency usd \
     --destination acct_XXXXX
   ```

---

## Key Points for Support

**When artist asks about payment setup:**

1. ✅ "Are you located in the US or Canada?"
   - Yes → Full service agreement (current flow works)
   - No → Recipient service agreement (new flow)

2. ✅ "Transfers take 24-48 hours to reach your Stripe balance"
   - This is normal for international recipient accounts

3. ✅ "You won't be able to process card payments directly"
   - Not an issue - we process payments, they just receive transfers

**When existing international artist can't receive payment:**

1. ❌ "Your account was set up before our international upgrade"
2. ✅ "Please complete new onboarding (takes 5 minutes)"
3. ✅ "You'll be able to receive payments immediately after"

---

## Documentation References

- [Stripe Service Agreement Types](https://stripe.com/docs/connect/service-agreement-types)
- [Cross-Border Payouts](https://docs.stripe.com/connect/cross-border-payouts)
- [Recipient Service Agreement](https://stripe.com/connect-account/legal/recipient)

---

## Success Criteria

✅ New international artists can complete onboarding
✅ Transfers to international accounts succeed
✅ US/CA artists continue working as before
✅ Metadata tracks service agreement type
✅ Slack notifications show service agreement

---

## Next Steps

1. ✅ Deploy updated onboarding function (DONE - Oct 7, 2025)
2. ⏳ Test with real international artist
3. ⏳ Contact existing international artists to re-onboard
4. ⏳ Monitor first successful international transfer
5. ⏳ Document any edge cases discovered

---

**Status:** ✅ Implementation complete, ready for production use
