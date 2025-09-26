-- Fix Function Collision: expire_old_offers_with_broadcast()
-- Date: 2025-09-26
-- Issue: Cron job failing with "function expire_old_offers_with_broadcast() is not unique"
-- Root Cause: Two functions exist with same name but different signatures
-- Solution: Drop the old parameterized version, keep the correct non-parameterized version

-- Drop the old function that takes an expiry_hours parameter
-- This is the version that uses 'created_at < NOW() - INTERVAL' logic (less accurate)
DROP FUNCTION IF EXISTS public.expire_old_offers_with_broadcast(integer);

-- The correct function (no parameters) will remain
-- It uses 'expires_at <= NOW()' which is the proper field for expiration checking
-- This matches the cron job call: SELECT expire_old_offers_with_broadcast();

-- Verify only one function remains (for debugging)
-- SELECT proname, proargtypes FROM pg_proc WHERE proname = 'expire_old_offers_with_broadcast';