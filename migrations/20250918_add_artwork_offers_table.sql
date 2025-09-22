-- ARTWORK OFFERS TABLE
-- Enables admins to offer artworks to specific bidders, creating payment races
-- Date: 2025-09-18

-- ============================================
-- Create artwork_offers table
-- ============================================

CREATE TABLE IF NOT EXISTS public.artwork_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  art_id UUID REFERENCES public.art(id) ON DELETE CASCADE NOT NULL,
  offered_to_person_id UUID REFERENCES public.people(id) ON DELETE CASCADE NOT NULL,
  bid_id UUID REFERENCES public.bids(id) ON DELETE CASCADE NOT NULL,
  offered_amount NUMERIC(10,2) NOT NULL,
  offered_by_admin UUID REFERENCES auth.users(id) NOT NULL,

  -- Status tracking: pending, paid, expired, overtaken, declined
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'overtaken', 'declined')),

  -- Offer expiration (default 15 minutes from creation)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Additional metadata
  admin_note TEXT,
  metadata JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT positive_offered_amount CHECK (offered_amount > 0),
  CONSTRAINT future_expiration CHECK (expires_at > created_at)
);

-- Create indexes for performance
CREATE INDEX idx_artwork_offers_art_id ON public.artwork_offers(art_id);
CREATE INDEX idx_artwork_offers_offered_to_person_id ON public.artwork_offers(offered_to_person_id);
CREATE INDEX idx_artwork_offers_bid_id ON public.artwork_offers(bid_id);
CREATE INDEX idx_artwork_offers_admin ON public.artwork_offers(offered_by_admin);
CREATE INDEX idx_artwork_offers_status ON public.artwork_offers(status);
CREATE INDEX idx_artwork_offers_expires_at ON public.artwork_offers(expires_at) WHERE status = 'pending';
CREATE INDEX idx_artwork_offers_created_at ON public.artwork_offers(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_artwork_offers_art_status ON public.artwork_offers(art_id, status);
CREATE INDEX idx_artwork_offers_person_status ON public.artwork_offers(offered_to_person_id, status);

-- ============================================
-- Add updated_at trigger
-- ============================================

-- Reuse existing trigger function if it exists, otherwise create it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to artwork_offers
CREATE TRIGGER update_artwork_offers_updated_at
    BEFORE UPDATE ON public.artwork_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Create helper functions
-- ============================================

-- Function to get active offers for an artwork
CREATE OR REPLACE FUNCTION get_active_offers_for_artwork(p_art_id UUID)
RETURNS TABLE (
  offer_id UUID,
  offered_to_person_id UUID,
  person_name TEXT,
  person_phone TEXT,
  offered_amount NUMERIC,
  bid_amount NUMERIC,
  expires_at TIMESTAMPTZ,
  minutes_remaining INTEGER,
  admin_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ao.id as offer_id,
    ao.offered_to_person_id,
    COALESCE(p.first_name || ' ' || p.last_name, p.name, 'Unknown') as person_name,
    COALESCE(p.phone, p.phone_number, p.auth_phone) as person_phone,
    ao.offered_amount,
    b.amount as bid_amount,
    ao.expires_at,
    EXTRACT(EPOCH FROM (ao.expires_at - NOW()))/60 as minutes_remaining,
    COALESCE(u.email, 'Admin') as admin_name
  FROM artwork_offers ao
  JOIN people p ON ao.offered_to_person_id = p.id
  JOIN bids b ON ao.bid_id = b.id
  LEFT JOIN auth.users u ON ao.offered_by_admin = u.id
  WHERE ao.art_id = p_art_id
    AND ao.status = 'pending'
    AND ao.expires_at > NOW()
  ORDER BY ao.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if person has active offer for artwork
CREATE OR REPLACE FUNCTION get_person_active_offer(p_art_id UUID, p_person_id UUID)
RETURNS TABLE (
  offer_id UUID,
  offered_amount NUMERIC,
  expires_at TIMESTAMPTZ,
  bid_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ao.id as offer_id,
    ao.offered_amount,
    ao.expires_at,
    ao.bid_id
  FROM artwork_offers ao
  WHERE ao.art_id = p_art_id
    AND ao.offered_to_person_id = p_person_id
    AND ao.status = 'pending'
    AND ao.expires_at > NOW()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire old offers (for scheduled cleanup)
CREATE OR REPLACE FUNCTION expire_old_offers()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE artwork_offers
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at <= NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE public.artwork_offers ENABLE ROW LEVEL SECURITY;

-- Allow users to see offers made to them
CREATE POLICY "Users can view their own offers" ON public.artwork_offers
  FOR SELECT
  TO authenticated
  USING (
    offered_to_person_id = (
      SELECT p.id FROM public.people p
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- Allow admins to view offers for their events
CREATE POLICY "Admins can view event offers" ON public.artwork_offers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      JOIN public.art a ON a.event_id = ea.event_id
      WHERE a.id = artwork_offers.art_id
      AND ea.phone = auth.jwt()->>'phone'
    )
  );

-- Allow admins to create offers for their events
CREATE POLICY "Admins can create event offers" ON public.artwork_offers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      JOIN public.art a ON a.event_id = ea.event_id
      WHERE a.id = artwork_offers.art_id
      AND ea.phone = auth.jwt()->>'phone'
    )
    AND offered_by_admin = auth.uid()
  );

-- Allow admins to update offers for their events
CREATE POLICY "Admins can update event offers" ON public.artwork_offers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      JOIN public.art a ON a.event_id = ea.event_id
      WHERE a.id = artwork_offers.art_id
      AND ea.phone = auth.jwt()->>'phone'
    )
  );

