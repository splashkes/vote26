                                                   pg_get_functiondef                                                    
-------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_detailed_slack_queue_status()                                                    +
  RETURNS jsonb                                                                                                         +
  LANGUAGE plpgsql                                                                                                      +
 AS $function$                                                                                                          +
  DECLARE                                                                                                               +
      v_stats JSONB;                                                                                                    +
      v_recent_activity JSONB;                                                                                          +
  BEGIN                                                                                                                 +
      -- Get overall statistics                                                                                         +
      SELECT jsonb_build_object(                                                                                        +
          'pending', COUNT(*) FILTER (WHERE status = 'pending'),                                                        +
          'pending_lookup', COUNT(*) FILTER (WHERE status = 'pending_lookup'),                                          +
          'sent', COUNT(*) FILTER (WHERE status = 'sent'),                                                              +
          'failed', COUNT(*) FILTER (WHERE status = 'failed'),                                                          +
          'total', COUNT(*),                                                                                            +
          'oldest_pending', MIN(created_at) FILTER (WHERE status = 'pending'),                                          +
          'newest_pending', MAX(created_at) FILTER (WHERE status = 'pending')                                           +
      ) INTO v_stats                                                                                                    +
      FROM slack_notifications;                                                                                         +
                                                                                                                        +
      -- Get recent activity (last hour)                                                                                +
      SELECT jsonb_build_object(                                                                                        +
          'last_hour_processed', COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '1 hour'),                           +
          'last_hour_failed', COUNT(*) FILTER (WHERE status = 'failed' AND last_attempt_at > NOW() - INTERVAL '1 hour'),+
          'recent_message_types', jsonb_agg(DISTINCT message_type) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')+
      ) INTO v_recent_activity                                                                                          +
      FROM slack_notifications;                                                                                         +
                                                                                                                        +
      RETURN v_stats || v_recent_activity;                                                                              +
  END;                                                                                                                  +
  $function$                                                                                                            +
 
(1 row)

