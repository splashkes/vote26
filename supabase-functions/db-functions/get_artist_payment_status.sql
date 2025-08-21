                                                                                        pg_get_functiondef                                                                                         
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artist_payment_status(p_art_id uuid)                                                                                                                       +
  RETURNS TABLE(payment_status text, gross_amount numeric, net_amount numeric, currency character varying, paid_at timestamp with time zone, has_buyer_payment boolean, buyer_payment_status text)+
  LANGUAGE plpgsql                                                                                                                                                                                +
 AS $function$                                                                                                                                                                                    +
 BEGIN                                                                                                                                                                                            +
     RETURN QUERY                                                                                                                                                                                 +
     SELECT                                                                                                                                                                                       +
         COALESCE(ap.status, 'no_payment') as payment_status,                                                                                                                                     +
         ap.gross_amount,                                                                                                                                                                         +
         ap.net_amount,                                                                                                                                                                           +
         ap.currency,                                                                                                                                                                             +
         ap.paid_at,                                                                                                                                                                              +
         (pp.id IS NOT NULL) as has_buyer_payment,                                                                                                                                                +
         pp.status as buyer_payment_status                                                                                                                                                        +
     FROM art a                                                                                                                                                                                   +
     LEFT JOIN artist_payments ap ON ap.art_id = a.id                                                                                                                                             +
     LEFT JOIN payment_processing pp ON pp.art_id = a.id AND pp.status = 'completed'                                                                                                              +
     WHERE a.id = p_art_id;                                                                                                                                                                       +
 END;                                                                                                                                                                                             +
 $function$                                                                                                                                                                                       +
 
(1 row)

