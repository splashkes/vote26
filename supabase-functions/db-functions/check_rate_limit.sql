                                                           pg_get_functiondef                                                           
----------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_rate_limit(function_name text, max_calls integer DEFAULT 10, window_minutes integer DEFAULT 1)+
  RETURNS boolean                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                     +
  SECURITY DEFINER                                                                                                                     +
  SET search_path TO 'public'                                                                                                          +
 AS $function$                                                                                                                         +
  DECLARE                                                                                                                              +
      current_calls integer;                                                                                                           +
      window_start timestamptz := NOW() - (window_minutes || ' minutes')::INTERVAL;                                                    +
  BEGIN                                                                                                                                +
      -- Get current call count for this user/function in the time window                                                              +
      SELECT COALESCE(SUM(call_count), 0) INTO current_calls                                                                           +
      FROM rpc_rate_limits                                                                                                             +
      WHERE user_id = auth.uid()                                                                                                       +
      AND function_name = check_rate_limit.function_name                                                                               +
      AND created_at >= window_start;                                                                                                  +
                                                                                                                                       +
      -- If limit exceeded, reject                                                                                                     +
      IF current_calls >= max_calls THEN                                                                                               +
          RAISE EXCEPTION 'Rate limit exceeded for function %. Try again in % minutes.',                                               +
              function_name, window_minutes;                                                                                           +
      END IF;                                                                                                                          +
                                                                                                                                       +
      -- Log this call                                                                                                                 +
      INSERT INTO rpc_rate_limits (user_id, function_name)                                                                             +
      VALUES (auth.uid(), function_name);                                                                                              +
                                                                                                                                       +
      RETURN true;                                                                                                                     +
  END;                                                                                                                                 +
  $function$                                                                                                                           +
 
(1 row)

