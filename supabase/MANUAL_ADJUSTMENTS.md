# Manual Artist Account Adjustments

This document describes how to add manual credits or debits to artist accounts for special circumstances.

## Overview

The system now supports manual adjustments to artist balances through the `admin-add-manual-adjustment` edge function. These adjustments appear in the artist's ledger and affect their balance calculations.

## Key Concepts

### Credit vs Debit

- **CREDIT**: Money **owed TO** the artist (increases their balance)
  - Examples: Prize winnings, private event payments, supplies reimbursement
  - Stored as **negative amounts** in the database

- **DEBIT**: Money **paid OUT to** the artist (decreases their balance)
  - Examples: Manual payments via check, cash, etc.
  - Stored as **positive amounts** in the database

## Reason Categories

When creating a manual adjustment, you must specify a reason category:

- `prize` - Prize winnings from competitions
- `private_event` - Private event compensation
- `supplies_reimbursement` - Reimbursement for art supplies
- `adjustment` - General balance adjustment/correction
- `other` - Other reasons not covered above

## Usage

### Edge Function: `admin-add-manual-adjustment`

**Endpoint**: `/functions/v1/admin-add-manual-adjustment`

**Authentication**: Requires ABHQ admin access

**Request Body**:
```json
{
  "artist_profile_id": "uuid",
  "amount": 100.00,
  "adjustment_type": "credit",
  "currency": "USD",
  "reason_category": "prize",
  "description": "First place prize - Toronto event",
  "reference": "PRIZE-2024-001",
  "payment_method": "manual_adjustment"
}
```

**Parameters**:
- `artist_profile_id` (required): UUID of the artist profile
- `amount` (required): Positive number representing the adjustment amount
- `adjustment_type` (required): Either `"credit"` or `"debit"`
- `currency` (optional): Currency code, defaults to `"USD"`
- `reason_category` (required): One of: `prize`, `private_event`, `supplies_reimbursement`, `adjustment`, `other`
- `description` (required): Description of the adjustment
- `reference` (optional): Reference number or identifier
- `payment_method` (optional): Payment method, defaults to `"manual_adjustment"`

**Response**:
```json
{
  "success": true,
  "adjustment": {
    "id": "uuid",
    "artist_profile_id": "uuid",
    "artist_name": "Artist Name",
    "adjustment_type": "credit",
    "amount": 100.00,
    "stored_amount": -100.00,
    "currency": "USD",
    "reason_category": "prize",
    "description": "First place prize - Toronto event",
    "reference": "PRIZE-2024-001",
    "created_by": "admin@example.com",
    "created_at": "2025-10-07T...",
    "status": "paid"
  },
  "current_balance": 150.00,
  "message": "Manual credit of USD 100 created successfully for Artist Name"
}
```

## Examples

### Example 1: Add Prize Credit

```bash
curl -X POST https://your-project.supabase.co/functions/v1/admin-add-manual-adjustment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "artist_profile_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 500.00,
    "adjustment_type": "credit",
    "currency": "USD",
    "reason_category": "prize",
    "description": "First place prize - Art Battle Toronto Finals",
    "reference": "PRIZE-TOR-2025-01"
  }'
```

### Example 2: Add Supplies Reimbursement

```bash
curl -X POST https://your-project.supabase.co/functions/v1/admin-add-manual-adjustment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "artist_profile_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 75.50,
    "adjustment_type": "credit",
    "currency": "CAD",
    "reason_category": "supplies_reimbursement",
    "description": "Canvas and paint reimbursement for damaged supplies",
    "reference": "REIMB-2025-042"
  }'
```

### Example 3: Manual Debit (Payment Made)

```bash
curl -X POST https://your-project.supabase.co/functions/v1/admin-add-manual-adjustment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "artist_profile_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 200.00,
    "adjustment_type": "debit",
    "currency": "USD",
    "reason_category": "other",
    "description": "Manual payment via check",
    "payment_method": "check",
    "reference": "CHK-2025-1042"
  }'
```

## Database Schema

### Table: `artist_payments`

Manual adjustments are stored in the `artist_payments` table with:
- `payment_type = 'manual'`
- `gross_amount` and `net_amount` are **negative for credits**, **positive for debits**
- `reason_category` indicates the reason for the adjustment
- `status = 'paid'` (manual adjustments are immediately effective)

### View: `artist_manual_adjustments`

A convenience view that shows manual adjustments with the adjustment type clearly labeled:

```sql
SELECT * FROM artist_manual_adjustments
WHERE artist_profile_id = 'artist_uuid'
ORDER BY created_at DESC;
```

## Ledger Display

Manual adjustments appear in the artist's ledger (via `artist-account-ledger` function):

- **Manual Credits** appear as:
  - Type: `credit`
  - Category: `Manual Credit`
  - Description: `{reason_category}: {description} (by {admin_email}) - Ref: {reference}`

- **Manual Debits** appear as:
  - Type: `debit`
  - Category: `Manual Payment`
  - Description: `{reason_category}: {description} (by {admin_email}) - Ref: {reference}`

## Balance Calculation

The `get_artists_owed()` function automatically accounts for manual adjustments:
- Manual credits (negative amounts) **increase** the balance owed to the artist
- Manual debits (positive amounts) **decrease** the balance owed to the artist

## Migration

The manual credits feature was added in migration:
- `20251007_add_manual_credits_support.sql`

This migration:
- Adds `reason_category` field
- Updates constraints to allow the new categories
- Creates the `artist_manual_adjustments` view
- Updates documentation comments

## Security

- Only ABHQ admins can create manual adjustments
- All adjustments are logged with the admin's email (`created_by`)
- Adjustments cannot be deleted, only cancelled (set status to `'cancelled'`)
- All actions are auditable through the `created_by` and `created_at` fields

## Best Practices

1. **Always provide a clear description** explaining why the adjustment is being made
2. **Use reference numbers** for tracking and auditing
3. **Choose the correct reason category** to help with reporting
4. **Double-check the adjustment type** - credit increases balance, debit decreases it
5. **Verify the amount** before submitting - manual adjustments should be carefully reviewed
6. **Document external payments** - if paying via check/cash, note the check number or receipt

## Troubleshooting

### Error: "Access denied. ABHQ admin access required"
- You must be logged in as an ABHQ admin to create manual adjustments

### Error: "Invalid reason_category"
- Use one of: `prize`, `private_event`, `supplies_reimbursement`, `adjustment`, `other`

### Error: "adjustment_type must be either 'credit' or 'debit'"
- Check the spelling and case of the adjustment_type parameter

### Adjustment not appearing in balance
- Check that the status is `'paid'` not `'cancelled'`
- Verify the artist_profile_id is correct
- Check the currency matches what you're expecting
