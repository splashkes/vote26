-- Create artist AI intelligence table for OpenAI-generated insights
-- TTL-based caching system for artist analysis and recommendations
-- Date: September 2, 2025

CREATE TABLE IF NOT EXISTS artist_ai_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  
  -- AI-generated insights stored as structured JSON
  ai_summary JSONB NOT NULL,
  participation_insights JSONB,
  bio_analysis JSONB,
  recommendations JSONB,
  strengths TEXT[],
  growth_areas TEXT[],
  
  -- Metadata and caching
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days', -- 7 day TTL
  openai_model TEXT DEFAULT 'gpt-4',
  token_usage JSONB,
  
  -- Ensure only one active AI intel record per artist (simplified approach)
  CONSTRAINT unique_active_intel UNIQUE (artist_profile_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_artist_ai_intel_profile_expires 
ON artist_ai_intel(artist_profile_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_artist_ai_intel_expires 
ON artist_ai_intel(expires_at);

-- Function to cleanup expired AI intel records
CREATE OR REPLACE FUNCTION cleanup_expired_ai_intel()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM artist_ai_intel 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$function$;

-- Function to get or generate AI intel for an artist
CREATE OR REPLACE FUNCTION admin_get_artist_ai_intel(
  p_artist_profile_id UUID
)
RETURNS TABLE (
  id UUID,
  ai_summary JSONB,
  participation_insights JSONB,
  bio_analysis JSONB,
  recommendations JSONB,
  strengths TEXT[],
  growth_areas TEXT[],
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_cached BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- First, clean up expired records for this artist
  DELETE FROM artist_ai_intel 
  WHERE artist_profile_id = p_artist_profile_id 
    AND expires_at < NOW();

  -- Try to get valid cached AI intel
  RETURN QUERY
  SELECT 
    ai.id,
    ai.ai_summary,
    ai.participation_insights,
    ai.bio_analysis,
    ai.recommendations,
    ai.strengths,
    ai.growth_areas,
    ai.generated_at,
    ai.expires_at,
    TRUE as is_cached
  FROM artist_ai_intel ai
  WHERE ai.artist_profile_id = p_artist_profile_id
    AND ai.expires_at > NOW()
  ORDER BY ai.generated_at DESC
  LIMIT 1;
  
  -- If no valid cache found, return empty result
  -- (The edge function will handle generation)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      NULL::UUID as id,
      NULL::JSONB as ai_summary,
      NULL::JSONB as participation_insights,
      NULL::JSONB as bio_analysis,
      NULL::JSONB as recommendations,
      NULL::TEXT[] as strengths,
      NULL::TEXT[] as growth_areas,
      NULL::TIMESTAMPTZ as generated_at,
      NULL::TIMESTAMPTZ as expires_at,
      FALSE as is_cached;
  END IF;
END;
$function$;

-- Function to store new AI intel
CREATE OR REPLACE FUNCTION admin_store_artist_ai_intel(
  p_artist_profile_id UUID,
  p_ai_summary JSONB,
  p_participation_insights JSONB DEFAULT NULL,
  p_bio_analysis JSONB DEFAULT NULL,
  p_recommendations JSONB DEFAULT NULL,
  p_strengths TEXT[] DEFAULT NULL,
  p_growth_areas TEXT[] DEFAULT NULL,
  p_openai_model TEXT DEFAULT 'gpt-4',
  p_token_usage JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_intel_id UUID;
BEGIN
  -- Delete any existing record for this artist (upsert pattern)
  DELETE FROM artist_ai_intel WHERE artist_profile_id = p_artist_profile_id;
  
  -- Insert new AI intel record
  INSERT INTO artist_ai_intel (
    artist_profile_id,
    ai_summary,
    participation_insights,
    bio_analysis,
    recommendations,
    strengths,
    growth_areas,
    openai_model,
    token_usage
  ) VALUES (
    p_artist_profile_id,
    p_ai_summary,
    p_participation_insights,
    p_bio_analysis,
    p_recommendations,
    p_strengths,
    p_growth_areas,
    p_openai_model,
    p_token_usage
  ) RETURNING id INTO v_intel_id;
  
  RETURN v_intel_id;
END;
$function$;

-- RLS Policies for admin access
ALTER TABLE artist_ai_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can access AI intel" ON artist_ai_intel
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users 
    WHERE email = auth.jwt() ->> 'email' 
    AND active = true 
    AND level = 'super'
  )
);

-- Comments for documentation
COMMENT ON TABLE artist_ai_intel IS 
'AI-generated intelligence and insights for artists using OpenAI API with TTL-based caching';

COMMENT ON COLUMN artist_ai_intel.ai_summary IS 
'Main AI-generated summary and overview of the artist';

COMMENT ON COLUMN artist_ai_intel.participation_insights IS 
'JSON object with participation metrics, trends, and patterns';

COMMENT ON COLUMN artist_ai_intel.bio_analysis IS 
'Analysis of artist bio, social media presence, and profile completeness';

COMMENT ON COLUMN artist_ai_intel.recommendations IS 
'AI-generated recommendations for artist engagement and development';

COMMENT ON COLUMN artist_ai_intel.expires_at IS 
'TTL expiration timestamp - records auto-expire after 7 days';

COMMENT ON FUNCTION admin_get_artist_ai_intel(UUID) IS 
'Get cached AI intel for an artist or indicate if generation is needed';

COMMENT ON FUNCTION admin_store_artist_ai_intel(UUID, JSONB, JSONB, JSONB, JSONB, TEXT[], TEXT[], TEXT, JSONB) IS 
'Store new AI-generated intel with automatic TTL expiration';

COMMENT ON FUNCTION cleanup_expired_ai_intel() IS 
'Cleanup function to remove expired AI intel records - can be run via cron';