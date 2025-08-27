-- Remove refresh_auth_metadata function to force clear errors
-- Date: August 26, 2025
-- Purpose: Eliminate phone corruption function and consolidate all auth functionality into auth-webhook

-- Drop the refresh_auth_metadata function
DROP FUNCTION IF EXISTS public.refresh_auth_metadata();

-- Drop the refresh_auth_metadata_for_user function too if it exists
DROP FUNCTION IF EXISTS public.refresh_auth_metadata_for_user(UUID);

-- Add a comment explaining the consolidation
COMMENT ON SCHEMA public IS 'Auth functionality consolidated into auth-webhook Edge Function. refresh_auth_metadata removed to eliminate phone corruption.';