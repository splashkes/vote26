                                  pg_get_functiondef                                   
---------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_voting_leaders(p_event_id uuid)                +
  RETURNS jsonb                                                                       +
  LANGUAGE plpgsql                                                                    +
 AS $function$                                                                        +
  BEGIN                                                                               +
    RETURN (                                                                          +
      SELECT jsonb_agg(                                                               +
        jsonb_build_object(                                                           +
          'type', 'mrkdwn',                                                           +
          'text', format('%s. *%s* - %s votes',                                       +
            row_num,                                                                  +
            artist_name,                                                              +
            vote_count                                                                +
          )                                                                           +
        )                                                                             +
      )                                                                               +
      FROM (                                                                          +
        SELECT                                                                        +
          ROW_NUMBER() OVER (ORDER BY COUNT(v.id) DESC) as row_num,                   +
          ap.name as artist_name,                                                     +
          COUNT(v.id) as vote_count                                                   +
        FROM art a                                                                    +
        JOIN artist_profiles ap ON a.artist_id = ap.id                                +
        LEFT JOIN votes v ON v.art_id = a.art_code  -- Changed from a.id to a.art_code+
        WHERE a.event_id = p_event_id                                                 +
          AND a.round = (                                                             +
            SELECT current_round                                                      +
            FROM events                                                               +
            WHERE id = p_event_id                                                     +
          )                                                                           +
        GROUP BY ap.id, ap.name                                                       +
        ORDER BY vote_count DESC                                                      +
        LIMIT 5                                                                       +
      ) leaders                                                                       +
    );                                                                                +
  END;                                                                                +
  $function$                                                                          +
 
(1 row)

