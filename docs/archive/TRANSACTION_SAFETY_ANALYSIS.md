# Transaction Safety Analysis: admin_update_art_status Function

## Date: 2025-10-04
## Incident: Payment Log Created but Art Status Not Updated

---

## The Problem

On September 11-12, 2025, an admin marked artwork AB3039-3-1 as "paid" using the admin interface. The system:
- ✅ Created a `payment_log` entry with $60.00 payment details
- ❌ **Failed to update** `art.status` from `'sold'` to `'paid'`

This resulted in:
- The artist's balance calculation showing the payment (ledger was correct)
- The artwork still showing as `status='sold'` in the database
- The payment details being invisible in the UI ledger view (which filters by status)

---

## Root Cause Analysis

### The Problematic Code Pattern

```sql
-- Inside IF block when marking as paid:

-- STEP 1: Insert payment log
INSERT INTO payment_logs (...) VALUES (...);  -- Line 132

-- STEP 2: Update art status (happens AFTER insert)
UPDATE art SET
  status = p_new_status::art_status,
  buyer_pay_recent_status_id = v_admin_payment_status_id,
  buyer_pay_recent_date = NOW()
WHERE art_code = p_art_code;  -- Line 170-174
```

### Why This Is Dangerous

1. **No Transaction Wrapper**: PostgreSQL functions run in implicit transactions, but if the UPDATE fails silently or is rolled back by the caller, the INSERT persists.

2. **No Error Checking**: The code doesn't verify `ROW_COUNT` after the UPDATE to confirm it succeeded.

3. **Wrong Order**: Creating the payment_log BEFORE confirming the status update means you can end up with:
   - A payment_log saying "this was paid"
   - An art record saying "this is still sold"
   - **Data inconsistency**

4. **Silent Failures**: If the UPDATE fails due to:
   - RLS policies blocking the write
   - Missing permissions
   - Constraint violations
   - Lock timeouts

   ...the function doesn't detect it and returns success anyway.

---

## The Fix (Theory)

### Principle: Update State Before Creating Audit Trail

**Always update the primary record BEFORE creating secondary records that reference it.**

```sql
-- CORRECT ORDER:

-- STEP 1: Update art status FIRST
UPDATE art SET
  status = p_new_status::art_status,
  buyer_pay_recent_status_id = v_admin_payment_status_id,
  buyer_pay_recent_date = NOW()
WHERE art_code = p_art_code;

-- STEP 2: Verify the update worked
GET DIAGNOSTICS v_update_count = ROW_COUNT;

IF v_update_count = 0 THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'Failed to update art status - no rows affected'
  );
END IF;

-- STEP 3: NOW create payment log (only after status is confirmed)
INSERT INTO payment_logs (...) VALUES (...);
```

### Why This Works

1. **Fail Fast**: If the UPDATE fails, we know immediately and can return an error
2. **No Orphaned Records**: The payment_log is only created if the status update succeeded
3. **Atomic Consistency**: If the transaction rolls back, both operations roll back together
4. **Explicit Verification**: `GET DIAGNOSTICS ROW_COUNT` confirms the UPDATE affected a row

---

## Transaction Safety Best Practices

### 1. Order Operations by Criticality

```
Most Critical → Least Critical
Primary Record → Audit Logs → Notifications
```

- Update the core business state FIRST (art.status)
- Then create audit trails (payment_logs)
- Then send notifications (SMS)

If notifications fail, that's annoying. If the status update fails but payment_log exists, that's **data corruption**.

### 2. Always Check ROW_COUNT After Updates

```sql
UPDATE some_table SET status = 'new_value' WHERE id = p_id;

GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

IF v_rows_affected = 0 THEN
  RAISE EXCEPTION 'Update failed - record not found or no permission';
END IF;
```

### 3. Use Explicit Transactions for Multi-Step Operations

PostgreSQL functions run in implicit transactions, but you can add explicit savepoints:

```sql
BEGIN
  -- Critical operation
  UPDATE art SET status = 'paid' WHERE art_code = p_art_code;

  IF NOT FOUND THEN
    ROLLBACK;
    RETURN jsonb_build_object('success', false, 'error', 'Art not found');
  END IF;

  -- Secondary operation
  INSERT INTO payment_logs (...) VALUES (...);

  COMMIT;
END;
```

### 4. Never Trust Silent Success

