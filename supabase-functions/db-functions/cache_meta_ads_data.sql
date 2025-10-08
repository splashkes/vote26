                                             pg_get_functiondef                                             
------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.cache_meta_ads_data()                                                   +
  RETURNS jsonb                                                                                            +
  LANGUAGE plpgsql                                                                                         +
  SECURITY DEFINER                                                                                         +
 AS $function$                                                                                             +
 DECLARE                                                                                                   +
   event_record RECORD;                                                                                    +
   start_date timestamp with time zone;                                                                    +
   end_date timestamp with time zone;                                                                      +
   total_count integer := 0;                                                                               +
   success_count integer := 0;                                                                             +
   result jsonb;                                                                                           +
 BEGIN                                                                                                     +
   -- Calculate date range: 2 days ago to 33 days in the future                                            +
   start_date := now() - interval '2 days';                                                                +
   end_date := now() + interval '33 days';                                                                 +
                                                                                                           +
   RAISE NOTICE 'Caching Meta Ads data for events from % to %', start_date, end_date;                      +
                                                                                                           +
   -- Loop through events in date range                                                                    +
   FOR event_record IN                                                                                     +
     SELECT id, eid, name, event_start_datetime                                                            +
     FROM events                                                                                           +
     WHERE event_start_datetime >= start_date                                                              +
       AND event_start_datetime <= end_date                                                                +
       AND eid IS NOT NULL                                                                                 +
     ORDER BY event_start_datetime                                                                         +
   LOOP                                                                                                    +
     total_count := total_count + 1;                                                                       +
                                                                                                           +
     -- Call the meta-ads-report edge function via pg_net                                                  +
     PERFORM net.http_get(                                                                                 +
       url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/' || event_record.eid,+
       headers := jsonb_build_object(                                                                      +
         'X-Cron-Secret', (SELECT secret_value FROM cron_secrets WHERE name = 'meta_ads_cron')             +
       )                                                                                                   +
     );                                                                                                    +
                                                                                                           +
     success_count := success_count + 1;                                                                   +
     RAISE NOTICE 'Cached data for event: % (%)', event_record.eid, event_record.name;                     +
   END LOOP;                                                                                               +
                                                                                                           +
   result := jsonb_build_object(                                                                           +
     'success', true,                                                                                      +
     'date_range', jsonb_build_object(                                                                     +
       'start', start_date,                                                                                +
       'end', end_date                                                                                     +
     ),                                                                                                    +
     'total_events', total_count,                                                                          +
     'cached_events', success_count,                                                                       +
     'completed_at', now()                                                                                 +
   );                                                                                                      +
                                                                                                           +
   RAISE NOTICE 'Cron job completed: % events processed, % cached', total_count, success_count;            +
                                                                                                           +
   RETURN result;                                                                                          +
 END;                                                                                                      +
 $function$                                                                                                +
 
(1 row)

