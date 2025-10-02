# Admin Function Audit Logging Priority List

Based on the Montreal auction incident, here are all admin functions categorized by audit priority.

## ✅ Already Implemented
- `manage_auction_timer` - Timer operations (start/extend/cancel/close_now)
- Trigger on `art` table - All art record changes
- Trigger on `events` table - All event config changes
- Trigger on `bids` table - All bid operations

---

## 🔴 CRITICAL PRIORITY (Implement Immediately)

These functions directly affect auction state, artwork status, and payments. Similar impact to the Montreal incident.

### Auction/Art Management
1. **`admin_update_art_status`** ⭐ MOST CRITICAL
   - Changes art status (active/sold/closed/paid/cancelled)
   - Sets closing times
   - Marks payments
   - **This likely caused the Montreal early closure**
   - Log: art_code, old_status, new_status, admin_phone, payment details

2. **`admin_actually_close_auction_items`**
   - Force closes auction items
   - Sets final status based on bids
   - Log: event_id, art_codes, old_statuses, new_statuses, admin triggering

3. **`clear_auction_closing_time`**
   - Clears auction timers (reopens auctions)
   - Critical for recovery from mistakes
   - Log: art_code, old_closing_time, admin who cleared it

4. **`close_auction_manually`**
   - Manual auction closure override
   - Log: art_code, admin_phone, reason

5. **`check_and_close_expired_auctions`**
   - Automated closure (cron job)
   - Log: artworks_closed, statuses_applied, system trigger

### Event Configuration
6. **`admin_toggle_event_applications`**
   - Opens/closes artist applications
   - Affects event participation
   - Log: event_id, old_value, new_value

7. **`admin_delete_event_safely`**
   - Deletes entire events
   - CRITICAL for data integrity
   - Log: event_id, event_name, all related data counts

### Payment Operations
8. **`mark_artwork_paid`**
   - Marks artwork as paid
   - Changes financial status
   - Log: art_code, person_id, amount, payment_method

9. **`complete_stripe_payment`**
   - Completes Stripe payment flow
   - Updates payment status
   - Log: art_id, person_id, amount, stripe_payment_id

10. **`toggle_payment_processing`**
    - Enables/disables payment system
    - System-wide control
    - Log: old_state, new_state, admin_id

---

## 🟠 HIGH PRIORITY (Implement Within 1 Week)

Functions that affect data integrity, user accounts, or system configuration.

### Artist/Profile Management
11. **`admin_insert_artist_profile`**
    - Creates new artist profiles
    - Log: artist data, admin_user_id

12. **`admin_update_artist_bio`**
    - Updates artist information
    - Log: artist_id, old_bio, new_bio

13. **`admin_update_artist_promo_image`**
    - Changes artist images
    - Log: artist_id, old_image_id, new_image_id

14. **`transfer_stripe_account`**
    - Transfers Stripe accounts between artists
    - Financial implications
    - Log: from_artist, to_artist, stripe_account_id

### User Account Management
15. **`merge_duplicate_people`**
    - Merges user accounts
    - Data loss risk
    - Log: source_person_id, target_person_id, records_moved

16. **`link_person_on_phone_verification`**
    - Links people to auth accounts
    - Security implications
    - Log: person_id, auth_user_id, phone

17. **`create_new_profile`**
    - Creates new user profiles
    - Log: person_id, phone, email

### Access Control
18. **`check_event_admin_permission`**
    - Validates admin permissions
    - Log: user_id, event_id, permission_type, granted/denied

19. **`is_super_admin`**
    - Checks super admin status
    - Log: user_id, result

20. **`block_ip_address`**
    - Blocks IP addresses
    - Security feature
    - Log: ip_address, reason, admin_id

---

## 🟡 MEDIUM PRIORITY (Implement Within 2-4 Weeks)

Functions that affect notifications, analytics, or secondary features.

### Notification Management
21. **`send_payment_setup_invitation`**
    - Sends payment setup invites to artists
    - Log: artist_id, event_id, sent_at

22. **`send_artist_invitation_email`**
    - Invites artists to events
    - Log: artist_id, event_id, invitation_sent

23. **`mark_admin_invitation_accepted`**
    - Tracks admin invitation status
    - Log: invitation_id, admin_user_id

### SMS/Communication
24. **`send_sms_instantly`**
    - Already has some logging via sms_logs table
    - Consider enhancing with admin context

25. **`send_auction_closing_notifications`**
    - Sends closing warnings
    - Log: event_id, notifications_sent, recipients

26. **`send_auction_winner_broadcast`**
    - Notifies winners
    - Log: art_id, winner_id, notification_sent

### Data Cleanup
27. **`admin_cleanup_expired_artwork_analysis`**
    - Cleans up old AI analysis
    - Log: records_deleted, date_range

28. **`cleanup_expired_qr_codes`**
    - Removes old QR codes
    - Log: codes_deleted, event_ids

### Round/Timer Management
29. **`set_round_timer`**
    - Sets round timing
    - Log: event_id, round, duration

30. **`notify_round_starting`**
    - Triggers round start notifications
    - Log: event_id, round, notifications_sent

---

## 🟢 LOW PRIORITY (Implement as Needed)

Read-only functions, analytics, or functions with minimal risk.

### Read-Only Functions (Consider Selective Logging)
- `get_admin_auction_details`
- `get_admin_payment_data`
- `get_artists_owed_money`
- `get_event_art_status`
- `get_comprehensive_auction_export`
- Most `get_*` functions

