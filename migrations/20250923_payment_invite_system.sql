-- Create table to track payment setup invitations
CREATE TABLE IF NOT EXISTS payment_invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_profile_id uuid REFERENCES artist_profiles(id) NOT NULL,
  invite_type text NOT NULL CHECK (invite_type IN ('email', 'sms', 'manual')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'completed', 'expired')),
  sent_at timestamp with time zone DEFAULT NOW(),
  opened_at timestamp with time zone,
  completed_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (NOW() + INTERVAL '30 days'),
  sent_by_user_id uuid,
  invitation_token text UNIQUE,
  email_subject text,
  email_body text,
  sms_message text,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_invitations_artist_profile_id ON payment_invitations(artist_profile_id);
CREATE INDEX IF NOT EXISTS idx_payment_invitations_status ON payment_invitations(status);
CREATE INDEX IF NOT EXISTS idx_payment_invitations_sent_at ON payment_invitations(sent_at);

-- Function to send payment setup invitation
CREATE OR REPLACE FUNCTION send_payment_setup_invitation(
  artist_id uuid,
  invite_type text DEFAULT 'email',
  custom_message text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  artist_record artist_profiles%ROWTYPE;
  invitation_id uuid;
  invite_token text;
  result json;
BEGIN
  -- Get artist details
  SELECT * INTO artist_record FROM artist_profiles WHERE id = artist_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Artist not found'
    );
  END IF;

  -- Generate unique invitation token
  invite_token := encode(gen_random_bytes(32), 'hex');

  -- Create invitation record
  INSERT INTO payment_invitations (
    artist_profile_id,
    invite_type,
    invitation_token,
    email_subject,
    email_body,
    sms_message
  ) VALUES (
    artist_id,
    invite_type,
    invite_token,
    CASE
      WHEN invite_type = 'email' THEN 'Set up your Art Battle payment account'
      ELSE NULL
    END,
    CASE
      WHEN invite_type = 'email' THEN COALESCE(
        custom_message,
        'Hi ' || artist_record.name || ',\n\nYou have earnings from Art Battle events that are ready to be paid out. Please set up your payment account to receive your funds.\n\nClick here to get started: [PAYMENT_SETUP_LINK]\n\nBest regards,\nArt Battle Team'
      )
      ELSE NULL
    END,
    CASE
      WHEN invite_type = 'sms' THEN COALESCE(
        custom_message,
        'Hi ' || artist_record.name || '! You have Art Battle earnings ready. Set up payment: [PAYMENT_SETUP_LINK]'
      )
      ELSE NULL
    END
  ) RETURNING id INTO invitation_id;

  -- Return success with invitation details
  RETURN json_build_object(
    'success', true,
    'invitation_id', invitation_id,
    'artist_name', artist_record.name,
    'artist_email', artist_record.email,
    'artist_phone', artist_record.phone,
    'invite_type', invite_type,
    'token', invite_token,
    'message', 'Invitation created successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', 'Failed to create invitation: ' || SQLERRM
  );
END;
$$;

-- Function to get invitation history for an artist
CREATE OR REPLACE FUNCTION get_artist_invitation_history(artist_id uuid)
RETURNS TABLE (
  invitation_id uuid,
  invite_type text,
  status text,
  sent_at timestamp with time zone,
  opened_at timestamp with time zone,
  completed_at timestamp with time zone,
  expires_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    invite_type,
    status,
    sent_at,
    opened_at,
    completed_at,
    expires_at
  FROM payment_invitations
  WHERE artist_profile_id = artist_id
  ORDER BY sent_at DESC;
$$;