-- Add realtime queue monitoring functions
-- Created: 2025-08-16
-- Purpose: Monitor Supabase realtime queue performance and detect bottlenecks

-- Function to get realtime queue statistics
CREATE OR REPLACE FUNCTION get_realtime_queue_stats()
RETURNS TABLE(
  metric_name text,
  metric_value bigint,
  metric_unit text,
  last_updated timestamp,
  status text
) AS $$
DECLARE
  wal_lag bigint;
  slot_count int;
  active_connections int;
  replication_delay interval;
BEGIN
  -- Get WAL lag (indicates message backup in queue)
  SELECT COALESCE(
    pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn), 0
  ) INTO wal_lag
  FROM pg_replication_slots 
  WHERE slot_name LIKE 'supabase_realtime%' 
  AND active = true 
  LIMIT 1;

  -- Count active replication slots
  SELECT COUNT(*) INTO slot_count
  FROM pg_replication_slots 
  WHERE slot_name LIKE 'supabase_realtime%' 
  AND active = true;

  -- Get active realtime connections
  SELECT COUNT(*) INTO active_connections
  FROM pg_stat_activity 
  WHERE application_name LIKE '%realtime%' 
  AND state = 'active';

  -- Calculate replication delay
  SELECT COALESCE(
    now() - pg_last_xact_replay_timestamp(), interval '0'
  ) INTO replication_delay;

  -- Return metrics
  RETURN QUERY VALUES
    ('wal_lag_bytes', wal_lag, 'bytes', now(), 
     CASE WHEN wal_lag > 1048576 THEN 'WARNING' -- 1MB threshold
          WHEN wal_lag > 10485760 THEN 'CRITICAL' -- 10MB threshold
          ELSE 'OK' END),
    ('active_slots', slot_count::bigint, 'count', now(),
     CASE WHEN slot_count = 0 THEN 'CRITICAL'
          WHEN slot_count > 5 THEN 'WARNING' 
          ELSE 'OK' END),
    ('active_connections', active_connections::bigint, 'count', now(),
     CASE WHEN active_connections = 0 THEN 'WARNING'
          WHEN active_connections > 100 THEN 'WARNING'
          ELSE 'OK' END),
    ('replication_delay_ms', 
     EXTRACT(EPOCH FROM replication_delay)::bigint * 1000, 
     'milliseconds', now(),
     CASE WHEN replication_delay > interval '5 seconds' THEN 'CRITICAL'
          WHEN replication_delay > interval '1 second' THEN 'WARNING'
          ELSE 'OK' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get detailed replication slot information
CREATE OR REPLACE FUNCTION get_realtime_slot_details()
RETURNS TABLE(
  slot_name text,
  slot_type text,
  active boolean,
  wal_lag_bytes bigint,
  confirmed_flush_lsn pg_lsn,
  restart_lsn pg_lsn
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rs.slot_name::text,
    rs.slot_type::text,
    rs.active,
    COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), rs.confirmed_flush_lsn), 0) as wal_lag_bytes,
    rs.confirmed_flush_lsn,
    rs.restart_lsn
  FROM pg_replication_slots rs
  WHERE rs.slot_name LIKE 'supabase_realtime%'
  ORDER BY rs.slot_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to monitor table-specific realtime activity
CREATE OR REPLACE FUNCTION get_table_realtime_activity()
RETURNS TABLE(
  table_name text,
  total_changes bigint,
  recent_changes bigint,
  avg_change_size numeric,
  last_change_time timestamp
) AS $$
BEGIN
  -- Note: This function provides estimated metrics based on pg_stat_user_tables
  -- For precise realtime metrics, you'd need to implement custom tracking
  
  RETURN QUERY
  SELECT 
    schemaname || '.' || relname as table_name,
    n_tup_ins + n_tup_upd + n_tup_del as total_changes,
    -- Estimate recent changes (this is approximate)
    CASE 
      WHEN last_autoanalyze > now() - interval '1 hour' 
      THEN (n_tup_ins + n_tup_upd + n_tup_del) / 10
      ELSE 0
    END as recent_changes,
    -- Average tuple size estimate
    CASE 
      WHEN n_live_tup > 0 
      THEN pg_total_relation_size(schemaname||'.'||relname)::numeric / n_live_tup
      ELSE 0
    END as avg_change_size,
    GREATEST(last_vacuum, last_autovacuum, last_analyze, last_autoanalyze) as last_change_time
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  AND relname IN ('art', 'bids', 'votes', 'round_contestants')
  ORDER BY total_changes DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check realtime health status
CREATE OR REPLACE FUNCTION check_realtime_health()
RETURNS TABLE(
  component text,
  status text,
  message text,
  check_time timestamp
) AS $$
DECLARE
  wal_lag bigint;
  active_slots int;
  replication_delay interval;
BEGIN
  -- Get current metrics
  SELECT metric_value INTO wal_lag 
  FROM get_realtime_queue_stats() 
  WHERE metric_name = 'wal_lag_bytes';
  
  SELECT metric_value INTO active_slots 
  FROM get_realtime_queue_stats() 
  WHERE metric_name = 'active_slots';

  -- WAL lag check
  RETURN QUERY VALUES
    ('wal_replication', 
     CASE WHEN wal_lag > 10485760 THEN 'CRITICAL'
          WHEN wal_lag > 1048576 THEN 'WARNING'
          ELSE 'HEALTHY' END,
     'WAL lag: ' || pg_size_pretty(wal_lag),
     now());

  -- Replication slots check  
  RETURN QUERY VALUES
    ('replication_slots',
     CASE WHEN active_slots = 0 THEN 'CRITICAL'
          WHEN active_slots > 5 THEN 'WARNING'
          ELSE 'HEALTHY' END,
     'Active slots: ' || active_slots::text,
     now());

  -- Database connection check
  RETURN QUERY VALUES
    ('database_connections',
     CASE WHEN (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') > 200 THEN 'WARNING'
          ELSE 'HEALTHY' END,
     'Active connections: ' || (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::text,
     now());

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_realtime_queue_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_realtime_slot_details() TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_realtime_activity() TO authenticated;
GRANT EXECUTE ON FUNCTION check_realtime_health() TO authenticated;

-- Create a view for easy monitoring
CREATE OR REPLACE VIEW realtime_monitoring_dashboard AS
SELECT 
  'Queue Stats' as category,
  metric_name,
  metric_value::text || ' ' || metric_unit as value,
  status,
  last_updated
FROM get_realtime_queue_stats()
UNION ALL
SELECT 
  'Health Check' as category,
  component as metric_name,
  message as value,
  status,
  check_time as last_updated  
FROM check_realtime_health()
ORDER BY category, metric_name;

-- Grant access to the view
GRANT SELECT ON realtime_monitoring_dashboard TO authenticated;