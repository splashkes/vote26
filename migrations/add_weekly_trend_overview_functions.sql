-- Add weekly trend overview functions and fix revenue pipeline
-- Created: 2025-10-17
-- Purpose: Add graph-ready counters with week-over-week comparisons for applications, confirmations, votes, and bids

-- Fix: Revenue pipeline was summing all cache entries instead of latest per event
CREATE OR REPLACE FUNCTION get_overview_revenue_pipeline()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  total_revenue NUMERIC;
  event_count INTEGER;
  result JSONB;
BEGIN
  WITH upcoming_eids AS (
    SELECT eid
    FROM events
    WHERE event_start_datetime >= NOW()
      AND event_start_datetime <= NOW() + INTERVAL '30 days'
      AND (eid ~ '^AB\d{3,4}$')
      AND (eid::text NOT SIMILAR TO 'AB(4[0-9]{3}|5[0-9]{3}|6[0-9]{3})')
  ),
  latest_cache AS (
    SELECT DISTINCT ON (eac.eid)
      eac.eid,
      eac.ticket_revenue
    FROM eventbrite_api_cache eac
    INNER JOIN upcoming_eids ue ON eac.eid = ue.eid
    ORDER BY eac.eid, eac.fetched_at DESC
  )
  SELECT
    COALESCE(SUM(lc.ticket_revenue), 0),
    COUNT(DISTINCT ue.eid)
  INTO total_revenue, event_count
  FROM upcoming_eids ue
  LEFT JOIN latest_cache lc ON ue.eid = lc.eid;

  result := jsonb_build_object(
    'total_revenue', total_revenue,
    'event_count', event_count,
    'metric_type', 'revenue_pipeline'
  );

  RETURN result;
END;
$$;

-- Function 1: Artist applications per week (last 10 weeks)
CREATE OR REPLACE FUNCTION get_overview_artist_applications_weekly()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  weekly_data JSONB;
  current_week INTEGER;
  last_week INTEGER;
  result JSONB;
BEGIN
  -- Get weekly counts for last 10 weeks
  WITH week_series AS (
    SELECT
      generate_series(9, 0, -1) as weeks_ago
  ),
  weekly_counts AS (
    SELECT
      ws.weeks_ago,
      COUNT(ac.id) as application_count
    FROM week_series ws
    LEFT JOIN artist_confirmations ac ON
      ac.created_at >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')
      AND ac.created_at < (NOW() - ws.weeks_ago * INTERVAL '1 week')
    GROUP BY ws.weeks_ago
    ORDER BY ws.weeks_ago DESC
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'week_offset', weeks_ago,
        'count', application_count,
        'week_label',
          CASE
            WHEN weeks_ago = 0 THEN 'This Week'
            WHEN weeks_ago = 1 THEN 'Last Week'
            ELSE weeks_ago || ' weeks ago'
          END
      ) ORDER BY weeks_ago DESC
    )
  INTO weekly_data
  FROM weekly_counts;

  -- Get current week and last week for comparison
  SELECT COUNT(*) INTO current_week
  FROM artist_confirmations
  WHERE created_at >= NOW() - INTERVAL '1 week';

  SELECT COUNT(*) INTO last_week
  FROM artist_confirmations
  WHERE created_at >= NOW() - INTERVAL '2 weeks'
    AND created_at < NOW() - INTERVAL '1 week';

  result := jsonb_build_object(
    'metric_type', 'artist_applications_weekly',
    'current_week', current_week,
    'last_week', last_week,
    'change', current_week - last_week,
    'change_pct', CASE WHEN last_week > 0 THEN ROUND(((current_week - last_week)::NUMERIC / last_week::NUMERIC) * 100, 1) ELSE NULL END,
    'weekly_data', weekly_data
  );

  RETURN result;
END;
$$;

-- Function 2: Artist confirmations per week (last 10 weeks)
CREATE OR REPLACE FUNCTION get_overview_artist_confirmations_weekly()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  weekly_data JSONB;
  current_week INTEGER;
  last_week INTEGER;
  result JSONB;
