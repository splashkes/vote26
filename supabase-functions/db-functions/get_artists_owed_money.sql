                                                                       pg_get_functiondef                                                                        
-----------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artists_owed_money()                                                                                                     +
  RETURNS TABLE(artist_id uuid, artist_name text, artist_email text, artist_phone text, artist_entry_id integer, artist_country text, estimated_balance numeric)+
  LANGUAGE sql                                                                                                                                                  +
  SECURITY DEFINER                                                                                                                                              +
  SET search_path TO 'public'                                                                                                                                   +
 AS $function$                                                                                                                                                  +
   WITH art_sales AS (                                                                                                                                          +
     SELECT                                                                                                                                                     +
       ap.id as artist_id,                                                                                                                                      +
       SUM(COALESCE(a.final_price, a.current_bid, 0) * 0.5) as sales_total                                                                                      +
     FROM art a                                                                                                                                                 +
     JOIN artist_profiles ap ON a.artist_id = ap.id                                                                                                             +
     WHERE a.status IN ('sold', 'paid', 'closed')                                                                                                               +
       AND COALESCE(a.final_price, a.current_bid, 0) > 0                                                                                                        +
     GROUP BY ap.id                                                                                                                                             +
   ),                                                                                                                                                           +
   payment_debits AS (                                                                                                                                          +
     SELECT                                                                                                                                                     +
       ap.artist_profile_id,                                                                                                                                    +
       SUM(ap.gross_amount) as debits_total                                                                                                                     +
     FROM artist_payments ap                                                                                                                                    +
     WHERE ap.status IN ('completed', 'paid')                                                                                                                   +
     GROUP BY ap.artist_profile_id                                                                                                                              +
   )                                                                                                                                                            +
   SELECT                                                                                                                                                       +
     ap.id as artist_id,                                                                                                                                        +
     ap.name as artist_name,                                                                                                                                    +
     ap.email as artist_email,                                                                                                                                  +
     ap.phone as artist_phone,                                                                                                                                  +
     ap.entry_id as artist_entry_id,                                                                                                                            +
     ap.country as artist_country,                                                                                                                              +
     GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) as estimated_balance                                                           +
   FROM artist_profiles ap                                                                                                                                      +
   LEFT JOIN art_sales asales ON ap.id = asales.artist_id                                                                                                       +
   LEFT JOIN payment_debits pd ON ap.id = pd.artist_profile_id                                                                                                  +
   WHERE GREATEST(0, COALESCE(asales.sales_total, 0) - COALESCE(pd.debits_total, 0)) > 0.01                                                                     +
   ORDER BY estimated_balance DESC;                                                                                                                             +
 $function$                                                                                                                                                     +
 
(1 row)

