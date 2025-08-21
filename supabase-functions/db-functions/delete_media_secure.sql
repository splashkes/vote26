                           pg_get_functiondef                           
------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.delete_media_secure(p_media_id uuid)+
  RETURNS json                                                         +
  LANGUAGE plpgsql                                                     +
  SECURITY DEFINER                                                     +
 AS $function$                                                         +
 DECLARE                                                               +
   v_result JSON;                                                      +
   v_deleted_count INTEGER;                                            +
 BEGIN                                                                 +
   -- Delete the media record from art_media table                     +
   DELETE FROM art_media                                               +
   WHERE media_id = p_media_id;                                        +
                                                                       +
   -- Get count of deleted rows                                        +
   GET DIAGNOSTICS v_deleted_count = ROW_COUNT;                        +
                                                                       +
   -- Return success response                                          +
   v_result := json_build_object(                                      +
     'success', true,                                                  +
     'deleted_count', v_deleted_count,                                 +
     'media_id', p_media_id                                            +
   );                                                                  +
                                                                       +
   RETURN v_result;                                                    +
                                                                       +
 EXCEPTION WHEN OTHERS THEN                                            +
   -- Return error response                                            +
   v_result := json_build_object(                                      +
     'success', false,                                                 +
     'error', SQLERRM,                                                 +
     'media_id', p_media_id                                            +
   );                                                                  +
                                                                       +
   RETURN v_result;                                                    +
 END;                                                                  +
 $function$                                                            +
 
(1 row)

