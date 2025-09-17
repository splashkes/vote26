                                                                                        pg_get_functiondef                                                                                         
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_expired_admin_invitations()                                                                                                                                +
  RETURNS TABLE(id uuid, email text, level text, invitation_sent_at timestamp with time zone, invitation_expires_at timestamp with time zone, hours_since_expired numeric, reminder_count integer)+
  LANGUAGE plpgsql                                                                                                                                                                                +
  SECURITY DEFINER                                                                                                                                                                                +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                                                                                                 +
 AS $function$                                                                                                                                                                                    +
  BEGIN                                                                                                                                                                                           +
    RETURN QUERY                                                                                                                                                                                  +
    SELECT                                                                                                                                                                                        +
      au.id,                                                                                                                                                                                      +
      au.email,                                                                                                                                                                                   +
      au.level,                                                                                                                                                                                   +
      au.invitation_sent_at,                                                                                                                                                                      +
      au.invitation_expires_at,                                                                                                                                                                   +
      ROUND(EXTRACT(EPOCH FROM (NOW() - au.invitation_expires_at)) / 3600, 1) as hours_since_expired,                                                                                             +
      COALESCE(au.invitation_reminder_count, 0) as reminder_count                                                                                                                                 +
    FROM abhq_admin_users au                                                                                                                                                                      +
    WHERE au.active = false                                                                                                                                                                       +
      AND au.invitation_sent_at IS NOT NULL                                                                                                                                                       +
      AND au.invitation_expires_at < NOW()                                                                                                                                                        +
    ORDER BY au.invitation_expires_at DESC;                                                                                                                                                       +
  END;                                                                                                                                                                                            +
  $function$                                                                                                                                                                                      +
 
(1 row)

