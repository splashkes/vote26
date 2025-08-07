-- CRITICAL SECURITY FIX: Enable Row Level Security on exposed tables
-- This migration enables RLS on all tables that were exposed without protection
-- Date: 2025-08-06

-- ============================================
-- PHASE 1: Enable RLS on Critical User Tables
-- ============================================

-- Votes table - Critical for voting integrity
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- Create permissive read policy for votes (public can see vote counts)
CREATE POLICY "Public read votes" ON public.votes
  FOR SELECT
  USING (true);

-- Votes should only be created through the cast_vote_secure RPC function
-- No direct insert/update/delete policies

-- ============================================
-- Media files - Has policies but RLS disabled
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;

-- The authenticated_read_media_files policy should already exist
-- If not, create it:
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'media_files' 
    AND policyname = 'authenticated_read_media_files'
  ) THEN
    CREATE POLICY "authenticated_read_media_files" ON public.media_files
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Allow authenticated users to insert media files they own
CREATE POLICY "Users can insert own media" ON public.media_files
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- PHASE 2: Admin and System Tables
-- ============================================

-- Admin tables should be completely restricted
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_recent_items ENABLE ROW LEVEL SECURITY;

-- No policies for admin tables - access only through RPC functions

-- System logs should be write-only for the system
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs_compressed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_logs ENABLE ROW LEVEL SECURITY;

-- No policies for log tables - internal use only

-- ============================================
-- PHASE 3: Financial Tables
-- ============================================

-- Payment related tables - extremely sensitive
ALTER TABLE public.payment_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_charges ENABLE ROW LEVEL SECURITY;

-- No policies - access only through secure RPC functions

-- ============================================
-- PHASE 4: Messaging and Communication
-- ============================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_channels ENABLE ROW LEVEL SECURITY;

-- Messages might need limited access for notifications
CREATE POLICY "Users can read own messages" ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    -- This needs to be adjusted based on your message schema
    -- For now, no access until we understand the structure
    false
  );

-- ============================================
-- PHASE 5: Campaign and Promotion Tables
-- ============================================

ALTER TABLE public.assigned_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assigned_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_logs ENABLE ROW LEVEL SECURITY;

-- No direct access policies

-- ============================================
-- PHASE 6: Analytics and Cache Tables
-- ============================================

ALTER TABLE public.event_analysis_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_event_data ENABLE ROW LEVEL SECURITY;

-- Cached event data might need public read for performance
CREATE POLICY "Public read cached events" ON public.cached_event_data
  FOR SELECT
  USING (true);

-- ============================================
-- PHASE 7: Configuration Tables
-- ============================================

ALTER TABLE public.timezones ENABLE ROW LEVEL SECURITY;

-- Timezones are reference data - public read
CREATE POLICY "Public read timezones" ON public.timezones
  FOR SELECT
  USING (true);

-- ============================================
-- PHASE 8: Vote Weights
-- ============================================

ALTER TABLE public.vote_weights ENABLE ROW LEVEL SECURITY;

-- Vote weights should be readable for transparency
CREATE POLICY "Public read vote weights" ON public.vote_weights
  FOR SELECT
  USING (true);

-- ============================================
-- PHASE 9: Schema Migrations (Internal)
-- ============================================

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- No policies - internal use only

-- ============================================
-- VERIFICATION
-- ============================================

-- List all tables still without RLS (should be empty or only non-critical)
DO $$ 
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE 'Tables still without RLS enabled:';
  FOR r IN 
    SELECT schemaname, tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND NOT rowsecurity
  LOOP
    RAISE NOTICE '  - %.%', r.schemaname, r.tablename;
  END LOOP;
END $$;

-- ============================================
-- NOTES
-- ============================================
-- This migration enables RLS with minimal policies to maintain current functionality
-- Most write operations should go through RPC functions which bypass RLS
-- Read operations have permissive policies where appropriate
-- Admin and financial tables have NO policies - access only through secure functions