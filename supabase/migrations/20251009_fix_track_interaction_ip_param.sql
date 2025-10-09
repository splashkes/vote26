-- Fix track_sponsorship_interaction RPC to accept text for IP address instead of inet
-- This allows storing full x-forwarded-for chain

DROP FUNCTION IF EXISTS track_sponsorship_interaction(character varying, character varying, uuid, jsonb, inet, text);

CREATE OR REPLACE FUNCTION track_sponsorship_interaction(
  p_invite_hash VARCHAR,
  p_interaction_type VARCHAR,
  p_package_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_ip_address TEXT DEFAULT NULL,  -- Changed from inet to text
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_id UUID;
  v_event_id UUID;
  v_interaction_id UUID;
BEGIN
  -- Get invite and event IDs
  SELECT id, event_id INTO v_invite_id, v_event_id
  FROM sponsorship_invites
  WHERE hash = p_invite_hash;

  IF v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Invite not found: %', p_invite_hash;
  END IF;

  -- Insert interaction record
  INSERT INTO sponsorship_interactions (
    invite_id,
    event_id,
    interaction_type,
    package_id,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    v_invite_id,
    v_event_id,
    p_interaction_type,
    p_package_id,
    p_metadata,
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_interaction_id;

  RETURN v_interaction_id;
END;
$$;
