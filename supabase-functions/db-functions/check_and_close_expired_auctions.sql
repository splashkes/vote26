                                        pg_get_functiondef                                        
--------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.check_and_close_expired_auctions()                            +
  RETURNS jsonb                                                                                  +
  LANGUAGE plpgsql                                                                               +
  SECURITY DEFINER                                                                               +
 AS $function$                                                                                   +
 DECLARE                                                                                         +
   v_artwork RECORD;                                                                             +
   v_closed_count INT := 0;                                                                      +
   v_error_count INT := 0;                                                                       +
   v_result JSONB;                                                                               +
   v_results JSONB[] := ARRAY[]::JSONB[];                                                        +
 BEGIN                                                                                           +
   -- Find all active artworks with expired closing times                                        +
   FOR v_artwork IN                                                                              +
     SELECT                                                                                      +
       art_code,                                                                                 +
       id,                                                                                       +
       closing_time                                                                              +
     FROM art                                                                                    +
     WHERE status = 'active'                                                                     +
     AND closing_time IS NOT NULL                                                                +
     AND closing_time <= NOW()                                                                   +
     ORDER BY closing_time                                                                       +
   LOOP                                                                                          +
     -- Use the existing admin function to close each artwork                                    +
     v_result := admin_update_art_status(                                                        +
       p_art_code := v_artwork.art_code,                                                         +
       p_new_status := 'closed',                                                                 +
       p_admin_phone := 'system-auto-close'                                                      +
     );                                                                                          +
                                                                                                 +
     IF (v_result->>'success')::boolean THEN                                                     +
       v_closed_count := v_closed_count + 1;                                                     +
       v_results := array_append(v_results, v_result);                                           +
       RAISE NOTICE 'Auto-closed auction for % at %', v_artwork.art_code, v_artwork.closing_time;+
     ELSE                                                                                        +
       v_error_count := v_error_count + 1;                                                       +
       RAISE WARNING 'Failed to auto-close %: %', v_artwork.art_code, v_result->>'error';        +
     END IF;                                                                                     +
   END LOOP;                                                                                     +
                                                                                                 +
   RETURN jsonb_build_object(                                                                    +
     'success', true,                                                                            +
     'closed_count', v_closed_count,                                                             +
     'error_count', v_error_count,                                                               +
     'timestamp', NOW(),                                                                         +
     'details', v_results                                                                        +
   );                                                                                            +
 EXCEPTION                                                                                       +
   WHEN OTHERS THEN                                                                              +
     RETURN jsonb_build_object(                                                                  +
       'success', false,                                                                         +
       'error', SQLERRM,                                                                         +
       'closed_count', v_closed_count,                                                           +
       'error_count', v_error_count                                                              +
     );                                                                                          +
 END;                                                                                            +
 $function$                                                                                      +
 
(1 row)

