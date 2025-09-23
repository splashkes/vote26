-- Payment Setup Invitations Tracking System
-- Tracks when payment setup invitations are sent to artists

CREATE TABLE IF NOT EXISTS payment_setup_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_profile_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  invitation_method VARCHAR(20) NOT NULL CHECK (invitation_method IN ('email', 'sms', 'both')),
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(50),
  sent_by VARCHAR(100) NOT NULL, -- Admin user who sent the invitation
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'opened', 'clicked')),
  invitation_type VARCHAR(30) DEFAULT 'payment_setup' CHECK (invitation_type IN ('payment_setup', 'reminder', 'follow_up')),
  message_content TEXT,
  delivery_metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_setup_invitations_artist_profile
ON payment_setup_invitations(artist_profile_id);

CREATE INDEX IF NOT EXISTS idx_payment_setup_invitations_sent_at
ON payment_setup_invitations(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_setup_invitations_method
ON payment_setup_invitations(invitation_method);

CREATE INDEX IF NOT EXISTS idx_payment_setup_invitations_status
ON payment_setup_invitations(status);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_setup_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_setup_invitations_updated_at_trigger
    BEFORE UPDATE ON payment_setup_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_setup_invitations_updated_at();

-- Function to log payment setup invitation
CREATE OR REPLACE FUNCTION log_payment_setup_invitation(
    p_artist_profile_id UUID,
    p_invitation_method VARCHAR(20),
    p_recipient_email VARCHAR(255) DEFAULT NULL,
    p_recipient_phone VARCHAR(50) DEFAULT NULL,
    p_sent_by VARCHAR(100),
    p_invitation_type VARCHAR(30) DEFAULT 'payment_setup',
    p_message_content TEXT DEFAULT NULL,
    p_delivery_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    invitation_id UUID;
BEGIN
    INSERT INTO payment_setup_invitations (
        artist_profile_id,
        invitation_method,
        recipient_email,
        recipient_phone,
        sent_by,
        invitation_type,
        message_content,
        delivery_metadata,
        status
    ) VALUES (
        p_artist_profile_id,
        p_invitation_method,
        p_recipient_email,
        p_recipient_phone,
        p_sent_by,
        p_invitation_type,
        p_message_content,
        p_delivery_metadata,
        'sent'
    )
    RETURNING id INTO invitation_id;

    RETURN invitation_id;
END;
$function$;

-- Function to get payment setup invitation history for an artist
CREATE OR REPLACE FUNCTION get_artist_invitation_history(p_artist_profile_id UUID)
RETURNS TABLE (
    id UUID,
    invitation_method VARCHAR(20),
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(50),
    sent_by VARCHAR(100),
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20),
    invitation_type VARCHAR(30),
    message_content TEXT,
    delivery_metadata JSONB,
    error_message TEXT,
    time_since_sent TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        psi.id,
        psi.invitation_method,
        psi.recipient_email,
        psi.recipient_phone,
        psi.sent_by,
        psi.sent_at,
        psi.status,
        psi.invitation_type,
        psi.message_content,
        psi.delivery_metadata,
        psi.error_message,
        CASE
            WHEN AGE(NOW(), psi.sent_at) < INTERVAL '1 hour' THEN
                EXTRACT(epoch FROM AGE(NOW(), psi.sent_at))::INTEGER / 60 || 'm ago'
            WHEN AGE(NOW(), psi.sent_at) < INTERVAL '1 day' THEN
                EXTRACT(epoch FROM AGE(NOW(), psi.sent_at))::INTEGER / 3600 || 'h ago'
            WHEN AGE(NOW(), psi.sent_at) < INTERVAL '7 days' THEN
                EXTRACT(epoch FROM AGE(NOW(), psi.sent_at))::INTEGER / 86400 || 'd ago'
            ELSE
                TO_CHAR(psi.sent_at, 'MM/DD/YYYY')
        END as time_since_sent
    FROM payment_setup_invitations psi
    WHERE psi.artist_profile_id = p_artist_profile_id
    ORDER BY psi.sent_at DESC;
END;
$function$;

-- Function to get latest invitation info for each artist (for main list display)
CREATE OR REPLACE FUNCTION get_latest_invitations_summary()
RETURNS TABLE (
    artist_profile_id UUID,
    latest_invitation_sent_at TIMESTAMP WITH TIME ZONE,
    latest_invitation_method VARCHAR(20),
    latest_invitation_status VARCHAR(20),
    invitation_count INTEGER,
    time_since_latest TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH latest_invitations AS (
        SELECT
            psi.artist_profile_id,
            psi.sent_at,
            psi.invitation_method,
            psi.status,
            ROW_NUMBER() OVER (PARTITION BY psi.artist_profile_id ORDER BY psi.sent_at DESC) as rn
        FROM payment_setup_invitations psi
    ),
    invitation_counts AS (
        SELECT
            psi.artist_profile_id,
            COUNT(*) as total_invitations
        FROM payment_setup_invitations psi
        GROUP BY psi.artist_profile_id
    )
    SELECT
        li.artist_profile_id,
        li.sent_at as latest_invitation_sent_at,
        li.invitation_method as latest_invitation_method,
        li.status as latest_invitation_status,
        ic.total_invitations as invitation_count,
        CASE
            WHEN AGE(NOW(), li.sent_at) < INTERVAL '1 hour' THEN
                EXTRACT(epoch FROM AGE(NOW(), li.sent_at))::INTEGER / 60 || 'm ago'
            WHEN AGE(NOW(), li.sent_at) < INTERVAL '1 day' THEN
                EXTRACT(epoch FROM AGE(NOW(), li.sent_at))::INTEGER / 3600 || 'h ago'
            WHEN AGE(NOW(), li.sent_at) < INTERVAL '7 days' THEN
                EXTRACT(epoch FROM AGE(NOW(), li.sent_at))::INTEGER / 86400 || 'd ago'
            ELSE
                TO_CHAR(li.sent_at, 'MM/DD/YYYY')
        END as time_since_latest
    FROM latest_invitations li
    JOIN invitation_counts ic ON li.artist_profile_id = ic.artist_profile_id
    WHERE li.rn = 1;
END;
$function$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON payment_setup_invitations TO authenticated;
GRANT EXECUTE ON FUNCTION log_payment_setup_invitation(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_artist_invitation_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_invitations_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION update_payment_setup_invitations_updated_at() TO authenticated;