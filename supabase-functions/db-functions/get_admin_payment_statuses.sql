                                             pg_get_functiondef                                              
-------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_admin_payment_statuses(p_event_id uuid, p_user_phone text)           +
  RETURNS TABLE(id uuid, code text, description text)                                                       +
  LANGUAGE plpgsql                                                                                          +
  SECURITY DEFINER                                                                                          +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                           +
 AS $function$                                                                                              +
  DECLARE                                                                                                   +
    v_admin_level TEXT;                                                                                     +
  BEGIN                                                                                                     +
    -- Check admin level using existing function                                                            +
    v_admin_level := get_user_admin_level(p_event_id, p_user_phone);                                        +
                                                                                                            +
    -- Only allow producer+ admins                                                                          +
    IF v_admin_level NOT IN ('super', 'producer') THEN                                                      +
      RAISE EXCEPTION 'Access denied. Producer+ admin access required.';                                    +
    END IF;                                                                                                 +
                                                                                                            +
    -- Get all payment statuses used by this event's artworks                                               +
    RETURN QUERY                                                                                            +
    SELECT DISTINCT                                                                                         +
      ps.id,                                                                                                +
      ps.code,                                                                                              +
      ps.description                                                                                        +
    FROM payment_statuses ps                                                                                +
    JOIN art a ON a.buyer_pay_recent_status_id = ps.id                                                      +
    WHERE a.event_id = p_event_id;                                                                          +
  END;                                                                                                      +
  $function$                                                                                                +
 
 CREATE OR REPLACE FUNCTION public.get_admin_payment_statuses(p_event_id uuid, p_user_id uuid, p_phone text)+
  RETURNS TABLE(id uuid, code text, description text)                                                       +
  LANGUAGE plpgsql                                                                                          +
  SECURITY DEFINER                                                                                          +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                           +
 AS $function$                                                                                              +
  DECLARE                                                                                                   +
    v_admin_level TEXT;                                                                                     +
  BEGIN                                                                                                     +
    -- Check admin level                                                                                    +
    v_admin_level := get_user_admin_level(p_user_id, p_phone);                                              +
                                                                                                            +
    -- Only allow producer+ admins                                                                          +
    IF v_admin_level NOT IN ('super', 'producer') THEN                                                      +
      RAISE EXCEPTION 'Access denied. Producer+ admin access required.';                                    +
    END IF;                                                                                                 +
                                                                                                            +
    -- Get all payment statuses used by this event's artworks                                               +
    RETURN QUERY                                                                                            +
    SELECT DISTINCT                                                                                         +
      ps.id,                                                                                                +
      ps.code,                                                                                              +
      ps.description                                                                                        +
    FROM payment_statuses ps                                                                                +
    JOIN art a ON a.buyer_pay_recent_status_id = ps.id                                                      +
    WHERE a.event_id = p_event_id;                                                                          +
  END;                                                                                                      +
  $function$                                                                                                +
 
(2 rows)

