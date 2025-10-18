                                        pg_get_functiondef                                         
---------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_all_overview_metrics()                                     +
  RETURNS TABLE(rule_id text, metrics jsonb)                                                      +
  LANGUAGE plpgsql                                                                                +
  STABLE SECURITY DEFINER                                                                         +
 AS $function$                                                                                    +
 BEGIN                                                                                            +
   RETURN QUERY                                                                                   +
   -- Operational overview metrics                                                                +
   SELECT 'overview_upcoming_events_8weeks'::TEXT, get_overview_upcoming_events_8weeks()          +
   UNION ALL                                                                                      +
   SELECT 'overview_facebook_budget_total'::TEXT, get_overview_facebook_budget()                  +
   UNION ALL                                                                                      +
   SELECT 'overview_artist_readiness_pct'::TEXT, get_overview_artist_readiness()                  +
   UNION ALL                                                                                      +
   SELECT 'overview_ticket_link_coverage'::TEXT, get_overview_ticket_link_coverage()              +
   UNION ALL                                                                                      +
   SELECT 'overview_revenue_pipeline'::TEXT, get_overview_revenue_pipeline()                      +
   UNION ALL                                                                                      +
   SELECT 'overview_events_by_week'::TEXT, get_overview_events_by_week()                          +
                                                                                                  +
   -- Issue-specific overview metrics                                                             +
   UNION ALL                                                                                      +
   SELECT 'overview_slack_missing'::TEXT, get_overview_slack_missing()                            +
   UNION ALL                                                                                      +
   SELECT 'overview_disabled_events'::TEXT, get_overview_disabled_events()                        +
   UNION ALL                                                                                      +
   SELECT 'overview_overdue_payments'::TEXT, get_overview_overdue_payments()                      +
   UNION ALL                                                                                      +
   SELECT 'overview_missing_timezone'::TEXT, get_overview_missing_timezone()                      +
   UNION ALL                                                                                      +
   SELECT 'overview_cities_need_booking'::TEXT, get_overview_cities_need_booking()                +
   UNION ALL                                                                                      +
   SELECT 'overview_missing_venue'::TEXT, get_overview_missing_venue()                            +
   UNION ALL                                                                                      +
   SELECT 'overview_missing_city'::TEXT, get_overview_missing_city()                              +
                                                                                                  +
   -- Weekly trend metrics                                                                        +
   UNION ALL                                                                                      +
   SELECT 'overview_artist_applications_weekly'::TEXT, get_overview_artist_applications_weekly()  +
   UNION ALL                                                                                      +
   SELECT 'overview_artist_confirmations_weekly'::TEXT, get_overview_artist_confirmations_weekly()+
   UNION ALL                                                                                      +
   SELECT 'overview_votes_weekly'::TEXT, get_overview_votes_weekly()                              +
   UNION ALL                                                                                      +
   SELECT 'overview_bids_weekly'::TEXT, get_overview_bids_weekly();                               +
 END;                                                                                             +
 $function$                                                                                       +
 
(1 row)

