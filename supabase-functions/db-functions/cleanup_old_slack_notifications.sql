                                          pg_get_functiondef                                          
------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cleanup_old_slack_notifications(days_to_keep integer DEFAULT 7)   +
  RETURNS integer                                                                                    +
  LANGUAGE plpgsql                                                                                   +
  SECURITY DEFINER                                                                                   +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                    +
 AS $function$                                                                                       +
  DECLARE                                                                                            +
      v_deleted_count INTEGER;                                                                       +
  BEGIN                                                                                              +
      DELETE FROM slack_notifications                                                                +
      WHERE status IN ('sent', 'failed')                                                             +
      AND (sent_at < NOW() - INTERVAL '%s days' OR last_attempt_at < NOW() - INTERVAL '%s days');    +
                                                                                                     +
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;                                                   +
                                                                                                     +
      RAISE NOTICE 'Cleaned up % old notifications older than % days', v_deleted_count, days_to_keep;+
                                                                                                     +
      RETURN v_deleted_count;                                                                        +
  END;                                                                                               +
  $function$                                                                                         +
 
(1 row)

