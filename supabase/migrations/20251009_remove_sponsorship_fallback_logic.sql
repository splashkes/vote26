-- Remove fallback logic from get_sponsorship_invite_details
-- Only use event_sponsorship_packages, no fallback to templates

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
  packages jsonb,
  media jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    e.city_id,
    si.prospect_name,
    si.prospect_email,
    si.prospect_company,
    si.discount_percent,
    si.valid_until,
    co.code::VARCHAR,
    co.currency_code::VARCHAR,
    co.currency_symbol::VARCHAR,
    -- ONLY use event_sponsorship_packages (no fallback)
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
  LEFT JOIN countries co ON c.country_id = co.id
  LEFT JOIN venues v ON e.venue_id = v.id
  WHERE si.hash = p_hash
    AND (si.valid_until IS NULL OR si.valid_until > NOW());
END;
$function$;
