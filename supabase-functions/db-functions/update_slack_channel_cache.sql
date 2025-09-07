                                                                       pg_get_functiondef                                                                       
----------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_slack_channel_cache(p_channel_name character varying, p_channel_id character varying, p_ttl_hours integer DEFAULT 24)+
  RETURNS void                                                                                                                                                 +
  LANGUAGE plpgsql                                                                                                                                             +
  SECURITY DEFINER                                                                                                                                             +
 AS $function$                                                                                                                                                 +
 DECLARE                                                                                                                                                       +
   v_clean_channel VARCHAR;                                                                                                                                    +
 BEGIN                                                                                                                                                         +
   -- Clean the channel name                                                                                                                                   +
   v_clean_channel := LTRIM(p_channel_name, '#');                                                                                                              +
                                                                                                                                                               +
   -- Insert or update the mapping with TTL                                                                                                                    +
   INSERT INTO slack_channels (                                                                                                                                +
     channel_name,                                                                                                                                             +
     channel_id,                                                                                                                                               +
     cache_expires_at,                                                                                                                                         +
     last_api_lookup_at,                                                                                                                                       +
     updated_at,                                                                                                                                               +
     active                                                                                                                                                    +
   )                                                                                                                                                           +
   VALUES (                                                                                                                                                    +
     v_clean_channel,                                                                                                                                          +
     p_channel_id,                                                                                                                                             +
     NOW() + (p_ttl_hours || ' hours')::INTERVAL,                                                                                                              +
     NOW(),                                                                                                                                                    +
     NOW(),                                                                                                                                                    +
     true                                                                                                                                                      +
   )                                                                                                                                                           +
   ON CONFLICT (channel_name)                                                                                                                                  +
   DO UPDATE SET                                                                                                                                               +
     channel_id = EXCLUDED.channel_id,                                                                                                                         +
     cache_expires_at = EXCLUDED.cache_expires_at,                                                                                                             +
     last_api_lookup_at = EXCLUDED.last_api_lookup_at,                                                                                                         +
     updated_at = NOW(),                                                                                                                                       +
     active = true;                                                                                                                                            +
 END;                                                                                                                                                          +
 $function$                                                                                                                                                    +
 
(1 row)

