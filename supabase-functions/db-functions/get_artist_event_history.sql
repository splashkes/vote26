                                                                               pg_get_functiondef                                                                                
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artist_event_history(artist_profile_id uuid, current_event_id uuid, max_events integer DEFAULT 15)                                       +
  RETURNS TABLE(event_id uuid, event_eid character varying, event_name text, event_date timestamp with time zone, round_number integer, easel_number integer, is_winner boolean)+
  LANGUAGE plpgsql                                                                                                                                                              +
  SECURITY DEFINER                                                                                                                                                              +
 AS $function$                                                                                                                                                                  +
 BEGIN                                                                                                                                                                          +
   RETURN QUERY                                                                                                                                                                 +
   SELECT                                                                                                                                                                       +
     e.id,                                                                                                                                                                      +
     e.eid,                                                                                                                                                                     +
     e.name,                                                                                                                                                                    +
     e.event_start_datetime,                                                                                                                                                    +
     r.round_number,                                                                                                                                                            +
     rc.easel_number,                                                                                                                                                           +
     (rc.is_winner > 0)                                                                                                                                                         +
   FROM round_contestants rc                                                                                                                                                    +
   JOIN rounds r ON rc.round_id = r.id                                                                                                                                          +
   JOIN events e ON r.event_id = e.id                                                                                                                                           +
   WHERE rc.artist_id = artist_profile_id                                                                                                                                       +
     AND e.id != current_event_id                                                                                                                                               +
   ORDER BY e.event_start_datetime DESC                                                                                                                                         +
   LIMIT max_events;                                                                                                                                                            +
 END;                                                                                                                                                                           +
 $function$                                                                                                                                                                     +
 
(1 row)

