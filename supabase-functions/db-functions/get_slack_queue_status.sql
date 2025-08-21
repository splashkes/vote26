                            pg_get_functiondef                            
--------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_slack_queue_status()              +
  RETURNS jsonb                                                          +
  LANGUAGE plpgsql                                                       +
 AS $function$                                                           +
 DECLARE                                                                 +
   v_status JSONB;                                                       +
 BEGIN                                                                   +
   SELECT jsonb_build_object(                                            +
     'pending', COUNT(*) FILTER (WHERE status = 'pending'),              +
     'sent', COUNT(*) FILTER (WHERE status = 'sent'),                    +
     'failed', COUNT(*) FILTER (WHERE status = 'failed'),                +
     'total', COUNT(*),                                                  +
     'oldest_pending', MIN(created_at) FILTER (WHERE status = 'pending'),+
     'newest_pending', MAX(created_at) FILTER (WHERE status = 'pending') +
   ) INTO v_status                                                       +
   FROM slack_notifications;                                             +
                                                                         +
   RETURN v_status;                                                      +
 END;                                                                    +
 $function$                                                              +
 
(1 row)

