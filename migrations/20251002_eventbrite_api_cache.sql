-- Eventbrite API Cache with Historical Tracking
-- Created: 2025-10-02
-- Purpose: Cache Eventbrite API responses with 6-hour TTL, preserve all historical calls

-- Create table for Eventbrite API cache (NO unique constraints - preserve history!)
CREATE TABLE IF NOT EXISTS eventbrite_api_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identifiers
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  eid VARCHAR(50) NOT NULL,
  eventbrite_id VARCHAR(255) NOT NULL,

  -- API response data (JSONB for flexibility and future-proofing)
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,           -- Full event details from API
  ticket_classes JSONB NOT NULL DEFAULT '[]'::jsonb,       -- Ticket types with pricing
  sales_summary JSONB NOT NULL DEFAULT '{}'::jsonb,        -- Aggregated sales data from /reports/sales/
  orders_summary JSONB DEFAULT '{}'::jsonb,                -- Optional: orders data if used

  -- Processed metrics (extracted for quick access and queries)
  total_tickets_sold INTEGER NOT NULL DEFAULT 0,

  -- Financial breakdown (ALL amounts in event currency)
  gross_revenue NUMERIC(10,2) DEFAULT 0,           -- Total charged to buyers
  ticket_revenue NUMERIC(10,2) DEFAULT 0,          -- Face value of tickets only
  taxes_collected NUMERIC(10,2) DEFAULT 0,         -- Sales tax/VAT
  eventbrite_fees NUMERIC(10,2) DEFAULT 0,         -- EB service fees
  payment_processing_fees NUMERIC(10,2) DEFAULT 0, -- Payment gateway fees
  total_fees NUMERIC(10,2) DEFAULT 0,              -- Sum of all fees
  net_deposit NUMERIC(10,2) DEFAULT 0,             -- What organizer receives (calculated: ticket_revenue - fees)

  total_capacity INTEGER,
  currency_code VARCHAR(10),

  -- Data quality tracking
  api_response_status VARCHAR(50) NOT NULL,  -- 'success', 'partial', 'error', 'fallback'
  api_response_code INTEGER,
  api_error_message TEXT,
  data_quality_score INTEGER CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
  data_quality_flags JSONB DEFAULT '[]'::jsonb,  -- Array of issues found

  -- Cache management
  fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  fetch_duration_ms INTEGER,                -- How long API call took
  is_stale BOOLEAN DEFAULT false,           -- Set to true if expires_at < NOW()

  -- Metadata
  fetched_by VARCHAR(255),                  -- User/function that triggered fetch
  fetch_reason VARCHAR(50),                 -- 'billing', 'refresh', 'manual', 'scheduled'
  api_version VARCHAR(20) DEFAULT 'v3',
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CHECK (total_tickets_sold >= 0),
  CHECK (gross_revenue >= 0),
  CHECK (ticket_revenue >= 0),
  CHECK (taxes_collected >= 0),
  CHECK (eventbrite_fees >= 0),
  CHECK (payment_processing_fees >= 0),
  CHECK (total_fees >= 0)
);

-- Indexes for performance (NO unique index - allow multiple rows per event!)
CREATE INDEX idx_eb_cache_event_id ON eventbrite_api_cache(event_id);
CREATE INDEX idx_eb_cache_eid ON eventbrite_api_cache(eid);
CREATE INDEX idx_eb_cache_eventbrite_id ON eventbrite_api_cache(eventbrite_id);
CREATE INDEX idx_eb_cache_fetched_at ON eventbrite_api_cache(fetched_at DESC);
CREATE INDEX idx_eb_cache_expires_at ON eventbrite_api_cache(expires_at);

-- Index for finding latest data per event (filter in query for freshness)
CREATE INDEX idx_eb_cache_latest_fresh ON eventbrite_api_cache(eid, fetched_at DESC);

-- Index for quality filtering
CREATE INDEX idx_eb_cache_quality ON eventbrite_api_cache(data_quality_score)
  WHERE data_quality_score < 80;

-- Index for finding historical data
CREATE INDEX idx_eb_cache_history ON eventbrite_api_cache(eid, fetched_at DESC);

-- Row Level Security
ALTER TABLE eventbrite_api_cache ENABLE ROW LEVEL SECURITY;

-- Admin users can read cache data for events they have access to
CREATE POLICY "Admin read eventbrite cache" ON eventbrite_api_cache
  FOR SELECT USING (
    auth.jwt()->>'role' = 'authenticated'
    AND (auth.jwt()->'admin_events')::jsonb ? eid
  );

-- Service role can insert (for edge functions)
CREATE POLICY "Service role insert eventbrite cache" ON eventbrite_api_cache
  FOR INSERT WITH CHECK (
    auth.role() = 'service_role'
  );

