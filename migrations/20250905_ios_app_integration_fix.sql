-- iOS App Integration Fix Migration
-- Fixes the media file column references and populates missing content
-- Date: September 5, 2025

-- Fix the content population with correct column names

-- Delete any incomplete records from the initial population
DELETE FROM app_content_analytics WHERE content_id NOT IN (
    SELECT DISTINCT content_id FROM app_curated_content
);

-- Re-populate app_curated_content with existing artworks using correct column names
INSERT INTO app_curated_content (
    content_id,
    content_type,
    title,
    description,
    image_url,
    thumbnail_url,
    tags,
    data,
    engagement_score,
    quality_score
)
SELECT 
    a.id::text,
    'artwork',
    COALESCE(a.description, 'Untitled Artwork'),
    a.description,
    CASE 
        WHEN mf.original_url IS NOT NULL THEN mf.original_url
        WHEN mf.compressed_url IS NOT NULL THEN mf.compressed_url
        ELSE NULL
    END,
    CASE 
        WHEN mf.thumbnail_url IS NOT NULL THEN mf.thumbnail_url
        WHEN mf.compressed_url IS NOT NULL THEN mf.compressed_url
        ELSE NULL
    END,
    ARRAY['art_battle', COALESCE(e.eid, 'event'), 'round_' || a.round::text],
    jsonb_build_object(
        'artistName', COALESCE(ap.name, 'Unknown Artist'),
        'artistId', ap.id,
        'eventName', COALESCE(e.name, 'Unknown Event'),
        'eventId', e.id,
        'eventDate', e.event_start_datetime,
        'city', COALESCE(c.name, 'Unknown City'),
        'round', a.round,
        'easel', a.easel,
        'voteCount', COALESCE(a.vote_count, 0),
        'bidCount', COALESCE(a.bid_count, 0),
        'currentBid', a.current_bid,
        'status', a.status,
        'artCode', a.art_code
    ),
    -- Simple engagement score based on votes
    CASE 
        WHEN a.vote_count > 0 THEN LEAST(0.5 + (a.vote_count::float / 100.0), 1.0)
        ELSE 0.3
    END,
    -- Quality score based on having description and media
    CASE 
        WHEN a.description IS NOT NULL AND mf.original_url IS NOT NULL THEN 0.9
        WHEN a.description IS NOT NULL OR mf.original_url IS NOT NULL THEN 0.7
        ELSE 0.5
    END
FROM art a
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN events e ON a.event_id = e.id
LEFT JOIN cities c ON e.city_id = c.id
LEFT JOIN art_media am ON a.id = am.art_id AND am.media_type = 'image' AND am.is_primary = true
LEFT JOIN media_files mf ON am.media_id = mf.id
WHERE a.status IN ('active', 'sold', 'closed')
AND (e.show_in_app = true OR e.show_in_app IS NULL)
ORDER BY COALESCE(e.event_start_datetime, a.created_at) DESC, a.round, a.easel
LIMIT 2000 -- Increase limit for more content
ON CONFLICT (id) DO UPDATE SET
    image_url = EXCLUDED.image_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    data = EXCLUDED.data,
    engagement_score = EXCLUDED.engagement_score,
    quality_score = EXCLUDED.quality_score;

