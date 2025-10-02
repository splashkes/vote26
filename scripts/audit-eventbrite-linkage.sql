-- Audit Eventbrite Event Linkage (Past Events for Billing)
-- Outputs data showing which events may have incorrect Eventbrite IDs
-- Focuses on events in the past 6 months (billing period)
-- Run with: psql ... -f audit-eventbrite-linkage.sql -o eventbrite-audit.csv

\pset format csv
\pset tuples_only on

SELECT
  e.eid AS "EID",
  e.name AS "Event Name (Database)",
  e.event_start_datetime::date AS "Event Date",
  c.name AS "City",
  co.currency_code AS "Currency",
  e.eventbrite_id AS "Eventbrite ID",
  eac.eventbrite_event_name AS "Eventbrite Event Name (API)",
  eac.eventbrite_start_date::date AS "Eventbrite Start Date (API)",
  eac.currency_code AS "EB Currency",
  eac.net_deposit AS "Net Deposit",
  eac.total_tickets_sold AS "Tickets Sold",
  eac.fetched_at AS "Data Fetched At",
  CASE
    WHEN eac.id IS NULL THEN 'NO_DATA'
    WHEN LOWER(c.name) = ANY(string_to_array(LOWER(eac.eventbrite_event_name), ' '))
         AND ABS(EXTRACT(EPOCH FROM (e.event_start_datetime - eac.eventbrite_start_date)) / 86400) <= 7
    THEN 'OK'
    WHEN LOWER(c.name) != ANY(string_to_array(LOWER(eac.eventbrite_event_name), ' '))
         AND ABS(EXTRACT(EPOCH FROM (e.event_start_datetime - eac.eventbrite_start_date)) / 86400) > 7
    THEN 'MISMATCH_SEVERE'
    ELSE 'MISMATCH_PARTIAL'
  END AS "Match Status"
FROM events e
LEFT JOIN cities c ON e.city_id = c.id
LEFT JOIN countries co ON c.country_id = co.id
LEFT JOIN LATERAL (
  SELECT *
  FROM eventbrite_api_cache
  WHERE eventbrite_api_cache.eid = e.eid
  ORDER BY fetched_at DESC
  LIMIT 1
) eac ON true
WHERE e.eventbrite_id IS NOT NULL
  AND e.event_start_datetime >= NOW() - INTERVAL '6 months'
  AND e.event_start_datetime <= NOW() + INTERVAL '1 month'
ORDER BY
  CASE
    WHEN eac.id IS NULL THEN 3
    WHEN LOWER(c.name) != ANY(string_to_array(LOWER(eac.eventbrite_event_name), ' ')) THEN 2
    ELSE 1
  END,
  e.event_start_datetime DESC;
