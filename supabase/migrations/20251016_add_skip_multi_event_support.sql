-- Add skip_multi_event support to sponsorship invites
-- This allows admins to hide the multi-event discount stage for certain invites (e.g. season sponsorships)

-- 1. Update admin_generate_sponsorship_invite to accept and save skip_multi_event parameter
DROP FUNCTION IF EXISTS admin_generate_sponsorship_invite(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION admin_generate_sponsorship_invite(
  p_event_id UUID,
  p_prospect_name VARCHAR,
  p_prospect_email VARCHAR DEFAULT NULL,
  p_prospect_company VARCHAR DEFAULT NULL,
  p_discount_percent NUMERIC DEFAULT 0,
  p_valid_until TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_skip_multi_event BOOLEAN DEFAULT FALSE
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
    created_by,
    skip_multi_event
  ) VALUES (
    p_event_id,
    v_hash,
    p_prospect_name,
    p_prospect_email,
    p_prospect_company,
    p_discount_percent,
    p_valid_until,
    p_notes,
    v_creator_email,
    p_skip_multi_event
  )
  RETURNING id INTO v_invite_id;

  -- Return invite details
  RETURN QUERY
  SELECT
    v_invite_id,
    v_hash,
    'https://artb.art/sponsor/' || v_hash AS full_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update get_sponsorship_invite_details to return skip_multi_event
DROP FUNCTION IF EXISTS get_sponsorship_invite_details(VARCHAR);

CREATE OR REPLACE FUNCTION get_sponsorship_invite_details(p_hash VARCHAR)
RETURNS TABLE(
  invite_id UUID,
  event_id UUID,
  event_name TEXT,
  event_date TIMESTAMPTZ,
  event_city VARCHAR,
  event_venue VARCHAR,
  prospect_name VARCHAR,
  prospect_email VARCHAR,
  prospect_company VARCHAR,
  discount_percent NUMERIC,
  valid_until TIMESTAMPTZ,
  country_code VARCHAR,
  currency_code VARCHAR,
  currency_symbol VARCHAR,
  event_start_datetime TIMESTAMPTZ,
  event_capacity INTEGER,
  skip_multi_event BOOLEAN,
  packages JSONB,
  media JSONB,
  artists JSONB
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
    c.name::VARCHAR,
    v.name::VARCHAR,
    si.prospect_name,
    si.prospect_email,
    si.prospect_company,
    si.discount_percent,
    si.valid_until,
    co.code::VARCHAR,
    co.currency_code::VARCHAR,
    co.currency_symbol::VARCHAR,
    e.event_start_datetime,
    e.capacity,
    COALESCE(si.skip_multi_event, FALSE),
    (
      -- First try event_sponsorship_packages, fall back to city pricing + templates
      COALESCE(
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
              'display_order', esp.display_order,
              'category', COALESCE(spt_esp.category, 'main'),
              'images', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', spi.id,
                      'url', spi.url,
                      'display_order', spi.display_order
                    ) ORDER BY spi.display_order
                  )
                  FROM sponsorship_package_images spi
                  WHERE spi.package_template_id = esp.template_id
                ),
                '[]'::jsonb
              )
            ) ORDER BY esp.display_order, esp.name
          )
          FROM event_sponsorship_packages esp
          LEFT JOIN sponsorship_package_templates spt_esp ON esp.template_id = spt_esp.id
          WHERE esp.event_id = si.event_id AND esp.active = true
        ),
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', spt.id,
              'name', spt.name,
              'description', spt.description,
              'benefits', spt.benefits,
              'base_price', scp.price,
              'currency', scp.currency,
              'category', spt.category,
              'is_addon', CASE WHEN spt.category = 'addon' THEN true ELSE false END,
              'display_order', spt.display_order,
              'images', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', spi.id,
                      'url', spi.url,
                      'display_order', spi.display_order
                    ) ORDER BY spi.display_order
                  )
                  FROM sponsorship_package_images spi
                  WHERE spi.package_template_id = spt.id
                ),
                '[]'::jsonb
              )
            ) ORDER BY spt.display_order, spt.name
          )
          FROM sponsorship_city_pricing scp
          JOIN sponsorship_package_templates spt ON scp.package_template_id = spt.id
          WHERE scp.city_id = e.city_id AND spt.active = true
        )
      )
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
    ) AS media,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ap.id,
          'name', ap.name
        ) ORDER BY ac.created_at
      )
      FROM artist_confirmations ac
      JOIN artist_profiles ap ON ac.artist_profile_id = ap.id
      WHERE ac.event_eid = si.event_id::text
        AND ac.confirmation_status = 'confirmed'
    ) AS artists
  FROM sponsorship_invites si
  JOIN events e ON si.event_id = e.id
  LEFT JOIN cities c ON e.city_id = c.id
  LEFT JOIN countries co ON c.country_id = co.id
  LEFT JOIN venues v ON e.venue_id = v.id
  WHERE si.hash = p_hash
    AND (si.valid_until IS NULL OR si.valid_until > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
