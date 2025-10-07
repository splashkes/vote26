-- =====================================================
-- SPONSORSHIP SYSTEM MIGRATION
-- Creates tables and functions for B2B sponsorship sales
-- =====================================================

-- =====================================================
-- TABLES
-- =====================================================

-- Package templates (reusable across events)
CREATE TABLE IF NOT EXISTS sponsorship_package_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  benefits JSONB DEFAULT '[]'::jsonb,  -- Array of benefit strings
  category VARCHAR(50) DEFAULT 'main',  -- 'main' or 'addon'
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event-specific packages with pricing
CREATE TABLE IF NOT EXISTS event_sponsorship_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  template_id UUID REFERENCES sponsorship_package_templates(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  benefits JSONB DEFAULT '[]'::jsonb,
  base_price NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  is_addon BOOLEAN DEFAULT false,
  available_quantity INTEGER,  -- NULL = unlimited
  sold_quantity INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- City-specific pricing overrides
CREATE TABLE IF NOT EXISTS sponsorship_city_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_template_id UUID REFERENCES sponsorship_package_templates(id) ON DELETE CASCADE,
  city_id UUID REFERENCES cities(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(package_template_id, city_id)
);

-- Prospect invite links with discounts
CREATE TABLE IF NOT EXISTS sponsorship_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  hash VARCHAR(16) UNIQUE NOT NULL,
  prospect_name VARCHAR(255),
  prospect_email VARCHAR(255),
  prospect_company VARCHAR(255),
  discount_percent NUMERIC(5,2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 1,
  use_count INTEGER DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0
);

-- Sponsorship purchases
CREATE TABLE IF NOT EXISTS sponsorship_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES sponsorship_invites(id) ON DELETE SET NULL,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_checkout_session_id VARCHAR(255),

  -- Buyer info
  buyer_name VARCHAR(255) NOT NULL,
  buyer_email VARCHAR(255) NOT NULL,
  buyer_company VARCHAR(255),
  buyer_phone VARCHAR(50),

  -- Package details (stored as JSONB for flexibility)
  main_package_id UUID REFERENCES event_sponsorship_packages(id) ON DELETE SET NULL,
  addon_package_ids UUID[] DEFAULT ARRAY[]::UUID[],
  package_details JSONB,  -- Snapshot of packages at purchase time

  -- Pricing
  subtotal NUMERIC(10,2) NOT NULL,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Logo
  logo_url TEXT,
  logo_cloudflare_id VARCHAR(255),
  logo_uploaded_at TIMESTAMPTZ,

  -- Status
  payment_status VARCHAR(50) DEFAULT 'pending',  -- pending, paid, refunded, failed
  fulfillment_status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, completed

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track prospect interactions
CREATE TABLE IF NOT EXISTS sponsorship_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES sponsorship_invites(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL,  -- page_view, package_click, checkout_started, payment_completed
  package_id UUID REFERENCES event_sponsorship_packages(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Visual content library
CREATE TABLE IF NOT EXISTS sponsorship_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,  -- NULL for global media
  media_type VARCHAR(50) NOT NULL,  -- promo_sample, voting_screenshot, event_photo, testimonial
  title VARCHAR(255),
  caption TEXT,
  url TEXT NOT NULL,
  cloudflare_id VARCHAR(255),
  thumbnail_url TEXT,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_event_sponsorship_packages_event ON event_sponsorship_packages(event_id);
CREATE INDEX idx_event_sponsorship_packages_template ON event_sponsorship_packages(template_id);
CREATE INDEX idx_sponsorship_invites_event ON sponsorship_invites(event_id);
CREATE INDEX idx_sponsorship_invites_hash ON sponsorship_invites(hash);
CREATE INDEX idx_sponsorship_purchases_event ON sponsorship_purchases(event_id);
CREATE INDEX idx_sponsorship_purchases_invite ON sponsorship_purchases(invite_id);
CREATE INDEX idx_sponsorship_purchases_stripe ON sponsorship_purchases(stripe_payment_intent_id);
CREATE INDEX idx_sponsorship_interactions_invite ON sponsorship_interactions(invite_id);
CREATE INDEX idx_sponsorship_interactions_event ON sponsorship_interactions(event_id);
CREATE INDEX idx_sponsorship_media_event ON sponsorship_media(event_id);

-- =====================================================
-- RPC FUNCTIONS
-- =====================================================

-- Generate unique invite hash
CREATE OR REPLACE FUNCTION generate_sponsorship_invite_hash()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Admin: Generate sponsorship invite link
CREATE OR REPLACE FUNCTION admin_generate_sponsorship_invite(
  p_event_id UUID,
  p_prospect_name VARCHAR,
  p_prospect_email VARCHAR,
  p_prospect_company VARCHAR,
  p_discount_percent NUMERIC,
  p_valid_until TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  invite_id UUID,
  hash VARCHAR,
  full_url TEXT
) AS $$
DECLARE
  v_hash VARCHAR;
  v_invite_id UUID;
  v_creator_email TEXT;
BEGIN
  -- Get current user email
  v_creator_email := current_setting('request.jwt.claims', true)::json->>'email';

  -- Generate unique hash
  LOOP
    v_hash := generate_sponsorship_invite_hash();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sponsorship_invites WHERE hash = v_hash);
  END LOOP;

  -- Create invite
  INSERT INTO sponsorship_invites (
    event_id,
    hash,
    prospect_name,
    prospect_email,
    prospect_company,
    discount_percent,
    valid_until,
    notes,
    created_by
  ) VALUES (
    p_event_id,
    v_hash,
    p_prospect_name,
    p_prospect_email,
    p_prospect_company,
    p_discount_percent,
    p_valid_until,
    p_notes,
    v_creator_email
  )
  RETURNING id INTO v_invite_id;

  RETURN QUERY SELECT
    v_invite_id,
    v_hash,
    'https://artb.art/sponsor/' || v_hash AS full_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public: Get invite details with packages
CREATE OR REPLACE FUNCTION get_sponsorship_invite_details(p_hash VARCHAR)
RETURNS TABLE(
  invite_id UUID,
  event_id UUID,
  event_name TEXT,
  event_date TIMESTAMPTZ,
  event_city TEXT,
  event_venue TEXT,
  prospect_name VARCHAR,
  prospect_email VARCHAR,
  discount_percent NUMERIC,
  valid_until TIMESTAMPTZ,
  packages JSONB,
  media JSONB
) AS $$
BEGIN
  -- Update view count and last viewed
  UPDATE sponsorship_invites
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE hash = p_hash;

  RETURN QUERY
  SELECT
    si.id,
    e.id,
    e.name,
    e.event_start_datetime,
    c.name,
    v.name,
    si.prospect_name,
    si.prospect_email,
    si.discount_percent,
    si.valid_until,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', esp.id,
          'name', esp.name,
          'description', esp.description,
          'benefits', esp.benefits,
          'base_price', esp.base_price,
          'currency', esp.currency,
          'is_addon', esp.is_addon,
          'display_order', esp.display_order
        ) ORDER BY esp.display_order, esp.name
      )
      FROM event_sponsorship_packages esp
      WHERE esp.event_id = si.event_id AND esp.active = true
    ) AS packages,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sm.id,
          'media_type', sm.media_type,
          'title', sm.title,
          'caption', sm.caption,
          'url', sm.url,
          'thumbnail_url', sm.thumbnail_url
        ) ORDER BY sm.display_order
      )
      FROM sponsorship_media sm
      WHERE (sm.event_id = si.event_id OR sm.event_id IS NULL) AND sm.active = true
    ) AS media
  FROM sponsorship_invites si
  JOIN events e ON si.event_id = e.id
  LEFT JOIN cities c ON e.city_id = c.id
  LEFT JOIN venues v ON e.venue_id = v.id
  WHERE si.hash = p_hash
    AND (si.valid_until IS NULL OR si.valid_until > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Track sponsorship interaction
CREATE OR REPLACE FUNCTION track_sponsorship_interaction(
  p_invite_hash VARCHAR,
  p_interaction_type VARCHAR,
  p_package_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_invite_id UUID;
  v_event_id UUID;
  v_interaction_id UUID;
BEGIN
  -- Get invite and event IDs
  SELECT id, event_id INTO v_invite_id, v_event_id
  FROM sponsorship_invites
  WHERE hash = p_invite_hash;

  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite hash';
  END IF;

  -- Insert interaction
  INSERT INTO sponsorship_interactions (
    invite_id,
    event_id,
    interaction_type,
    package_id,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    v_invite_id,
    v_event_id,
    p_interaction_type,
    p_package_id,
    p_metadata,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_interaction_id;

  RETURN v_interaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: Get event sponsorship summary
CREATE OR REPLACE FUNCTION admin_get_event_sponsorship_summary(p_event_id UUID)
RETURNS TABLE(
  total_invites INTEGER,
  total_views INTEGER,
  total_purchases INTEGER,
  total_revenue NUMERIC,
  invites JSONB,
  purchases JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM sponsorship_invites WHERE event_id = p_event_id),
    (SELECT COALESCE(SUM(view_count), 0)::INTEGER FROM sponsorship_invites WHERE event_id = p_event_id),
    (SELECT COUNT(*)::INTEGER FROM sponsorship_purchases WHERE event_id = p_event_id AND payment_status = 'paid'),
    (SELECT COALESCE(SUM(total_amount), 0) FROM sponsorship_purchases WHERE event_id = p_event_id AND payment_status = 'paid'),
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', si.id,
          'hash', si.hash,
          'prospect_name', si.prospect_name,
          'prospect_email', si.prospect_email,
          'prospect_company', si.prospect_company,
          'discount_percent', si.discount_percent,
          'view_count', si.view_count,
          'last_viewed_at', si.last_viewed_at,
          'created_at', si.created_at,
          'has_purchase', EXISTS(SELECT 1 FROM sponsorship_purchases sp WHERE sp.invite_id = si.id)
        ) ORDER BY si.created_at DESC
      )
      FROM sponsorship_invites si
      WHERE si.event_id = p_event_id
    ),
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sp.id,
          'buyer_name', sp.buyer_name,
          'buyer_email', sp.buyer_email,
          'buyer_company', sp.buyer_company,
          'total_amount', sp.total_amount,
          'currency', sp.currency,
          'discount_percent', sp.discount_percent,
          'payment_status', sp.payment_status,
          'logo_url', sp.logo_url,
          'paid_at', sp.paid_at,
          'package_details', sp.package_details
        ) ORDER BY sp.created_at DESC
      )
      FROM sponsorship_purchases sp
      WHERE sp.event_id = p_event_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SEED DATA (Sample Package Templates)
