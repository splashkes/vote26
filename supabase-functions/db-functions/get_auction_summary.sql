                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_auction_summary(p_event_id uuid)+
  RETURNS jsonb                                                        +
  LANGUAGE plpgsql                                                     +
 AS $function$                                                         +
 DECLARE                                                               +
   v_summary JSONB;                                                    +
 BEGIN                                                                 +
   WITH bid_stats AS (                                                 +
     SELECT                                                            +
       COUNT(DISTINCT b.id) as total_bids,                             +
       COUNT(DISTINCT b.person_id) as unique_bidders,                  +
       COUNT(DISTINCT b.art_id) as artworks_with_bids,                 +
       MAX(b.amount) as highest_bid_amount                             +
     FROM bids b                                                       +
     JOIN art a ON b.art_id = a.id                                     +
     WHERE a.event_id = p_event_id                                     +
   ),                                                                  +
   current_values AS (                                                 +
     SELECT SUM(max_bid) as total_current_value                        +
     FROM (                                                            +
       SELECT MAX(b.amount) as max_bid                                 +
       FROM bids b                                                     +
       JOIN art a ON b.art_id = a.id                                   +
       WHERE a.event_id = p_event_id                                   +
       GROUP BY a.id                                                   +
     ) max_bids                                                        +
   ),                                                                  +
   top_bids AS (                                                       +
     SELECT jsonb_agg(                                                 +
       jsonb_build_object(                                             +
         'art_code', art_code,                                         +
         'artist_name', artist_name,                                   +
         'current_bid', current_bid                                    +
       ) ORDER BY current_bid DESC                                     +
     ) as top_artworks                                                 +
     FROM (                                                            +
       SELECT DISTINCT ON (a.id)                                       +
         a.art_code,                                                   +
         ap.name as artist_name,                                       +
         b.amount as current_bid                                       +
       FROM art a                                                      +
       JOIN artist_profiles ap ON a.artist_id = ap.id                  +
       JOIN bids b ON b.art_id = a.id                                  +
       WHERE a.event_id = p_event_id                                   +
       ORDER BY a.id, b.amount DESC                                    +
       LIMIT 5                                                         +
     ) top                                                             +
   )                                                                   +
   SELECT jsonb_build_object(                                          +
     'total_bids', COALESCE(bs.total_bids, 0),                         +
     'unique_bidders', COALESCE(bs.unique_bidders, 0),                 +
     'artworks_with_bids', COALESCE(bs.artworks_with_bids, 0),         +
     'highest_bid', COALESCE(bs.highest_bid_amount, 0),                +
     'total_value', COALESCE(cv.total_current_value, 0),               +
     'top_artworks', COALESCE(tb.top_artworks, '[]'::jsonb)            +
   ) INTO v_summary                                                    +
   FROM bid_stats bs                                                   +
   CROSS JOIN current_values cv                                        +
   CROSS JOIN top_bids tb;                                             +
                                                                       +
   RETURN v_summary;                                                   +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

