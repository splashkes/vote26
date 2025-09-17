                                                  pg_get_functiondef                                                  
----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_cloudflare_config()                                                           +
  RETURNS jsonb                                                                                                      +
  LANGUAGE plpgsql                                                                                                   +
  SECURITY DEFINER                                                                                                   +
  SET search_path TO 'pg_catalog', 'public'                                                                          +
 AS $function$                                                                                                       +
  BEGIN                                                                                                              +
      -- For now, return config for any authenticated user                                                           +
      -- The frontend already checks permissions                                                                     +
      IF auth.uid() IS NOT NULL THEN                                                                                 +
          RETURN jsonb_build_object(                                                                                 +
              'accountId', '8679deebf60af4e83f621a3173b3f2a4',                                                       +
              'accountHash', 'IGZfH_Pl-6S6csykNnXNJw',                                                               +
              'deliveryUrl', 'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw',                                     +
              'uploadUrl', 'https://api.cloudflare.com/client/v4/accounts/8679deebf60af4e83f621a3173b3f2a4/images/v1'+
          );                                                                                                         +
      ELSE                                                                                                           +
          RETURN NULL;                                                                                               +
      END IF;                                                                                                        +
  END;                                                                                                               +
  $function$                                                                                                         +
 
(1 row)

