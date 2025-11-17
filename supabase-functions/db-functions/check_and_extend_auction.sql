                            pg_get_functiondef                             
---------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_and_extend_auction(p_art_id uuid)+
  RETURNS jsonb                                                           +
  LANGUAGE plpgsql                                                        +
 AS $function$                                                            +
 DECLARE                                                                  +
   v_closing_time TIMESTAMPTZ;                                            +
   v_extension_count INTEGER;                                             +
   v_time_remaining INTERVAL;                                             +
   v_minutes_remaining NUMERIC;                                           +
 BEGIN                                                                    +
   -- Get current closing time and extension count                        +
   SELECT closing_time, extension_count                                   +
   INTO v_closing_time, v_extension_count                                 +
   FROM art                                                               +
   WHERE id = p_art_id;                                                   +
                                                                          +
   -- If no closing time set, nothing to extend                           +
   IF v_closing_time IS NULL THEN                                         +
     RETURN jsonb_build_object(                                           +
       'extended', false,                                                 +
       'reason', 'no_closing_time'                                        +
     );                                                                   +
   END IF;                                                                +
                                                                          +
   -- Calculate time remaining                                            +
   v_time_remaining := v_closing_time - NOW();                            +
   v_minutes_remaining := EXTRACT(EPOCH FROM v_time_remaining) / 60;      +
                                                                          +
   -- If more than 5 minutes remaining, no extension needed               +
   IF v_minutes_remaining > 5 THEN                                        +
     RETURN jsonb_build_object(                                           +
       'extended', false,                                                 +
       'reason', 'time_remaining_sufficient',                             +
       'minutes_remaining', v_minutes_remaining                           +
     );                                                                   +
   END IF;                                                                +
                                                                          +
   -- Extend the auction by 5 minutes from NOW                            +
   UPDATE art                                                             +
   SET                                                                    +
     closing_time = NOW() + INTERVAL '5 minutes',                         +
     auction_extended = true,                                             +
     extension_count = COALESCE(extension_count, 0) + 1,                  +
     updated_at = NOW()                                                   +
   WHERE id = p_art_id;                                                   +
                                                                          +
   RETURN jsonb_build_object(                                             +
     'extended', true,                                                    +
     'new_closing_time', NOW() + INTERVAL '5 minutes',                    +
     'previous_closing_time', v_closing_time,                             +
     'extension_count', COALESCE(v_extension_count, 0) + 1,               +
     'minutes_remaining_before', v_minutes_remaining                      +
   );                                                                     +
 END;                                                                     +
 $function$                                                               +
 
(1 row)

