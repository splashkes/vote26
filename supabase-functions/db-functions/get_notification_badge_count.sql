                                pg_get_functiondef                                
----------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_notification_badge_count(p_person_id uuid)+
  RETURNS integer                                                                +
  LANGUAGE plpgsql                                                               +
 AS $function$                                                                   +
  BEGIN                                                                          +
      RETURN (                                                                   +
          SELECT COUNT(*)                                                        +
          FROM notifications                                                     +
          WHERE person_id = p_person_id                                          +
          AND is_seen = false                                                    +
          AND (expires_at IS NULL OR expires_at > NOW())                         +
      );                                                                         +
  END;                                                                           +
  $function$                                                                     +
 
(1 row)

