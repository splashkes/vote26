                                            pg_get_functiondef                                            
----------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.toggle_payment_processing(enable_system boolean DEFAULT NULL::boolean)+
  RETURNS jsonb                                                                                          +
  LANGUAGE plpgsql                                                                                       +
  SECURITY DEFINER                                                                                       +
  SET search_path TO 'public'                                                                            +
 AS $function$                                                                                           +
 DECLARE                                                                                                 +
     control_record payment_processing_control%ROWTYPE;                                                  +
     result jsonb;                                                                                       +
 BEGIN                                                                                                   +
     -- Get current control record                                                                       +
     SELECT * INTO control_record FROM payment_processing_control LIMIT 1;                               +
                                                                                                         +
     IF NOT FOUND THEN                                                                                   +
         RAISE EXCEPTION 'Payment processing control not initialized';                                   +
     END IF;                                                                                             +
                                                                                                         +
     -- Update system enabled status if provided                                                         +
     IF enable_system IS NOT NULL THEN                                                                   +
         UPDATE payment_processing_control                                                               +
         SET system_enabled = enable_system,                                                             +
             metadata = metadata || jsonb_build_object(                                                  +
                 'last_manual_toggle', NOW(),                                                            +
                 'toggled_by', 'admin_function'                                                          +
             )                                                                                           +
         WHERE id = control_record.id;                                                                   +
                                                                                                         +
         -- Refresh record                                                                               +
         SELECT * INTO control_record FROM payment_processing_control WHERE id = control_record.id;      +
     END IF;                                                                                             +
                                                                                                         +
     -- Return current status                                                                            +
     result := jsonb_build_object(                                                                       +
         'system_enabled', control_record.system_enabled,                                                +
         'global_payments_enabled', control_record.global_payments_enabled,                              +
         'stripe_connect_enabled', control_record.stripe_connect_enabled,                                +
         'processing_batch_size', control_record.processing_batch_size,                                  +
         'max_daily_payments', control_record.max_daily_payments,                                        +
         'daily_payment_count', control_record.daily_payment_count,                                      +
         'last_processed_at', control_record.last_processed_at,                                          +
         'status', CASE WHEN control_record.system_enabled THEN 'enabled' ELSE 'disabled' END            +
     );                                                                                                  +
                                                                                                         +
     RETURN result;                                                                                      +
 END;                                                                                                    +
 $function$                                                                                              +
 
(1 row)

