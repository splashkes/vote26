                             pg_get_functiondef                             
----------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mark_payment_processing(payment_id uuid)+
  RETURNS boolean                                                          +
  LANGUAGE plpgsql                                                         +
  SECURITY DEFINER                                                         +
  SET search_path TO 'public'                                              +
 AS $function$                                                             +
 BEGIN                                                                     +
     UPDATE artist_payments                                                +
     SET status = 'processing',                                            +
         updated_at = NOW(),                                               +
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object( +
             'processing_started_at', NOW(),                               +
             'processing_system', 'auto_process_edge_function'             +
         )                                                                 +
     WHERE id = payment_id                                                 +
       AND status = 'pending';                                             +
                                                                           +
     RETURN FOUND;                                                         +
 END;                                                                      +
 $function$                                                                +
 
(1 row)

