-- Safe Event Deletion System
-- Creates AB8888 as a holder event for deleted event data
-- Provides admin-delete-event function for super admins only

-- First, ensure we have AB8888 as our deleted events holder
INSERT INTO events (
    id,
    eid,
    name,
    description,
    enabled,
    show_in_app,
    vote_by_link,
    enable_auction,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000008888'::uuid,
    'AB8888',
    '[DELETED EVENTS HOLDER]',
    'This event holds data from deleted events to preserve historical records. Do not modify or delete.',
    false,
    false,
    false,
    false,
    NOW(),
    NOW()
) ON CONFLICT (eid) DO UPDATE SET
    name = '[DELETED EVENTS HOLDER]',
    description = 'This event holds data from deleted events to preserve historical records. Do not modify or delete.',
    enabled = false,
    show_in_app = false;

-- Create admin function for safe event deletion (super admin only)
CREATE OR REPLACE FUNCTION admin_delete_event_safely(
    target_event_id UUID,
    admin_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    affected_tables JSONB
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    holder_event_id UUID := '00000000-0000-0000-0000-000000008888'::uuid;
    target_event_eid TEXT;
    is_super_admin BOOLEAN := false;
    affected_counts JSONB := '{}'::jsonb;
    temp_count INTEGER;
BEGIN
    -- Security: Only super admins can delete events
    SELECT EXISTS (
        SELECT 1 FROM abhq_admin_users
        WHERE email = auth.email()
        AND level = 'super'
        AND active = true
    ) INTO is_super_admin;

    IF NOT is_super_admin THEN
        RETURN QUERY SELECT false, 'Access denied: Super admin required'::text, '{}'::jsonb;
        RETURN;
    END IF;

    -- Get event EID for logging
    SELECT eid INTO target_event_eid FROM events WHERE id = target_event_id;

    IF target_event_eid IS NULL THEN
        RETURN QUERY SELECT false, 'Event not found'::text, '{}'::jsonb;
        RETURN;
    END IF;

    -- Prevent deletion of the holder event itself
    IF target_event_id = holder_event_id THEN
        RETURN QUERY SELECT false, 'Cannot delete the deleted events holder (AB8888)'::text, '{}'::jsonb;
        RETURN;
    END IF;

    -- Start transaction for safe relinking
    BEGIN
        -- Relink all connected data to holder event

        -- 1. Admin audit log
        UPDATE admin_audit_log SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{admin_audit_log}', temp_count::text::jsonb);

        -- 2. Art pieces
        UPDATE art SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{art}', temp_count::text::jsonb);

        -- 3. Artist applications
        UPDATE artist_applications SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{artist_applications}', temp_count::text::jsonb);

        -- 4. Artist invites
        UPDATE artist_invites SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{artist_invites}', temp_count::text::jsonb);

        -- 5. Artist payment email queue
        UPDATE artist_payment_email_queue SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{artist_payment_email_queue}', temp_count::text::jsonb);

        -- 6. Email logs
        UPDATE email_logs SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{email_logs}', temp_count::text::jsonb);

        -- 7. Event admins
        UPDATE event_admins SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_admins}', temp_count::text::jsonb);

        -- 8. Event artists
        UPDATE event_artists SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_artists}', temp_count::text::jsonb);

        -- 9. Event QR secrets
        UPDATE event_qr_secrets SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_qr_secrets}', temp_count::text::jsonb);

        -- 10. Event registrations
        UPDATE event_registrations SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_registrations}', temp_count::text::jsonb);

        -- 11. Event slack settings
        UPDATE event_slack_settings SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_slack_settings}', temp_count::text::jsonb);

        -- 12. Notifications
        UPDATE notifications SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{notifications}', temp_count::text::jsonb);

        -- 13. Payment processing
        UPDATE payment_processing SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{payment_processing}', temp_count::text::jsonb);

        -- 14. People interactions
        UPDATE people_interactions SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{people_interactions}', temp_count::text::jsonb);

        -- 15. People QR scans
        UPDATE people_qr_scans SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{people_qr_scans}', temp_count::text::jsonb);

        -- 16. Promo materials
        UPDATE promo_materials SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{promo_materials}', temp_count::text::jsonb);

        -- 17. QR codes
        UPDATE qr_codes SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{qr_codes}', temp_count::text::jsonb);

        -- 18. Rounds
        UPDATE rounds SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{rounds}', temp_count::text::jsonb);

        -- 19. Slack analytics
        UPDATE slack_analytics SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{slack_analytics}', temp_count::text::jsonb);

        -- 20. Slack notifications
        UPDATE slack_notifications SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{slack_notifications}', temp_count::text::jsonb);

        -- 21. Vote weights
        UPDATE vote_weights SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{vote_weights}', temp_count::text::jsonb);

        -- 22. Votes
        UPDATE votes SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{votes}', temp_count::text::jsonb);

        -- 23. Votes old backup
        UPDATE votes_old_backup SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{votes_old_backup}', temp_count::text::jsonb);

        -- Log the deletion in admin audit log
        INSERT INTO admin_audit_log (
            event_id,
            action,
            target_type,
            target_id,
            changes,
            admin_email,
            notes,
            created_at
        ) VALUES (
            holder_event_id,
            'delete_event',
            'event',
            target_event_id::text,
            jsonb_build_object(
                'deleted_event_eid', target_event_eid,
                'affected_data', affected_counts,
                'deletion_timestamp', NOW()
            ),
            auth.email(),
            COALESCE(admin_notes, 'Event deleted and data moved to AB8888 holder'),
            NOW()
        );

        -- Finally, delete the actual event record
        DELETE FROM events WHERE id = target_event_id;

        RETURN QUERY SELECT
            true,
            format('Event %s successfully deleted. Data moved to AB8888 holder.', target_event_eid)::text,
            affected_counts;

    EXCEPTION WHEN OTHERS THEN
        -- Rollback will happen automatically
        RETURN QUERY SELECT
            false,
            format('Error deleting event: %s', SQLERRM)::text,
            '{}'::jsonb;
    END;
END;
$$;

-- Grant execute permission to authenticated users (function checks super admin internally)
GRANT EXECUTE ON FUNCTION admin_delete_event_safely TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION admin_delete_event_safely IS 'Safely deletes an event by moving all connected data to AB8888 holder event. Super admin only.';