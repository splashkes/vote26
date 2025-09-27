                                                                       pg_get_functiondef                                                                        
-----------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artists_owed_money()                                                                                                     +
  RETURNS TABLE(artist_id uuid, artist_name text, artist_email text, artist_phone text, artist_entry_id integer, artist_country text, estimated_balance numeric)+
  LANGUAGE plpgsql                                                                                                                                              +
 AS $function$                                                                                                                                                  +
 BEGIN                                                                                                                                                          +
   RETURN QUERY                                                                                                                                                 +
   WITH art_sales AS (                                                                                                                                          +
     SELECT                                                                                                                                                     +
       ap.id as artist_id,                                                                                                                                      +
       SUM(COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion) as sales_total                                                                 +
     FROM art a                                                                                                                                                 +
     JOIN artist_profiles ap ON a.artist_id = ap.id                                                                                                             +
     JOIN events e ON a.event_id = e.id                                                                                                                         +
     WHERE a.status IN ('sold', 'paid', 'closed')                                                                                                               +
       AND COALESCE(a.final_price, a.current_bid, 0) > 0                                                                                                        +
     GROUP BY ap.id                                                                                                                                             +
   ),                                                                                                                                                           +
   payment_debits AS (                                                                                                                                          +
     SELECT                                                                                                                                                     +
       ap.artist_profile_id,                                                                                                                                    +
       SUM(ap.gross_amount) as debits_total                                                                                                                     +
     FROM artist_payments ap                                                                                                                                    +
     WHERE ap.status IN ('paid', 'verified')                                                                                                                    +
     GROUP BY ap.artist_profile_id                                                                                                                              +
   )                                                                                                                                                            +
   SELECT                                                                                                                                                       +
     ap.id::UUID,                                                                                                                                               +
     ap.name::TEXT,                                                                                                                                             +
     ap.email::TEXT,                                                                                                                                            +
     ap.phone::TEXT,                                                                                                                                            +
     ap.entry_id::INTEGER,                                                                                                                                      +
     ap.country::TEXT,                                                                                                                                          +
     (COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0))::NUMERIC                                                                                  +
   FROM artist_profiles ap                                                                                                                                      +
   LEFT JOIN art_sales asales ON ap.id = asales.artist_id                                                                                                       +
   LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id                                                                                                  +
   -- CHANGED: Show any balance != 0 (including negative balances)                                                                                              +
   WHERE (COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) != 0                                                                                  +
   ORDER BY (COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) DESC;                                                                              +
 END;                                                                                                                                                           +
 $function$                                                                                                                                                     +
 
(1 row)