-- Re-populate app_curated_content with upcoming events using correct column names
INSERT INTO app_curated_content (
    content_id,
    content_type,
    title,
    description,
    image_url,
    thumbnail_url,
    tags,
    data,
    engagement_score,
    trending_score
)
SELECT 
    e.id::text,
    'event',
    e.name,
    e.description,
    CASE 
        WHEN mf.original_url IS NOT NULL THEN mf.original_url
        WHEN mf.compressed_url IS NOT NULL THEN mf.compressed_url
        ELSE NULL
    END,
    CASE 
        WHEN mf.thumbnail_url IS NOT NULL THEN mf.thumbnail_url  
        WHEN mf.compressed_url IS NOT NULL THEN mf.compressed_url
        ELSE NULL
    END,
    ARRAY['event', 'art_battle', COALESCE(c.name, 'unknown_city')] || 
    CASE WHEN e.event_start_datetime > NOW() THEN ARRAY['upcoming'] ELSE ARRAY['past'] END,
    jsonb_build_object(
        'eventId', e.id,
        'eid', e.eid,
        'venue', e.venue,
        'city', COALESCE(c.name, 'Unknown City'),
        'country', COALESCE(co.name, 'Unknown Country'),
        'startDate', e.event_start_datetime,
        'endDate', e.event_end_datetime,
        'currentRound', e.current_round,
        'ticketLink', e.ticket_link,
        'liveStream', e.live_stream,
        'capacity', e.capacity,
        'status', CASE 
            WHEN e.event_start_datetime > NOW() THEN 'upcoming'
            WHEN e.event_start_datetime <= NOW() AND (e.event_end_datetime IS NULL OR e.event_end_datetime > NOW()) THEN 'live'
            ELSE 'completed'
        END
    ),
    -- Simple engagement score
    0.6,
    -- Higher trending score for upcoming events
    CASE 
        WHEN e.event_start_datetime > NOW() AND e.event_start_datetime < NOW() + INTERVAL '30 days' THEN 0.8
        WHEN e.event_start_datetime > NOW() THEN 0.6
        ELSE 0.3
    END
FROM events e
LEFT JOIN cities c ON e.city_id = c.id
LEFT JOIN countries co ON e.country_id = co.id
LEFT JOIN media_files mf ON e.sponsor_logo_id = mf.id
WHERE e.enabled = true 
AND (e.show_in_app = true OR e.show_in_app IS NULL)
AND e.event_start_datetime > NOW() - INTERVAL '60 days' -- Include more recent events
ORDER BY e.event_start_datetime DESC
LIMIT 300
ON CONFLICT (id) DO UPDATE SET
    image_url = EXCLUDED.image_url,
    thumbnail_url = EXCLUDED.thumbnail_url,
    data = EXCLUDED.data,
    trending_score = EXCLUDED.trending_score;

-- Add artist spotlight content from artist profiles
INSERT INTO app_curated_content (
    content_id,
    content_type,
    title,
    description,
    image_url,
    thumbnail_url,
    tags,
    data,
    engagement_score,
    quality_score
)
SELECT 
    ap.id::text,
    'artist_spotlight',
    COALESCE(ap.name, 'Artist Profile'),
    COALESCE(ap.bio, ap.abhq_bio, 'Artist from ' || COALESCE(ap.city, 'Art Battle')),
    CASE 
        WHEN mf.original_url IS NOT NULL THEN mf.original_url
        WHEN mf.compressed_url IS NOT NULL THEN mf.compressed_url
        ELSE NULL
    END,
    CASE 
        WHEN mf.thumbnail_url IS NOT NULL THEN mf.thumbnail_url
        WHEN mf.compressed_url IS NOT NULL THEN mf.compressed_url
        ELSE NULL
    END,
    ARRAY['artist', 'spotlight', COALESCE(ap.city, 'artist')] || 
    CASE WHEN ap.specialties IS NOT NULL THEN ap.specialties[1:3] ELSE '{}' END,
    jsonb_build_object(
        'artistId', ap.id,
        'name', ap.name,
        'city', ap.city,
        'country', ap.country,
        'bio', COALESCE(ap.bio, ap.abhq_bio),
        'website', ap.website,
        'instagram', ap.instagram,
        'yearsExperience', ap.years_experience,
        'specialties', ap.specialties,
        'followersCount', ap.followers_count,
        'votesCount', ap.votes_count,
        'score', ap.score
    ),
    -- Engagement score based on followers and votes
    CASE 
        WHEN ap.score > 100 THEN 0.8
        WHEN ap.score > 50 THEN 0.6
        ELSE 0.4
    END,
    -- Quality score based on profile completeness
    CASE 
        WHEN ap.bio IS NOT NULL AND ap.website IS NOT NULL AND ap.instagram IS NOT NULL THEN 0.9
        WHEN ap.bio IS NOT NULL OR ap.website IS NOT NULL OR ap.instagram IS NOT NULL THEN 0.7
        ELSE 0.5
    END
