                                  pg_get_functiondef                                  
--------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.populate_common_slack_channels()                  +
  RETURNS void                                                                       +
  LANGUAGE plpgsql                                                                   +
  SECURITY DEFINER                                                                   +
 AS $function$                                                                       +
 BEGIN                                                                               +
   -- Insert common channels with 24-hour TTL                                        +
   PERFORM update_slack_channel_cache('general', 'C0337E73W', 24);                   +
   PERFORM update_slack_channel_cache('from-artb', 'C08QG87U3D0', 24);               +
   PERFORM update_slack_channel_cache('art-battle-notifications', 'C08QG87U3D0', 24);+
                                                                                     +
   -- Add some city channels that might be commonly used                             +
   PERFORM update_slack_channel_cache('toronto', 'C1234567890', 24);  -- Example IDs +
   PERFORM update_slack_channel_cache('vancouver', 'C2234567890', 24);               +
   PERFORM update_slack_channel_cache('calgary', 'C3234567890', 24);                 +
   PERFORM update_slack_channel_cache('montreal', 'C4234567890', 24);                +
 END;                                                                                +
 $function$                                                                          +
 
(1 row)

