-- Slack Queue Cron Management Functions

-- Function to check cron job status
CREATE OR REPLACE FUNCTION get_slack_cron_status()
RETURNS TABLE(
    job_name TEXT,
    schedule TEXT,
    command TEXT,
    active BOOLEAN,
    last_run TIMESTAMP WITH TIME ZONE,
    next_run TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.jobname::TEXT,
        j.schedule::TEXT,
        j.command::TEXT,
        j.active,
        j.last_run,
        j.next_run
    FROM cron.job j
    WHERE j.jobname LIKE '%slack%'
    ORDER BY j.jobname;
END;
$$;

-- Function to pause Slack queue processing
CREATE OR REPLACE FUNCTION pause_slack_queue_processing()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE cron.job 
    SET active = false 
    WHERE jobname = 'process-slack-queue-every-minute';
    
    RETURN 'Slack queue processing paused';
END;
$$;

-- Function to resume Slack queue processing
CREATE OR REPLACE FUNCTION resume_slack_queue_processing()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE cron.job 
    SET active = true 
    WHERE jobname = 'process-slack-queue-every-minute';
    
    RETURN 'Slack queue processing resumed';
END;
$$;

-- Function to manually trigger queue processing
CREATE OR REPLACE FUNCTION manual_process_slack_queue(batch_size INTEGER DEFAULT 20)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT process_slack_queue_batch(batch_size) INTO v_result;
    
    RAISE NOTICE 'Manual queue processing completed: %', v_result;
    
    RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_slack_cron_status TO authenticated;
GRANT EXECUTE ON FUNCTION pause_slack_queue_processing TO authenticated;
GRANT EXECUTE ON FUNCTION resume_slack_queue_processing TO authenticated;
GRANT EXECUTE ON FUNCTION manual_process_slack_queue TO authenticated;