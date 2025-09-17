                                                                                    pg_get_functiondef                                                                                    
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_payment_status(p_art_id uuid)                                                                                                                     +
  RETURNS TABLE(has_payment boolean, payment_status text, payment_method text, amount numeric, currency character varying, completed_at timestamp with time zone, stripe_session_id text)+
  LANGUAGE plpgsql                                                                                                                                                                       +
 AS $function$                                                                                                                                                                           +
  BEGIN                                                                                                                                                                                  +
    RETURN QUERY                                                                                                                                                                         +
    SELECT                                                                                                                                                                               +
      TRUE as has_payment,                                                                                                                                                               +
      pp.status as payment_status,                                                                                                                                                       +
      pp.payment_method,                                                                                                                                                                 +
      pp.amount_with_tax as amount,                                                                                                                                                      +
      pp.currency,                                                                                                                                                                       +
      pp.completed_at,                                                                                                                                                                   +
      pp.stripe_checkout_session_id as stripe_session_id                                                                                                                                 +
    FROM payment_processing pp                                                                                                                                                           +
    WHERE pp.art_id = p_art_id                                                                                                                                                           +
    AND pp.status IN ('completed', 'processing')                                                                                                                                         +
    ORDER BY pp.created_at DESC                                                                                                                                                          +
    LIMIT 1;                                                                                                                                                                             +
                                                                                                                                                                                         +
    -- Return null row if no payment found                                                                                                                                               +
    IF NOT FOUND THEN                                                                                                                                                                    +
      RETURN QUERY                                                                                                                                                                       +
      SELECT                                                                                                                                                                             +
        FALSE as has_payment,                                                                                                                                                            +
        NULL::TEXT as payment_status,                                                                                                                                                    +
        NULL::TEXT as payment_method,                                                                                                                                                    +
        NULL::NUMERIC as amount,                                                                                                                                                         +
        NULL::VARCHAR as currency,                                                                                                                                                       +
        NULL::TIMESTAMPTZ as completed_at,                                                                                                                                               +
        NULL::TEXT as stripe_session_id;                                                                                                                                                 +
    END IF;                                                                                                                                                                              +
  END;                                                                                                                                                                                   +
  $function$                                                                                                                                                                             +
 
(1 row)

