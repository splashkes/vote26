                                                                               pg_get_functiondef                                                                                
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_people_for_campaign(person_ids uuid[])                                                                                                   +
  RETURNS TABLE(id uuid, phone character varying, phone_number text, first_name character varying, last_name character varying, hash character varying, message_blocked integer)+
  LANGUAGE plpgsql                                                                                                                                                              +
  SECURITY DEFINER                                                                                                                                                              +
 AS $function$                                                                                                                                                                  +
 BEGIN                                                                                                                                                                          +
   RETURN QUERY                                                                                                                                                                 +
   SELECT                                                                                                                                                                       +
     p.id,                                                                                                                                                                      +
     p.phone,                                                                                                                                                                   +
     p.phone_number,                                                                                                                                                            +
     p.first_name,                                                                                                                                                              +
     p.last_name,                                                                                                                                                               +
     p.hash,                                                                                                                                                                    +
     p.message_blocked                                                                                                                                                          +
   FROM people p                                                                                                                                                                +
   WHERE p.id = ANY(person_ids)                                                                                                                                                 +
     AND (p.message_blocked IS NULL OR p.message_blocked = 0); -- EXCLUDE BLOCKED USERS                                                                                         +
 END;                                                                                                                                                                           +
 $function$                                                                                                                                                                     +
 
(1 row)

