                                      pg_get_functiondef                                       
-----------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_event_admins_with_people(p_event_id uuid)              +
  RETURNS TABLE(id uuid, phone character varying, admin_level character varying, people jsonb)+
  LANGUAGE plpgsql                                                                            +
  SECURITY DEFINER                                                                            +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                             +
 AS $function$                                                                                +
  BEGIN                                                                                       +
      RETURN QUERY                                                                            +
      SELECT                                                                                  +
          ea.id,                                                                              +
          ea.phone,                                                                           +
          ea.admin_level,                                                                     +
          CASE                                                                                +
              WHEN p.id IS NOT NULL THEN                                                      +
                  jsonb_build_object(                                                         +
                      'id', p.id,                                                             +
                      'first_name', p.first_name,                                             +
                      'last_name', p.last_name,                                               +
                      'name', p.name,                                                         +
                      'nickname', p.nickname                                                  +
                  )                                                                           +
              ELSE NULL                                                                       +
          END as people                                                                       +
      FROM event_admins ea                                                                    +
      LEFT JOIN people p ON ea.phone = p.phone                                                +
      WHERE ea.event_id = p_event_id                                                          +
      ORDER BY ea.admin_level DESC;                                                           +
  END;                                                                                        +
  $function$                                                                                  +
 
(1 row)