FROM artist_profiles ap
LEFT JOIN cities c ON ap.city_id = c.id
LEFT JOIN artist_sample_works asw ON ap.id = asw.artist_profile_id AND asw.display_order = 1
LEFT JOIN media_files mf ON asw.media_file_id = mf.id
WHERE ap.name IS NOT NULL
AND ap.is_duplicate = false
ORDER BY ap.score DESC, ap.created_at DESC
LIMIT 500
ON CONFLICT (id) DO NOTHING;

-- Re-populate app_content_analytics with corrected data
INSERT INTO app_content_analytics (content_id, content_type, total_views, total_likes)
SELECT 
    a.id::text,
    'artwork',
    GREATEST(COALESCE(a.vote_count, 0), 1), -- Use vote_count as proxy for views
    COALESCE(a.vote_count, 0) -- Use vote_count as likes
FROM art a
WHERE a.status IN ('active', 'sold', 'closed')
ON CONFLICT (content_id) DO UPDATE SET
    total_views = EXCLUDED.total_views,
    total_likes = EXCLUDED.total_likes;

-- Add content analytics for events
INSERT INTO app_content_analytics (content_id, content_type, total_views)
SELECT 
    e.id::text,
    'event',
    CASE 
        WHEN e.event_start_datetime > NOW() THEN 25 -- Upcoming events get more views
        ELSE 10
    END
FROM events e
WHERE e.enabled = true AND (e.show_in_app = true OR e.show_in_app IS NULL)
ON CONFLICT (content_id) DO UPDATE SET
    total_views = EXCLUDED.total_views;

-- Add content analytics for artist spotlights
INSERT INTO app_content_analytics (content_id, content_type, total_views, total_likes)
SELECT 
    ap.id::text,
    'artist_spotlight',
    GREATEST(ap.votes_count, 5), -- Use artist vote count as views
    GREATEST(ap.followers_count, 1) -- Use followers as likes
FROM artist_profiles ap
WHERE ap.name IS NOT NULL AND ap.is_duplicate = false
ON CONFLICT (content_id) DO UPDATE SET
    total_views = EXCLUDED.total_views,
    total_likes = EXCLUDED.total_likes;

-- Update trending scores based on recent activity
UPDATE app_curated_content 
SET trending_score = CASE
    WHEN content_type = 'event' AND (data->>'status') = 'upcoming' THEN 0.9
    WHEN content_type = 'event' AND (data->>'status') = 'live' THEN 1.0
    WHEN content_type = 'artwork' AND (data->>'voteCount')::int > 20 THEN 0.7
    WHEN content_type = 'artist_spotlight' AND (data->>'score')::int > 100 THEN 0.6
    ELSE trending_score
END;

-- Create indexes for better performance on new data
CREATE INDEX IF NOT EXISTS idx_app_curated_content_compound ON app_curated_content(content_type, status, trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_data_gin ON app_curated_content USING GIN(data);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'iOS App Integration Fix Completed Successfully!';
    RAISE NOTICE 'Updated content population with correct media file references';
    RAISE NOTICE 'Added artist spotlight content';
    RAISE NOTICE 'Updated trending scores and analytics';
    
    -- Show content counts
    RAISE NOTICE 'Content Summary:';
    RAISE NOTICE '- Artworks: % items', (SELECT COUNT(*) FROM app_curated_content WHERE content_type = 'artwork');
    RAISE NOTICE '- Events: % items', (SELECT COUNT(*) FROM app_curated_content WHERE content_type = 'event');
    RAISE NOTICE '- Artist Spotlights: % items', (SELECT COUNT(*) FROM app_curated_content WHERE content_type = 'artist_spotlight');
    RAISE NOTICE '- Total: % items', (SELECT COUNT(*) FROM app_curated_content);
END $$;