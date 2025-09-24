                                                                                                 pg_get_functiondef                                                                                                  
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_artist_invitation_history(artist_id uuid)                                                                                                                                    +
  RETURNS TABLE(invitation_id uuid, invite_type text, status text, sent_at timestamp with time zone, opened_at timestamp with time zone, completed_at timestamp with time zone, expires_at timestamp with time zone)+
  LANGUAGE sql                                                                                                                                                                                                      +
  SECURITY DEFINER                                                                                                                                                                                                  +
  SET search_path TO 'public'                                                                                                                                                                                       +
 AS $function$                                                                                                                                                                                                      +
   SELECT                                                                                                                                                                                                           +
     id,                                                                                                                                                                                                            +
     invite_type,                                                                                                                                                                                                   +
     status,                                                                                                                                                                                                        +
     sent_at,                                                                                                                                                                                                       +
     opened_at,                                                                                                                                                                                                     +
     completed_at,                                                                                                                                                                                                  +
     expires_at                                                                                                                                                                                                     +
   FROM payment_invitations                                                                                                                                                                                         +
   WHERE artist_profile_id = artist_id                                                                                                                                                                              +
   ORDER BY sent_at DESC;                                                                                                                                                                                           +
 $function$                                                                                                                                                                                                         +
 
(1 row)