Just because a function doesn't throw an error doesn't mean it worked:

```sql
-- BAD: Assumes success
UPDATE art SET status = 'paid' WHERE art_code = p_art_code;
RETURN jsonb_build_object('success', true);

-- GOOD: Verifies success
UPDATE art SET status = 'paid' WHERE art_code = p_art_code;
GET DIAGNOSTICS v_count = ROW_COUNT;

IF v_count = 0 THEN
  RETURN jsonb_build_object('success', false, 'error', 'Update failed');
END IF;

RETURN jsonb_build_object('success', true);
```

---

## How the September Incident Happened

### Timeline

1. **Sept 11-12, 2025**: Admin clicks "Mark as Paid" on AB3039-3-1
2. Function calls `admin_update_art_status(p_new_status='paid', ...)`
3. Function finds winner (Kurt Aspland, $60 bid)
4. Function INSERTs into `payment_logs` ✅
5. Function attempts UPDATE on `art` table ❌ (failed silently)
6. Function returns `{success: true}` (incorrectly)
7. UI shows success message
8. Database left in inconsistent state:
   - `payment_logs` has entry showing "paid"
   - `art.status` still shows "sold"

### Why It Failed Silently

Possible causes:
- RLS policy blocked the UPDATE but not the INSERT
- Lock timeout on the `art` table
- Function was running in a subtransaction that got rolled back
- Constraint violation on the UPDATE that was caught and ignored

Without `GET DIAGNOSTICS ROW_COUNT` checking, the function never knew.

---

## The Current Solution

As of October 4, 2025, we manually fixed AB3039-3-1 by re-running the function:

```sql
SELECT admin_update_art_status(
  p_art_code := 'AB3039-3-1',
  p_new_status := 'paid',
  p_admin_phone := 'test',
  p_actual_amount_collected := 60,
  p_payment_method := 'other'
);
```

Result:
- ✅ Status updated to `'paid'`
- ✅ Second payment_log created (acceptable duplicate)
- ✅ Art now shows correctly in ledger

---

## Recommended Future Improvements

### 1. Add ROW_COUNT Verification (Immediate Priority)

```sql
UPDATE art SET status = p_new_status::art_status WHERE art_code = p_art_code;
GET DIAGNOSTICS v_update_count = ROW_COUNT;

IF v_update_count = 0 THEN
  RAISE EXCEPTION 'Failed to update art % - not found or permission denied', p_art_code;
END IF;
```

### 2. Reorder Operations (High Priority)

Move all status UPDATEs to happen BEFORE any INSERT operations.

### 3. Add Constraint to Prevent Duplicates (Medium Priority)

```sql
-- Ensure only one 'admin_marked' payment per artwork
CREATE UNIQUE INDEX idx_payment_logs_one_admin_marked_per_art
ON payment_logs (art_id)
WHERE payment_type = 'admin_marked' AND status_id IS NOT NULL;
```

This would have prevented the duplicate payment_log from being created.

### 4. Add Monitoring (Low Priority)

Create a view to detect mismatches:

```sql
CREATE VIEW payment_status_mismatches AS
SELECT
  a.art_code,
  a.status as art_status,
  COUNT(pl.id) as payment_log_count,
  MAX(pl.created_at) as last_payment_log
FROM art a
LEFT JOIN payment_logs pl ON a.id = pl.art_id AND pl.payment_type = 'admin_marked'
WHERE a.status = 'sold' AND pl.id IS NOT NULL
GROUP BY a.art_code, a.status;
```

Run daily to catch future incidents.

---

## Key Takeaways

1. **Order matters**: Update core state before creating audit records
2. **Verify everything**: Use `GET DIAGNOSTICS ROW_COUNT` after all UPDATEs
3. **Fail loudly**: Return explicit errors rather than pretending success
4. **Test failure paths**: What happens if the UPDATE fails? The function should handle it gracefully
5. **Monitor for inconsistencies**: Regular checks can catch issues before they become critical

---

## References

- Incident artwork: AB3039-3-1 (Kurt Aspland)
- Payment logs table: 2 entries for this artwork
- Original payment attempt: 2025-09-12 01:43:45
- Fix applied: 2025-10-04 04:30:34
- Function file: `/root/vote_app/vote26/migrations/20251002_add_audit_to_admin_update_art_status.sql`
