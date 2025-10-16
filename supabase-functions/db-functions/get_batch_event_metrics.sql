                                                                                  pg_get_functiondef                                                                                  
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_batch_event_metrics(p_eids text[])                                                                                                            +
  RETURNS TABLE(eid text, confirmed_artists_count integer, applied_artists_count integer, ticket_revenue numeric, auction_revenue numeric, total_votes integer, ticket_sales integer)+
  LANGUAGE plpgsql                                                                                                                                                                   +
  STABLE SECURITY DEFINER                                                                                                                                                            +
 AS $function$                                                                                                                                                                       +
 BEGIN                                                                                                                                                                               +
   RETURN QUERY                                                                                                                                                                      +
   WITH event_list AS (                                                                                                                                                              +
     SELECT UNNEST(p_eids) AS eid                                                                                                                                                    +
   ),                                                                                                                                                                                +
   artist_counts AS (                                                                                                                                                                +
     SELECT                                                                                                                                                                          +
       ac.event_eid AS eid,                                                                                                                                                          +
       COUNT(*) FILTER (WHERE ac.confirmation_status = 'confirmed' AND ac.withdrawn_at IS NULL)::INTEGER AS confirmed_count,                                                         +
       COUNT(*)::INTEGER AS applied_count                                                                                                                                            +
     FROM artist_confirmations ac                                                                                                                                                    +
     WHERE ac.event_eid = ANY(p_eids)                                                                                                                                                +
     GROUP BY ac.event_eid                                                                                                                                                           +
   ),                                                                                                                                                                                +
   revenue_data AS (                                                                                                                                                                 +
     SELECT                                                                                                                                                                          +
       eac.eid,                                                                                                                                                                      +
       COALESCE(MAX(eac.ticket_revenue), 0) AS ticket_rev,                                                                                                                           +
       COALESCE(MAX(eac.total_tickets_sold), 0)::INTEGER AS tickets_sold                                                                                                             +
     FROM eventbrite_api_cache eac                                                                                                                                                   +
     WHERE eac.eid = ANY(p_eids)                                                                                                                                                     +
     GROUP BY eac.eid                                                                                                                                                                +
   ),                                                                                                                                                                                +
   auction_data AS (                                                                                                                                                                 +
     SELECT                                                                                                                                                                          +
       e.eid,                                                                                                                                                                        +
       COALESCE(SUM(a.final_price), 0) AS auction_rev                                                                                                                                +
     FROM events e                                                                                                                                                                   +
     LEFT JOIN art a ON a.event_id = e.id AND a.final_price IS NOT NULL AND a.final_price > 0                                                                                        +
     WHERE e.eid = ANY(p_eids)                                                                                                                                                       +
     GROUP BY e.eid                                                                                                                                                                  +
   ),                                                                                                                                                                                +
   vote_data AS (                                                                                                                                                                    +
     SELECT                                                                                                                                                                          +
       v.eid,                                                                                                                                                                        +
       COUNT(*)::INTEGER AS vote_count                                                                                                                                               +
     FROM votes v                                                                                                                                                                    +
     WHERE v.eid = ANY(p_eids)                                                                                                                                                       +
     GROUP BY v.eid                                                                                                                                                                  +
   )                                                                                                                                                                                 +
   SELECT                                                                                                                                                                            +
     el.eid,                                                                                                                                                                         +
     COALESCE(ac.confirmed_count, 0) AS confirmed_artists_count,                                                                                                                     +
     COALESCE(ac.applied_count, 0) AS applied_artists_count,                                                                                                                         +
     COALESCE(rd.ticket_rev, 0) AS ticket_revenue,                                                                                                                                   +
     COALESCE(ad.auction_rev, 0) AS auction_revenue,                                                                                                                                 +
     COALESCE(vd.vote_count, 0) AS total_votes,                                                                                                                                      +
     COALESCE(rd.tickets_sold, 0) AS ticket_sales                                                                                                                                    +
   FROM event_list el                                                                                                                                                                +
   LEFT JOIN artist_counts ac ON el.eid = ac.eid                                                                                                                                     +
   LEFT JOIN revenue_data rd ON el.eid = rd.eid                                                                                                                                      +
   LEFT JOIN auction_data ad ON el.eid = ad.eid                                                                                                                                      +
   LEFT JOIN vote_data vd ON el.eid = vd.eid;                                                                                                                                        +
 END;                                                                                                                                                                                +
 $function$                                                                                                                                                                          +
 
(1 row)

