-- =====================================================
-- ADD AUDIT LOGGING TO admin_update_art_status
-- =====================================================
-- Purpose: Track all art status changes for investigation
-- This is THE critical function that likely caused Montreal incident
-- Author: Claude Code
-- Date: 2025-10-02

-- What this logs:
-- - Every status change (active -> sold -> paid -> closed)
-- - Every closing_time change (timers being set/cleared)
-- - Who made the change (admin_phone, auth.uid())
-- - When it happened
-- - Old values vs new values
-- - Payment details if marking as paid

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_art_status(
  p_art_code text,
  p_new_status text,
  p_admin_phone text DEFAULT NULL::text,
  p_actual_amount_collected numeric DEFAULT NULL::numeric,
  p_actual_tax_collected numeric DEFAULT NULL::numeric,
  p_payment_method text DEFAULT NULL::text,
  p_collection_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
  DECLARE
    v_art RECORD;
    v_winner RECORD;
    v_phone TEXT;
    v_total_with_tax NUMERIC;
    v_auction_url TEXT;
    v_message_id UUID;
    v_notifications_sent INT := 0;
    v_event_code TEXT;
    v_admin_payment_status_id UUID;
    v_payment_log_id UUID;
    v_final_amount NUMERIC;
    v_has_winner BOOLEAN := false;
    v_audit_data JSONB;
    v_result JSONB;
  BEGIN
    -- Validate status
    IF p_new_status NOT IN ('active', 'sold', 'closed', 'paid', 'cancelled') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
    END IF;

    -- Validate payment method if provided
    IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('cash', 'card', 'check', 'other', 'stripe') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method');
    END IF;

    -- Get art details with full joins
    SELECT
      a.*,
      e.id as event_id,
      e.name as event_name,
      e.currency,
      e.tax,
      ap.name as artist_name
    INTO v_art
    FROM art a
    JOIN events e ON a.event_id = e.id
    LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
    WHERE a.art_code = p_art_code;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Art not found');
    END IF;

    -- Extract event code from art_code (e.g., "AB2900-1-1" -> "AB2900")
    v_event_code := split_part(p_art_code, '-', 1);

    -- *** AUDIT LOG: Log the status change attempt ***
    v_audit_data := jsonb_build_object(
      'function', 'admin_update_art_status',
      'art_code', p_art_code,
      'art_id', v_art.id,
      'event_id', v_art.event_id,
      'event_name', v_art.event_name,
      'old_status', v_art.status,
      'new_status', p_new_status,
      'old_closing_time', v_art.closing_time,
      'old_bid_count', v_art.bid_count,
      'admin_phone', p_admin_phone,
      'payment_method', p_payment_method,
      'actual_amount_collected', p_actual_amount_collected,
      'actual_tax_collected', p_actual_tax_collected,
      'collection_notes', p_collection_notes
    );

    PERFORM log_admin_action(
      'art_status_change_attempt',
      v_art.event_id,
      v_audit_data
    );

    -- If marking as paid, create admin payment record
    IF p_new_status = 'paid' THEN
      -- Get admin payment status ID
      SELECT id INTO v_admin_payment_status_id
      FROM payment_statuses
      WHERE code = 'admin_paid';

      -- Get winner info for payment log
      SELECT p.*, b.amount as winning_bid
      INTO v_winner
      FROM bids b
      JOIN people p ON b.person_id = p.id
      WHERE b.art_id = v_art.id
      ORDER BY b.amount DESC
      LIMIT 1;

      IF FOUND THEN
        v_has_winner := true;
      END IF;

      IF v_has_winner AND v_admin_payment_status_id IS NOT NULL THEN
        -- Calculate theoretical total with tax
        v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);

        -- Use actual amount collected if provided, otherwise use calculated amount
        v_final_amount := COALESCE(p_actual_amount_collected, v_total_with_tax);

        -- Create payment log entry with actual collection data
        INSERT INTO payment_logs (
          art_id,
          person_id,
          payment_type,
          status_id,
          amount,  -- This now stores the actual amount collected
          actual_amount_collected,
          actual_tax_collected,
          payment_method,
          collection_notes,
          admin_phone,
          metadata
        ) VALUES (
          v_art.id,
          v_winner.id,
          'admin_marked',
          v_admin_payment_status_id,
          v_final_amount,  -- Main amount field gets actual collected amount
          p_actual_amount_collected,  -- Store separately for reference
          p_actual_tax_collected,
          COALESCE(p_payment_method, 'cash'),  -- Default to cash if not specified
          p_collection_notes,
          p_admin_phone,
          jsonb_build_object(
            'admin_phone', p_admin_phone,
            'marked_at', NOW(),
            'art_code', p_art_code,
            'winning_bid', v_winner.winning_bid,
            'calculated_total_with_tax', v_total_with_tax,
            'actual_amount_collected', p_actual_amount_collected,
            'actual_tax_collected', p_actual_tax_collected,
            'payment_method', COALESCE(p_payment_method, 'cash'),
            'collection_notes', p_collection_notes
          )
        )
        RETURNING id INTO v_payment_log_id;

        -- Update art with payment status and date
        UPDATE art SET
          status = p_new_status::art_status,
          buyer_pay_recent_status_id = v_admin_payment_status_id,
          buyer_pay_recent_date = NOW()
        WHERE art_code = p_art_code;
      ELSE
        -- Just update status if no winner found
        UPDATE art SET status = p_new_status::art_status WHERE art_code = p_art_code;
      END IF;
    ELSE
      -- Update the status - FIXED: Cast text to art_status enum
      -- If reopening (setting to active), also clear closing time and payment info
      IF p_new_status = 'active' THEN
        -- *** CRITICAL: Reopening auction - log this prominently ***
        PERFORM log_admin_action(
          'art_auction_reopened',
          v_art.event_id,
          v_audit_data || jsonb_build_object(
            'reopening', true,
            'clearing_closing_time', v_art.closing_time,
            'clearing_payment_info', true
          )
        );

        UPDATE art SET
          status = p_new_status::art_status,
          closing_time = NULL,
          auction_extended = false,
          extension_count = 0,
          buyer_pay_recent_status_id = NULL,
          buyer_pay_recent_date = NULL
        WHERE art_code = p_art_code;
      ELSE
        UPDATE art SET status = p_new_status::art_status WHERE art_code = p_art_code;
      END IF;
    END IF;

    -- If setting to 'sold', send winner notification
    IF p_new_status = 'sold' AND v_art.status != 'sold' THEN
      -- Get winner details if not already fetched
      IF NOT v_has_winner THEN
        SELECT
          p.*,
          b.amount as winning_bid
        INTO v_winner
        FROM bids b
        JOIN people p ON b.person_id = p.id
        WHERE b.art_id = v_art.id
        ORDER BY b.amount DESC
        LIMIT 1;

        IF FOUND THEN
          v_has_winner := true;
        END IF;
      END IF;

      IF v_has_winner THEN
        -- Update winner_id if not already set
        IF v_art.winner_id IS NULL THEN
          UPDATE art SET winner_id = v_winner.id WHERE id = v_art.id;
        END IF;

        v_phone := COALESCE(v_winner.auth_phone, v_winner.phone_number);

        IF v_phone IS NOT NULL THEN
          -- Calculate total with tax if not already calculated
          IF v_total_with_tax IS NULL THEN
            v_total_with_tax := v_winner.winning_bid * (1 + COALESCE(v_art.tax, 0) / 100.0);
          END IF;

          -- Generate auction URL
          v_auction_url := format('https://artb.art/e/%s/auction', v_event_code);

          -- Send improved SMS to winner (removed emoji and tax reference)
          v_message_id := send_sms_instantly(
            p_destination := v_phone,
            p_message_body := format(
              'Congratulations! You won %s''s artwork for %s%s. Complete your purchase: %s',
              COALESCE(v_art.artist_name, 'Artist'),
              COALESCE(v_art.currency, '$'),
              round(v_total_with_tax, 2),
              v_auction_url
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_winner',
              'art_id', v_art.id,
              'art_code', v_art.art_code,
              'amount', v_winner.winning_bid,
              'total_with_tax', round(v_total_with_tax, 2),
              'winner_id', v_winner.id,
              'event_code', v_event_code,
              'closed_by', 'admin',
              'admin_phone', p_admin_phone,
              'message_version', 'improved_v2'
            )
          );

          v_notifications_sent := v_notifications_sent + 1;

          -- Also send "not winning" notifications to other bidders
          PERFORM send_not_winning_notifications(
            v_art.id,
            v_winner.id,
            v_winner.winning_bid,
            v_art.art_code,
            COALESCE(v_art.artist_name, 'Artist'),
            COALESCE(v_art.currency, '$'),
            'admin'
          );
        END IF;
      END IF;
    END IF;

    -- *** AUDIT LOG: Log successful status change ***
    PERFORM log_admin_action(
      'art_status_changed',
      v_art.event_id,
      v_audit_data || jsonb_build_object(
        'result', 'success',
        'notifications_sent', v_notifications_sent,
        'payment_log_id', v_payment_log_id,
        'has_winner', v_has_winner
      )
    );

    -- FIXED: Build return object with conditional winner fields
    IF v_has_winner THEN
      v_result := jsonb_build_object(
        'success', true,
        'message', format('Status updated to %s', p_new_status),
        'notifications_sent', v_notifications_sent,
        'payment_log_id', v_payment_log_id,
        'admin_phone', p_admin_phone,
        'winning_bid', v_winner.winning_bid,
        'calculated_total', v_total_with_tax,
        'actual_amount_collected', p_actual_amount_collected,
        'actual_tax_collected', p_actual_tax_collected,
        'payment_method', COALESCE(p_payment_method, 'cash'),
        'has_winner', v_has_winner
      );
    ELSE
      v_result := jsonb_build_object(
        'success', true,
        'message', format('Status updated to %s', p_new_status),
        'notifications_sent', v_notifications_sent,
        'payment_log_id', v_payment_log_id,
        'admin_phone', p_admin_phone,
        'winning_bid', NULL,
        'calculated_total', v_total_with_tax,
        'actual_amount_collected', p_actual_amount_collected,
        'actual_tax_collected', p_actual_tax_collected,
        'payment_method', COALESCE(p_payment_method, 'cash'),
        'has_winner', v_has_winner
      );
    END IF;

    RETURN v_result;

  EXCEPTION
    WHEN OTHERS THEN
      -- *** AUDIT LOG: Log error ***
      PERFORM log_admin_action(
        'art_status_change_error',
        v_art.event_id,
        v_audit_data || jsonb_build_object(
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        )
      );

      -- Re-raise the error
      RAISE;
  END;
