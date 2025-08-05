-- Materialized view for efficient auction tracking and admin dashboard

-- 1. Create materialized view for auction dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_auction_dashboard AS
SELECT 
  a.id as art_id,
  a.art_code,
  a.event_id,
  e.name as event_name,
  e.currency,
  e.tax,
  a.round,
  a.easel,
  ap.name as artist_name,
  ap.instagram as artist_instagram,
  a.starting_bid,
  a.current_bid,
  a.bid_count,
  a.status,
  a.closing_time,
  a.auction_extended,
  a.extension_count,
  -- Winner information (privacy protected)
  CASE 
    WHEN w.nickname IS NOT NULL THEN 
      CONCAT(SPLIT_PART(w.nickname, ' ', 1), ' ', LEFT(SPLIT_PART(w.nickname, ' ', 2), 1), '.')
    ELSE NULL
  END as winner_name_masked,
  CASE 
    WHEN w.phone_number IS NOT NULL THEN 
      CONCAT('***-', RIGHT(w.phone_number, 4))
    ELSE NULL
  END as winner_phone_masked,
  w.id as winner_id,
  -- Latest bid information
  lb.amount as latest_bid_amount,
  lb.created_at as latest_bid_time,
  -- Auction metrics
  CASE 
    WHEN a.closing_time IS NULL THEN 'not_scheduled'
    WHEN a.status = 'closed' THEN 'closed'
    WHEN a.closing_time < NOW() THEN 'expired_pending_close'
    WHEN a.closing_time < NOW() + INTERVAL '5 minutes' THEN 'closing_soon'
    WHEN a.closing_time < NOW() + INTERVAL '1 hour' THEN 'active_urgent'
    ELSE 'active'
  END as auction_status,
  -- Time calculations
  EXTRACT(EPOCH FROM (a.closing_time - NOW())) as seconds_until_close,
  a.created_at,
  a.updated_at
FROM art a
JOIN events e ON a.event_id = e.id
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN people w ON a.winner_id = w.id
LEFT JOIN LATERAL (
  SELECT amount, created_at 
  FROM bids 
  WHERE art_id = a.id 
  ORDER BY created_at DESC 
  LIMIT 1
) lb ON true
WHERE e.enable_auction = true;

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mv_auction_dashboard_event_id ON mv_auction_dashboard(event_id);
CREATE INDEX IF NOT EXISTS idx_mv_auction_dashboard_status ON mv_auction_dashboard(auction_status);
CREATE INDEX IF NOT EXISTS idx_mv_auction_dashboard_closing ON mv_auction_dashboard(closing_time);

-- 3. Create refresh function
CREATE OR REPLACE FUNCTION refresh_auction_dashboard()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_auction_dashboard;
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to get auction summary stats
CREATE OR REPLACE FUNCTION get_auction_summary(p_event_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_artworks INTEGER,
  active_auctions INTEGER,
  closing_soon INTEGER,
  closed_auctions INTEGER,
  total_bids INTEGER,
  total_revenue NUMERIC,
  average_bid NUMERIC,
  highest_bid NUMERIC,
  no_bid_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total_artworks,
    COUNT(*) FILTER (WHERE auction_status IN ('active', 'active_urgent', 'closing_soon'))::INTEGER as active_auctions,
    COUNT(*) FILTER (WHERE auction_status = 'closing_soon')::INTEGER as closing_soon,
    COUNT(*) FILTER (WHERE auction_status = 'closed')::INTEGER as closed_auctions,
    SUM(bid_count)::INTEGER as total_bids,
    SUM(CASE WHEN status = 'closed' THEN current_bid ELSE 0 END) as total_revenue,
    AVG(current_bid) FILTER (WHERE current_bid > 0) as average_bid,
    MAX(current_bid) as highest_bid,
    COUNT(*) FILTER (WHERE bid_count = 0)::INTEGER as no_bid_count
  FROM mv_auction_dashboard
  WHERE p_event_id IS NULL OR event_id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Create view for real-time bid activity
CREATE OR REPLACE VIEW v_recent_bid_activity AS
SELECT 
  b.id as bid_id,
  b.created_at as bid_time,
  b.amount,
  a.art_code,
  a.event_id,
  e.name as event_name,
  ap.name as artist_name,
  -- Privacy protected bidder info
  CONCAT(SPLIT_PART(p.nickname, ' ', 1), ' ', LEFT(SPLIT_PART(p.nickname, ' ', 2), 1), '.') as bidder_name,
  CONCAT('***-', RIGHT(p.phone_number, 4)) as bidder_phone,
  -- Bid context
  b.amount - LAG(b.amount) OVER (PARTITION BY b.art_id ORDER BY b.created_at) as bid_increment,
  ROW_NUMBER() OVER (PARTITION BY b.art_id ORDER BY b.created_at DESC) as bid_rank
FROM bids b
JOIN art a ON b.art_id = a.id
JOIN events e ON a.event_id = e.id
JOIN people p ON b.person_id = p.id
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE b.created_at > NOW() - INTERVAL '24 hours'
ORDER BY b.created_at DESC;

-- 6. Schedule automatic refresh every 5 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-auction-dashboard') THEN
    PERFORM cron.unschedule('refresh-auction-dashboard');
  END IF;
  
  PERFORM cron.schedule(
    'refresh-auction-dashboard',
    '*/5 * * * *',
    'SELECT refresh_auction_dashboard();'
  );
END $$;

-- 7. Initial population
REFRESH MATERIALIZED VIEW mv_auction_dashboard;

-- 8. Grant permissions
GRANT SELECT ON mv_auction_dashboard TO authenticated;
GRANT SELECT ON v_recent_bid_activity TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_auction_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION get_auction_summary(UUID) TO authenticated;