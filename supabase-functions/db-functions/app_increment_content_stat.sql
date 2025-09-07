                                                   pg_get_functiondef                                                   
------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.app_increment_content_stat(p_content_id text, p_content_type text, p_stat_type text)+
  RETURNS void                                                                                                         +
  LANGUAGE plpgsql                                                                                                     +
 AS $function$                                                                                                         +
 BEGIN                                                                                                                 +
     -- Insert if not exists                                                                                           +
     INSERT INTO app_content_analytics (content_id, content_type)                                                      +
     VALUES (p_content_id, p_content_type)                                                                             +
     ON CONFLICT (content_id) DO NOTHING;                                                                              +
                                                                                                                       +
     -- Update the specific stat                                                                                       +
     CASE p_stat_type                                                                                                  +
         WHEN 'view' THEN                                                                                              +
             UPDATE app_content_analytics                                                                              +
             SET total_views = total_views + 1,                                                                        +
                 last_viewed_at = NOW(),                                                                               +
                 updated_at = NOW()                                                                                    +
             WHERE content_id = p_content_id;                                                                          +
         WHEN 'like' THEN                                                                                              +
             UPDATE app_content_analytics                                                                              +
             SET total_likes = total_likes + 1,                                                                        +
                 updated_at = NOW()                                                                                    +
             WHERE content_id = p_content_id;                                                                          +
         WHEN 'share' THEN                                                                                             +
             UPDATE app_content_analytics                                                                              +
             SET total_shares = total_shares + 1,                                                                      +
                 updated_at = NOW()                                                                                    +
             WHERE content_id = p_content_id;                                                                          +
         WHEN 'save' THEN                                                                                              +
             UPDATE app_content_analytics                                                                              +
             SET total_saves = total_saves + 1,                                                                        +
                 updated_at = NOW()                                                                                    +
             WHERE content_id = p_content_id;                                                                          +
     END CASE;                                                                                                         +
 END;                                                                                                                  +
 $function$                                                                                                            +
 
(1 row)