$function$;

COMMENT ON FUNCTION admin_update_art_status IS
  'Enhanced with comprehensive audit logging as of 2025-10-02. Logs all status changes including reopening auctions.';

-- =====================================================
-- Create view for easier querying of art status changes
-- =====================================================

CREATE OR REPLACE VIEW art_status_change_audit AS
SELECT
  aal.created_at,
  aal.admin_user_id,
  au.email as admin_email,
  aal.event_id,
  e.name as event_name,
  aal.action_type,
  aal.action_data->>'art_code' as art_code,
  aal.action_data->>'old_status' as old_status,
  aal.action_data->>'new_status' as new_status,
  (aal.action_data->>'old_closing_time')::timestamptz as old_closing_time,
  (aal.action_data->>'old_bid_count')::int as old_bid_count,
  aal.action_data->>'admin_phone' as admin_phone,
  aal.action_data->>'payment_method' as payment_method,
  (aal.action_data->>'actual_amount_collected')::numeric as amount_collected,
  aal.action_data->>'result' as result,
  (aal.action_data->>'notifications_sent')::int as notifications_sent,
  aal.action_data->>'error' as error,
  aal.action_data
FROM admin_audit_log aal
LEFT JOIN auth.users au ON aal.admin_user_id = au.id
LEFT JOIN events e ON aal.event_id = e.id
WHERE aal.action_type LIKE 'art_status%' OR aal.action_type = 'art_auction_reopened'
ORDER BY aal.created_at DESC;

