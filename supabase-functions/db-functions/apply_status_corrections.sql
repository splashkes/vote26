                                                                             pg_get_functiondef                                                                              
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.apply_status_corrections(p_dry_run boolean DEFAULT true)                                                                                 +
  RETURNS TABLE(correction_id uuid, payment_id uuid, old_status text, new_status text, artist_name text, amount numeric, currency text, transfer_id text, action_taken text)+
  LANGUAGE plpgsql                                                                                                                                                          +
  SECURITY DEFINER                                                                                                                                                          +
 AS $function$                                                                                                                                                              +
 DECLARE                                                                                                                                                                    +
     correction_record RECORD;                                                                                                                                              +
     correction_count integer := 0;                                                                                                                                         +
     slack_message text;                                                                                                                                                    +
 BEGIN                                                                                                                                                                      +
     -- Process each correction needed                                                                                                                                      +
     FOR correction_record IN                                                                                                                                               +
         SELECT * FROM identify_status_corrections()                                                                                                                        +
     LOOP                                                                                                                                                                   +
         correction_count := correction_count + 1;                                                                                                                          +
                                                                                                                                                                            +
         IF NOT p_dry_run THEN                                                                                                                                              +
             -- Apply the correction                                                                                                                                        +
             UPDATE artist_payments                                                                                                                                         +
             SET                                                                                                                                                            +
                 status = correction_record.suggested_status,                                                                                                               +
                 verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || jsonb_build_object(                                                                +
                     'status_corrected_at', NOW()::text,                                                                                                                    +
                     'old_status', correction_record.current_status,                                                                                                        +
                     'correction_reason', correction_record.correction_reason,                                                                                              +
                     'corrected_by', 'reconciliation_script'                                                                                                                +
                 ),                                                                                                                                                         +
                 webhook_confirmed_at = CASE                                                                                                                                +
                     WHEN correction_record.suggested_status = 'verified' THEN NOW()                                                                                        +
                     ELSE webhook_confirmed_at                                                                                                                              +
                 END,                                                                                                                                                       +
                 updated_at = NOW()                                                                                                                                         +
             WHERE id = correction_record.payment_id;                                                                                                                       +
                                                                                                                                                                            +
             -- Queue Slack notification for each correction                                                                                                                +
             slack_message := format('[CORRECTED] Payment %s: %s → %s | $%s %s to %s (%s)',                                                                                 +
                 SUBSTRING(correction_record.payment_id::text, 1, 8),                                                                                                       +
                 correction_record.current_status,                                                                                                                          +
                 correction_record.suggested_status,                                                                                                                        +
                 correction_record.amount,                                                                                                                                  +
                 correction_record.currency,                                                                                                                                +
                 correction_record.artist_name,                                                                                                                             +
                 COALESCE(correction_record.transfer_id, 'no_transfer_id')                                                                                                  +
             );                                                                                                                                                             +
                                                                                                                                                                            +
             PERFORM queue_slack_notification(                                                                                                                              +
                 'stripe-flood',                                                                                                                                            +
                 'payment_status_correction',                                                                                                                               +
                 slack_message,                                                                                                                                             +
                 jsonb_build_array(                                                                                                                                         +
                     jsonb_build_object(                                                                                                                                    +
                         'type', 'section',                                                                                                                                 +
                         'text', jsonb_build_object(                                                                                                                        +
                             'type', 'mrkdwn',                                                                                                                              +
                             'text', format('🔧 *Payment Status Corrected*\n*Artist:* %s\n*Amount:* $%s %s\n*Status:* %s → %s\n*Transfer ID:* `%s`\n*Reason:* %s',           +
                                 correction_record.artist_name,                                                                                                             +
                                 correction_record.amount,                                                                                                                  +
                                 correction_record.currency,                                                                                                                +
                                 correction_record.current_status,                                                                                                          +
                                 correction_record.suggested_status,                                                                                                        +
                                 COALESCE(correction_record.transfer_id, 'none'),                                                                                           +
                                 correction_record.correction_reason                                                                                                        +
                             )                                                                                                                                              +
                         )                                                                                                                                                  +
                     )                                                                                                                                                      +
                 ),                                                                                                                                                         +
                 NULL                                                                                                                                                       +
             );                                                                                                                                                             +
         END IF;                                                                                                                                                            +
                                                                                                                                                                            +
         RETURN QUERY SELECT                                                                                                                                                +
             gen_random_uuid() as correction_id,                                                                                                                            +
             correction_record.payment_id,                                                                                                                                  +
             correction_record.current_status as old_status,                                                                                                                +
             correction_record.suggested_status as new_status,                                                                                                              +
             correction_record.artist_name,                                                                                                                                 +
             correction_record.amount,                                                                                                                                      +
             correction_record.currency,                                                                                                                                    +
             correction_record.transfer_id,                                                                                                                                 +
             CASE WHEN p_dry_run THEN 'DRY_RUN' ELSE 'APPLIED' END as action_taken;                                                                                         +
     END LOOP;                                                                                                                                                              +
                                                                                                                                                                            +
     -- Log summary                                                                                                                                                         +
     INSERT INTO system_logs (service, operation, level, message, request_data)                                                                                             +
     VALUES (                                                                                                                                                               +
         'reconciliation',                                                                                                                                                  +
         'status_corrections',                                                                                                                                              +
         'info',                                                                                                                                                            +
         format('%s status corrections %s',                                                                                                                                 +
             correction_count,                                                                                                                                              +
             CASE WHEN p_dry_run THEN 'identified (DRY RUN)' ELSE 'applied' END                                                                                             +
         ),                                                                                                                                                                 +
         jsonb_build_object(                                                                                                                                                +
             'correction_count', correction_count,                                                                                                                          +
             'dry_run', p_dry_run,                                                                                                                                          +
             'timestamp', NOW()::text                                                                                                                                       +
         )                                                                                                                                                                  +
     );                                                                                                                                                                     +
 END;                                                                                                                                                                       +
 $function$                                                                                                                                                                 +
 
(1 row)

