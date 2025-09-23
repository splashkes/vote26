                                                                          pg_get_functiondef                                                                          
----------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.complete_stripe_payment_with_race_check(p_session_id text, p_payment_intent_id text, p_payment_method text DEFAULT 'stripe'::text)+
  RETURNS jsonb                                                                                                                                                      +
  LANGUAGE plpgsql                                                                                                                                                   +
  SECURITY DEFINER                                                                                                                                                   +
 AS $function$                                                                                                                                                       +
 DECLARE                                                                                                                                                             +
   v_payment RECORD;                                                                                                                                                 +
   v_art_status TEXT;                                                                                                                                                +
   v_art_winner_id UUID;                                                                                                                                             +
   v_race_result TEXT := 'won';                                                                                                                                      +
   v_offer_record RECORD;                                                                                                                                            +
   v_result JSONB;                                                                                                                                                   +
 BEGIN                                                                                                                                                               +
   -- Find the payment record first                                                                                                                                  +
   SELECT * INTO v_payment                                                                                                                                           +
   FROM payment_processing                                                                                                                                           +
   WHERE stripe_checkout_session_id = p_session_id                                                                                                                   +
   AND status IN ('pending', 'processing');                                                                                                                          +
                                                                                                                                                                     +
   IF NOT FOUND THEN                                                                                                                                                 +
     RETURN jsonb_build_object(                                                                                                                                      +
       'success', false,                                                                                                                                             +
       'error', 'Payment session not found or already processed',                                                                                                    +
       'race_result', 'invalid_session'                                                                                                                              +
     );                                                                                                                                                              +
   END IF;                                                                                                                                                           +
                                                                                                                                                                     +
   -- ATOMIC CHECK: Lock the artwork and check if it's still available for payment                                                                                   +
   SELECT status, winner_id INTO v_art_status, v_art_winner_id                                                                                                       +
   FROM public.art                                                                                                                                                   +
   WHERE id = v_payment.art_id                                                                                                                                       +
   FOR UPDATE; -- This prevents race conditions                                                                                                                      +
                                                                                                                                                                     +
   -- Check if artwork is already paid for                                                                                                                           +
   IF v_art_status = 'paid' THEN                                                                                                                                     +
     -- Someone else already won the race                                                                                                                            +
     v_race_result := 'lost';                                                                                                                                        +
                                                                                                                                                                     +
     -- Update this payment as failed due to race loss                                                                                                               +
     UPDATE payment_processing                                                                                                                                       +
     SET                                                                                                                                                             +
       status = 'failed',                                                                                                                                            +
       error_message = 'Artwork already purchased by another bidder',                                                                                                +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'race_result', 'lost',                                                                                                                                      +
         'failed_at', NOW(),                                                                                                                                         +
         'reason', 'payment_race_lost'                                                                                                                               +
       )                                                                                                                                                             +
     WHERE stripe_checkout_session_id = p_session_id;                                                                                                                +
                                                                                                                                                                     +
     -- Mark any related offers as overtaken                                                                                                                         +
     UPDATE artwork_offers                                                                                                                                           +
     SET                                                                                                                                                             +
       status = 'overtaken',                                                                                                                                         +
       updated_at = NOW(),                                                                                                                                           +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'overtaken_at', NOW(),                                                                                                                                      +
         'overtaken_reason', 'another_bidder_paid_first'                                                                                                             +
       )                                                                                                                                                             +
     WHERE art_id = v_payment.art_id                                                                                                                                 +
     AND status = 'pending';                                                                                                                                         +
                                                                                                                                                                     +
     RETURN jsonb_build_object(                                                                                                                                      +
       'success', false,                                                                                                                                             +
       'error', 'Payment race lost - artwork already purchased',                                                                                                     +
       'race_result', 'lost',                                                                                                                                        +
       'art_id', v_payment.art_id                                                                                                                                    +
     );                                                                                                                                                              +
   END IF;                                                                                                                                                           +
                                                                                                                                                                     +
   -- Check if artwork is in valid state for payment                                                                                                                 +
   IF v_art_status NOT IN ('sold', 'closed') THEN                                                                                                                    +
     UPDATE payment_processing                                                                                                                                       +
     SET                                                                                                                                                             +
       status = 'failed',                                                                                                                                            +
       error_message = 'Artwork not available for payment',                                                                                                          +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'failed_at', NOW(),                                                                                                                                         +
         'artwork_status', v_art_status                                                                                                                              +
       )                                                                                                                                                             +
     WHERE stripe_checkout_session_id = p_session_id;                                                                                                                +
                                                                                                                                                                     +
     RETURN jsonb_build_object(                                                                                                                                      +
       'success', false,                                                                                                                                             +
       'error', 'Artwork not available for payment',                                                                                                                 +
       'race_result', 'invalid_state',                                                                                                                               +
       'artwork_status', v_art_status                                                                                                                                +
     );                                                                                                                                                              +
   END IF;                                                                                                                                                           +
                                                                                                                                                                     +
   -- WINNER! Update payment record as completed                                                                                                                     +
   UPDATE payment_processing                                                                                                                                         +
   SET                                                                                                                                                               +
     status = 'completed',                                                                                                                                           +
     stripe_payment_intent_id = p_payment_intent_id,                                                                                                                 +
     payment_method = p_payment_method,                                                                                                                              +
     completed_at = NOW(),                                                                                                                                           +
     metadata = metadata || jsonb_build_object(                                                                                                                      +
       'completed_via', 'stripe_webhook',                                                                                                                            +
       'completed_at', NOW(),                                                                                                                                        +
       'race_result', 'won'                                                                                                                                          +
     )                                                                                                                                                               +
   WHERE stripe_checkout_session_id = p_session_id                                                                                                                   +
   RETURNING * INTO v_payment;                                                                                                                                       +
                                                                                                                                                                     +
   -- Update artwork status to paid and set winner                                                                                                                   +
   UPDATE public.art                                                                                                                                                 +
   SET                                                                                                                                                               +
     status = 'paid',                                                                                                                                                +
     winner_id = v_payment.person_id,                                                                                                                                +
     buyer_pay_recent_date = NOW(),                                                                                                                                  +
     -- If this was an offer payment, update the current_bid to reflect actual paid amount                                                                           +
     current_bid = CASE                                                                                                                                              +
       WHEN (v_payment.metadata->>'payment_reason') = 'artwork_offer'                                                                                                +
       THEN v_payment.amount                                                                                                                                         +
       ELSE current_bid                                                                                                                                              +
     END                                                                                                                                                             +
   WHERE id = v_payment.art_id;                                                                                                                                      +
                                                                                                                                                                     +
   -- Handle offer-related cleanup                                                                                                                                   +
   IF (v_payment.metadata->>'payment_reason') = 'artwork_offer' THEN                                                                                                 +
     -- Mark the specific offer as paid                                                                                                                              +
     UPDATE artwork_offers                                                                                                                                           +
     SET                                                                                                                                                             +
       status = 'paid',                                                                                                                                              +
       updated_at = NOW(),                                                                                                                                           +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'paid_at', NOW(),                                                                                                                                           +
         'payment_session_id', p_session_id,                                                                                                                         +
         'payment_amount', v_payment.amount_with_tax                                                                                                                 +
       )                                                                                                                                                             +
     WHERE art_id = v_payment.art_id                                                                                                                                 +
     AND offered_to_person_id = v_payment.person_id                                                                                                                  +
     AND status = 'pending';                                                                                                                                         +
                                                                                                                                                                     +
     -- Mark any other competing offers as overtaken                                                                                                                 +
     UPDATE artwork_offers                                                                                                                                           +
     SET                                                                                                                                                             +
       status = 'overtaken',                                                                                                                                         +
       updated_at = NOW(),                                                                                                                                           +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'overtaken_at', NOW(),                                                                                                                                      +
         'overtaken_by', 'offer_payment',                                                                                                                            +
         'winning_person_id', v_payment.person_id                                                                                                                    +
       )                                                                                                                                                             +
     WHERE art_id = v_payment.art_id                                                                                                                                 +
     AND offered_to_person_id != v_payment.person_id                                                                                                                 +
     AND status = 'pending';                                                                                                                                         +
                                                                                                                                                                     +
   ELSE                                                                                                                                                              +
     -- This was a normal winner payment - mark all pending offers as overtaken                                                                                      +
     UPDATE artwork_offers                                                                                                                                           +
     SET                                                                                                                                                             +
       status = 'overtaken',                                                                                                                                         +
       updated_at = NOW(),                                                                                                                                           +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'overtaken_at', NOW(),                                                                                                                                      +
         'overtaken_by', 'winner_payment',                                                                                                                           +
         'winning_person_id', v_payment.person_id                                                                                                                    +
       )                                                                                                                                                             +
     WHERE art_id = v_payment.art_id                                                                                                                                 +
     AND status = 'pending';                                                                                                                                         +
   END IF;                                                                                                                                                           +
                                                                                                                                                                     +
   -- Broadcast the payment completion for real-time updates                                                                                                         +
   PERFORM pg_notify('payment_completed', jsonb_build_object(                                                                                                        +
     'art_id', v_payment.art_id,                                                                                                                                     +
     'person_id', v_payment.person_id,                                                                                                                               +
     'amount', v_payment.amount_with_tax,                                                                                                                            +
     'payment_reason', v_payment.metadata->>'payment_reason',                                                                                                        +
     'race_result', 'won'                                                                                                                                            +
   )::text);                                                                                                                                                         +
                                                                                                                                                                     +
   -- Return success                                                                                                                                                 +
   RETURN jsonb_build_object(                                                                                                                                        +
     'success', true,                                                                                                                                                +
     'race_result', 'won',                                                                                                                                           +
     'art_id', v_payment.art_id,                                                                                                                                     +
     'person_id', v_payment.person_id,                                                                                                                               +
     'amount', v_payment.amount_with_tax,                                                                                                                            +
     'currency', v_payment.currency,                                                                                                                                 +
     'payment_reason', v_payment.metadata->>'payment_reason',                                                                                                        +
     'completed_at', v_payment.completed_at                                                                                                                          +
   );                                                                                                                                                                +
                                                                                                                                                                     +
 EXCEPTION                                                                                                                                                           +
   WHEN OTHERS THEN                                                                                                                                                  +
     -- Log the error and return failure                                                                                                                             +
     UPDATE payment_processing                                                                                                                                       +
     SET                                                                                                                                                             +
       status = 'failed',                                                                                                                                            +
       error_message = SQLERRM,                                                                                                                                      +
       metadata = metadata || jsonb_build_object(                                                                                                                    +
         'failed_at', NOW(),                                                                                                                                         +
         'error_code', SQLSTATE,                                                                                                                                     +
         'error_message', SQLERRM                                                                                                                                    +
       )                                                                                                                                                             +
     WHERE stripe_checkout_session_id = p_session_id;                                                                                                                +
                                                                                                                                                                     +
     RETURN jsonb_build_object(                                                                                                                                      +
       'success', false,                                                                                                                                             +
       'error', 'Payment processing failed',                                                                                                                         +
       'details', SQLERRM,                                                                                                                                           +
       'race_result', 'error'                                                                                                                                        +
     );                                                                                                                                                              +
 END;                                                                                                                                                                +
 $function$                                                                                                                                                          +
 
(1 row)

