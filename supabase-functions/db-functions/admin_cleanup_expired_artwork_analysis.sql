                             pg_get_functiondef                             
----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_cleanup_expired_artwork_analysis()+
  RETURNS integer                                                          +
  LANGUAGE plpgsql                                                         +
 AS $function$                                                             +
 DECLARE                                                                   +
     deleted_count INTEGER;                                                +
 BEGIN                                                                     +
     DELETE FROM art_media_ai_caption                                      +
     WHERE expires_at <= NOW();                                            +
                                                                           +
     GET DIAGNOSTICS deleted_count = ROW_COUNT;                            +
                                                                           +
     RETURN deleted_count;                                                 +
 END;                                                                      +
 $function$                                                                +
 
(1 row)

