                                                      pg_get_functiondef                                                      
------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_bid_history_with_names(p_art_ids uuid[])                                              +
  RETURNS TABLE(id uuid, art_id uuid, person_id uuid, amount numeric, created_at timestamp with time zone, display_name text)+
  LANGUAGE plpgsql                                                                                                           +
  SECURITY DEFINER                                                                                                           +
  SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'                                                            +
 AS $function$                                                                                                               +
  BEGIN                                                                                                                      +
    RETURN QUERY                                                                                                             +
    SELECT                                                                                                                   +
      b.id,                                                                                                                  +
      b.art_id,                                                                                                              +
      b.person_id,                                                                                                           +
      b.amount,                                                                                                              +
      b.created_at,                                                                                                          +
      (CASE                                                                                                                  +
        -- 1: first name + last initial                                                                                      +
        WHEN p.first_name IS NOT NULL AND p.first_name != '' THEN                                                            +
          CASE                                                                                                               +
            WHEN p.last_name IS NOT NULL AND p.last_name != '' THEN                                                          +
              p.first_name || ' ' || LEFT(p.last_name, 1) || '.'                                                             +
            ELSE                                                                                                             +
              p.first_name                                                                                                   +
          END                                                                                                                +
        -- 2: nickname                                                                                                       +
        WHEN p.nickname IS NOT NULL AND p.nickname != '' THEN                                                                +
          p.nickname                                                                                                         +
        -- 3: full name (fallback - split and format)                                                                        +
        WHEN p.name IS NOT NULL AND p.name != '' THEN                                                                        +
          CASE                                                                                                               +
            WHEN position(' ' in p.name) > 0 THEN                                                                            +
              split_part(p.name, ' ', 1) || ' ' || LEFT(split_part(p.name, ' ', -1), 1) || '.'                               +
            ELSE                                                                                                             +
              p.name                                                                                                         +
          END                                                                                                                +
        -- 4: last 4 digits of phone number                                                                                  +
        WHEN COALESCE(p.phone, p.phone_number, p.auth_phone) IS NOT NULL THEN                                                +
          'User ' || RIGHT(regexp_replace(COALESCE(p.phone, p.phone_number, p.auth_phone), '[^0-9]', '', 'g'), 4)            +
        -- 5: Anonymous (should never happen)                                                                                +
        ELSE                                                                                                                 +
          'Anonymous'                                                                                                        +
      END)::TEXT AS display_name                                                                                             +
    FROM bids b                                                                                                              +
    JOIN people p ON b.person_id = p.id                                                                                      +
    WHERE b.art_id = ANY(p_art_ids)                                                                                          +
    ORDER BY b.created_at DESC;                                                                                              +
  END;                                                                                                                       +
  $function$                                                                                                                 +
 
(1 row)

