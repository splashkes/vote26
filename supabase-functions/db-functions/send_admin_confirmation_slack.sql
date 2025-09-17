                                                    pg_get_functiondef                                                    
--------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.send_admin_confirmation_slack(p_email text, p_admin_id uuid DEFAULT NULL::uuid)       +
  RETURNS jsonb                                                                                                          +
  LANGUAGE plpgsql                                                                                                       +
  SECURITY DEFINER                                                                                                       +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                        +
 AS $function$                                                                                                           +
  DECLARE                                                                                                                +
      v_slack_blocks JSONB;                                                                                              +
      v_notification_id UUID;                                                                                            +
  BEGIN                                                                                                                  +
      -- Build Slack blocks                                                                                              +
      v_slack_blocks := jsonb_build_array(                                                                               +
          jsonb_build_object(                                                                                            +
              'type', 'section',                                                                                         +
              'text', jsonb_build_object(                                                                                +
                  'type', 'mrkdwn',                                                                                      +
                  'text', ':white_check_mark: *Admin Account Activated*'                                                 +
              )                                                                                                          +
          ),                                                                                                             +
          jsonb_build_object(                                                                                            +
              'type', 'section',                                                                                         +
              'fields', jsonb_build_array(                                                                               +
                  jsonb_build_object(                                                                                    +
                      'type', 'mrkdwn',                                                                                  +
                      'text', '*Email:*\n' || p_email                                                                    +
                  ),                                                                                                     +
                  jsonb_build_object(                                                                                    +
                      'type', 'mrkdwn',                                                                                  +
                      'text', '*Status:*\nAccount successfully activated'                                                +
                  )                                                                                                      +
              )                                                                                                          +
          ),                                                                                                             +
          jsonb_build_object(                                                                                            +
              'type', 'context',                                                                                         +
              'elements', jsonb_build_array(                                                                             +
                  jsonb_build_object(                                                                                    +
                      'type', 'mrkdwn',                                                                                  +
                      'text', 'Art Battle Admin System • ' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI UTC')+
                  )                                                                                                      +
              )                                                                                                          +
          )                                                                                                              +
      );                                                                                                                 +
                                                                                                                         +
      -- Queue notification to general channel                                                                           +
      SELECT queue_slack_notification(                                                                                   +
          'general',                                                                                                     +
          'admin_confirmation',                                                                                          +
          'Admin Account Activated: ' || p_email,                                                                        +
          v_slack_blocks,                                                                                                +
          NULL                                                                                                           +
      ) INTO v_notification_id;                                                                                          +
                                                                                                                         +
      RETURN jsonb_build_object(                                                                                         +
          'ok', true,                                                                                                    +
          'notification_id', v_notification_id,                                                                          +
          'queued_to', 'general'                                                                                         +
      );                                                                                                                 +
  END;                                                                                                                   +
  $function$                                                                                                             +
 
(1 row)

