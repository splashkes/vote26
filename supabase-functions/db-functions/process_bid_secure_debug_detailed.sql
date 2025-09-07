                                           pg_get_functiondef                                            
---------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_bid_secure_debug_detailed(p_art_id text, p_amount numeric)   +
  RETURNS jsonb                                                                                         +
  LANGUAGE plpgsql                                                                                      +
  SECURITY DEFINER                                                                                      +
 AS $function$                                                                                          +
 DECLARE                                                                                                +
   v_auth_user_id UUID;                                                                                 +
   v_debug_info JSONB := '{}'::jsonb;                                                                   +
   v_art_exists BOOLEAN := false;                                                                       +
   v_event_exists BOOLEAN := false;                                                                     +
   v_city_exists BOOLEAN := false;                                                                      +
   v_country_exists BOOLEAN := false;                                                                   +
 BEGIN                                                                                                  +
   -- Get authenticated user                                                                            +
   v_auth_user_id := auth.uid();                                                                        +
   v_debug_info := v_debug_info || jsonb_build_object('auth_user_id', v_auth_user_id);                  +
                                                                                                        +
   IF v_auth_user_id IS NULL THEN                                                                       +
     RETURN jsonb_build_object(                                                                         +
       'success', false,                                                                                +
       'error', 'Authentication required',                                                              +
       'debug', v_debug_info                                                                            +
     );                                                                                                 +
   END IF;                                                                                              +
                                                                                                        +
   -- Check if art exists                                                                               +
   SELECT EXISTS(SELECT 1 FROM art WHERE art_code = p_art_id) INTO v_art_exists;                        +
   v_debug_info := v_debug_info || jsonb_build_object('art_exists', v_art_exists, 'art_code', p_art_id);+
                                                                                                        +
   IF NOT v_art_exists THEN                                                                             +
     RETURN jsonb_build_object(                                                                         +
       'success', false,                                                                                +
       'error', 'Art not found',                                                                        +
       'debug', v_debug_info                                                                            +
     );                                                                                                 +
   END IF;                                                                                              +
                                                                                                        +
   -- Check event linkage                                                                               +
   SELECT EXISTS(                                                                                       +
     SELECT 1 FROM art a                                                                                +
     JOIN events e ON a.event_id = e.id                                                                 +
     WHERE a.art_code = p_art_id                                                                        +
   ) INTO v_event_exists;                                                                               +
   v_debug_info := v_debug_info || jsonb_build_object('event_link_exists', v_event_exists);             +
                                                                                                        +
   -- Check city linkage                                                                                +
   SELECT EXISTS(                                                                                       +
     SELECT 1 FROM art a                                                                                +
     JOIN events e ON a.event_id = e.id                                                                 +
     JOIN cities c ON e.city_id = c.id                                                                  +
     WHERE a.art_code = p_art_id                                                                        +
   ) INTO v_city_exists;                                                                                +
   v_debug_info := v_debug_info || jsonb_build_object('city_link_exists', v_city_exists);               +
                                                                                                        +
   -- Check country linkage                                                                             +
   SELECT EXISTS(                                                                                       +
     SELECT 1 FROM art a                                                                                +
     JOIN events e ON a.event_id = e.id                                                                 +
     JOIN cities c ON e.city_id = c.id                                                                  +
     JOIN countries co ON c.country_id = co.id                                                          +
     WHERE a.art_code = p_art_id                                                                        +
   ) INTO v_country_exists;                                                                             +
   v_debug_info := v_debug_info || jsonb_build_object('country_link_exists', v_country_exists);         +
                                                                                                        +
   -- Test the exact problematic query                                                                  +
   BEGIN                                                                                                +
     PERFORM                                                                                            +
       COALESCE(co.currency_symbol, '$'),                                                               +
       COALESCE(co.currency_code, 'USD')                                                                +
     FROM art a                                                                                         +
     JOIN events e ON a.event_id = e.id                                                                 +
     JOIN cities c ON e.city_id = c.id                                                                  +
     JOIN countries co ON c.country_id = co.id                                                          +
     WHERE a.art_code = p_art_id;                                                                       +
                                                                                                        +
     v_debug_info := v_debug_info || jsonb_build_object('currency_query_success', true);                +
                                                                                                        +
   EXCEPTION WHEN OTHERS THEN                                                                           +
     v_debug_info := v_debug_info || jsonb_build_object(                                                +
       'currency_query_success', false,                                                                 +
       'currency_query_error', SQLERRM                                                                  +
     );                                                                                                 +
   END;                                                                                                 +
                                                                                                        +
   -- Get detailed info about the art record and its links                                              +
   SELECT jsonb_build_object(                                                                           +
     'art_id', a.id,                                                                                    +
     'event_id', a.event_id,                                                                            +
     'event_name', e.name,                                                                              +
     'city_id', e.city_id,                                                                              +
     'city_name', c.name,                                                                               +
     'country_id', c.country_id,                                                                        +
     'country_name', co.name,                                                                           +
     'currency_code', co.currency_code,                                                                 +
     'currency_symbol', co.currency_symbol,                                                             +
     'auction_start_bid', e.auction_start_bid,                                                          +
     'min_bid_increment', e.min_bid_increment                                                           +
   ) INTO v_debug_info                                                                                  +
   FROM art a                                                                                           +
   LEFT JOIN events e ON a.event_id = e.id                                                              +
   LEFT JOIN cities c ON e.city_id = c.id                                                               +
   LEFT JOIN countries co ON c.country_id = co.id                                                       +
   WHERE a.art_code = p_art_id;                                                                         +
                                                                                                        +
   RETURN jsonb_build_object(                                                                           +
     'success', true,                                                                                   +
     'message', 'Debug complete - no actual bid placed',                                                +
     'debug', v_debug_info                                                                              +
   );                                                                                                   +
                                                                                                        +
 EXCEPTION WHEN OTHERS THEN                                                                             +
   RETURN jsonb_build_object(                                                                           +
     'success', false,                                                                                  +
     'error', 'Debug function error',                                                                   +
     'sql_error', SQLERRM,                                                                              +
     'debug', v_debug_info                                                                              +
   );                                                                                                   +
 END;                                                                                                   +
 $function$                                                                                             +
 
(1 row)

