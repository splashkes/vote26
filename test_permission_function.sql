-- Test the permission function
-- First check if we can call it at all
SELECT check_my_photo_permission('62ed65fb-8a13-4f8b-8601-fb163cee7a33'::uuid);

-- Check the simpler function too
SELECT check_photo_permission('62ed65fb-8a13-4f8b-8601-fb163cee7a33'::uuid, '+16478020225');