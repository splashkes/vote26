                                                                  pg_get_functiondef                                                                  
------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.complete_stripe_payment(p_session_id text, p_payment_intent_id text, p_payment_method text DEFAULT 'stripe'::text)+
  RETURNS jsonb                                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                                   +
  SECURITY DEFINER                                                                                                                                   +
 AS $function$                                                                                                                                       +
 DECLARE                                                                                                                                             +
   v_payment RECORD;                                                                                                                                 +
   v_result JSONB;                                                                                                                                   +
 BEGIN                                                                                                                                               +
   -- Find and update the payment record                                                                                                             +
   UPDATE payment_processing                                                                                                                         +
   SET                                                                                                                                               +
     status = 'completed',                                                                                                                           +
     stripe_payment_intent_id = p_payment_intent_id,                                                                                                 +
     payment_method = p_payment_method,                                                                                                              +
     completed_at = NOW(),                                                                                                                           +
     metadata = metadata || jsonb_build_object(                                                                                                      +
       'completed_via', 'stripe_webhook',                                                                                                            +
       'completed_at', NOW()                                                                                                                         +
     )                                                                                                                                               +
   WHERE stripe_checkout_session_id = p_session_id                                                                                                   +
   AND status IN ('pending', 'processing')                                                                                                           +
   RETURNING * INTO v_payment;                                                                                                                       +
                                                                                                                                                     +
   IF NOT FOUND THEN                                                                                                                                 +
     RETURN jsonb_build_object(                                                                                                                      +
       'success', false,                                                                                                                             +
       'error', 'Payment session not found or already completed'                                                                                     +
     );                                                                                                                                              +
   END IF;                                                                                                                                           +
                                                                                                                                                     +
   -- Update the art status to paid                                                                                                                  +
   UPDATE public.art                                                                                                                                 +
   SET                                                                                                                                               +
     status = 'paid',                                                                                                                                +
     buyer_pay_recent_date = NOW()                                                                                                                   +
   WHERE id = v_payment.art_id;                                                                                                                      +
                                                                                                                                                     +
   -- Return success                                                                                                                                 +
   RETURN jsonb_build_object(                                                                                                                        +
     'success', true,                                                                                                                                +
     'art_id', v_payment.art_id,                                                                                                                     +
     'amount', v_payment.amount_with_tax,                                                                                                            +
     'currency', v_payment.currency                                                                                                                  +
   );                                                                                                                                                +
 END;                                                                                                                                                +
 $function$                                                                                                                                          +
 
(1 row)