BEGIN
  -- Get weekly counts for last 10 weeks
  WITH week_series AS (
    SELECT
      generate_series(9, 0, -1) as weeks_ago
  ),
  weekly_counts AS (
    SELECT
      ws.weeks_ago,
      COUNT(ac.id) as confirmation_count
    FROM week_series ws
    LEFT JOIN artist_confirmations ac ON
      ac.confirmation_date >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')
      AND ac.confirmation_date < (NOW() - ws.weeks_ago * INTERVAL '1 week')
      AND ac.confirmation_status = 'confirmed'
      AND ac.withdrawn_at IS NULL
    GROUP BY ws.weeks_ago
    ORDER BY ws.weeks_ago DESC
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'week_offset', weeks_ago,
        'count', confirmation_count,
        'week_label',
          CASE
            WHEN weeks_ago = 0 THEN 'This Week'
            WHEN weeks_ago = 1 THEN 'Last Week'
            ELSE weeks_ago || ' weeks ago'
          END
      ) ORDER BY weeks_ago DESC
    )
  INTO weekly_data
  FROM weekly_counts;

  -- Get current week and last week for comparison
  SELECT COUNT(*) INTO current_week
  FROM artist_confirmations
  WHERE confirmation_date >= NOW() - INTERVAL '1 week'
    AND confirmation_status = 'confirmed'
    AND withdrawn_at IS NULL;

  SELECT COUNT(*) INTO last_week
  FROM artist_confirmations
  WHERE confirmation_date >= NOW() - INTERVAL '2 weeks'
    AND confirmation_date < NOW() - INTERVAL '1 week'
    AND confirmation_status = 'confirmed'
    AND withdrawn_at IS NULL;

  result := jsonb_build_object(
    'metric_type', 'artist_confirmations_weekly',
    'current_week', current_week,
    'last_week', last_week,
    'change', current_week - last_week,
    'change_pct', CASE WHEN last_week > 0 THEN ROUND(((current_week - last_week)::NUMERIC / last_week::NUMERIC) * 100, 1) ELSE NULL END,
    'weekly_data', weekly_data
  );

  RETURN result;
END;
$$;

-- Function 3: Votes per week (last 10 weeks)
CREATE OR REPLACE FUNCTION get_overview_votes_weekly()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  weekly_data JSONB;
  current_week INTEGER;
  last_week INTEGER;
  result JSONB;
BEGIN
  -- Get weekly counts for last 10 weeks
  WITH week_series AS (
    SELECT
      generate_series(9, 0, -1) as weeks_ago
  ),
  weekly_counts AS (
    SELECT
      ws.weeks_ago,
      COUNT(v.id) as vote_count
    FROM week_series ws
    LEFT JOIN votes v ON
      v.created_at >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')
      AND v.created_at < (NOW() - ws.weeks_ago * INTERVAL '1 week')
    GROUP BY ws.weeks_ago
    ORDER BY ws.weeks_ago DESC
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'week_offset', weeks_ago,
        'count', vote_count,
        'week_label',
          CASE
            WHEN weeks_ago = 0 THEN 'This Week'
            WHEN weeks_ago = 1 THEN 'Last Week'
            ELSE weeks_ago || ' weeks ago'
          END
      ) ORDER BY weeks_ago DESC
    )
  INTO weekly_data
  FROM weekly_counts;

  -- Get current week and last week for comparison
  SELECT COUNT(*) INTO current_week
  FROM votes
  WHERE created_at >= NOW() - INTERVAL '1 week';

  SELECT COUNT(*) INTO last_week
  FROM votes
  WHERE created_at >= NOW() - INTERVAL '2 weeks'
    AND created_at < NOW() - INTERVAL '1 week';

  result := jsonb_build_object(
    'metric_type', 'votes_weekly',
    'current_week', current_week,
    'last_week', last_week,
    'change', current_week - last_week,
    'change_pct', CASE WHEN last_week > 0 THEN ROUND(((current_week - last_week)::NUMERIC / last_week::NUMERIC) * 100, 1) ELSE NULL END,
    'weekly_data', weekly_data
  );

  RETURN result;
END;
$$;

-- Function 4: Bids per week (last 10 weeks)
CREATE OR REPLACE FUNCTION get_overview_bids_weekly()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  weekly_data JSONB;
  current_week INTEGER;
  last_week INTEGER;
  current_week_amount NUMERIC;
  last_week_amount NUMERIC;
  result JSONB;
BEGIN
  -- Get weekly counts for last 10 weeks
  WITH week_series AS (
    SELECT
      generate_series(9, 0, -1) as weeks_ago
  ),
  weekly_counts AS (
    SELECT
      ws.weeks_ago,
      COUNT(b.id) as bid_count,
      COALESCE(SUM(b.amount), 0) as total_amount
    FROM week_series ws
    LEFT JOIN bids b ON
      b.created_at >= (NOW() - (ws.weeks_ago + 1) * INTERVAL '1 week')
      AND b.created_at < (NOW() - ws.weeks_ago * INTERVAL '1 week')
    GROUP BY ws.weeks_ago
    ORDER BY ws.weeks_ago DESC
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'week_offset', weeks_ago,
        'count', bid_count,
        'total_amount', total_amount,
        'week_label',
          CASE
            WHEN weeks_ago = 0 THEN 'This Week'
            WHEN weeks_ago = 1 THEN 'Last Week'
            ELSE weeks_ago || ' weeks ago'
          END
      ) ORDER BY weeks_ago DESC
    )
  INTO weekly_data
  FROM weekly_counts;

  -- Get current week and last week for comparison
  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO current_week, current_week_amount
  FROM bids
  WHERE created_at >= NOW() - INTERVAL '1 week';

  SELECT COUNT(*), COALESCE(SUM(amount), 0) INTO last_week, last_week_amount
  FROM bids
  WHERE created_at >= NOW() - INTERVAL '2 weeks'
    AND created_at < NOW() - INTERVAL '1 week';

  result := jsonb_build_object(
    'metric_type', 'bids_weekly',
    'current_week', current_week,
    'last_week', last_week,
    'current_week_amount', current_week_amount,
    'last_week_amount', last_week_amount,
    'change', current_week - last_week,
    'change_pct', CASE WHEN last_week > 0 THEN ROUND(((current_week - last_week)::NUMERIC / last_week::NUMERIC) * 100, 1) ELSE NULL END,
    'weekly_data', weekly_data
  );

  RETURN result;
