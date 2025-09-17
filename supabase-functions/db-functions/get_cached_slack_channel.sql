                                      pg_get_functiondef                                      
----------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_cached_slack_channel(p_channel_name character varying)+
  RETURNS character varying                                                                  +
  LANGUAGE plpgsql                                                                           +
  SECURITY DEFINER                                                                           +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                            +
 AS $function$                                                                               +
  DECLARE                                                                                    +
    v_channel_id VARCHAR;                                                                    +
    v_clean_channel VARCHAR;                                                                 +
  BEGIN                                                                                      +
    -- Clean the channel name                                                                +
    v_clean_channel := LTRIM(p_channel_name, '#');                                           +
                                                                                             +
    -- If it already looks like a channel ID (starts with C, G, or D), return as-is          +
    IF v_clean_channel ~ '^[CGD][0-9A-Z]+$' THEN                                             +
      RETURN v_clean_channel;                                                                +
    END IF;                                                                                  +
                                                                                             +
    -- Look up the channel ID from cache, only if not expired                                +
    SELECT channel_id INTO v_channel_id                                                      +
    FROM slack_channels                                                                      +
    WHERE channel_name = v_clean_channel                                                     +
      AND active = true                                                                      +
      AND cache_expires_at > NOW()                                                           +
      AND channel_id ~ '^[CGD][0-9A-Z]{8,}$'                                                 +
    LIMIT 1;                                                                                 +
                                                                                             +
    -- Return the ID if found and not expired, otherwise NULL                                +
    RETURN v_channel_id;                                                                     +
  END;                                                                                       +
  $function$                                                                                 +
 
(1 row)

