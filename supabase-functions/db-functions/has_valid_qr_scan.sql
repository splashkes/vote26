                                   pg_get_functiondef                                   
----------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.has_valid_qr_scan(p_person_id uuid, p_event_id uuid)+
  RETURNS boolean                                                                      +
  LANGUAGE plpgsql                                                                     +
  STABLE SECURITY DEFINER                                                              +
 AS $function$                                                                         +
 DECLARE                                                                               +
   v_has_scan BOOLEAN;                                                                 +
 BEGIN                                                                                 +
   SELECT EXISTS(                                                                      +
     SELECT 1                                                                          +
     FROM people_qr_scans                                                              +
     WHERE person_id = p_person_id                                                     +
       AND event_id = p_event_id                                                       +
       AND is_valid = true                                                             +
   ) INTO v_has_scan;                                                                  +
                                                                                       +
   RETURN COALESCE(v_has_scan, false);                                                 +
 END;                                                                                  +
 $function$                                                                            +
 
(1 row)

