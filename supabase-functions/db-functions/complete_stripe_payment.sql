                                                                  pg_get_functiondef                                                                  
------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.complete_stripe_payment(p_session_id text, p_payment_intent_id text, p_payment_method text DEFAULT 'stripe'::text)+
  RETURNS jsonb                                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                                   +
  SECURITY DEFINER                                                                                                                                   +
 AS $function$                                                                                                                                       +
 BEGIN                                                                                                                                               +
   -- Call the enhanced version with race checking                                                                                                   +
   RETURN complete_stripe_payment_with_race_check(p_session_id, p_payment_intent_id, p_payment_method);                                              +
 END;                                                                                                                                                +
 $function$                                                                                                                                          +
 
(1 row)

