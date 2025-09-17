                                               pg_get_functiondef                                                
-----------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.mark_artwork_paid(p_art_id uuid, p_payment_reference text DEFAULT NULL::text)+
  RETURNS boolean                                                                                               +
  LANGUAGE plpgsql                                                                                              +
 AS $function$                                                                                                  +
  BEGIN                                                                                                         +
    UPDATE art                                                                                                  +
    SET                                                                                                         +
      status = 'paid',                                                                                          +
      mongo_status = 4,                                                                                         +
      updated_at = NOW()                                                                                        +
    WHERE id = p_art_id                                                                                         +
      AND status = 'closed';                                                                                    +
                                                                                                                +
    IF FOUND THEN                                                                                               +
      -- Log payment status                                                                                     +
      INSERT INTO payment_logs (                                                                                +
        art_id,                                                                                                 +
        amount,                                                                                                 +
        status,                                                                                                 +
        reference,                                                                                              +
        created_at                                                                                              +
      )                                                                                                         +
      SELECT                                                                                                    +
        p_art_id,                                                                                               +
        current_bid,                                                                                            +
        'completed',                                                                                            +
        p_payment_reference,                                                                                    +
        NOW()                                                                                                   +
      FROM art                                                                                                  +
      WHERE id = p_art_id;                                                                                      +
                                                                                                                +
      RETURN TRUE;                                                                                              +
    END IF;                                                                                                     +
                                                                                                                +
    RETURN FALSE;                                                                                               +
  END;                                                                                                          +
  $function$                                                                                                    +
 
(1 row)

