-- AI Artwork Analysis System Database Migration
-- Date: September 2, 2025
-- Purpose: Create table and functions for AI-powered artwork analysis with 5-year TTL caching

-- Create the main art_media_ai_caption table
CREATE TABLE IF NOT EXISTS art_media_ai_caption (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    
    -- Image identification & classification
    artwork_type TEXT NOT NULL CHECK (artwork_type IN ('sample_work', 'event_painting', 'portfolio_piece', 'competition_entry')),
    source_id UUID, -- References artist_sample_works.id, painting.id, etc. depending on type
    cloudflare_id TEXT, -- For Cloudflare-hosted images
    image_url TEXT NOT NULL, -- Source image URL (from unified sample works or other sources)
    
    -- AI Analysis Content (streamlined to 2 sections)
    commentary TEXT NOT NULL, -- Combines technique, style, materials analysis
    event_potential TEXT NOT NULL, -- Combines market value and live performance potential
    
    -- Metadata & Versioning
    openai_model TEXT DEFAULT 'gpt-4o-mini',
    prompt_used TEXT NOT NULL,
    token_usage JSONB DEFAULT '{}', -- {prompt_tokens, completion_tokens, total_tokens}
    api_response_metadata JSONB DEFAULT '{}', -- Full API response for debugging
    
    -- TTL & Caching (5 years default)
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 years',
    
    -- Constraints
    CONSTRAINT unique_artwork_analysis UNIQUE(artist_profile_id, image_url, artwork_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_art_media_ai_caption_artist_type 
ON art_media_ai_caption(artist_profile_id, artwork_type);

CREATE INDEX IF NOT EXISTS idx_art_media_ai_caption_expires 
ON art_media_ai_caption(expires_at);

-- Enable RLS for admin access only
ALTER TABLE art_media_ai_caption ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access (similar to artist_ai_intel table)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'art_media_ai_caption' 
        AND policyname = 'Allow admin access to artwork AI analysis'
    ) THEN
        CREATE POLICY "Allow admin access to artwork AI analysis"
        ON art_media_ai_caption
        FOR ALL
        USING (true);
    END IF;
END $$;

-- Helper function to get artwork AI analysis (with TTL check)
CREATE OR REPLACE FUNCTION admin_get_artwork_ai_analysis(
    p_artist_profile_id UUID,
    p_image_url TEXT,
    p_artwork_type TEXT DEFAULT 'sample_work'
)
RETURNS TABLE(
    id UUID,
    artwork_type TEXT,
    source_id UUID,
    cloudflare_id TEXT,
    image_url TEXT,
    commentary TEXT,
    event_potential TEXT,
    openai_model TEXT,
    token_usage JSONB,
    generated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_cached BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        amc.id,
        amc.artwork_type,
        amc.source_id,
        amc.cloudflare_id,
        amc.image_url,
        amc.technique_analysis,
        amc.style_assessment,
        amc.materials_description,
        amc.market_value_analysis,
        amc.live_performance_potential,
        amc.openai_model,
        amc.token_usage,
        amc.generated_at,
        amc.expires_at,
        (amc.expires_at > NOW()) as is_cached
    FROM art_media_ai_caption amc
    WHERE amc.artist_profile_id = p_artist_profile_id
        AND amc.image_url = p_image_url
        AND amc.artwork_type = p_artwork_type
        AND amc.expires_at > NOW()
    ORDER BY amc.generated_at DESC
    LIMIT 1;
END;
$$;

-- Helper function to store artwork AI analysis
CREATE OR REPLACE FUNCTION admin_store_artwork_ai_analysis(
    p_artist_profile_id UUID,
    p_artwork_type TEXT,
    p_source_id UUID,
    p_cloudflare_id TEXT,
    p_image_url TEXT,
    p_commentary TEXT,
    p_event_potential TEXT,
    p_openai_model TEXT DEFAULT 'gpt-4o-mini',
    p_prompt_used TEXT DEFAULT '',
    p_token_usage JSONB DEFAULT '{}',
    p_api_response_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    new_id UUID;
BEGIN
    -- Insert new analysis
    INSERT INTO art_media_ai_caption (
        artist_profile_id,
        artwork_type,
        source_id,
        cloudflare_id,
        image_url,
        commentary,
        event_potential,
        openai_model,
        prompt_used,
        token_usage,
        api_response_metadata
    ) VALUES (
        p_artist_profile_id,
        p_artwork_type,
        p_source_id,
        p_cloudflare_id,
        p_image_url,
        p_commentary,
        p_event_potential,
        p_openai_model,
        p_prompt_used,
        p_token_usage,
        p_api_response_metadata
    )
    ON CONFLICT (artist_profile_id, image_url, artwork_type)
    DO UPDATE SET
        commentary = EXCLUDED.commentary,
        event_potential = EXCLUDED.event_potential,
        openai_model = EXCLUDED.openai_model,
        prompt_used = EXCLUDED.prompt_used,
        token_usage = EXCLUDED.token_usage,
        api_response_metadata = EXCLUDED.api_response_metadata,
        generated_at = NOW(),
        expires_at = NOW() + INTERVAL '5 years'
    RETURNING id INTO new_id;
    
    RETURN new_id;
END;
$$;

-- Helper function to cleanup expired analyses
CREATE OR REPLACE FUNCTION admin_cleanup_expired_artwork_analysis()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM art_media_ai_caption 
    WHERE expires_at <= NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- Helper function to get artwork analysis stats
CREATE OR REPLACE FUNCTION admin_get_artwork_analysis_stats()
RETURNS TABLE(
    total_analyses INTEGER,
    active_analyses INTEGER,
    expired_analyses INTEGER,
    sample_work_count INTEGER,
    event_painting_count INTEGER,
    avg_tokens_used NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_analyses,
        COUNT(CASE WHEN expires_at > NOW() THEN 1 END)::INTEGER as active_analyses,
        COUNT(CASE WHEN expires_at <= NOW() THEN 1 END)::INTEGER as expired_analyses,
        COUNT(CASE WHEN artwork_type = 'sample_work' THEN 1 END)::INTEGER as sample_work_count,
        COUNT(CASE WHEN artwork_type = 'event_painting' THEN 1 END)::INTEGER as event_painting_count,
        ROUND(AVG(COALESCE((token_usage->>'total_tokens')::INTEGER, 0)), 2) as avg_tokens_used
    FROM art_media_ai_caption;
END;
$$;