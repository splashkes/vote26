-- Fix ambiguous column reference in sponsorship functions
-- The 'hash' column reference was ambiguous when variable name matched column name

DROP FUNCTION IF EXISTS admin_get_event_sponsorship_summary(UUID);
DROP FUNCTION IF EXISTS admin_generate_sponsorship_invite(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, TIMESTAMPTZ, TEXT);

-- Admin: Generate sponsorship invite
CREATE OR REPLACE FUNCTION admin_generate_sponsorship_invite(
  p_event_id UUID,
  p_prospect_name VARCHAR,
  p_prospect_email VARCHAR DEFAULT NULL,
  p_prospect_company VARCHAR DEFAULT NULL,
  p_discount_percent NUMERIC DEFAULT 0,
  p_valid_until TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  invite_id UUID,
  hash VARCHAR,
  full_url TEXT
) AS $$
DECLARE
  v_invite_id UUID;
  v_hash VARCHAR;
  v_creator_email TEXT;
BEGIN
  -- Get creator email from JWT
  v_creator_email := current_setting('request.jwt.claims', true)::json->>'email';

  -- Generate unique hash
  LOOP
    v_hash := generate_sponsorship_invite_hash();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sponsorship_invites si WHERE si.hash = v_hash);
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
          'id', invite_data.id,
          'hash', invite_data.hash,
          'prospect_name', invite_data.prospect_name,
          'prospect_email', invite_data.prospect_email,
          'prospect_company', invite_data.prospect_company,
          'discount_percent', invite_data.discount_percent,
          'view_count', invite_data.view_count,
          'last_viewed_at', invite_data.last_viewed_at,
          'created_at', invite_data.created_at,
          'has_purchase', EXISTS(SELECT 1 FROM sponsorship_purchases sp WHERE sp.invite_id = invite_data.id)
        ) ORDER BY invite_data.created_at DESC
      )
      FROM sponsorship_invites invite_data
      WHERE invite_data.event_id = p_event_id
    ),
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', purchase_data.id,
          'buyer_name', purchase_data.buyer_name,
          'buyer_email', purchase_data.buyer_email,
          'buyer_company', purchase_data.buyer_company,
          'total_amount', purchase_data.total_amount,
          'currency', purchase_data.currency,
          'discount_percent', purchase_data.discount_percent,
          'payment_status', purchase_data.payment_status,
          'logo_url', purchase_data.logo_url,
          'paid_at', purchase_data.paid_at,
          'package_details', purchase_data.package_details
        ) ORDER BY purchase_data.created_at DESC
      )
      FROM sponsorship_purchases purchase_data
      WHERE purchase_data.event_id = p_event_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
