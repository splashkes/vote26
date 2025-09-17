                                                  pg_get_functiondef                                                   
-----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.add_slack_channel(p_channel_name character varying, p_channel_id character varying)+
  RETURNS void                                                                                                        +
  LANGUAGE plpgsql                                                                                                    +
 AS $function$                                                                                                        +
   BEGIN                                                                                                              +
     INSERT INTO slack_channels (channel_name, channel_id)                                                            +
     VALUES (LTRIM(p_channel_name, '#'), p_channel_id)                                                                +
     ON CONFLICT (channel_name)                                                                                       +
     DO UPDATE SET                                                                                                    +
       channel_id = EXCLUDED.channel_id,                                                                              +
       updated_at = NOW();                                                                                            +
   END;                                                                                                               +
   $function$                                                                                                         +
 
(1 row)

