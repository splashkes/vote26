-- Fix the safe deletion function to handle artist_confirmations properly
-- artist_confirmations table uses event_eid instead of event_id

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

        -- 5. Artist confirmations (uses event_eid field, not event_id)
        UPDATE artist_confirmations SET event_invited_to = 'AB8888' WHERE event_invited_to = target_event_eid;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{artist_confirmations}', temp_count::text::jsonb);

        -- 6. Artist payment email queue
        UPDATE artist_payment_email_queue SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{artist_payment_email_queue}', temp_count::text::jsonb);

        -- 7. Email logs
        UPDATE email_logs SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{email_logs}', temp_count::text::jsonb);

        -- 8. Event admins
        UPDATE event_admins SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_admins}', temp_count::text::jsonb);

        -- 9. Event artists
        UPDATE event_artists SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_artists}', temp_count::text::jsonb);

        -- 10. Event QR secrets
        UPDATE event_qr_secrets SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_qr_secrets}', temp_count::text::jsonb);

        -- 11. Event registrations
        UPDATE event_registrations SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_registrations}', temp_count::text::jsonb);

        -- 12. Event slack settings
        UPDATE event_slack_settings SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{event_slack_settings}', temp_count::text::jsonb);

        -- 13. Notifications
        UPDATE notifications SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{notifications}', temp_count::text::jsonb);

        -- 14. Payment processing
        UPDATE payment_processing SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{payment_processing}', temp_count::text::jsonb);

        -- 15. People interactions
        UPDATE people_interactions SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{people_interactions}', temp_count::text::jsonb);

        -- 16. People QR scans
        UPDATE people_qr_scans SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{people_qr_scans}', temp_count::text::jsonb);

        -- 17. Promo materials
        UPDATE promo_materials SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{promo_materials}', temp_count::text::jsonb);

        -- 18. QR codes
        UPDATE qr_codes SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{qr_codes}', temp_count::text::jsonb);

        -- 19. Rounds
        UPDATE rounds SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{rounds}', temp_count::text::jsonb);

        -- 20. Slack analytics
        UPDATE slack_analytics SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{slack_analytics}', temp_count::text::jsonb);

        -- 21. Slack notifications
        UPDATE slack_notifications SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{slack_notifications}', temp_count::text::jsonb);

        -- 22. Vote weights
        UPDATE vote_weights SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{vote_weights}', temp_count::text::jsonb);

        -- 23. Votes
        UPDATE votes SET event_id = holder_event_id WHERE event_id = target_event_id;
        GET DIAGNOSTICS temp_count = ROW_COUNT;
        affected_counts := jsonb_set(affected_counts, '{votes}', temp_count::text::jsonb);

        -- 24. Votes old backup
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