                                                   pg_get_functiondef                                                    
-------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cache_slack_channel(p_channel_name character varying, p_channel_id character varying)+
  RETURNS void                                                                                                          +
  LANGUAGE plpgsql                                                                                                      +
 AS $function$                                                                                                          +
  BEGIN                                                                                                                 +
    -- Clean the channel name                                                                                           +
    p_channel_name := LTRIM(p_channel_name, '#');                                                                       +
                                                                                                                        +
    -- Insert or update the mapping                                                                                     +
    INSERT INTO slack_channels (channel_name, channel_id, updated_at)                                                   +
    VALUES (p_channel_name, p_channel_id, NOW())                                                                        +
    ON CONFLICT (channel_name)                                                                                          +
    DO UPDATE SET                                                                                                       +
      channel_id = EXCLUDED.channel_id,                                                                                 +
      updated_at = NOW(),                                                                                               +
      active = true;                                                                                                    +
  END;                                                                                                                  +
  $function$                                                                                                            +
 
(1 row)

