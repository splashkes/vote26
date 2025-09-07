-- Delete emergency fix and sync functions with their dependent triggers
-- With auth-first approach, these complex metadata sync functions become obsolete

-- Drop triggers first (to avoid dependency errors)
DROP TRIGGER IF EXISTS trigger_auto_fix_auth_metadata ON people;
DROP TRIGGER IF EXISTS auth_user_phone_confirmed ON auth.users;

-- Now drop the functions that had trigger dependencies
DROP FUNCTION IF EXISTS auto_fix_user_auth_metadata() CASCADE;
DROP FUNCTION IF EXISTS handle_auth_user_phone_confirmed() CASCADE;

-- Drop any other metadata sync triggers that might exist
DROP TRIGGER IF EXISTS trigger_sync_person_metadata ON people;
DROP TRIGGER IF EXISTS trigger_link_person_on_phone_verification ON auth.users;

SELECT 'Emergency triggers and functions deleted - metadata sync system completely removed' AS status;