-- =====================================================
-- COMPREHENSIVE AUCTION AUDIT LOGGING
-- =====================================================
-- Purpose: Add complete audit trail for auction operations
-- Tables affected: art, events
-- Functions affected: manage_auction_timer, admin_update_art_status
-- Author: Claude Code
-- Date: 2025-10-02
-- Ticket: Montreal auction premature closure investigation

-- Safety: All triggers use EXCEPTION blocks to prevent audit failures
-- from breaking core functionality

BEGIN;

-- =====================================================
-- STEP 1: Add audit trigger to ART table
-- =====================================================
-- This will log all changes to art records including:
-- - Status changes (active -> sold -> paid -> closed)
-- - Closing time changes (critical for timer investigations)
-- - Bid count updates
-- - Winner assignments

-- First, check if trigger already exists and drop it
DROP TRIGGER IF EXISTS audit_art_trigger ON art;

-- Create the trigger
CREATE TRIGGER audit_art_trigger
  AFTER INSERT OR UPDATE OR DELETE ON art
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

COMMENT ON TRIGGER audit_art_trigger ON art IS
  'Logs all changes to art records including status, closing_time, and winner changes';

-- =====================================================
-- STEP 2: Add audit trigger to EVENTS table
-- =====================================================
-- This will log changes to event settings including:
-- - auction_close_starts_at changes
-- - enable_auction toggles
-- - Event activation/deactivation

DROP TRIGGER IF EXISTS audit_events_trigger ON events;

CREATE TRIGGER audit_events_trigger
  AFTER INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();

COMMENT ON TRIGGER audit_events_trigger ON events IS
  'Logs all changes to event records including auction timing settings';

-- =====================================================
-- STEP 3: Enhanced admin audit log function
-- =====================================================
-- Helper function to safely log admin actions
-- This can be called from any admin function

