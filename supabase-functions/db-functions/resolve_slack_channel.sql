                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.resolve_slack_channel(p_channel character varying)+
  RETURNS character varying                                                          +
  LANGUAGE plpgsql                                                                   +
  SECURITY DEFINER                                                                   +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                    +
 AS $function$                                                                       +
  BEGIN                                                                              +
    -- This function now just delegates to the cache-only version                    +
    -- No more synchronous API calls!                                                +
    RETURN get_cached_slack_channel(p_channel);                                      +
  END;                                                                               +
  $function$                                                                         +
 
(1 row)

