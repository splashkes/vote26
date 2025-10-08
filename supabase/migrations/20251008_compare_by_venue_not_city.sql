-- Update get_previous_event_metrics to compare by venue instead of city
-- Date: 2025-10-08
-- Issue: Comparative rules were comparing events in the same city, but should compare same venue
-- Reason: Different venues in the same city can have very different capacities and audiences

CREATE OR REPLACE FUNCTION public.get_previous_event_metrics(p_event_id uuid)
 RETURNS TABLE(previous_event_id uuid, previous_event_eid character varying, previous_event_name text, previous_event_end_datetime timestamp with time zone, ticket_revenue numeric, auction_revenue numeric, total_votes integer, round1_votes integer, round2_votes integer, round3_votes integer, qr_registrations integer, online_registrations integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_venue_id UUID;
  v_event_end_datetime TIMESTAMPTZ;
BEGIN
  -- Get the venue and end datetime of the current event
  SELECT venue_id, event_end_datetime
  INTO v_venue_id, v_event_end_datetime
  FROM events
  WHERE id = p_event_id;

  -- If event not found or venue not set, return empty result
  IF v_venue_id IS NULL THEN
    RETURN;
  END IF;

  -- Get the most recent previous event at the same venue
  RETURN QUERY
  WITH prev_event AS (
    SELECT e.id, e.eid, e.name, e.event_end_datetime
    FROM events e
    WHERE e.venue_id = v_venue_id  -- Changed from city_id to venue_id
      AND e.id != p_event_id
      AND e.event_end_datetime < COALESCE(v_event_end_datetime, NOW())
      AND e.event_end_datetime IS NOT NULL
    ORDER BY e.event_end_datetime DESC
    LIMIT 1
  ),
  prev_votes AS (
    SELECT
      pe.id as event_id,
      COUNT(v.id) as total_votes,
      COUNT(CASE WHEN v.round = 1 THEN 1 END) as round1_votes,
      COUNT(CASE WHEN v.round = 2 THEN 1 END) as round2_votes,
      COUNT(CASE WHEN v.round = 3 THEN 1 END) as round3_votes
    FROM prev_event pe
    LEFT JOIN art a ON a.event_id = pe.id
    LEFT JOIN votes v ON v.art_uuid = a.id
    GROUP BY pe.id
  ),
  prev_registrations AS (
    SELECT
      pe.id as event_id,
      COUNT(CASE WHEN er.registration_type = 'qr' THEN 1 END) as qr_regs,
      COUNT(CASE WHEN er.registration_type = 'online' THEN 1 END) as online_regs
    FROM prev_event pe
    LEFT JOIN event_registrations er ON er.event_id = pe.id
    GROUP BY pe.id
  ),
  prev_auction AS (
    SELECT
      pe.id as event_id,
      COALESCE(SUM(a.final_price), 0) as auction_revenue
    FROM prev_event pe
    LEFT JOIN art a ON a.event_id = pe.id
    WHERE a.status IN ('sold', 'paid')
    GROUP BY pe.id
  )
  SELECT
    pe.id,
    pe.eid,
    pe.name,
    pe.event_end_datetime,
    COALESCE(ebc.ticket_revenue, 0)::NUMERIC,
    COALESCE(pa.auction_revenue, 0)::NUMERIC,
    COALESCE(pv.total_votes, 0)::INTEGER,
    COALESCE(pv.round1_votes, 0)::INTEGER,
    COALESCE(pv.round2_votes, 0)::INTEGER,
    COALESCE(pv.round3_votes, 0)::INTEGER,
    COALESCE(pr.qr_regs, 0)::INTEGER,
    COALESCE(pr.online_regs, 0)::INTEGER
  FROM prev_event pe
  LEFT JOIN eventbrite_api_cache ebc ON ebc.event_id = pe.id
  LEFT JOIN prev_votes pv ON pv.event_id = pe.id
  LEFT JOIN prev_registrations pr ON pr.event_id = pe.id
  LEFT JOIN prev_auction pa ON pa.event_id = pe.id;
END;
$function$;

-- Update rule descriptions to reflect venue-based comparison
UPDATE event_linter_rules
SET description = 'Total votes significantly lower than previous event at same venue (>50% decline)',
    updated_at = now()
WHERE rule_id = 'total_votes_decline_error';

UPDATE event_linter_rules
SET description = 'Total votes lower than previous event at same venue',
    updated_at = now()
WHERE rule_id = 'total_votes_decline_warning';

UPDATE event_linter_rules
SET description = 'Total votes exceeded previous event at same venue',
    updated_at = now()
WHERE rule_id = 'total_votes_success';

UPDATE event_linter_rules
SET description = 'Ticket revenue significantly lower than previous event at same venue (>30% decline)',
    updated_at = now()
WHERE rule_id = 'ticket_revenue_decline_error';

UPDATE event_linter_rules
SET description = 'Ticket revenue lower than previous event at same venue',
    updated_at = now()
WHERE rule_id = 'ticket_revenue_decline_warning';

UPDATE event_linter_rules
SET description = 'Ticket revenue exceeded previous event at same venue',
    updated_at = now()
WHERE rule_id = 'ticket_revenue_success';

UPDATE event_linter_rules
SET description = 'Auction revenue exceeded previous event at same venue',
    updated_at = now()
WHERE rule_id = 'auction_revenue_success';

COMMENT ON FUNCTION get_previous_event_metrics IS 'Returns metrics from the most recent previous event at the same venue for comparison purposes';
