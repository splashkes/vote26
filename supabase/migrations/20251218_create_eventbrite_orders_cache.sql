-- ============================================================================
-- Migration: Create eventbrite_orders_cache table
-- Date: 2025-12-18
-- Purpose: Cache Eventbrite order data including tax breakdown before 12-month
--          API retention limit expires. Enables accurate tax reporting.
-- ============================================================================

-- === Main Table ===
CREATE TABLE IF NOT EXISTS eventbrite_orders_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- === Event Linkage ===
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  eid VARCHAR(50) NOT NULL,
  eventbrite_event_id VARCHAR(255) NOT NULL,

  -- === Order Identification ===
  order_id VARCHAR(255) NOT NULL UNIQUE,
  resource_uri TEXT,

  -- === Order Timestamps ===
  order_created TIMESTAMPTZ,
  order_changed TIMESTAMPTZ,

  -- === Buyer Info ===
  buyer_name TEXT,
  buyer_first_name TEXT,
  buyer_last_name TEXT,
  buyer_email TEXT,

  -- === Order Status ===
  order_status VARCHAR(50),              -- placed, refunded, cancelled, etc.
  time_remaining INTEGER,

  -- === Costs Breakdown (extracted for querying) ===
  base_price NUMERIC(10,2) DEFAULT 0,
  tax NUMERIC(10,2) DEFAULT 0,
  eventbrite_fee NUMERIC(10,2) DEFAULT 0,
  payment_fee NUMERIC(10,2) DEFAULT 0,
  gross NUMERIC(10,2) DEFAULT 0,
  currency_code VARCHAR(10),

  -- === Tax Details ===
  has_gts_tax BOOLEAN DEFAULT FALSE,
  tax_components JSONB DEFAULT '[]',
  fee_components JSONB DEFAULT '[]',
  shipping_components JSONB DEFAULT '[]',

  -- === Attendees ===
  attendee_count INTEGER DEFAULT 0,
  attendees JSONB DEFAULT '[]',          -- Full attendee array with costs, profiles, barcodes, answers

  -- === Raw Data (complete audit trail) ===
  costs_raw JSONB,                       -- Full costs object as returned
  order_raw JSONB,                       -- Complete order response

  -- === Cache Metadata ===
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetched_by VARCHAR(255),
  api_version VARCHAR(20) DEFAULT 'v3',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- === Indexes ===
CREATE INDEX IF NOT EXISTS idx_eb_orders_event_id ON eventbrite_orders_cache(event_id);
CREATE INDEX IF NOT EXISTS idx_eb_orders_eid ON eventbrite_orders_cache(eid);
CREATE INDEX IF NOT EXISTS idx_eb_orders_eventbrite_event_id ON eventbrite_orders_cache(eventbrite_event_id);
CREATE INDEX IF NOT EXISTS idx_eb_orders_order_created ON eventbrite_orders_cache(order_created DESC);
CREATE INDEX IF NOT EXISTS idx_eb_orders_order_status ON eventbrite_orders_cache(order_status);
CREATE INDEX IF NOT EXISTS idx_eb_orders_buyer_email ON eventbrite_orders_cache(buyer_email);
CREATE INDEX IF NOT EXISTS idx_eb_orders_fetched_at ON eventbrite_orders_cache(fetched_at DESC);

-- Composite for event + status queries
CREATE INDEX IF NOT EXISTS idx_eb_orders_event_status ON eventbrite_orders_cache(eid, order_status);

-- === Summary View ===
CREATE OR REPLACE VIEW eventbrite_orders_summary AS
SELECT
  eid,
  eventbrite_event_id,
  currency_code,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE order_status = 'placed') as placed_orders,
  COUNT(*) FILTER (WHERE order_status = 'refunded') as refunded_orders,
  COUNT(*) FILTER (WHERE order_status = 'cancelled') as cancelled_orders,
  SUM(attendee_count) as total_attendees,
  SUM(attendee_count) FILTER (WHERE order_status = 'placed') as placed_attendees,
  SUM(base_price) FILTER (WHERE order_status = 'placed') as total_base_price,
  SUM(tax) FILTER (WHERE order_status = 'placed') as total_tax,
  SUM(eventbrite_fee) FILTER (WHERE order_status = 'placed') as total_eventbrite_fees,
  SUM(payment_fee) FILTER (WHERE order_status = 'placed') as total_payment_fees,
  SUM(gross) FILTER (WHERE order_status = 'placed') as total_gross,
  MIN(order_created) as first_order_at,
  MAX(order_created) as last_order_at,
  MAX(fetched_at) as last_fetched_at
FROM eventbrite_orders_cache
GROUP BY eid, eventbrite_event_id, currency_code;

-- === RLS Policies ===
ALTER TABLE eventbrite_orders_cache ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for edge functions)
CREATE POLICY "Service role full access to orders cache"
  ON eventbrite_orders_cache
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admins can read orders for events they have access to
CREATE POLICY "Admin read orders cache"
  ON eventbrite_orders_cache
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'authenticated'
    AND (auth.jwt() -> 'admin_events') ? eid
  );

-- === Helper Function: Get orders summary for an event ===
CREATE OR REPLACE FUNCTION get_eventbrite_orders_summary(p_eid VARCHAR)
RETURNS TABLE (
  total_orders BIGINT,
  placed_orders BIGINT,
  refunded_orders BIGINT,
  total_attendees BIGINT,
  total_base_price NUMERIC,
  total_tax NUMERIC,
  total_eventbrite_fees NUMERIC,
  total_payment_fees NUMERIC,
  total_gross NUMERIC,
  currency_code VARCHAR,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  last_fetched_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    total_orders,
    placed_orders,
    refunded_orders,
    total_attendees,
    total_base_price,
    total_tax,
    total_eventbrite_fees,
    total_payment_fees,
    total_gross,
    currency_code,
    first_order_at,
    last_order_at,
    last_fetched_at
  FROM eventbrite_orders_summary
  WHERE eid = p_eid
  LIMIT 1;
$$;

-- === Helper Function: Check if orders have been cached for an event ===
CREATE OR REPLACE FUNCTION has_eventbrite_orders_cached(p_eid VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM eventbrite_orders_cache WHERE eid = p_eid LIMIT 1
  );
$$;

-- === Comments ===
COMMENT ON TABLE eventbrite_orders_cache IS 'Cache of Eventbrite order data including tax breakdown. Orders are cached permanently since they do not change and Eventbrite only retains data for 12 months.';
COMMENT ON COLUMN eventbrite_orders_cache.order_raw IS 'Complete order JSON response for audit trail';
COMMENT ON COLUMN eventbrite_orders_cache.attendees IS 'Full attendee array including costs, profiles, barcodes, and survey answers';
COMMENT ON VIEW eventbrite_orders_summary IS 'Aggregated order data per event, filtering out refunded/cancelled orders for financial totals';