END;
$$;

-- Update master function to include weekly trend metrics
CREATE OR REPLACE FUNCTION get_all_overview_metrics()
RETURNS TABLE (
  rule_id TEXT,
  metrics JSONB
)
SECURITY DEFINER
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Operational overview metrics
  SELECT 'overview_upcoming_events_8weeks'::TEXT, get_overview_upcoming_events_8weeks()
  UNION ALL
  SELECT 'overview_facebook_budget_total'::TEXT, get_overview_facebook_budget()
  UNION ALL
  SELECT 'overview_artist_readiness_pct'::TEXT, get_overview_artist_readiness()
  UNION ALL
  SELECT 'overview_ticket_link_coverage'::TEXT, get_overview_ticket_link_coverage()
  UNION ALL
  SELECT 'overview_revenue_pipeline'::TEXT, get_overview_revenue_pipeline()
  UNION ALL
  SELECT 'overview_events_by_week'::TEXT, get_overview_events_by_week()

  -- Issue-specific overview metrics
  UNION ALL
  SELECT 'overview_slack_missing'::TEXT, get_overview_slack_missing()
  UNION ALL
  SELECT 'overview_disabled_events'::TEXT, get_overview_disabled_events()
  UNION ALL
  SELECT 'overview_overdue_payments'::TEXT, get_overview_overdue_payments()
  UNION ALL
  SELECT 'overview_missing_timezone'::TEXT, get_overview_missing_timezone()
  UNION ALL
  SELECT 'overview_cities_need_booking'::TEXT, get_overview_cities_need_booking()
  UNION ALL
  SELECT 'overview_missing_venue'::TEXT, get_overview_missing_venue()
  UNION ALL
  SELECT 'overview_missing_city'::TEXT, get_overview_missing_city()

  -- Weekly trend metrics
  UNION ALL
  SELECT 'overview_artist_applications_weekly'::TEXT, get_overview_artist_applications_weekly()
  UNION ALL
  SELECT 'overview_artist_confirmations_weekly'::TEXT, get_overview_artist_confirmations_weekly()
  UNION ALL
  SELECT 'overview_votes_weekly'::TEXT, get_overview_votes_weekly()
  UNION ALL
  SELECT 'overview_bids_weekly'::TEXT, get_overview_bids_weekly();
END;
$$;

-- Insert weekly trend overview rules
INSERT INTO event_linter_rules (
  rule_id, name, description, severity, category, context, conditions, message, status
) VALUES
(
  'overview_artist_applications_weekly',
  'Weekly Trend - Artist Applications',
  '10-week trend of artist applications with week-over-week comparison',
  'info',
  'trends',
  'dashboard',
  '[]'::jsonb,
  '📝 Applications: {current_week} this week ({change:+;-} from last week, {change_pct:+;-}%)',
  'active'
),
(
  'overview_artist_confirmations_weekly',
  'Weekly Trend - Artist Confirmations',
  '10-week trend of artist confirmations with week-over-week comparison',
  'info',
  'trends',
  'dashboard',
  '[]'::jsonb,
  '✅ Confirmations: {current_week} this week ({change:+;-} from last week, {change_pct:+;-}%)',
  'active'
),
(
  'overview_votes_weekly',
  'Weekly Trend - Votes Cast',
  '10-week trend of votes cast with week-over-week comparison',
  'info',
  'trends',
  'dashboard',
  '[]'::jsonb,
  '🗳️ Votes: {current_week} this week ({change:+;-} from last week, {change_pct:+;-}%)',
  'active'
),
(
  'overview_bids_weekly',
  'Weekly Trend - Bids Placed',
  '10-week trend of auction bids with week-over-week comparison',
  'info',
  'trends',
  'dashboard',
  '[]'::jsonb,
  '💰 Bids: {current_week} this week (\${current_week_amount}) • {change:+;-} from last week ({change_pct:+;-}%)',
  'active'
)
ON CONFLICT (rule_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  message = EXCLUDED.message,
  status = 'active';
