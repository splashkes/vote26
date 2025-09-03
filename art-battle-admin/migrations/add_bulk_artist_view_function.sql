-- Create function to get bulk artist data for admin management
-- Combines artist_confirmations, artist_profiles, events, and cities for efficient retrieval

CREATE OR REPLACE FUNCTION admin_get_bulk_artist_data(
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_search_term TEXT DEFAULT NULL
)
RETURNS TABLE (
  artist_profile_id UUID,
  artist_name TEXT,
  artist_number TEXT,
  event_eid TEXT,
  event_name TEXT,
  city_name TEXT,
  event_date TEXT,
  bio_preview TEXT,
  full_bio TEXT,
  promotion_artwork_url TEXT,
  has_bio BOOLEAN,
  has_promo_image BOOLEAN,
  confirmation_date TIMESTAMPTZ,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ap.id as artist_profile_id,
    COALESCE(TRIM(ap.name), 'Unknown Artist') as artist_name,
    COALESCE(ap.entry_id::TEXT, 'N/A') as artist_number,
    ac.event_eid,
    COALESCE(TRIM(e.name), ac.event_eid) as event_name,
    COALESCE(TRIM(c.name), 'Unknown City') as city_name,
    CASE 
      WHEN e.event_start_datetime IS NOT NULL 
      THEN TO_CHAR(e.event_start_datetime, 'Mon DD, YYYY')
      ELSE 'TBD'
    END as event_date,
    LEFT(COALESCE(TRIM(ap.abhq_bio), ''), 100) as bio_preview,
    COALESCE(TRIM(ap.abhq_bio), '') as full_bio,
    COALESCE(TRIM(ac.promotion_artwork_url), '') as promotion_artwork_url,
    (ap.abhq_bio IS NOT NULL AND TRIM(ap.abhq_bio) != '') as has_bio,
    (ac.promotion_artwork_url IS NOT NULL AND TRIM(ac.promotion_artwork_url) != '') as has_promo_image,
    ac.confirmation_date,
    ac.created_at
  FROM artist_confirmations ac
  JOIN artist_profiles ap ON ac.artist_profile_id = ap.id
  LEFT JOIN events e ON ac.event_eid = e.eid
  LEFT JOIN cities c ON e.city_id = c.id
  WHERE 
    ac.confirmation_status = 'confirmed'
    AND ac.withdrawn_at IS NULL
    -- Only show events from 5 days ago to future
    AND (e.event_start_datetime IS NULL OR e.event_start_datetime >= (NOW() - INTERVAL '5 days'))
    AND (
      p_search_term IS NULL 
      OR LOWER(ap.name) LIKE '%' || LOWER(p_search_term) || '%'
      OR LOWER(ac.event_eid) LIKE '%' || LOWER(p_search_term) || '%'
      OR ap.entry_id::TEXT LIKE '%' || p_search_term || '%'
    )
  ORDER BY 
    -- Sort by event date ascending (future events first, then recent past)
    COALESCE(e.event_start_datetime, '2099-12-31'::TIMESTAMP) ASC,
    -- Then prioritize artists missing bio/image
    CASE WHEN ap.abhq_bio IS NULL OR TRIM(ap.abhq_bio) = '' THEN 0 ELSE 1 END,
    CASE WHEN ac.promotion_artwork_url IS NULL OR TRIM(ac.promotion_artwork_url) = '' THEN 0 ELSE 1 END,
    ap.name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Create function to get bulk artist statistics
CREATE OR REPLACE FUNCTION admin_get_bulk_artist_stats()
RETURNS TABLE (
  total_confirmed_artists BIGINT,
  artists_with_bio BIGINT,
  artists_with_promo_image BIGINT,
  artists_missing_both BIGINT,
  bio_completion_rate DECIMAL,
  promo_completion_rate DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_confirmed_artists,
    COUNT(CASE WHEN ap.abhq_bio IS NOT NULL AND TRIM(ap.abhq_bio) != '' THEN 1 END) as artists_with_bio,
    COUNT(CASE WHEN ac.promotion_artwork_url IS NOT NULL AND TRIM(ac.promotion_artwork_url) != '' THEN 1 END) as artists_with_promo_image,
    COUNT(CASE WHEN (ap.abhq_bio IS NULL OR TRIM(ap.abhq_bio) = '') AND (ac.promotion_artwork_url IS NULL OR TRIM(ac.promotion_artwork_url) = '') THEN 1 END) as artists_missing_both,
    ROUND(
      (COUNT(CASE WHEN ap.abhq_bio IS NOT NULL AND TRIM(ap.abhq_bio) != '' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
    ) as bio_completion_rate,
    ROUND(
      (COUNT(CASE WHEN ac.promotion_artwork_url IS NOT NULL AND TRIM(ac.promotion_artwork_url) != '' THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
    ) as promo_completion_rate
  FROM artist_confirmations ac
  JOIN artist_profiles ap ON ac.artist_profile_id = ap.id
  WHERE 
    ac.confirmation_status = 'confirmed'
    AND ac.withdrawn_at IS NULL;
END;
$function$;

-- Create function to update artist bio
CREATE OR REPLACE FUNCTION admin_update_artist_bio(
  p_artist_profile_id UUID,
  p_bio TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_updated_rows INTEGER;
BEGIN
  -- Validate bio length (max 2000 characters)
  IF LENGTH(p_bio) > 2000 THEN
    RAISE EXCEPTION 'Bio cannot exceed 2000 characters';
  END IF;

  -- Update the bio
  UPDATE artist_profiles 
  SET 
    abhq_bio = CASE 
      WHEN TRIM(p_bio) = '' THEN NULL 
      ELSE TRIM(p_bio) 
    END,
    updated_at = NOW()
  WHERE id = p_artist_profile_id;
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Artist profile not found or not updated';
  END IF;
  
  RETURN TRUE;
END;
$function$;

-- Create function to update artist promo image
CREATE OR REPLACE FUNCTION admin_update_artist_promo_image(
  p_artist_profile_id UUID,
  p_event_eid TEXT,
  p_image_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_updated_rows INTEGER;
BEGIN
  -- Update the promo image URL in artist_confirmations
  UPDATE artist_confirmations 
  SET 
    promotion_artwork_url = CASE 
      WHEN TRIM(p_image_url) = '' THEN NULL 
      ELSE TRIM(p_image_url) 
    END,
    updated_at = NOW()
  WHERE 
    artist_profile_id = p_artist_profile_id 
    AND event_eid = p_event_eid
    AND confirmation_status = 'confirmed';
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Artist confirmation not found or not updated';
  END IF;
  
  RETURN TRUE;
END;
$function$;

-- Add RLS policies for admin access
CREATE POLICY "Super admins can access bulk artist functions" ON artist_profiles
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND active = true 
    AND level = 'super'
  )
);

CREATE POLICY "Super admins can access artist confirmation bulk functions" ON artist_confirmations
FOR ALL TO authenticated  
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND active = true 
    AND level = 'super'
  )
);

-- Add comments for documentation
COMMENT ON FUNCTION admin_get_bulk_artist_data(INTEGER, INTEGER, TEXT) IS 
'Retrieve paginated bulk artist data for events from 5 days ago to future, sorted by event date ascending';

COMMENT ON FUNCTION admin_get_bulk_artist_stats() IS 
'Get overview statistics for bulk artist management including completion rates';

COMMENT ON FUNCTION admin_update_artist_bio(UUID, TEXT) IS 
'Update artist bio with validation and trimming for admin bulk management';

COMMENT ON FUNCTION admin_update_artist_promo_image(UUID, TEXT, TEXT) IS 
'Update artist promo image URL in confirmations table for admin bulk management';