-- iOS App Integration Migration
-- Creates tables and functions for iOS app content feed and analytics
-- Date: September 5, 2025

-- =============================================================================
-- 1. APP ANALYTICS SESSIONS TABLE
-- =============================================================================
-- Tracks app sessions for analytics and personalization
CREATE TABLE IF NOT EXISTS app_analytics_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    device_id TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    device_info JSONB DEFAULT '{}'::jsonb,
    app_version TEXT,
    os_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 2. APP ENGAGEMENT EVENTS TABLE
-- =============================================================================
-- Tracks user interactions with content in the iOS app
CREATE TABLE IF NOT EXISTS app_engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES app_analytics_sessions(session_id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    
    -- Content identification
    item_id TEXT NOT NULL, -- feed item ID
    content_id TEXT NOT NULL, -- actual content ID (artwork, event, etc.)
    content_type TEXT NOT NULL, -- artwork, event, artist_spotlight, video
    
    -- Engagement metrics
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    dwell_time_ms INTEGER,
    viewport_percentage FLOAT,
    video_watch_percentage FLOAT,
    
    -- Actions and interactions
    actions JSONB DEFAULT '[]'::jsonb, -- Array of {type, timestamp, metadata}
    gestures JSONB DEFAULT '[]'::jsonb, -- Array of {type, timestamp, location, scale}
    exit_action TEXT, -- how user left this content
    swipe_velocity FLOAT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 3. APP PERFORMANCE METRICS TABLE
-- =============================================================================
-- Tracks app performance metrics for optimization
CREATE TABLE IF NOT EXISTS app_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES app_analytics_sessions(session_id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    value FLOAT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 4. APP ERROR EVENTS TABLE
-- =============================================================================
-- Tracks app errors and crashes for debugging
CREATE TABLE IF NOT EXISTS app_error_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES app_analytics_sessions(session_id) ON DELETE CASCADE,
    error_type TEXT NOT NULL,
    message TEXT,
    stack_trace TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 5. APP CONTENT ANALYTICS TABLE (AGGREGATED)
-- =============================================================================
-- Pre-computed statistics for fast queries
CREATE TABLE IF NOT EXISTS app_content_analytics (
    content_id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    total_views INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    total_shares INTEGER DEFAULT 0,
    total_saves INTEGER DEFAULT 0,
    avg_dwell_time_ms INTEGER DEFAULT 0,
    completion_rate FLOAT DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. APP PERSONALIZATION PROFILES TABLE
-- =============================================================================
-- Machine learning derived user preferences for personalization
CREATE TABLE IF NOT EXISTS app_personalization_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    
    -- ML vectors and preferences
    preference_vector FLOAT[], -- 512-dimensional embedding
    liked_categories TEXT[] DEFAULT '{}',
    liked_artists UUID[] DEFAULT '{}',
    liked_styles TEXT[] DEFAULT '{}',
    
    -- Behavioral patterns
    avg_dwell_time_ms INTEGER DEFAULT 0,
    avg_session_length INTEGER DEFAULT 0,
    primary_usage_time TEXT, -- morning, afternoon, evening, night
    
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 7. APP CURATED CONTENT TABLE
-- =============================================================================
-- Pre-computed content items for the personalized feed
CREATE TABLE IF NOT EXISTS app_curated_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id TEXT NOT NULL,
    content_type TEXT NOT NULL, -- artwork, event, artist_spotlight, video
    
    -- Content metadata for feed
    title TEXT,
    description TEXT,
    image_url TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    
    -- Content categorization
    tags TEXT[] DEFAULT '{}',
    color_palette TEXT[] DEFAULT '{}',
    mood_tags TEXT[] DEFAULT '{}',
    
    -- Engagement metrics (from content_analytics)
    engagement_score FLOAT DEFAULT 0,
    trending_score FLOAT DEFAULT 0,
    quality_score FLOAT DEFAULT 0,
    
    -- Content metadata specific to type
    data JSONB DEFAULT '{}'::jsonb,
    
    -- Status and curation
    status TEXT DEFAULT 'active',
    curator_type TEXT DEFAULT 'auto', -- auto, admin
    curator_id UUID REFERENCES people(id) ON DELETE SET NULL,
    available_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. APP EXPOSURE TRACKING TABLE
-- =============================================================================
-- Tracks what content users have been shown to avoid duplicates
CREATE TABLE IF NOT EXISTS app_exposure_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES app_analytics_sessions(session_id) ON DELETE CASCADE,
    item_id UUID REFERENCES app_curated_content(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL,
    interaction_type TEXT NOT NULL, -- shown, engaged, liked, shared, saved
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Analytics sessions indexes
CREATE INDEX IF NOT EXISTS idx_app_analytics_sessions_user_id ON app_analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_analytics_sessions_person_id ON app_analytics_sessions(person_id);
CREATE INDEX IF NOT EXISTS idx_app_analytics_sessions_started_at ON app_analytics_sessions(started_at DESC);

-- Engagement events indexes
CREATE INDEX IF NOT EXISTS idx_app_engagement_session ON app_engagement_events(session_id);
CREATE INDEX IF NOT EXISTS idx_app_engagement_content ON app_engagement_events(content_id, content_type);
CREATE INDEX IF NOT EXISTS idx_app_engagement_timestamp ON app_engagement_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_engagement_user ON app_engagement_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_engagement_person ON app_engagement_events(person_id) WHERE person_id IS NOT NULL;

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_app_performance_session ON app_performance_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_app_performance_type ON app_performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_app_performance_timestamp ON app_performance_metrics(timestamp DESC);

-- Error events indexes
CREATE INDEX IF NOT EXISTS idx_app_error_session ON app_error_events(session_id);
CREATE INDEX IF NOT EXISTS idx_app_error_type ON app_error_events(error_type);
CREATE INDEX IF NOT EXISTS idx_app_error_timestamp ON app_error_events(timestamp DESC);

-- Content analytics indexes
CREATE INDEX IF NOT EXISTS idx_app_content_analytics_type ON app_content_analytics(content_type);
CREATE INDEX IF NOT EXISTS idx_app_content_analytics_views ON app_content_analytics(total_views DESC);
CREATE INDEX IF NOT EXISTS idx_app_content_analytics_updated ON app_content_analytics(updated_at DESC);

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_app_personalization_person ON app_personalization_profiles(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_personalization_updated ON app_personalization_profiles(last_updated DESC);

-- Content feed items indexes
CREATE INDEX IF NOT EXISTS idx_app_curated_content_type ON app_curated_content(content_type);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_status ON app_curated_content(status);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_engagement ON app_curated_content(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_trending ON app_curated_content(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_tags ON app_curated_content USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_app_curated_content_available ON app_curated_content(available_until) WHERE available_until IS NOT NULL;

-- Feed interactions indexes
CREATE INDEX IF NOT EXISTS idx_app_exposure_tracking_user ON app_exposure_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_app_exposure_tracking_session ON app_exposure_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_app_exposure_tracking_item ON app_exposure_tracking(item_id);
CREATE INDEX IF NOT EXISTS idx_app_exposure_tracking_timestamp ON app_exposure_tracking(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_exposure_tracking_type ON app_exposure_tracking(interaction_type);

-- =============================================================================
-- DATABASE FUNCTIONS FOR CONTENT STATISTICS
-- =============================================================================

-- Function to increment content statistics
CREATE OR REPLACE FUNCTION app_increment_content_stat(
    p_content_id TEXT,
    p_content_type TEXT,
    p_stat_type TEXT
) RETURNS void AS $$
BEGIN
    -- Insert if not exists
    INSERT INTO app_content_analytics (content_id, content_type)
    VALUES (p_content_id, p_content_type)
    ON CONFLICT (content_id) DO NOTHING;

    -- Update the specific stat
    CASE p_stat_type
        WHEN 'view' THEN
            UPDATE app_content_analytics
            SET total_views = total_views + 1,
                last_viewed_at = NOW(),
                updated_at = NOW()
            WHERE content_id = p_content_id;
        WHEN 'like' THEN
            UPDATE app_content_analytics
            SET total_likes = total_likes + 1,
                updated_at = NOW()
            WHERE content_id = p_content_id;
        WHEN 'share' THEN
            UPDATE app_content_analytics
            SET total_shares = total_shares + 1,
                updated_at = NOW()
            WHERE content_id = p_content_id;
        WHEN 'save' THEN
            UPDATE app_content_analytics
            SET total_saves = total_saves + 1,
                updated_at = NOW()
            WHERE content_id = p_content_id;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to update average dwell time
CREATE OR REPLACE FUNCTION app_update_avg_dwell_time()
RETURNS TRIGGER AS $$
BEGIN
    -- Update average dwell time for this content
    UPDATE app_content_analytics
    SET avg_dwell_time_ms = (
        SELECT AVG(dwell_time_ms)::integer
        FROM app_engagement_events
        WHERE content_id = NEW.content_id
        AND dwell_time_ms IS NOT NULL
        AND dwell_time_ms > 0
    ),
    updated_at = NOW()
    WHERE content_id = NEW.content_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update dwell time averages
CREATE TRIGGER app_engagement_dwell_time_trigger
    AFTER INSERT ON app_engagement_events
    FOR EACH ROW
    WHEN (NEW.dwell_time_ms IS NOT NULL AND NEW.dwell_time_ms > 0)
    EXECUTE FUNCTION app_update_avg_dwell_time();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE app_analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_content_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_personalization_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_curated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_exposure_tracking ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access app_analytics_sessions"
    ON app_analytics_sessions FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_engagement_events"
    ON app_engagement_events FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_performance_metrics"
    ON app_performance_metrics FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_error_events"
    ON app_error_events FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_content_analytics"
    ON app_content_analytics FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_personalization_profiles"
    ON app_personalization_profiles FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_curated_content"
    ON app_curated_content FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access app_exposure_tracking"
    ON app_exposure_tracking FOR ALL
    USING (auth.role() = 'service_role');

-- Users can read public content and manage their own data
CREATE POLICY "Users can read app_curated_content"
    ON app_curated_content FOR SELECT
    TO authenticated
    USING (status = 'active');

CREATE POLICY "Public can read app_content_analytics"
    ON app_content_analytics FOR SELECT
    USING (true);

CREATE POLICY "Users can manage their own app_personalization_profiles"
    ON app_personalization_profiles FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can manage their own app_exposure_tracking"
    ON app_exposure_tracking FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Admin policies for ABHQ admins
CREATE POLICY "ABHQ admins can read all app analytics data"
    ON app_analytics_sessions FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM abhq_admin_users
        WHERE user_id = auth.uid() AND active = true
    ));

CREATE POLICY "ABHQ admins can read all app engagement data"
    ON app_engagement_events FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM abhq_admin_users
        WHERE user_id = auth.uid() AND active = true
    ));

CREATE POLICY "ABHQ admins can curate content"
    ON app_curated_content FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM abhq_admin_users
        WHERE user_id = auth.uid() AND active = true
    ));

-- =============================================================================
-- INITIAL DATA POPULATION
-- =============================================================================

-- Populate app_curated_content with existing artworks
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
        WHEN mf.file_url IS NOT NULL THEN mf.file_url
        ELSE NULL
    END,
    CASE 
        WHEN mf.file_url IS NOT NULL THEN mf.file_url
        ELSE NULL
    END,
    ARRAY['art_battle', e.eid, 'round_' || a.round::text],
    jsonb_build_object(
        'artistName', ap.name,
        'artistId', ap.id,
        'eventName', e.name,
        'eventId', e.id,
        'eventDate', e.event_start_datetime,
        'city', c.name,
        'round', a.round,
        'easel', a.easel,
        'voteCount', a.vote_count,
        'bidCount', a.bid_count,
        'currentBid', a.current_bid,
        'status', a.status,
        'artCode', a.art_code
    ),
    -- Simple engagement score based on votes and views
    CASE 
        WHEN a.vote_count > 0 THEN 0.5 + (a.vote_count::float / 100.0)
        ELSE 0.3
    END,
    -- Quality score based on having description and media
    CASE 
        WHEN a.description IS NOT NULL AND mf.file_url IS NOT NULL THEN 0.9
        WHEN a.description IS NOT NULL OR mf.file_url IS NOT NULL THEN 0.7
        ELSE 0.5
    END
FROM art a
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN events e ON a.event_id = e.id
LEFT JOIN cities c ON e.city_id = c.id
LEFT JOIN art_media am ON a.id = am.art_id AND am.media_type = 'image'
LEFT JOIN media_files mf ON am.media_file_id = mf.id
WHERE a.status IN ('active', 'sold', 'closed')
AND e.show_in_app = true
ORDER BY e.event_start_datetime DESC, a.round, a.easel
LIMIT 1000 -- Start with recent artworks
ON CONFLICT (id) DO NOTHING;

-- Populate app_curated_content with upcoming events
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
        WHEN mf.file_url IS NOT NULL THEN mf.file_url
        ELSE NULL
    END,
    CASE 
        WHEN mf.file_url IS NOT NULL THEN mf.file_url
        ELSE NULL
    END,
    ARRAY['event', 'art_battle', COALESCE(c.name, 'unknown_city')] || 
    CASE WHEN e.event_start_datetime > NOW() THEN ARRAY['upcoming'] ELSE ARRAY['past'] END,
    jsonb_build_object(
        'eventId', e.id,
        'eid', e.eid,
        'venue', e.venue,
        'city', c.name,
        'country', co.name,
        'startDate', e.event_start_datetime,
        'endDate', e.event_end_datetime,
        'currentRound', e.current_round,
        'ticketLink', e.ticket_link,
        'liveStream', e.live_stream,
        'capacity', e.capacity,
        'status', CASE 
            WHEN e.event_start_datetime > NOW() THEN 'upcoming'
            WHEN e.event_start_datetime <= NOW() AND e.event_end_datetime > NOW() THEN 'live'
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
AND e.show_in_app = true
AND e.event_start_datetime > NOW() - INTERVAL '30 days' -- Include recent past events
ORDER BY e.event_start_datetime DESC
LIMIT 200
ON CONFLICT (id) DO NOTHING;

-- Initialize app_content_analytics for existing artworks
INSERT INTO app_content_analytics (content_id, content_type, total_views, total_likes)
SELECT 
    a.id::text,
    'artwork',
    GREATEST(a.vote_count, 1), -- Use vote_count as proxy for views
    a.vote_count -- Use vote_count as likes
FROM art a
WHERE a.status IN ('active', 'sold', 'closed')
ON CONFLICT (content_id) DO NOTHING;

-- Initialize app_content_analytics for events
INSERT INTO app_content_analytics (content_id, content_type, total_views)
SELECT 
    e.id::text,
    'event',
    10 -- Default view count
FROM events e
WHERE e.enabled = true AND e.show_in_app = true
ON CONFLICT (content_id) DO NOTHING;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE 'iOS App Integration Migration Completed Successfully!';
    RAISE NOTICE 'Created tables: app_analytics_sessions, app_engagement_events, app_performance_metrics, app_error_events, app_content_analytics, app_personalization_profiles, app_curated_content, app_exposure_tracking';
    RAISE NOTICE 'Created indexes for optimal performance';
    RAISE NOTICE 'Created RLS policies for security';
    RAISE NOTICE 'Populated initial content from existing artworks and events';
    RAISE NOTICE 'Ready for iOS app integration!';
END $$;