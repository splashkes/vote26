# Manual Payment System - Admin Guide

**Last Updated:** October 3, 2025
**System Status:** Production
**Database:** `artist_manual_payment_requests` table

---

## Overview

The Manual Payment System allows artists to request manual payment (via PayPal, Zelle, Interac, IBAN, etc.) when they have outstanding balances from art sales. This is a fallback system for artists who:
- Don't want to use Stripe automated payments
- Are waiting 14+ days after an event
- Have been given admin override for immediate manual payment access

---

## Database Schema

### Table: `artist_manual_payment_requests`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `artist_profile_id` | UUID | Foreign key to `artist_profiles` table |
| `person_id` | UUID | Foreign key to `people` table |
| `payment_method` | VARCHAR | Method name (e.g., "PayPal", "Zelle", "Interac") |
| `payment_details` | TEXT | Artist-provided banking/payment info (sensitive data) |
| `country_code` | VARCHAR | Artist's country code |
| `preferred_currency` | VARCHAR | Preferred payment currency |
| `status` | VARCHAR | Request status (default: 'pending') |
| `admin_notes` | TEXT | Admin notes for processing |
| `processed_by` | UUID | Admin person_id who processed the request |
| `processed_at` | TIMESTAMPTZ | When request was processed |
| `requested_amount` | NUMERIC | Amount requested by artist |
| `events_referenced` | TEXT[] | Array of event EIDs (e.g., ["AB2232", "AB2949"]) |
| `created_at` | TIMESTAMPTZ | Request submission timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### Table: `artist_profiles` (Manual Payment Columns)

| Column | Type | Description |
|--------|------|-------------|
| `manual_payment_override` | BOOLEAN | Admin override flag to bypass 14-day wait |
| `manual_payment_override_at` | TIMESTAMPTZ | When override was enabled |
| `manual_payment_override_by` | UUID | Admin person_id who enabled override |

**Note:** The FK constraint `artist_profiles_manual_payment_override_by_fkey` was **removed** to prevent query ambiguity issues.

---

## Eligibility Rules

Artists can submit manual payment requests when:

1. **Balance > 0** - They have outstanding earnings from art sales
2. **AND one of:**
   - **14-day rule:** Events are 14+ days old
   - **Admin override:** `manual_payment_override = TRUE` on their artist_profile

### How Eligibility is Determined

**Server-side calculation** in `artist-get-notes` edge function:
```typescript
// Check balance
const balance = totalEarned - totalPaid;

// Check for old events (14+ days)
const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
const oldEvents = events?.filter(e => {
  const eventDate = new Date(e.event_start_datetime);
  return eventDate < fourteenDaysAgo;
}) || [];

// Show manual payment if old events exist OR admin override enabled
if (oldEvents.length > 0 || hasAdminOverride) {
  // Display manual payment request form
}
```

---

## Artist Experience Flow

### 1. Artist sees Manual Payment Request form
- Shown on Home page when eligible
- Contains country-specific instructions:
  - **US:** PayPal or Zelle
  - **Canada:** Interac e-Transfer
  - **EU/UK:** IBAN/SWIFT
  - **AU/NZ:** Bank Transfer, PayPal, or other
  - **Other countries:** Various methods

### 2. Artist submits payment details
- Artist provides:
  - Payment method preference
  - Banking details (email, account numbers, IBAN, etc.)
  - Confirms events and amount
- **Status:** Request created with `status = 'pending'`

### 3. Stripe setup is blocked
- Once manual payment request is pending:
  - All Stripe onboarding buttons hidden
  - Amber callout shown: "Stripe setup is disabled while you have a pending manual payment request"
- This prevents confusion and double-processing

