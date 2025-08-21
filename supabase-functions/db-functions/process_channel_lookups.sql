                                     pg_get_functiondef                                      
---------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_channel_lookups()                                +
  RETURNS TABLE(notification_id uuid, channel_name character varying, lookup_needed boolean)+
  LANGUAGE plpgsql                                                                          +
 AS $function$                                                                              +
 BEGIN                                                                                      +
   RETURN QUERY                                                                             +
   SELECT                                                                                   +
     id,                                                                                    +
     payload->>'channel_name',                                                              +
     true                                                                                   +
   FROM slack_notifications                                                                 +
   WHERE status = 'pending_lookup'                                                          +
     AND payload ? 'channel_name'                                                           +
   LIMIT 10;                                                                                +
 END;                                                                                       +
 $function$                                                                                 +
 
(1 row)

