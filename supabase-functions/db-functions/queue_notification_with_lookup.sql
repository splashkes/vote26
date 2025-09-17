                                                                           pg_get_functiondef                                                                           
------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.queue_notification_with_lookup(p_event_id uuid, p_channel_name character varying, p_message_type character varying, p_payload jsonb)+
  RETURNS uuid                                                                                                                                                         +
  LANGUAGE plpgsql                                                                                                                                                     +
  SECURITY DEFINER                                                                                                                                                     +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                      +
 AS $function$                                                                                                                                                         +
  BEGIN                                                                                                                                                                +
    -- Delegate to the new cache-only function                                                                                                                         +
    RETURN queue_notification_with_cache_only(p_event_id, p_channel_name, p_message_type, p_payload);                                                                  +
  END;                                                                                                                                                                 +
  $function$                                                                                                                                                           +
 
(1 row)

