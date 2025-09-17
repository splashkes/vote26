                        pg_get_functiondef                         
-------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_artist_follower_counts()+
  RETURNS void                                                    +
  LANGUAGE plpgsql                                                +
 AS $function$                                                    +
  BEGIN                                                           +
      UPDATE artist_profiles a                                    +
      SET followers_count = (                                     +
          SELECT COUNT(*)                                         +
          FROM artist_followers af                                +
          WHERE af.artist_id = a.id                               +
      );                                                          +
  END;                                                            +
  $function$                                                      +
 
(1 row)

