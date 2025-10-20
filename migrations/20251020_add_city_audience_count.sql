-- Add city_audience_count to get_sponsorship_invite_details RPC function
-- Migration: 20251020_add_city_audience_count.sql
-- Date: 2025-10-20

-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS public.get_sponsorship_invite_details(character varying);

CREATE OR REPLACE FUNCTION public.get_sponsorship_invite_details(p_hash character varying)
 RETURNS TABLE(
   invite_id uuid,
   event_id uuid,
   event_name text,
   event_date timestamp with time zone,
   event_city character varying,
   event_venue character varying,
   city_id uuid,
   prospect_name character varying,
   prospect_email character varying,
   prospect_company character varying,
   discount_percent numeric,
   valid_until timestamp with time zone,
   country_code character varying,
   currency_code character varying,
   currency_symbol character varying,
   event_start_datetime timestamp with time zone,
   event_capacity integer,
   skip_multi_event boolean,
   city_audience_count integer,
   packages jsonb,
   media jsonb,
   artists jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_city_id uuid;
  v_unique_voters integer;
BEGIN
  -- Update view count and last viewed
  UPDATE sponsorship_invites
  SET
    view_count = view_count + 1,
    last_viewed_at = NOW()
  WHERE hash = p_hash;

  -- Get city_id for calculating audience
  SELECT e.city_id INTO v_city_id
  FROM sponsorship_invites si
  JOIN events e ON si.event_id = e.id
  WHERE si.hash = p_hash;

  -- Calculate unique voters for this city * 1.5
  SELECT ROUND(COUNT(DISTINCT phone) * 1.5)::integer
  INTO v_unique_voters
  FROM votes v
  JOIN events e ON v.event_id = e.id
  WHERE e.city_id = v_city_id
    AND v.phone IS NOT NULL;

  RETURN QUERY
  SELECT
    si.id,
    e.id,
    e.name,
    e.event_start_datetime,
    c.name::VARCHAR,
    v.name::VARCHAR,
    e.city_id,
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
    si.skip_multi_event,
    v_unique_voters,
    -- Use ONLY city pricing + templates (now includes category and images)
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', spt.id,
          'name', spt.name,
          'description', spt.description,
          'benefits', spt.benefits,
          'category', spt.category,
          'base_price', scp.price,
          'currency', scp.currency,
          'is_addon', CASE WHEN spt.category = 'addon' THEN true ELSE false END,
          'display_order', spt.display_order,
          'images', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', spi.id,
                'url', spi.url
              ) ORDER BY spi.display_order
            )
            FROM sponsorship_package_images spi
            WHERE spi.package_template_id = spt.id
          )
        ) ORDER BY spt.display_order, spt.name
      )
      FROM sponsorship_city_pricing scp
      JOIN sponsorship_package_templates spt ON scp.package_template_id = spt.id
      WHERE scp.city_id = e.city_id AND spt.active = true AND scp.price > 0
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
          'name', ap.name,
          'instagram', ap.instagram
        )
      )
      FROM event_artists ea
      JOIN artist_profiles ap ON ea.artist_id = ap.id
      WHERE ea.event_id = e.id
    ) AS artists
  FROM sponsorship_invites si
  JOIN events e ON si.event_id = e.id
  LEFT JOIN cities c ON e.city_id = c.id
  LEFT JOIN countries co ON c.country_id = co.id
  LEFT JOIN venues v ON e.venue_id = v.id
  WHERE si.hash = p_hash
    AND (si.valid_until IS NULL OR si.valid_until > NOW());
END;
$$;
