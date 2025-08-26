-- Create automated queue processing system
-- Process 20 notifications per minute to respect Slack rate limits

-- Enhanced batch processing function with rate limiting
CREATE OR REPLACE FUNCTION process_slack_queue_batch(batch_size INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notification RECORD;
    v_processed INTEGER := 0;
    v_succeeded INTEGER := 0;
    v_failed INTEGER := 0;
    v_result BOOLEAN;
    v_start_time TIMESTAMP := NOW();
    v_delay_seconds INTEGER := 0;
BEGIN
    -- Process pending notifications in batches with rate limiting
    FOR v_notification IN 
        SELECT id 
        FROM slack_notifications 
        WHERE status = 'pending' 
        ORDER BY created_at ASC 
        LIMIT batch_size
    LOOP
        -- Add small delay between messages to avoid rate limiting
        IF v_processed > 0 AND (v_processed % 5) = 0 THEN
            -- Add 2 second delay every 5 messages
            PERFORM pg_sleep(2);
        END IF;

        SELECT process_slack_notification(v_notification.id) INTO v_result;
        
        v_processed := v_processed + 1;
        IF v_result THEN
            v_succeeded := v_succeeded + 1;
        ELSE
            v_failed := v_failed + 1;
        END IF;

        -- Log progress every 10 messages
        IF (v_processed % 10) = 0 THEN
            RAISE NOTICE 'Queue processing: % processed, % succeeded, % failed', v_processed, v_succeeded, v_failed;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'processed', v_processed,
        'succeeded', v_succeeded,
        'failed', v_failed,
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - v_start_time))::INTEGER,
        'timestamp', NOW()
    );
END;
$$;

-- Create a monitoring function for queue status
CREATE OR REPLACE FUNCTION get_detailed_slack_queue_status()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_stats JSONB;
    v_recent_activity JSONB;
BEGIN
    -- Get overall statistics
    SELECT jsonb_build_object(
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'pending_lookup', COUNT(*) FILTER (WHERE status = 'pending_lookup'),
        'sent', COUNT(*) FILTER (WHERE status = 'sent'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed'),
        'total', COUNT(*),
        'oldest_pending', MIN(created_at) FILTER (WHERE status = 'pending'),
        'newest_pending', MAX(created_at) FILTER (WHERE status = 'pending')
    ) INTO v_stats
    FROM slack_notifications;

    -- Get recent activity (last hour)
    SELECT jsonb_build_object(
        'last_hour_processed', COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '1 hour'),
        'last_hour_failed', COUNT(*) FILTER (WHERE status = 'failed' AND last_attempt_at > NOW() - INTERVAL '1 hour'),
        'recent_message_types', jsonb_agg(DISTINCT message_type) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')
    ) INTO v_recent_activity
    FROM slack_notifications;

    RETURN v_stats || v_recent_activity;
END;
$$;

-- Create function to clear old processed notifications (housekeeping)
CREATE OR REPLACE FUNCTION cleanup_old_slack_notifications(days_to_keep INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM slack_notifications 
    WHERE status IN ('sent', 'failed') 
    AND (sent_at < NOW() - INTERVAL '%s days' OR last_attempt_at < NOW() - INTERVAL '%s days');
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old notifications older than % days', v_deleted_count, days_to_keep;
    
    RETURN v_deleted_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_slack_queue_batch TO authenticated;
GRANT EXECUTE ON FUNCTION get_detailed_slack_queue_status TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_slack_notifications TO authenticated;