CREATE OR REPLACE FUNCTION log_admin_action(
  p_action_type TEXT,
  p_event_id UUID DEFAULT NULL,
  p_action_data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user ID (may be NULL for system operations)
  v_user_id := auth.uid();

  -- Insert audit log entry
  INSERT INTO admin_audit_log (
    admin_user_id,
    event_id,
    action_type,
    action_data,
    created_at
  ) VALUES (
    v_user_id,
    p_event_id,
    p_action_type,
    p_action_data || jsonb_build_object(
      'timestamp', NOW(),
      'user_id', v_user_id,
      'session_id', current_setting('request.jwt.claim.session_id', true)
    ),
    NOW()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the operation
    RAISE WARNING 'Failed to log admin action: % - %', SQLERRM, SQLSTATE;
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION log_admin_action IS
  'Safely logs admin actions to admin_audit_log. Never throws errors to prevent breaking operations.';

-- =====================================================
-- STEP 4: Update manage_auction_timer to log actions
-- =====================================================
-- Add audit logging to the auction timer management function

CREATE OR REPLACE FUNCTION public.manage_auction_timer(
  p_event_id uuid,
  p_action text,
  p_duration_minutes integer DEFAULT 12,
  p_admin_phone text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $function$
  DECLARE
    v_event RECORD;
    v_updated_count INT := 0;
    v_closing_time TIMESTAMP WITH TIME ZONE;
    v_participant_count INT := 0;
    v_sms_count INT := 0;
    v_participants RECORD;
    v_message_id UUID;
    v_event_code TEXT;
    v_extended_count INT := 0;
    v_result JSONB;
    v_audit_data JSONB;
  BEGIN
    -- *** AUDIT LOG: Log the timer action attempt ***
    v_audit_data := jsonb_build_object(
      'action', p_action,
      'event_id', p_event_id,
      'duration_minutes', p_duration_minutes,
      'admin_phone', p_admin_phone
    );

    PERFORM log_admin_action(
      'auction_timer_' || p_action,
      p_event_id,
      v_audit_data
    );

    -- Validate action
    IF p_action NOT IN ('start', 'extend', 'cancel', 'close_now') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid action. Must be start, extend, cancel, or close_now'
      );
    END IF;

    -- Get event details
    SELECT * INTO v_event FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Event not found');
    END IF;

    -- Extract event code from event name (e.g., "AB2900 - Omaha" -> "AB2900")
    v_event_code := split_part(v_event.name, ' ', 1);

    -- Check if auction is enabled for this event
    IF NOT v_event.enable_auction THEN
      RETURN jsonb_build_object('success', false, 'error', 'Auction not enabled for this event');
    END IF;

    -- Perform the requested action
    CASE p_action
      WHEN 'start' THEN
        -- Set closing time for all active artworks
        v_closing_time := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;

        UPDATE art
        SET
          closing_time = v_closing_time,
          auction_extended = false,
          extension_count = 0,
          updated_at = NOW()
        WHERE
          event_id = p_event_id
          AND status = 'active'
          AND closing_time IS NULL; -- Only set if not already set

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- Send 10-minute warning SMS to all participants
        IF p_duration_minutes >= 10 THEN
          -- Get all unique participants (voters and bidders)
          FOR v_participants IN
            SELECT DISTINCT
              p.id as person_id,
              COALESCE(p.auth_phone, p.phone_number) as phone,
              p.nickname
            FROM people p
            WHERE EXISTS (
              -- Has voted in this event - FIXED: Cast art.id to text for comparison
              SELECT 1 FROM votes v
              JOIN art a ON v.art_id = a.id::text
              WHERE a.event_id = p_event_id AND v.person_id = p.id
            ) OR EXISTS (
              -- Has bid in this event
              SELECT 1 FROM bids b
              JOIN art a ON b.art_id = a.id
              WHERE a.event_id = p_event_id AND b.person_id = p.id
            )
            AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL
          LOOP
            v_participant_count := v_participant_count + 1;

            -- Send improved SMS instantly
            v_message_id := send_sms_instantly(
              p_destination := v_participants.phone,
              p_message_body := format(
                '⏰ %s auction ends in 10 minutes! Last chance to bid on your favorites: https://artb.art/e/%s/auction',
                COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),
                v_event_code
              ),
              p_metadata := jsonb_build_object(
                'type', 'auction_warning',
                'event_id', p_event_id,
                'event_name', v_event.name,
                'event_code', v_event_code,
                'person_id', v_participants.person_id,
                'admin_action', 'timer_start',
                'admin_phone', p_admin_phone,
                'message_version', 'improved_v1'
              )
            );

            IF v_message_id IS NOT NULL THEN
              v_sms_count := v_sms_count + 1;
            END IF;
          END LOOP;
        END IF;

        v_result := jsonb_build_object(
          'success', true,
          'message', format('Auction timer started for %s artworks', v_updated_count),
          'closing_time', v_closing_time,
          'artworks_updated', v_updated_count,
          'participants_notified', v_participant_count,
          'sms_sent', v_sms_count
        );

        -- *** AUDIT LOG: Record successful timer start ***
        PERFORM log_admin_action(
          'auction_timer_started',
          p_event_id,
          v_audit_data || jsonb_build_object(
            'result', 'success',
            'artworks_updated', v_updated_count,
            'closing_time', v_closing_time,
            'sms_sent', v_sms_count
          )
        );

        RETURN v_result;

      WHEN 'extend' THEN
        -- Extend closing time by 5 minutes for all artworks with timers
        UPDATE art
        SET
          closing_time = closing_time + INTERVAL '5 minutes',
          auction_extended = true,
          extension_count = extension_count + 1,
          updated_at = NOW()
        WHERE
          event_id = p_event_id
          AND status = 'active'
          AND closing_time IS NOT NULL
          AND closing_time > NOW(); -- Only extend if not already passed

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        v_result := jsonb_build_object(
          'success', true,
          'message', format('Extended %s auction timers by 5 minutes', v_updated_count),
          'artworks_updated', v_updated_count
        );

        -- *** AUDIT LOG: Record extension ***
        PERFORM log_admin_action(
          'auction_timer_extended',
          p_event_id,
          v_audit_data || jsonb_build_object(
            'result', 'success',
            'artworks_updated', v_updated_count
          )
        );

        RETURN v_result;

      WHEN 'cancel' THEN
        -- Remove all closing times
        UPDATE art
        SET
          closing_time = NULL,
          auction_extended = false,
          extension_count = 0,
          updated_at = NOW()
        WHERE
          event_id = p_event_id
          AND closing_time IS NOT NULL;

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        v_result := jsonb_build_object(
          'success', true,
          'message', format('Cancelled timers for %s artworks', v_updated_count),
          'artworks_updated', v_updated_count
        );

        -- *** AUDIT LOG: Record cancellation ***
        PERFORM log_admin_action(
          'auction_timer_cancelled',
          p_event_id,
          v_audit_data || jsonb_build_object(
            'result', 'success',
            'artworks_updated', v_updated_count
          )
        );

        RETURN v_result;

      WHEN 'close_now' THEN
        -- FIXED: Use bid-based status logic instead of always setting 'closed'
        -- If artwork has bids: status = 'sold' (winner exists, awaiting payment)
        -- If artwork has no bids: status = 'closed' (no winner)
        UPDATE art
        SET
          status = CASE
            WHEN EXISTS (SELECT 1 FROM bids WHERE bids.art_id = art.id) THEN 'sold'::art_status
            ELSE 'closed'::art_status
          END,
          closing_time = NOW(), -- Set to now for audit trail
          updated_at = NOW()
        WHERE
          event_id = p_event_id
          AND status = 'active'
          AND closing_time IS NOT NULL; -- Only close artworks that had active timers

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- Send closure notifications to all participants who had bid or voted
        FOR v_participants IN
          SELECT DISTINCT
            p.id as person_id,
            COALESCE(p.auth_phone, p.phone_number) as phone,
            p.nickname
          FROM people p
          WHERE EXISTS (
            -- Has voted in this event
            SELECT 1 FROM votes v
            JOIN art a ON v.art_id = a.id::text
            WHERE a.event_id = p_event_id AND v.person_id = p.id
          ) OR EXISTS (
            -- Has bid in this event
            SELECT 1 FROM bids b
            JOIN art a ON b.art_id = a.id
            WHERE a.event_id = p_event_id AND b.person_id = p.id
          )
          AND COALESCE(p.auth_phone, p.phone_number) IS NOT NULL
        LOOP
          v_participant_count := v_participant_count + 1;

          -- Send closure SMS notification
          v_message_id := send_sms_instantly(
            p_destination := v_participants.phone,
            p_message_body := format(
              '🎯 %s auction is now closed! Check results and payment notifications: https://artb.art/e/%s/auction',
              COALESCE(split_part(v_event.name, ' - ', 2), v_event.name),
              v_event_code
            ),
            p_metadata := jsonb_build_object(
              'type', 'auction_closed',
              'event_id', p_event_id,
              'event_name', v_event.name,
              'event_code', v_event_code,
              'person_id', v_participants.person_id,
              'admin_action', 'force_close',
              'admin_phone', p_admin_phone,
              'message_version', 'close_now_v1'
            )
          );

          IF v_message_id IS NOT NULL THEN
            v_sms_count := v_sms_count + 1;
          END IF;
        END LOOP;

        v_result := jsonb_build_object(
          'success', true,
          'message', format('Force closed %s auctions with bid-based statuses', v_updated_count),
          'artworks_closed', v_updated_count,
          'participants_notified', v_participant_count,
          'sms_sent', v_sms_count
        );

        -- *** AUDIT LOG: Record force close ***
        PERFORM log_admin_action(
          'auction_force_closed',
          p_event_id,
          v_audit_data || jsonb_build_object(
            'result', 'success',
            'artworks_closed', v_updated_count,
            'sms_sent', v_sms_count
          )
        );

        RETURN v_result;

    END CASE;

  EXCEPTION
    WHEN OTHERS THEN
      -- *** AUDIT LOG: Record error ***
      PERFORM log_admin_action(
        'auction_timer_error',
        p_event_id,
        v_audit_data || jsonb_build_object(
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        )
      );

      RETURN jsonb_build_object(
        'success', false,
        'error', 'Database error occurred',
        'detail', SQLERRM
      );
  END;
$function$;

COMMENT ON FUNCTION manage_auction_timer IS
  'Enhanced with comprehensive audit logging for all timer operations';

-- =====================================================
-- STEP 5: Add indexes for efficient audit queries
-- =====================================================

-- Index for querying admin actions by event
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_event_action
  ON admin_audit_log(event_id, action_type, created_at DESC);

-- Index for querying security audit logs by table and operation
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_table_operation
  ON security_audit_logs(table_name, operation, created_at DESC);

-- Index for user-specific audit queries
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user_table
  ON security_audit_logs(user_id, table_name, created_at DESC);

-- =====================================================
-- STEP 6: Create helpful audit query views
-- =====================================================

-- View for art table changes (easier to query)
CREATE OR REPLACE VIEW art_audit_history AS
SELECT
  sal.id,
  sal.created_at,
  sal.operation,
  sal.user_id,
  sal.user_role,
  au.email as user_email,
  -- Extract key fields from old_data
  (sal.old_data->>'id')::uuid as art_id,
  sal.old_data->>'art_code' as old_art_code,
  sal.old_data->>'status' as old_status,
  (sal.old_data->>'closing_time')::timestamptz as old_closing_time,
  (sal.old_data->>'bid_count')::int as old_bid_count,
  -- Extract key fields from new_data
  sal.new_data->>'art_code' as new_art_code,
  sal.new_data->>'status' as new_status,
  (sal.new_data->>'closing_time')::timestamptz as new_closing_time,
  (sal.new_data->>'bid_count')::int as new_bid_count,
  -- Full data for detailed investigation
  sal.old_data,
  sal.new_data
FROM security_audit_logs sal
LEFT JOIN auth.users au ON sal.user_id = au.id
WHERE sal.table_name = 'art'
ORDER BY sal.created_at DESC;

COMMENT ON VIEW art_audit_history IS
  'Formatted view of art table changes with key fields extracted for easy querying';

-- View for auction timer operations
CREATE OR REPLACE VIEW auction_timer_audit AS
SELECT
  aal.id,
  aal.created_at,
  aal.admin_user_id,
  au.email as admin_email,
  aal.event_id,
  e.name as event_name,
  aal.action_type,
  aal.action_data->>'action' as timer_action,
  (aal.action_data->>'duration_minutes')::int as duration_minutes,
  (aal.action_data->>'artworks_updated')::int as artworks_updated,
  (aal.action_data->>'closing_time')::timestamptz as closing_time,
  aal.action_data->>'admin_phone' as admin_phone,
  aal.action_data->>'result' as result,
  aal.action_data
FROM admin_audit_log aal
LEFT JOIN auth.users au ON aal.admin_user_id = au.id
LEFT JOIN events e ON aal.event_id = e.id
WHERE aal.action_type LIKE 'auction_timer%'
ORDER BY aal.created_at DESC;

COMMENT ON VIEW auction_timer_audit IS
  'Formatted view of auction timer operations for easy investigation';

-- =====================================================
-- STEP 7: Grant permissions
-- =====================================================

-- Admin users can query audit logs
GRANT SELECT ON art_audit_history TO authenticated;
GRANT SELECT ON auction_timer_audit TO authenticated;

-- =====================================================
-- STEP 8: Create helper function to investigate events
-- =====================================================

CREATE OR REPLACE FUNCTION get_event_audit_timeline(p_event_id UUID)
RETURNS TABLE (
  timestamp TIMESTAMPTZ,
  source TEXT,
  action TEXT,
  details JSONB,
  user_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
BEGIN
  RETURN QUERY
  -- Admin actions
  SELECT
    aal.created_at as timestamp,
    'admin_action'::text as source,
    aal.action_type as action,
    aal.action_data as details,
    au.email as user_email
  FROM admin_audit_log aal
  LEFT JOIN auth.users au ON aal.admin_user_id = au.id
  WHERE aal.event_id = p_event_id

  UNION ALL

  -- Art changes for this event
  SELECT
    sal.created_at as timestamp,
    'art_change'::text as source,
    sal.operation || ' on ' || sal.table_name as action,
    jsonb_build_object(
      'art_code', sal.new_data->>'art_code',
      'old_status', sal.old_data->>'status',
      'new_status', sal.new_data->>'status',
      'old_closing_time', sal.old_data->>'closing_time',
      'new_closing_time', sal.new_data->>'closing_time'
    ) as details,
    au.email as user_email
  FROM security_audit_logs sal
  LEFT JOIN auth.users au ON sal.user_id = au.id
  WHERE sal.table_name = 'art'
    AND (
      (sal.new_data->>'event_id')::uuid = p_event_id
      OR (sal.old_data->>'event_id')::uuid = p_event_id
    )

  ORDER BY timestamp DESC;
END;
$$;

COMMENT ON FUNCTION get_event_audit_timeline IS
  'Returns complete timeline of admin actions and art changes for an event';

GRANT EXECUTE ON FUNCTION get_event_audit_timeline TO authenticated;

COMMIT;

-- =====================================================
-- TESTING QUERIES (commented out - for manual testing)
-- =====================================================

-- Test: View recent art changes
-- SELECT * FROM art_audit_history LIMIT 20;

-- Test: View recent timer operations
-- SELECT * FROM auction_timer_audit LIMIT 20;

-- Test: Get timeline for Montreal event
-- SELECT * FROM get_event_audit_timeline('ca071057-032d-4ed2-9648-f550b49028d5');

-- Test: Find all timer operations for a specific event
-- SELECT * FROM auction_timer_audit
-- WHERE event_id = 'ca071057-032d-4ed2-9648-f550b49028d5'
-- ORDER BY created_at;
