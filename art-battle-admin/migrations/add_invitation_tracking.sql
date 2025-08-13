-- Add invitation view tracking fields to artist_invites table
ALTER TABLE artist_invites 
ADD COLUMN first_viewed_at TIMESTAMPTZ,
ADD COLUMN last_viewed_at TIMESTAMPTZ,
ADD COLUMN view_count INTEGER DEFAULT 0,
ADD COLUMN viewed_from_ip INET,
ADD COLUMN viewed_user_agent TEXT,
ADD COLUMN invitation_token TEXT UNIQUE;

-- Generate unique tokens for existing invitations
UPDATE artist_invites 
SET invitation_token = gen_random_uuid()::text 
WHERE invitation_token IS NULL;

-- Make invitation_token non-null for future records
ALTER TABLE artist_invites 
ALTER COLUMN invitation_token SET NOT NULL;

-- Add index for token lookups
CREATE INDEX idx_artist_invites_token ON artist_invites(invitation_token);

-- Add index for view tracking queries
CREATE INDEX idx_artist_invites_viewed_at ON artist_invites(last_viewed_at);

-- Create detailed invitation views tracking table
CREATE TABLE invitation_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invitation_id UUID NOT NULL REFERENCES artist_invites(id) ON DELETE CASCADE,
  viewer_user_id UUID, -- Could be artist or admin user
  viewer_type TEXT NOT NULL CHECK (viewer_type IN ('artist', 'admin')) DEFAULT 'artist',
  ip_address INET,
  user_agent TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for invitation_views
CREATE INDEX idx_invitation_views_invitation_id ON invitation_views(invitation_id);
CREATE INDEX idx_invitation_views_viewed_at ON invitation_views(viewed_at);
CREATE INDEX idx_invitation_views_viewer_type ON invitation_views(viewer_type);

-- Create function to update invitation view counts from detailed tracking
CREATE OR REPLACE FUNCTION update_invitation_view_counts(invite_id UUID)
RETURNS VOID AS $$
DECLARE
  first_view TIMESTAMPTZ;
  last_view TIMESTAMPTZ;
  total_views INTEGER;
  latest_ip INET;
  latest_agent TEXT;
BEGIN
  -- Get aggregated view data
  SELECT 
    MIN(viewed_at),
    MAX(viewed_at),
    COUNT(*),
    (SELECT ip_address FROM invitation_views WHERE invitation_id = invite_id ORDER BY viewed_at DESC LIMIT 1),
    (SELECT user_agent FROM invitation_views WHERE invitation_id = invite_id ORDER BY viewed_at DESC LIMIT 1)
  INTO first_view, last_view, total_views, latest_ip, latest_agent
  FROM invitation_views
  WHERE invitation_id = invite_id;
  
  -- Update artist_invites summary fields
  UPDATE artist_invites 
  SET 
    first_viewed_at = first_view,
    last_viewed_at = last_view,
    view_count = total_views,
    viewed_from_ip = latest_ip,
    viewed_user_agent = latest_agent
  WHERE id = invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to generate invitation analytics
CREATE OR REPLACE FUNCTION get_invitation_analytics(event_uuid UUID)
RETURNS TABLE (
  total_invitations BIGINT,
  viewed_invitations BIGINT,
  confirmed_invitations BIGINT,
  avg_time_to_view INTERVAL,
  avg_time_to_confirm INTERVAL,
  view_rate DECIMAL,
  confirmation_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_invitations,
    COUNT(ai.first_viewed_at) as viewed_invitations,
    COUNT(ac.id) as confirmed_invitations,
    AVG(ai.first_viewed_at - ai.created_at) as avg_time_to_view,
    AVG(ac.created_at - ai.created_at) as avg_time_to_confirm,
    ROUND(
      (COUNT(ai.first_viewed_at)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
    ) as view_rate,
    ROUND(
      (COUNT(ac.id)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2
    ) as confirmation_rate
  FROM artist_invites ai
  LEFT JOIN artist_confirmations ac ON ai.artist_id = ac.artist_id AND ai.event_id = ac.event_id
  WHERE ai.event_id = event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on invitation_views table
ALTER TABLE invitation_views ENABLE ROW LEVEL SECURITY;

-- RLS policies for invitation tracking
CREATE POLICY "Admins can view invitation tracking data" ON artist_invites 
FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users 
    WHERE email = auth.jwt() ->> 'email' AND active = true
  )
);

CREATE POLICY "Allow public view recording" ON artist_invites 
FOR UPDATE TO anon, authenticated
USING (invitation_token IS NOT NULL)
WITH CHECK (invitation_token IS NOT NULL);

-- RLS policies for invitation_views table
CREATE POLICY "Admins can view invitation views" ON invitation_views 
FOR SELECT TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM abhq_admin_users 
    WHERE email = auth.jwt() ->> 'email' AND active = true
  )
);

CREATE POLICY "Allow insertion of invitation views" ON invitation_views 
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Service role can access all invitation views" ON invitation_views 
FOR ALL TO service_role
USING (true)
WITH CHECK (true);