**Recommendation for reads:** Only log sensitive queries:
- Queries for payment data
- Queries for personal information
- Bulk data exports

### Analytics Functions (Low Risk)
- `get_auction_summary`
- `get_event_vote_ranges`
- `get_voting_summary`
- `refresh_auction_dashboard`
- `update_slack_analytics`

### Internal/Automated Functions
- `audit_trigger_function` (already audits itself)
- `cleanup_old_logs`
- `compress_old_logs`
- `refresh_vote_weights`

---

## Implementation Recommendations

### Phase 1: Critical (This Week)
Implement audit logging for functions 1-10:
- `admin_update_art_status` ⭐
- `admin_actually_close_auction_items`
- `clear_auction_closing_time`
- `close_auction_manually`
- `check_and_close_expired_auctions`
- `admin_toggle_event_applications`
- `admin_delete_event_safely`
- `mark_artwork_paid`
- `complete_stripe_payment`
- `toggle_payment_processing`

### Phase 2: High Priority (Next 1-2 Weeks)
Implement audit logging for functions 11-20

### Phase 3: Medium Priority (Next 2-4 Weeks)
Implement audit logging for functions 21-30

### Phase 4: Selective Implementation
Add logging for sensitive read operations and bulk exports

---

## Standard Audit Pattern

For each function, add this pattern:

```sql
-- At start of function
DECLARE
  v_audit_data JSONB;
BEGIN
  -- Build audit data
  v_audit_data := jsonb_build_object(
    'function_name', 'function_name_here',
    'parameters', jsonb_build_object(
      'param1', p_param1,
      'param2', p_param2
    )
  );

  -- Log the attempt
  PERFORM log_admin_action(
    'function_name_action',
    p_event_id, -- or NULL if not event-specific
    v_audit_data
  );

  -- ... function logic ...

  -- Log the success
  PERFORM log_admin_action(
    'function_name_success',
    p_event_id,
    v_audit_data || jsonb_build_object(
      'result', v_result,
      'records_affected', v_count
    )
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error
    PERFORM log_admin_action(
      'function_name_error',
      p_event_id,
      v_audit_data || jsonb_build_object(
        'error', SQLERRM
      )
    );
    RAISE;
END;
```

---

## Query Patterns for Audited Functions

### Find who changed art status
```sql
SELECT created_at, admin_email, event_name,
       action_data->>'art_code' as art_code,
       action_data->>'old_status' as old_status,
       action_data->>'new_status' as new_status
FROM admin_audit_log aal
LEFT JOIN auth.users au ON aal.admin_user_id = au.id
LEFT JOIN events e ON aal.event_id = e.id
WHERE action_type LIKE 'art_status%'
ORDER BY created_at DESC;
```

### Find who cleared auction timers
```sql
SELECT created_at, admin_email,
       action_data->>'art_code' as art_code,
       action_data->>'old_closing_time' as removed_timer
FROM admin_audit_log aal
LEFT JOIN auth.users au ON aal.admin_user_id = au.id
WHERE action_type = 'clear_auction_timer'
ORDER BY created_at DESC;
```

### Find who merged user accounts
```sql
SELECT created_at, admin_email,
       action_data->>'source_person_id' as from_person,
       action_data->>'target_person_id' as to_person,
       action_data->>'records_moved' as records
FROM admin_audit_log aal
LEFT JOIN auth.users au ON aal.admin_user_id = au.id
WHERE action_type = 'merge_people'
ORDER BY created_at DESC;
```

---

## Special Considerations

### System-Triggered Functions
For cron jobs and triggers:
- Use `admin_user_id = NULL`
- Add `'triggered_by', 'system'` to action_data
- Include cron job name or trigger name

### Batch Operations
For functions that affect multiple records:
- Log summary counts in action_data
- Consider logging individual record IDs if < 10 records
- For > 10 records, log counts only

### Sensitive Data
Never log in action_data:
- Full credit card numbers
- Passwords
- API keys
- Full phone numbers (log last 4 digits only)
- Full email (log masked version)

### Performance
- Audit logging adds ~1-5ms per call
- For high-frequency functions (>100/sec), consider:
  - Async logging via queue
  - Sampling (log 1 in N calls)
  - Summary logging (aggregate stats every minute)

---

## Migration Template

When adding audit logging to a function:

1. Read existing function
2. Create migration: `YYYYMMDD_add_audit_to_FUNCTION_NAME.sql`
3. Add audit calls at: start, success, error
4. Test in staging
5. Deploy to production
6. Monitor for performance impact

Example migration file structure:
```sql
-- Migration: Add audit logging to admin_update_art_status
-- Date: 2025-10-02
-- Purpose: Track all art status changes for investigation

BEGIN;

-- Drop and recreate function with audit logging
CREATE OR REPLACE FUNCTION admin_update_art_status(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_data JSONB;
BEGIN
  -- Audit logging here
  ...
END;
$$;

COMMENT ON FUNCTION admin_update_art_status IS
  'Enhanced with audit logging as of 2025-10-02';

COMMIT;
```

---

## Next Steps

1. ✅ Review this priority list
2. Create migration for `admin_update_art_status` (most critical)
3. Test thoroughly in staging
4. Deploy to production
5. Move to next function in priority list
6. Repeat until all critical functions have audit logging