-- ============================================
-- Add broadcast triggers for real-time updates
-- ============================================

-- Create broadcast function for offer events
CREATE OR REPLACE FUNCTION broadcast_artwork_offer_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
    art_code TEXT;
    event_eid TEXT;
BEGIN
    -- Get art code and event info for broadcast
    SELECT a.art_code, e.eid INTO art_code, event_eid
    FROM art a
    JOIN events e ON a.event_id = e.id
    WHERE a.id = COALESCE(NEW.art_id, OLD.art_id);

    payload = json_build_object(
        'table', 'artwork_offers',
        'type', TG_OP,
        'id', COALESCE(NEW.id, OLD.id),
        'art_id', COALESCE(NEW.art_id, OLD.art_id),
        'art_code', art_code,
        'event_eid', event_eid,
        'offered_to_person_id', COALESCE(NEW.offered_to_person_id, OLD.offered_to_person_id),
        'status', COALESCE(NEW.status, OLD.status),
        'offered_amount', COALESCE(NEW.offered_amount, OLD.offered_amount)
    );

    PERFORM pg_notify('artwork_offer_changed', payload::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Add trigger for offer changes
CREATE TRIGGER artwork_offer_broadcast_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.artwork_offers
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_artwork_offer_change();

-- ============================================
-- Grant permissions
-- ============================================

-- Grant access to helper functions
GRANT EXECUTE ON FUNCTION get_active_offers_for_artwork(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_person_active_offer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_offers() TO authenticated;

-- ============================================
-- Verification and completion message
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ artwork_offers table created successfully';
  RAISE NOTICE '✅ Indexes and constraints applied';
  RAISE NOTICE '✅ Helper functions created';
  RAISE NOTICE '✅ RLS policies applied';
  RAISE NOTICE '✅ Real-time broadcast triggers added';
  RAISE NOTICE '';
  RAISE NOTICE 'Artwork Offers System Ready:';
  RAISE NOTICE '- Admins can create offers to specific bidders';
  RAISE NOTICE '- 15-minute default expiration for offers';
  RAISE NOTICE '- Real-time notifications for offer events';
  RAISE NOTICE '- Automatic cleanup of expired offers';
END $$;