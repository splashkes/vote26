-- RLS Policies for Art Battle Vote App
-- This migration adds specific policies for tables the app uses directly
-- Date: 2025-08-06

-- ============================================
-- EVENTS TABLE - Public read for event listings
-- ============================================

-- Check if RLS is enabled on events table
DO $$ 
BEGIN
  -- Enable RLS if not already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'events' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Events should be publicly readable (for event listing)
CREATE POLICY IF NOT EXISTS "Public read events" ON public.events
  FOR SELECT
  USING (enabled = true AND show_in_app = true);

-- Only admins can modify events (through RPC or with proper auth)
CREATE POLICY IF NOT EXISTS "Super admins can update events" ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins
      WHERE event_admins.event_id = events.id
      AND event_admins.phone = auth.jwt()->>'phone'
      AND event_admins.admin_level = 'super'
    )
  );

-- ============================================
-- ART TABLE - Public read for artwork display
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'art' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.art ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Art should be publicly readable
CREATE POLICY IF NOT EXISTS "Public read art" ON public.art
  FOR SELECT
  USING (true);

-- Art updates only through RPC functions or admin
CREATE POLICY IF NOT EXISTS "Admins can update art" ON public.art
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins
      WHERE event_admins.event_id = art.event_id
      AND event_admins.phone = auth.jwt()->>'phone'
    )
  );

-- ============================================
-- ARTIST_PROFILES TABLE - Public read
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'artist_profiles' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.artist_profiles ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Public read artist profiles" ON public.artist_profiles
  FOR SELECT
  USING (true);

-- Admin insert for creating new artists
CREATE POLICY IF NOT EXISTS "Admins can insert artists" ON public.artist_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_admins
      WHERE event_admins.phone = auth.jwt()->>'phone'
    )
  );

-- ============================================
-- BIDS TABLE - Controlled access
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'bids' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Bids are readable by everyone (for current bid display)
CREATE POLICY IF NOT EXISTS "Public read bids" ON public.bids
  FOR SELECT
  USING (true);

-- Bids should only be created through process_bid_secure RPC
-- No direct insert policy

-- ============================================
-- ART_MEDIA TABLE - Public read for images
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'art_media' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.art_media ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Public read art media" ON public.art_media
  FOR SELECT
  USING (true);

-- Authenticated users can add media
CREATE POLICY IF NOT EXISTS "Authenticated insert art media" ON public.art_media
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- ROUNDS TABLE - Public read
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'rounds' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Public read rounds" ON public.rounds
  FOR SELECT
  USING (true);

-- Admin management of rounds
CREATE POLICY IF NOT EXISTS "Admins can manage rounds" ON public.rounds
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins
      WHERE event_admins.event_id = rounds.event_id
      AND event_admins.phone = auth.jwt()->>'phone'
    )
  );

-- ============================================
-- ROUND_CONTESTANTS TABLE
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'round_contestants' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.round_contestants ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Public read round contestants" ON public.round_contestants
  FOR SELECT
  USING (true);

-- Admin management
CREATE POLICY IF NOT EXISTS "Admins can manage round contestants" ON public.round_contestants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea
      JOIN public.rounds r ON r.id = round_contestants.round_id
      WHERE ea.event_id = r.event_id
      AND ea.phone = auth.jwt()->>'phone'
    )
  );

-- ============================================
-- EVENT_ARTISTS TABLE
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'event_artists' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.event_artists ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Public read event artists" ON public.event_artists
  FOR SELECT
  USING (true);

-- Admin management
CREATE POLICY IF NOT EXISTS "Admins can manage event artists" ON public.event_artists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins
      WHERE event_admins.event_id = event_artists.event_id
      AND event_admins.phone = auth.jwt()->>'phone'
    )
  );

-- ============================================
-- EVENT_ADMINS TABLE - Restricted
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'event_admins' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.event_admins ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Only super admins can read admin list
CREATE POLICY IF NOT EXISTS "Super admins read event admins" ON public.event_admins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea2
      WHERE ea2.event_id = event_admins.event_id
      AND ea2.phone = auth.jwt()->>'phone'
      AND ea2.admin_level = 'super'
    )
  );

-- Super admins can manage other admins
CREATE POLICY IF NOT EXISTS "Super admins manage event admins" ON public.event_admins
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins ea2
      WHERE ea2.event_id = event_admins.event_id
      AND ea2.phone = auth.jwt()->>'phone'
      AND ea2.admin_level = 'super'
    )
  );

-- ============================================
-- PEOPLE TABLE - Limited access
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'people' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- People can read their own record
CREATE POLICY IF NOT EXISTS "Users read own record" ON public.people
  FOR SELECT
  TO authenticated
  USING (
    phone = auth.jwt()->>'phone' OR
    auth_id = auth.uid()::text
  );

-- Admins can search people (for admin management)
CREATE POLICY IF NOT EXISTS "Admins can search people" ON public.people
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_admins
      WHERE event_admins.phone = auth.jwt()->>'phone'
      AND event_admins.admin_level = 'super'
    )
  );

-- ============================================
-- COUNTRIES & CITIES - Reference data
-- ============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'countries' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'cities' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Public read countries" ON public.countries
  FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read cities" ON public.cities
  FOR SELECT
  USING (true);

-- ============================================
-- VERIFICATION
-- ============================================

-- Show summary of RLS status
DO $$ 
DECLARE
  r RECORD;
  policy_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Status Summary:';
  RAISE NOTICE '==================';
  
  FOR r IN 
    SELECT 
      t.tablename,
      t.rowsecurity,
      COUNT(p.policyname) as policy_count
    FROM pg_tables t
    LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
    WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'events', 'art', 'artist_profiles', 'bids', 'votes',
      'art_media', 'media_files', 'rounds', 'round_contestants',
      'event_artists', 'event_admins', 'people'
    )
    GROUP BY t.tablename, t.rowsecurity
    ORDER BY t.tablename
  LOOP
    RAISE NOTICE '  % - RLS: %, Policies: %', 
      RPAD(r.tablename, 20), 
      CASE WHEN r.rowsecurity THEN 'Enabled' ELSE 'DISABLED' END,
      r.policy_count;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Security migration completed successfully!';
END $$;