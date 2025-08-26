                                                                                     pg_get_functiondef                                                                                     
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.send_admin_invitation_slack(p_email text, p_level text, p_invited_by text, p_cities_access text[] DEFAULT NULL::text[], p_notes text DEFAULT NULL::text)+
  RETURNS jsonb                                                                                                                                                                            +
  LANGUAGE plpgsql                                                                                                                                                                         +
  SECURITY DEFINER                                                                                                                                                                         +
 AS $function$                                                                                                                                                                             +
 DECLARE                                                                                                                                                                                   +
     v_slack_blocks JSONB;                                                                                                                                                                 +
     v_cities_text TEXT;                                                                                                                                                                   +
     v_notification_id UUID;                                                                                                                                                               +
 BEGIN                                                                                                                                                                                     +
     -- Format cities access                                                                                                                                                               +
     IF p_cities_access IS NOT NULL AND array_length(p_cities_access, 1) > 0 THEN                                                                                                          +
         v_cities_text := array_to_string(p_cities_access, ', ');                                                                                                                          +
     ELSE                                                                                                                                                                                  +
         v_cities_text := 'All cities';                                                                                                                                                    +
     END IF;                                                                                                                                                                               +
                                                                                                                                                                                           +
     -- Build Slack blocks                                                                                                                                                                 +
     v_slack_blocks := jsonb_build_array(                                                                                                                                                  +
         jsonb_build_object(                                                                                                                                                               +
             'type', 'section',                                                                                                                                                            +
             'text', jsonb_build_object(                                                                                                                                                   +
                 'type', 'mrkdwn',                                                                                                                                                         +
                 'text', ':key: *New Admin Invitation Sent*'                                                                                                                               +
             )                                                                                                                                                                             +
         ),                                                                                                                                                                                +
         jsonb_build_object(                                                                                                                                                               +
             'type', 'section',                                                                                                                                                            +
             'fields', jsonb_build_array(                                                                                                                                                  +
                 jsonb_build_object(                                                                                                                                                       +
                     'type', 'mrkdwn',                                                                                                                                                     +
                     'text', '*Email:*\n' || p_email                                                                                                                                       +
                 ),                                                                                                                                                                        +
                 jsonb_build_object(                                                                                                                                                       +
                     'type', 'mrkdwn',                                                                                                                                                     +
                     'text', '*Level:*\n' || upper(p_level)                                                                                                                                +
                 ),                                                                                                                                                                        +
                 jsonb_build_object(                                                                                                                                                       +
                     'type', 'mrkdwn',                                                                                                                                                     +
                     'text', '*Invited By:*\n' || p_invited_by                                                                                                                             +
                 ),                                                                                                                                                                        +
                 jsonb_build_object(                                                                                                                                                       +
                     'type', 'mrkdwn',                                                                                                                                                     +
                     'text', '*Cities Access:*\n' || v_cities_text                                                                                                                         +
                 )                                                                                                                                                                         +
             )                                                                                                                                                                             +
         )                                                                                                                                                                                 +
     );                                                                                                                                                                                    +
                                                                                                                                                                                           +
     IF p_notes IS NOT NULL AND LENGTH(trim(p_notes)) > 0 THEN                                                                                                                             +
         v_slack_blocks := v_slack_blocks || jsonb_build_array(                                                                                                                            +
             jsonb_build_object(                                                                                                                                                           +
                 'type', 'section',                                                                                                                                                        +
                 'text', jsonb_build_object(                                                                                                                                               +
                     'type', 'mrkdwn',                                                                                                                                                     +
                     'text', '*Notes:*\n' || p_notes                                                                                                                                       +
                 )                                                                                                                                                                         +
             )                                                                                                                                                                             +
         );                                                                                                                                                                                +
     END IF;                                                                                                                                                                               +
                                                                                                                                                                                           +
     -- Add footer                                                                                                                                                                         +
     v_slack_blocks := v_slack_blocks || jsonb_build_array(                                                                                                                                +
         jsonb_build_object(                                                                                                                                                               +
             'type', 'context',                                                                                                                                                            +
             'elements', jsonb_build_array(                                                                                                                                                +
                 jsonb_build_object(                                                                                                                                                       +
                     'type', 'mrkdwn',                                                                                                                                                     +
                     'text', 'Art Battle Admin System • ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')                                                                   +
                 )                                                                                                                                                                         +
             )                                                                                                                                                                             +
         )                                                                                                                                                                                 +
     );                                                                                                                                                                                    +
                                                                                                                                                                                           +
     -- Queue notification to general channel (admin notifications)                                                                                                                        +
     SELECT queue_slack_notification(                                                                                                                                                      +
         'general',                                                                                                                                                                        +
         'admin_invitation',                                                                                                                                                               +
         'New Admin Invitation: ' || p_email,                                                                                                                                              +
         v_slack_blocks,                                                                                                                                                                   +
         NULL                                                                                                                                                                              +
     ) INTO v_notification_id;                                                                                                                                                             +
                                                                                                                                                                                           +
     RETURN jsonb_build_object(                                                                                                                                                            +
         'ok', true,                                                                                                                                                                       +
         'notification_id', v_notification_id,                                                                                                                                             +
         'queued_to', 'general'                                                                                                                                                            +
     );                                                                                                                                                                                    +
 END;                                                                                                                                                                                      +
 $function$                                                                                                                                                                                +
 
(1 row)