-- =====================================================

INSERT INTO sponsorship_package_templates (name, slug, description, benefits, category, display_order) VALUES
('Title Sponsor', 'title-sponsor', 'Premier sponsorship opportunity with maximum visibility',
 '["Logo on all promotional materials", "Stage signage and announcements", "Social media promotion", "10 VIP tickets", "Logo on event website", "Exclusive presenting rights"]'::jsonb,
 'main', 1),
('Venue Sponsor', 'venue-sponsor', 'Associate your brand with our premier venue',
 '["Venue signage", "Logo on promotional materials", "Social media mentions", "6 VIP tickets", "Logo on event website"]'::jsonb,
 'main', 2),
('Round Sponsor', 'round-sponsor', 'Sponsor a competition round',
 '["Round announcements", "Signage during round", "Social media mention", "4 tickets", "Logo on event website"]'::jsonb,
 'main', 3),
('Prize Sponsor', 'prize-sponsor', 'Provide the winner prize',
 '["Winner announcement association", "Social media mentions", "2 tickets", "Logo on event website"]'::jsonb,
 'main', 4),
('Digital Sponsor', 'digital-sponsor', 'Social media and digital presence',
 '["Social media campaign promotion", "Logo on website", "Email newsletter feature", "2 tickets"]'::jsonb,
 'main', 5),
('VIP Table', 'vip-table', 'Premium seating package',
 '["Reserved table for 8", "Premium viewing location", "Drink vouchers", "Logo placement"]'::jsonb,
 'addon', 10),
('Social Media Boost', 'social-boost', 'Enhanced social media coverage',
 '["Dedicated Instagram story", "Facebook post feature", "Twitter mentions"]'::jsonb,
 'addon', 11),
('Logo on Merchandise', 'merch-logo', 'Brand placement on event merchandise',
 '["Logo on event t-shirts", "Logo on promotional items", "Merchandise package"]'::jsonb,
 'addon', 12)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE sponsorship_package_templates IS 'Reusable sponsorship package templates';
COMMENT ON TABLE event_sponsorship_packages IS 'Event-specific sponsorship packages with pricing';
COMMENT ON TABLE sponsorship_city_pricing IS 'City-specific pricing overrides for packages';
COMMENT ON TABLE sponsorship_invites IS 'Prospect invite links with custom discounts';
COMMENT ON TABLE sponsorship_purchases IS 'Completed sponsorship purchases';
COMMENT ON TABLE sponsorship_interactions IS 'Track prospect engagement with invite pages';
COMMENT ON TABLE sponsorship_media IS 'Visual content library for sponsorship pages';
