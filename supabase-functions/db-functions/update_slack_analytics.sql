                     pg_get_functiondef                     
------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.update_slack_analytics()+
  RETURNS trigger                                          +
  LANGUAGE plpgsql                                         +
 AS $function$                                             +
  BEGIN                                                    +
    IF NEW.status = 'sent' THEN                            +
      INSERT INTO slack_analytics (                        +
        event_id,                                          +
        notification_type,                                 +
        sent_count,                                        +
        last_sent_at                                       +
      ) VALUES (                                           +
        NEW.event_id,                                      +
        NEW.message_type,                                  +
        1,                                                 +
        NEW.sent_at                                        +
      )                                                    +
      ON CONFLICT (event_id, notification_type)            +
      DO UPDATE SET                                        +
        sent_count = slack_analytics.sent_count + 1,       +
        last_sent_at = NEW.sent_at;                        +
    ELSIF NEW.status = 'failed' THEN                       +
      INSERT INTO slack_analytics (                        +
        event_id,                                          +
        notification_type,                                 +
        failed_count                                       +
      ) VALUES (                                           +
        NEW.event_id,                                      +
        NEW.message_type,                                  +
        1                                                  +
      )                                                    +
      ON CONFLICT (event_id, notification_type)            +
      DO UPDATE SET                                        +
        failed_count = slack_analytics.failed_count + 1;   +
    END IF;                                                +
                                                           +
    RETURN NEW;                                            +
  END;                                                     +
  $function$                                               +
 
(1 row)

