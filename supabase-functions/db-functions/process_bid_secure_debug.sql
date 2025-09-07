                                         pg_get_functiondef                                          
-----------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_bid_secure_debug(p_art_id text, p_amount numeric)        +
  RETURNS jsonb                                                                                     +
  LANGUAGE plpgsql                                                                                  +
  SECURITY DEFINER                                                                                  +
 AS $function$                                                                                      +
 BEGIN                                                                                              +
   -- Log the input parameters                                                                      +
   RAISE WARNING 'DEBUG: process_bid_secure called with p_art_id=%, p_amount=%', p_art_id, p_amount;+
                                                                                                    +
   -- Check if art exists                                                                           +
   IF NOT EXISTS (SELECT 1 FROM art WHERE art_code = p_art_id) THEN                                 +
     RAISE WARNING 'DEBUG: Art not found with art_code=%', p_art_id;                                +
     RETURN jsonb_build_object(                                                                     +
       'success', false,                                                                            +
       'error', format('Art not found: %', p_art_id)                                                +
     );                                                                                             +
   END IF;                                                                                          +
                                                                                                    +
   -- Call the actual function                                                                      +
   RETURN process_bid_secure(p_art_id, p_amount);                                                   +
 END;                                                                                               +
 $function$                                                                                         +
 
(1 row)

