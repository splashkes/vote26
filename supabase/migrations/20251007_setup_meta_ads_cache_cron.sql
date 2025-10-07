-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to cache Meta Ads data for relevant events
CREATE OR REPLACE FUNCTION cache_meta_ads_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_record RECORD;
  start_date timestamp with time zone;
  end_date timestamp with time zone;
  total_count integer := 0;
  success_count integer := 0;
  result jsonb;
BEGIN
  -- Calculate date range: 2 days ago to 33 days in the future
  start_date := now() - interval '2 days';
  end_date := now() + interval '33 days';

  RAISE NOTICE 'Caching Meta Ads data for events from % to %', start_date, end_date;

  -- Loop through events in date range
  FOR event_record IN
    SELECT id, eid, name, event_start_datetime
    FROM events
    WHERE event_start_datetime >= start_date
      AND event_start_datetime <= end_date
      AND eid IS NOT NULL
    ORDER BY event_start_datetime
  LOOP
    total_count := total_count + 1;

    -- Call the meta-ads-report edge function via pg_net
    PERFORM net.http_get(
      url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report?event_eid=' || event_record.eid,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      )
    );

    success_count := success_count + 1;
    RAISE NOTICE 'Cached data for event: % (%)', event_record.eid, event_record.name;
  END LOOP;

  result := jsonb_build_object(
    'success', true,
    'date_range', jsonb_build_object(
      'start', start_date,
      'end', end_date
    ),
    'total_events', total_count,
    'cached_events', success_count,
    'completed_at', now()
  );

  RAISE NOTICE 'Cron job completed: % events processed, % cached', total_count, success_count;

  RETURN result;
END;
$$;

-- Remove existing cron job if it exists (ignore errors if it doesn't exist)
DO $$
BEGIN
  PERFORM cron.unschedule('meta-ads-cache-daily');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

-- Schedule Meta Ads cache cron job to run every morning at 8:00 AM UTC
SELECT cron.schedule(
  'meta-ads-cache-daily',
  '0 8 * * *', -- Every day at 8:00 AM UTC
  $$SELECT cache_meta_ads_data()$$
);

-- Create a table to store cron job execution logs
CREATE TABLE IF NOT EXISTS meta_ads_cache_cron_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  executed_at timestamp with time zone DEFAULT now(),
  status text,
  total_events integer,
  successful integer,
  failed integer,
  skipped integer,
  errors jsonb,
  duration_ms integer,
  response jsonb
);

-- Add index for querying recent logs
CREATE INDEX IF NOT EXISTS idx_meta_ads_cache_cron_log_executed_at
  ON meta_ads_cache_cron_log(executed_at DESC);

-- Add comment
COMMENT ON TABLE meta_ads_cache_cron_log IS 'Logs for Meta Ads cache cron job execution';
