                                          pg_get_functiondef                                          
------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.process_bid_secure(p_art_id text, p_amount numeric)               +
  RETURNS jsonb                                                                                      +
  LANGUAGE plpgsql                                                                                   +
  SECURITY DEFINER                                                                                   +
 AS $function$                                                                                       +
 DECLARE                                                                                             +
   v_auth_user_id UUID;                                                                              +
   v_auth_phone TEXT;                                                                                +
   v_auth_metadata JSONB;                                                                            +
   v_person_id UUID;                                                                                 +
   v_event_id UUID;                                                                                  +
   v_art_uuid UUID;                                                                                  +
   v_current_bid DECIMAL;                                                                            +
   v_min_increment DECIMAL;                                                                          +
   v_auction_start_bid DECIMAL;                                                                      +
   v_previous_bidder_id UUID;                                                                        +
   v_previous_bidder_mongo_id TEXT;                                                                  +
   v_bid_id UUID;                                                                                    +
   v_art_status TEXT;                                                                                +
   v_event_number TEXT;                                                                              +
   v_artist_name TEXT;                                                                               +
   v_currency_symbol TEXT;                                                                           +
   v_currency_code TEXT;  -- ADDED: Currency code variable                                           +
   v_round INT;                                                                                      +
   v_easel INT;                                                                                      +
   v_extension_result JSONB;                                                                         +
   v_nickname TEXT;                                                                                  +
 BEGIN                                                                                               +
   -- Get authenticated user                                                                         +
   v_auth_user_id := auth.uid();                                                                     +
                                                                                                     +
   IF v_auth_user_id IS NULL THEN                                                                    +
     RETURN jsonb_build_object(                                                                      +
       'success', false,                                                                             +
       'error', 'Authentication required'                                                            +
     );                                                                                              +
   END IF;                                                                                           +
                                                                                                     +
   -- Get user phone from auth.users table                                                           +
   SELECT                                                                                            +
     phone,                                                                                          +
     raw_user_meta_data                                                                              +
   INTO v_auth_phone, v_auth_metadata                                                                +
   FROM auth.users                                                                                   +
   WHERE id = v_auth_user_id;                                                                        +
                                                                                                     +
   IF v_auth_phone IS NULL THEN                                                                      +
     RETURN jsonb_build_object(                                                                      +
       'success', false,                                                                             +
       'error', 'Phone number required for bidding. Please update your profile.',                    +
       'auth_user_id', v_auth_user_id                                                                +
     );                                                                                              +
   END IF;                                                                                           +
                                                                                                     +
   -- Extract nickname from metadata                                                                 +
   v_nickname := COALESCE(                                                                           +
     v_auth_metadata->>'nickname',                                                                   +
     v_auth_metadata->>'name',                                                                       +
     SPLIT_PART(v_auth_metadata->>'email', '@', 1)                                                   +
   );                                                                                                +
                                                                                                     +
   -- Get or create person record (FIXED TO CREATE LIKE VOTE FUNCTION)                               +
   SELECT id INTO v_person_id                                                                        +
   FROM people                                                                                       +
   WHERE auth_user_id = v_auth_user_id;                                                              +
                                                                                                     +
   IF v_person_id IS NULL THEN                                                                       +
     -- Try to find existing person by phone number and link them                                    +
     SELECT id INTO v_person_id                                                                      +
     FROM people                                                                                     +
     WHERE auth_user_id IS NULL                                                                      +
       AND (                                                                                         +
         phone = v_auth_phone                                                                        +
         OR phone = REPLACE(v_auth_phone, '+', '')                                                   +
         OR phone = REPLACE(v_auth_phone, '+', '')                                                   +
       )                                                                                             +
     ORDER BY created_at DESC                                                                        +
     LIMIT 1;                                                                                        +
                                                                                                     +
     IF v_person_id IS NOT NULL THEN                                                                 +
       -- Link the existing person record to the auth user                                           +
       UPDATE people                                                                                 +
       SET                                                                                           +
         auth_user_id = v_auth_user_id,                                                              +
         phone = COALESCE(phone, v_auth_phone),                                                      +
         updated_at = NOW()                                                                          +
       WHERE id = v_person_id;                                                                       +
     ELSE                                                                                            +
       -- CREATE NEW PERSON RECORD (FIXED)                                                           +
       v_person_id := gen_random_uuid();                                                             +
                                                                                                     +
       INSERT INTO people (                                                                          +
         id,                                                                                         +
         auth_user_id,                                                                               +
         auth_phone,                                                                                 +
         phone,                                                                                      +
         nickname,                                                                                   +
         created_at,                                                                                 +
         updated_at                                                                                  +
       ) VALUES (                                                                                    +
         v_person_id,                                                                                +
         v_auth_user_id,                                                                             +
         v_auth_phone,                                                                               +
         v_auth_phone,                                                                               +
         v_nickname,                                                                                 +
         NOW(),                                                                                      +
         NOW()                                                                                       +
       );                                                                                            +
     END IF;                                                                                         +
   END IF;                                                                                           +
                                                                                                     +
   -- Extract event number from art code                                                             +
   v_event_number := SPLIT_PART(p_art_id, '-', 1);                                                   +
                                                                                                     +
   -- Get art record using art_code with currency information from countries                         +
   SELECT                                                                                            +
     a.id,                                                                                           +
     a.event_id,                                                                                     +
     a.status::text,                                                                                 +
     a.current_bid,                                                                                  +
     a.round,                                                                                        +
     a.easel,                                                                                        +
     COALESCE(ap.name, 'Artist'),                                                                    +
     e.min_bid_increment,                                                                            +
     e.auction_start_bid,                                                                            +
     COALESCE(co.currency_symbol, '$'),                                                              +
     COALESCE(co.currency_code, 'USD')  -- ADDED: Get currency code from countries                   +
   INTO                                                                                              +
     v_art_uuid,                                                                                     +
     v_event_id,                                                                                     +
     v_art_status,                                                                                   +
     v_current_bid,                                                                                  +
     v_round,                                                                                        +
     v_easel,                                                                                        +
     v_artist_name,                                                                                  +
     v_min_increment,                                                                                +
     v_auction_start_bid,                                                                            +
     v_currency_symbol,                                                                              +
     v_currency_code  -- ADDED: Store currency code                                                  +
   FROM art a                                                                                        +
   JOIN events e ON a.event_id = e.id                                                                +
   JOIN cities c ON e.city_id = c.id  -- ADDED: Join through cities to get currency                  +
   JOIN countries co ON c.country_id = co.id  -- ADDED: Join countries for currency                  +
   LEFT JOIN artist_profiles ap ON a.artist_id = ap.id                                               +
   WHERE a.art_code = p_art_id;                                                                      +
                                                                                                     +
   -- Check if art exists                                                                            +
   IF NOT FOUND THEN                                                                                 +
     RETURN jsonb_build_object(                                                                      +
       'success', false,                                                                             +
       'error', 'Unable to find the matching Art'                                                    +
     );                                                                                              +
   END IF;                                                                                           +
                                                                                                     +
   -- Check if auction is enabled                                                                    +
   IF v_art_status <> 'active' THEN                                                                  +
     RETURN jsonb_build_object(                                                                      +
       'success', false,                                                                             +
       'error', 'Auction disabled'                                                                   +
     );                                                                                              +
   END IF;                                                                                           +
                                                                                                     +
   -- Determine minimum bid                                                                          +
   IF v_current_bid IS NULL OR v_current_bid = 0 THEN                                                +
     IF p_amount < v_auction_start_bid THEN                                                          +
       RETURN jsonb_build_object(                                                                    +
         'success', false,                                                                           +
         'error', format('Minimum bid is %s%s', v_currency_symbol, v_auction_start_bid)              +
       );                                                                                            +
     END IF;                                                                                         +
   ELSE                                                                                              +
     IF p_amount < (v_current_bid + v_min_increment) THEN                                            +
       RETURN jsonb_build_object(                                                                    +
         'success', false,                                                                           +
         'error', format('Minimum bid is %s%s', v_currency_symbol, (v_current_bid + v_min_increment))+
       );                                                                                            +
     END IF;                                                                                         +
   END IF;                                                                                           +
                                                                                                     +
   -- Insert new bid WITH CURRENCY INFORMATION                                                       +
   v_bid_id := gen_random_uuid();                                                                    +
   INSERT INTO bids (id, art_id, person_id, amount, currency_code, currency_symbol, created_at)      +
   VALUES (v_bid_id, v_art_uuid, v_person_id, p_amount, v_currency_code, v_currency_symbol, NOW());  +
                                                                                                     +
   -- Update art record                                                                              +
   UPDATE art                                                                                        +
   SET                                                                                               +
     current_bid = p_amount,                                                                         +
     bid_count = bid_count + 1,                                                                      +
     updated_at = NOW()                                                                              +
   WHERE id = v_art_uuid;                                                                            +
                                                                                                     +
   -- Return success                                                                                 +
   RETURN jsonb_build_object(                                                                        +
     'success', true,                                                                                +
     'bid_id', v_bid_id,                                                                             +
     'message', 'Bid placed successfully',                                                           +
     'person_id_used', v_person_id,                                                                  +
     'currency_code', v_currency_code,  -- ADDED: Return currency info                               +
     'currency_symbol', v_currency_symbol  -- ADDED: Return currency info                            +
   );                                                                                                +
                                                                                                     +
 EXCEPTION                                                                                           +
   WHEN OTHERS THEN                                                                                  +
     RAISE WARNING 'Error in process_bid_secure: %', SQLERRM;                                        +
     RETURN jsonb_build_object(                                                                      +
       'success', false,                                                                             +
       'error', 'An error occurred processing your bid',                                             +
       'detail', SQLERRM                                                                             +
     );                                                                                              +
 END;                                                                                                +
 $function$                                                                                          +
 
(1 row)

