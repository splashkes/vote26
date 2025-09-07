                                                                             pg_get_functiondef                                                                              
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.admin_get_artwork_analysis_stats()                                                                                                       +
  RETURNS TABLE(total_analyses integer, active_analyses integer, expired_analyses integer, sample_work_count integer, event_painting_count integer, avg_tokens_used numeric)+
  LANGUAGE plpgsql                                                                                                                                                          +
 AS $function$                                                                                                                                                              +
 BEGIN                                                                                                                                                                      +
     RETURN QUERY                                                                                                                                                           +
     SELECT                                                                                                                                                                 +
         COUNT(*)::INTEGER as total_analyses,                                                                                                                               +
         COUNT(CASE WHEN expires_at > NOW() THEN 1 END)::INTEGER as active_analyses,                                                                                        +
         COUNT(CASE WHEN expires_at <= NOW() THEN 1 END)::INTEGER as expired_analyses,                                                                                      +
         COUNT(CASE WHEN artwork_type = 'sample_work' THEN 1 END)::INTEGER as sample_work_count,                                                                            +
         COUNT(CASE WHEN artwork_type = 'event_painting' THEN 1 END)::INTEGER as event_painting_count,                                                                      +
         ROUND(AVG(COALESCE((token_usage->>'total_tokens')::INTEGER, 0)), 2) as avg_tokens_used                                                                             +
     FROM art_media_ai_caption;                                                                                                                                             +
 END;                                                                                                                                                                       +
 $function$                                                                                                                                                                 +
 
(1 row)

