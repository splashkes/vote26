                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.resolve_slack_channel(p_channel character varying)+
  RETURNS character varying                                                          +
  LANGUAGE plpgsql                                                                   +
 AS $function$                                                                       +
 DECLARE                                                                             +
   v_channel_id VARCHAR;                                                             +
   v_clean_channel VARCHAR;                                                          +
 BEGIN                                                                               +
   -- If it already looks like a channel ID (starts with C, G, or D), return as-is   +
   IF p_channel ~ '^[CGD][0-9A-Z]+$' THEN                                            +
     RETURN p_channel;                                                               +
   END IF;                                                                           +
                                                                                     +
   -- Clean the channel name                                                         +
   v_clean_channel := LTRIM(p_channel, '#');                                         +
                                                                                     +
   -- Look up the channel ID from cache                                              +
   SELECT channel_id INTO v_channel_id                                               +
   FROM slack_channels                                                               +
   WHERE channel_name = v_clean_channel                                              +
     AND active = true                                                               +
     -- Only use entries that look like real Slack IDs                               +
     AND channel_id ~ '^[CGD][0-9A-Z]{8,}$'                                          +
   LIMIT 1;                                                                          +
                                                                                     +
   -- Return the ID if found, otherwise return NULL to trigger API lookup            +
   RETURN v_channel_id;                                                              +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