COMMENT ON VIEW art_status_change_audit IS
  'Formatted view of art status changes with key fields extracted for easy investigation';

GRANT SELECT ON art_status_change_audit TO authenticated;

COMMIT;

-- =====================================================
-- TESTING QUERIES (for manual verification)
-- =====================================================

-- Test: View recent art status changes
-- SELECT * FROM art_status_change_audit LIMIT 20;

-- Test: Find who changed specific artwork
-- SELECT created_at, admin_email, old_status, new_status, old_closing_time, admin_phone
-- FROM art_status_change_audit
-- WHERE art_code = 'AB3059-1-6'
-- ORDER BY created_at;

-- Test: Find all auction reopenings
-- SELECT created_at, admin_email, art_code, event_name, old_closing_time
-- FROM art_status_change_audit
-- WHERE action_type = 'art_auction_reopened'
-- ORDER BY created_at DESC;

-- Test: Find who closed artworks before event started
-- SELECT
--   asc.created_at,
--   asc.admin_email,
--   asc.art_code,
--   asc.new_status,
--   asc.old_closing_time,
--   e.event_start_datetime,
--   EXTRACT(EPOCH FROM (e.event_start_datetime - asc.old_closing_time))/3600 as hours_before_event
-- FROM art_status_change_audit asc
-- JOIN events e ON asc.event_id = e.id
-- WHERE asc.old_closing_time < e.event_start_datetime
--   AND asc.new_status IN ('closed', 'sold')
-- ORDER BY hours_before_event DESC;
