                                                  pg_get_functiondef                                                  
----------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.format_event_datetime_local(utc_datetime timestamp with time zone, city_name text)+
  RETURNS text                                                                                                       +
  LANGUAGE plpgsql                                                                                                   +
  IMMUTABLE                                                                                                          +
 AS $function$                                                                                                       +
 DECLARE                                                                                                             +
     venue_timezone TEXT;                                                                                            +
     local_datetime TIMESTAMP;                                                                                       +
 BEGIN                                                                                                               +
     -- Map city names to timezones                                                                                  +
     venue_timezone := CASE city_name                                                                                +
         WHEN 'Toronto' THEN 'America/Toronto'                                                                       +
         WHEN 'Amsterdam' THEN 'Europe/Amsterdam'                                                                    +
         WHEN 'Bangkok' THEN 'Asia/Bangkok'                                                                          +
         WHEN 'San Francisco' THEN 'America/Los_Angeles'                                                             +
         WHEN 'Oakland' THEN 'America/Los_Angeles'                                                                   +
         WHEN 'Boston' THEN 'America/New_York'                                                                       +
         WHEN 'Seattle' THEN 'America/Los_Angeles'                                                                   +
         WHEN 'Sydney' THEN 'Australia/Sydney'                                                                       +
         WHEN 'Auckland' THEN 'Pacific/Auckland'                                                                     +
         WHEN 'Ottawa' THEN 'America/Toronto'                                                                        +
         WHEN 'Wilmington' THEN 'America/New_York'                                                                   +
         WHEN 'Lancaster' THEN 'America/New_York'                                                                    +
         WHEN 'Montreal' THEN 'America/Toronto'                                                                      +
         WHEN 'Vancouver' THEN 'America/Vancouver'                                                                   +
         WHEN 'Melbourne' THEN 'Australia/Melbourne'                                                                 +
         WHEN 'Brisbane' THEN 'Australia/Brisbane'                                                                   +
         WHEN 'Perth' THEN 'Australia/Perth'                                                                         +
         WHEN 'New York' THEN 'America/New_York'                                                                     +
         WHEN 'Los Angeles' THEN 'America/Los_Angeles'                                                               +
         WHEN 'Chicago' THEN 'America/Chicago'                                                                       +
         WHEN 'London' THEN 'Europe/London'                                                                          +
         WHEN 'Paris' THEN 'Europe/Paris'                                                                            +
         WHEN 'Berlin' THEN 'Europe/Berlin'                                                                          +
         WHEN 'Tokyo' THEN 'Asia/Tokyo'                                                                              +
         WHEN 'Singapore' THEN 'Asia/Singapore'                                                                      +
         ELSE 'UTC'                                                                                                  +
     END;                                                                                                            +
                                                                                                                     +
     -- Convert to local timezone                                                                                    +
     local_datetime := utc_datetime AT TIME ZONE venue_timezone;                                                     +
                                                                                                                     +
     -- Format for Slack: "Mon DD, YYYY"                                                                             +
     RETURN TO_CHAR(local_datetime, 'Mon DD, YYYY');                                                                 +
 END;                                                                                                                +
 $function$                                                                                                          +
 
(1 row)

