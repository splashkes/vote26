                      pg_get_functiondef                       
---------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_artist_vote_counts()+
  RETURNS void                                                +
  LANGUAGE plpgsql                                            +
 AS $function$                                                +
  BEGIN                                                       +
      UPDATE artist_profiles a                                +
      SET votes_count = (                                     +
          SELECT COUNT(DISTINCT v.person_id)                  +
          FROM votes v                                        +
          JOIN art ar ON ar.id = v.art_id                     +
          WHERE ar.artist_id = a.id                           +
      );                                                      +
  END;                                                        +
  $function$                                                  +
 
(1 row)

