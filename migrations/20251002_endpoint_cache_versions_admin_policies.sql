-- Allow admin users to insert and update endpoint_cache_versions
-- This is needed because cache invalidation triggers fire when admins update tables

DROP POLICY IF EXISTS admin_insert_endpoint_cache ON endpoint_cache_versions;
DROP POLICY IF EXISTS admin_update_endpoint_cache ON endpoint_cache_versions;

CREATE POLICY admin_insert_endpoint_cache
ON endpoint_cache_versions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (
    SELECT user_id
    FROM abhq_admin_users
    WHERE active = true
  )
);

CREATE POLICY admin_update_endpoint_cache
ON endpoint_cache_versions
FOR UPDATE
TO authenticated
USING (
  auth.uid() IN (
    SELECT user_id
    FROM abhq_admin_users
    WHERE active = true
  )
);

COMMENT ON POLICY admin_insert_endpoint_cache ON endpoint_cache_versions IS 'Allow admin users to insert cache versions when triggers fire';
COMMENT ON POLICY admin_update_endpoint_cache ON endpoint_cache_versions IS 'Allow admin users to update cache versions when triggers fire';