-- Comment
COMMENT ON TABLE eventbrite_api_cache IS
  'Cached Eventbrite API responses for billing accuracy. TTL: 6 hours.
   PRESERVES ALL HISTORICAL DATA - new rows are inserted for each fetch, old data never deleted.
   Use fetched_at DESC to get latest data.';

COMMENT ON COLUMN eventbrite_api_cache.net_deposit IS
  'Calculated net amount paid to organizer after all fees (ticket_revenue - eventbrite_fees - payment_processing_fees)';

COMMENT ON COLUMN eventbrite_api_cache.is_stale IS
  'True if expires_at < NOW(). Check expires_at > NOW() to find fresh data. Updated periodically.';

-- Helper function to get latest fresh cache entry
CREATE OR REPLACE FUNCTION get_latest_eventbrite_cache(p_eid VARCHAR)
RETURNS TABLE (
  cache_id UUID,
  event_id UUID,
  eid VARCHAR,
  total_tickets_sold INTEGER,
  gross_revenue NUMERIC,
  ticket_revenue NUMERIC,
  taxes_collected NUMERIC,
  eventbrite_fees NUMERIC,
  payment_processing_fees NUMERIC,
  total_fees NUMERIC,
  net_deposit NUMERIC,
  currency_code VARCHAR,
  data_quality_score INTEGER,
  is_stale BOOLEAN,
  fetched_at TIMESTAMP,
  expires_at TIMESTAMP,
  sales_summary JSONB,
  ticket_classes JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    eac.id as cache_id,
    eac.event_id,
    eac.eid,
    eac.total_tickets_sold,
    eac.gross_revenue,
    eac.ticket_revenue,
    eac.taxes_collected,
    eac.eventbrite_fees,
    eac.payment_processing_fees,
    eac.total_fees,
    eac.net_deposit,
    eac.currency_code,
    eac.data_quality_score,
    eac.is_stale,
    eac.fetched_at,
    eac.expires_at,
    eac.sales_summary,
    eac.ticket_classes
  FROM eventbrite_api_cache eac
  WHERE eac.eid = p_eid
  ORDER BY eac.fetched_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_latest_eventbrite_cache IS
  'Helper function to get the most recent cache entry for an event (by EID), regardless of staleness.';

-- View for latest fresh data per event
CREATE OR REPLACE VIEW eventbrite_latest_fresh_cache AS
SELECT DISTINCT ON (eid)
  id,
  event_id,
  eid,
  eventbrite_id,
  total_tickets_sold,
  gross_revenue,
  ticket_revenue,
  taxes_collected,
  eventbrite_fees,
  payment_processing_fees,
  total_fees,
  net_deposit,
  currency_code,
  data_quality_score,
  data_quality_flags,
  fetched_at,
  expires_at,
  (expires_at < NOW()) as is_stale,
  fetch_duration_ms,
  sales_summary,
  ticket_classes
FROM eventbrite_api_cache
WHERE expires_at > NOW()
ORDER BY eid, fetched_at DESC;

COMMENT ON VIEW eventbrite_latest_fresh_cache IS
  'Latest non-stale (< 6 hours old) cache entry for each event. Use this for current data.';

-- View for data quality monitoring
CREATE OR REPLACE VIEW eventbrite_data_quality_summary AS
SELECT
  e.eid,
  e.name as event_name,
  e.event_start_datetime,
  eac.total_tickets_sold,
  eac.gross_revenue,
  eac.net_deposit,
  eac.currency_code,
  eac.data_quality_score,
  eac.data_quality_flags,
  eac.fetched_at,
  eac.expires_at,
  (eac.expires_at < NOW()) as is_stale,
  CASE
    WHEN eac.data_quality_score >= 90 THEN 'excellent'
    WHEN eac.data_quality_score >= 70 THEN 'good'
    WHEN eac.data_quality_score >= 50 THEN 'fair'
    ELSE 'poor'
  END as quality_rating,
  eac.api_response_status,
  EXTRACT(EPOCH FROM (NOW() - eac.fetched_at)) / 3600 as age_hours
FROM events e
INNER JOIN LATERAL (
  SELECT *
  FROM eventbrite_api_cache
  WHERE eventbrite_api_cache.event_id = e.id
  ORDER BY fetched_at DESC
  LIMIT 1
) eac ON true
WHERE e.eventbrite_id IS NOT NULL
ORDER BY e.event_start_datetime DESC;

COMMENT ON VIEW eventbrite_data_quality_summary IS
  'Latest cache entry per event with quality assessment. Use for monitoring and alerts.';

-- Grant permissions
GRANT SELECT ON eventbrite_api_cache TO authenticated;
GRANT SELECT ON eventbrite_latest_fresh_cache TO authenticated;
GRANT SELECT ON eventbrite_data_quality_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_eventbrite_cache TO authenticated;
