-- Create RPC function to get artist applications for feed
CREATE OR REPLACE FUNCTION get_artist_applications_for_feed(days_back INTEGER DEFAULT 7, limit_count INTEGER DEFAULT 25)
RETURNS TABLE(
    id UUID,
    artist_profile_id UUID,
    event_id UUID,
    applied_at TIMESTAMP WITH TIME ZONE,
    artist_number TEXT,
    event_eid TEXT,
    sample_works JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (aa.artist_number, aa.event_eid)
        aa.id,
        aa.artist_profile_id,
        aa.event_id,
        aa.applied_at,
        aa.artist_number,
        aa.event_eid,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', sw.id,
                    'title', sw.title,
                    'image_url', sw.image_url,
                    'source_type', sw.source_type
                )
            )
            FROM get_unified_sample_works(aa.artist_profile_id) sw
        ) as sample_works
    FROM artist_applications aa
    WHERE aa.applied_at > (NOW() - (days_back || ' days')::INTERVAL)
      AND EXISTS (
          SELECT 1 FROM get_unified_sample_works(aa.artist_profile_id)
      )
      AND NOT EXISTS (
          SELECT 1 
          FROM artist_confirmations ac 
          WHERE ac.artist_number = aa.artist_number 
            AND ac.event_eid = aa.event_eid 
            AND ac.confirmation_status = 'confirmed' 
            AND ac.withdrawn_at IS NULL
      )
    ORDER BY aa.artist_number, aa.event_eid, aa.applied_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;