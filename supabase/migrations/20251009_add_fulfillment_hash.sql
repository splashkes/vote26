-- Add fulfillment_hash to sponsorship_purchases for post-payment customization access
ALTER TABLE sponsorship_purchases
ADD COLUMN fulfillment_hash VARCHAR(64) UNIQUE;

-- Create index for quick lookups
CREATE INDEX idx_sponsorship_purchases_fulfillment_hash ON sponsorship_purchases(fulfillment_hash);

-- Function to generate fulfillment hash (longer than invite hash - 40 chars vs 32)
CREATE OR REPLACE FUNCTION generate_fulfillment_hash()
RETURNS TRIGGER AS $$
BEGIN
  -- Generate a 40-character hash for fulfillment (differentiate from 32-char invite hash)
  NEW.fulfillment_hash := encode(gen_random_bytes(20), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate fulfillment hash on insert
CREATE TRIGGER set_fulfillment_hash
  BEFORE INSERT ON sponsorship_purchases
  FOR EACH ROW
  EXECUTE FUNCTION generate_fulfillment_hash();

-- RPC function to get purchase details by fulfillment hash
CREATE OR REPLACE FUNCTION get_purchase_by_fulfillment_hash(p_hash VARCHAR)
RETURNS TABLE(
  id UUID,
  event_id UUID,
  event_name VARCHAR,
  city_name VARCHAR,
  buyer_name VARCHAR,
  buyer_email VARCHAR,
  buyer_company VARCHAR,
  buyer_phone VARCHAR,
  main_package_id UUID,
  package_details JSONB,
  subtotal NUMERIC,
  discount_percent NUMERIC,
  discount_amount NUMERIC,
  tax_amount NUMERIC,
  total_amount NUMERIC,
  currency VARCHAR,
  logo_url TEXT,
  logo_cloudflare_id VARCHAR,
  brand_name VARCHAR,
  brand_tagline VARCHAR,
  payment_status VARCHAR,
  fulfillment_status VARCHAR,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  country_code VARCHAR,
  currency_code VARCHAR,
  currency_symbol VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id,
    sp.event_id,
    e.name AS event_name,
    c.name AS city_name,
    sp.buyer_name,
    sp.buyer_email,
    sp.buyer_company,
    sp.buyer_phone,
    sp.main_package_id,
    sp.package_details,
    sp.subtotal,
    sp.discount_percent,
    sp.discount_amount,
    sp.tax_amount,
    sp.total_amount,
    sp.currency,
    sp.logo_url,
    sp.logo_cloudflare_id,
    COALESCE(sp.buyer_company, sp.buyer_name) AS brand_name,
    ''::VARCHAR AS brand_tagline,
    sp.payment_status,
    sp.fulfillment_status,
    sp.paid_at,
    sp.created_at,
    co.code AS country_code,
    co.currency_code,
    co.currency_symbol
  FROM sponsorship_purchases sp
  INNER JOIN events e ON sp.event_id = e.id
  LEFT JOIN cities c ON e.city_id = c.id
  LEFT JOIN countries co ON e.country_id = co.id
  WHERE sp.fulfillment_hash = p_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