### 4. Admin processes payment (manual workflow)
- Admin receives Slack notification (#payments channel)
- Admin reviews request in admin system
- Admin processes payment externally (via PayPal, bank transfer, etc.)
- Admin updates status to `processed` or `completed`

---

## Slack Notifications

### Trigger
**Database trigger:** `trigger_manual_payment_request_slack`
**Function:** `notify_manual_payment_request_slack()`
**Channel:** `#payments`

### Notification Format
```
💰 Manual Payment Request

Artist: [Name]
Amount: $XX.XX USD
Phone: +1234567890
Email: artist@example.com

Events: AB2232, AB2949
Status: pending

Payment Details:
```
[Artist's banking information - first 500 chars]
```

Submitted: 2025-10-03 12:34 | Request ID: 1e73ad1b
```

### Rich Slack Blocks
The notification uses Slack's Block Kit for formatted display with:
- Header
- Field sections (2-column layout)
- Code block for payment details
- Context footer with timestamp and ID

---

## Admin Tasks

### Viewing Pending Requests

**SQL Query:**
```sql
SELECT
    r.id,
    r.created_at,
    ap.name as artist_name,
    p.phone,
    p.email,
    r.requested_amount,
    r.preferred_currency,
    r.events_referenced,
    r.payment_details,
    r.status
FROM artist_manual_payment_requests r
JOIN artist_profiles ap ON r.artist_profile_id = ap.id
JOIN people p ON r.person_id = p.id
WHERE r.status = 'pending'
ORDER BY r.created_at DESC;
```

### Processing a Request

1. **Verify the request** - Check balance, events, artist identity
2. **Process payment externally** - Use PayPal, Zelle, bank transfer, etc.
3. **Update the database:**

```sql
UPDATE artist_manual_payment_requests
SET
    status = 'completed',
    processed_by = '[ADMIN_PERSON_ID]',
    processed_at = NOW(),
    admin_notes = 'Paid via PayPal on [date]'
WHERE id = '[REQUEST_ID]';
```

4. **Record the payment** in `artist_payments` table (for ledger tracking)

### Admin Override (Bypass 14-day Rule)

To enable immediate manual payment access for an artist:

```sql
UPDATE artist_profiles
SET
    manual_payment_override = TRUE,
    manual_payment_override_at = NOW(),
    manual_payment_override_by = '[ADMIN_PERSON_ID]'
WHERE id = '[ARTIST_PROFILE_ID]';
```

**Effect:** Artist can immediately submit manual payment request, even if events are recent.

**Use cases:**
- Special circumstances (artist needs urgent payment)
- Event exceptions
- Testing

---

## Status Values

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `pending` | Request submitted, awaiting admin processing | Admin should process payment |
| `processing` | Admin is working on payment | Payment in progress |
| `completed` | Payment processed successfully | None - request closed |
| `failed` | Payment attempt failed | Admin should retry or contact artist |
| `cancelled` | Request cancelled by artist or admin | None - request closed |

---

## Country-Specific Payment Methods

The system provides localized instructions based on artist's country:

| Country/Region | Payment Methods | Details Required |
|----------------|-----------------|------------------|
| **US** | PayPal, Zelle | Email or phone for Zelle, PayPal email |
| **Canada** | Interac e-Transfer | Email or phone registered with bank |
| **EU/UK** | IBAN/SWIFT | Full name, IBAN, BIC/SWIFT, bank name/address |
| **AU/NZ** | Bank Transfer, PayPal | BSB, account number, OR PayPal email |
| **Other** | Various | Artist specifies preferred method |

---

## Integration Points

### Edge Functions
- **`artist-get-notes`** - Returns manual payment eligibility and form data
- **`artist-get-my-profile`** - Returns artist profile with override status

### React Components
- **`ServerNotes.jsx`** - Displays notes from server
- **`ManualPaymentRequest.jsx`** - Manual payment request form UI
- **`PaymentStatusBanner.jsx`** - Blocks Stripe setup when manual request pending

### Database Tables
- **`artist_manual_payment_requests`** - Request records
- **`artist_profiles`** - Override flags
- **`artist_payments`** - Payment ledger (for recording completed payments)
- **`artist_note_dismissals`** - Track dismissed notification notes

---

## Security Considerations

### Sensitive Data
⚠️ **`payment_details` column contains sensitive banking information:**
- Bank account numbers
- IBAN numbers
- Email addresses
- Phone numbers
- Routing numbers

**Access Control:**
- Only admins with payment processing permissions should view this data
- Consider encryption at rest if not already implemented
- Implement audit logging for all access to `payment_details`
- Use RLS (Row Level Security) policies to restrict access

### Slack Notification Security
- Payment details are truncated to first 500 characters in Slack
- Ensure #payments channel has restricted membership
- Consider using private channels or DMs for sensitive requests

---

## Monitoring & Metrics

### Key Metrics to Track
1. **Request Volume** - Count of pending requests by status
2. **Processing Time** - Time from `created_at` to `processed_at`
3. **Amount Distribution** - Total amount by currency
4. **Method Breakdown** - Payment methods used
5. **Country Distribution** - Requests by country

### Query: Pending Requests Summary
```sql
SELECT
    COUNT(*) as pending_count,
    SUM(requested_amount) as total_amount,
    AVG(requested_amount) as avg_amount,
    MIN(created_at) as oldest_request
FROM artist_manual_payment_requests
WHERE status = 'pending';
```

---

## Common Admin Workflows

### 1. Daily Review
```sql
-- Get today's new requests
SELECT * FROM artist_manual_payment_requests
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
```

### 2. Process Batch Payments
```sql
-- Get all pending US requests for PayPal batch
SELECT
    ap.name,
    p.email,
    r.requested_amount,
    r.payment_details
FROM artist_manual_payment_requests r
JOIN artist_profiles ap ON r.artist_profile_id = ap.id
JOIN people p ON r.person_id = p.id
WHERE r.status = 'pending'
  AND r.country_code IN ('US', 'USA')
  AND r.payment_details ILIKE '%paypal%'
ORDER BY r.created_at;
```

### 3. Mark Multiple as Processed
```sql
UPDATE artist_manual_payment_requests
SET
    status = 'completed',
    processed_by = '[ADMIN_PERSON_ID]',
    processed_at = NOW(),
    admin_notes = 'Batch processed via PayPal on 2025-10-03'
WHERE id IN ('[ID1]', '[ID2]', '[ID3]');
```

---

## Troubleshooting

### Issue: Artist says they're eligible but form doesn't show

**Check:**
1. Does artist have balance > 0?
   ```sql
   SELECT * FROM artist_account_ledger
   WHERE artist_profile_id = '[ID]';
   ```

2. Are events 14+ days old OR is override enabled?
   ```sql
   SELECT manual_payment_override, manual_payment_override_at
   FROM artist_profiles
   WHERE id = '[ID]';
   ```

3. Has artist dismissed the note?
   ```sql
   SELECT * FROM artist_note_dismissals
   WHERE person_id = '[PERSON_ID]'
   AND note_id = 'manual-payment-eligible-2025-10';
   ```

### Issue: Stripe setup showing when manual request pending

**Check:**
```sql
SELECT * FROM artist_manual_payment_requests
WHERE artist_profile_id = '[ID]'
AND status = 'pending';
```

If request exists, this is a bug in `PaymentStatusBanner.jsx` - the `hasPendingManualRequest` check may not be working.

---

## Future Enhancements

### Potential Admin Features
1. **Admin Dashboard** - View all pending requests in table format
2. **Bulk Actions** - Process multiple requests at once
3. **Payment Templates** - Save common payment notes
4. **Status Updates** - Send artist notification when processed
5. **Payment History** - View all historical manual payments per artist
6. **Analytics** - Charts for request volume, processing time, etc.

### Automation Opportunities
1. **Auto-matching** - Match manual payment to ledger entries automatically
2. **Payment Status Sync** - Integrate with PayPal/Stripe APIs for status updates
3. **Reminder System** - Alert admins about old pending requests

---

## Contact & Support

**Questions about manual payment system:**
- Technical: Check `artist-get-notes` edge function code
- Database: Review migrations in `/migrations` folder
- UI: Review `ManualPaymentRequest.jsx` component

**Key Files:**
- `/supabase/functions/artist-get-notes/index.ts`
- `/art-battle-artists/src/components/ManualPaymentRequest.jsx`
- `/art-battle-artists/src/components/ServerNotes.jsx`
- `/art-battle-artists/src/components/PaymentStatusBanner.jsx`
- `/migrations/20251002_artist_manual_payment_requests.sql`
- `/migrations/20251002_manual_payment_slack_notification.sql`
- `/migrations/20251002_manual_payment_admin_override.sql`
