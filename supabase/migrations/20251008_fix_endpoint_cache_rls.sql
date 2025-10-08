-- Fix RLS policies on endpoint_cache_versions to allow cache invalidation triggers to work
-- Issue: Triggers run in authenticated user context and need to INSERT/UPDATE cache versions
-- Solution: Allow authenticated users to INSERT/UPDATE (preserving admin-only DELETE)

-- Drop the restrictive admin policies for INSERT and UPDATE
DROP POLICY IF EXISTS "admin_insert_endpoint_cache" ON endpoint_cache_versions;
DROP POLICY IF EXISTS "admin_update_endpoint_cache" ON endpoint_cache_versions;

-- Create more permissive policies that work with triggers
-- Allow INSERT from any authenticated user (trigger context)
CREATE POLICY "authenticated_insert_endpoint_cache"
ON endpoint_cache_versions
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow UPDATE from any authenticated user (trigger context)
CREATE POLICY "authenticated_update_endpoint_cache"
ON endpoint_cache_versions
FOR UPDATE
TO authenticated
USING (true);

-- Existing policies preserved:
-- - service_insert_endpoint_cache: service_role can INSERT
-- - service_update_endpoint_cache: service_role can UPDATE
-- - service_delete_endpoint_cache: service_role can DELETE
-- - admin_clear_endpoint_cache: admins can DELETE (requires abhq_admin_users.active = true)
-- - public_read_endpoint_cache: public SELECT access
