                             pg_get_functiondef                              
-----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mark_notifications_seen(p_person_id uuid)+
  RETURNS void                                                              +
  LANGUAGE plpgsql                                                          +
 AS $function$                                                              +
  BEGIN                                                                     +
      UPDATE notifications                                                  +
      SET is_seen = true, seen_at = NOW()                                   +
      WHERE person_id = p_person_id                                         +
      AND is_seen = false;                                                  +
                                                                            +
      -- Update or insert last read timestamp                               +
      INSERT INTO notification_reads (person_id, last_read_at)              +
      VALUES (p_person_id, NOW())                                           +
      ON CONFLICT (person_id)                                               +
      DO UPDATE SET last_read_at = NOW();                                   +
  END;                                                                      +
  $function$                                                                +
 
(1 row)

