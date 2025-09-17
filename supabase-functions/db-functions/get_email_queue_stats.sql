                                     pg_get_functiondef                                     
--------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_email_queue_stats(p_event_eid text)                 +
  RETURNS TABLE(status text, count bigint, event_eid text, event_name text, city_name text)+
  LANGUAGE plpgsql                                                                         +
  SECURITY DEFINER                                                                         +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                          +
 AS $function$                                                                             +
  BEGIN                                                                                    +
      RETURN QUERY                                                                         +
      SELECT                                                                               +
          COALESCE(eq.status, 'none'::TEXT) as status,                                     +
          COALESCE(COUNT(eq.id), 0) as count,                                              +
          e.eid as event_eid,                                                              +
          e.name as event_name,                                                            +
          c.name as city_name                                                              +
      FROM events e                                                                        +
      LEFT JOIN cities c ON e.city_id = c.id                                               +
      LEFT JOIN artist_payment_email_queue eq ON eq.event_id = e.id                        +
      WHERE e.eid = p_event_eid                                                            +
      GROUP BY eq.status, e.eid, e.name, c.name                                            +
      ORDER BY                                                                             +
          CASE eq.status                                                                   +
              WHEN 'draft' THEN 1                                                          +
              WHEN 'ready_for_review' THEN 2                                               +
              WHEN 'approved' THEN 3                                                       +
              WHEN 'sent' THEN 4                                                           +
              WHEN 'failed' THEN 5                                                         +
              ELSE 6                                                                       +
          END;                                                                             +
  END;                                                                                     +
  $function$                                                                               +
 
(1 row)

