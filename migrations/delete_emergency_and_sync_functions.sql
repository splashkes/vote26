-- Delete emergency fix and sync functions that are no longer needed
-- With auth-first approach, these complex metadata sync functions become obsolete

-- Drop emergency fix functions
DROP FUNCTION IF EXISTS emergency_fix_single_user_metadata(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS emergency_fix_single_user_metadata(UUID);
DROP FUNCTION IF EXISTS emergency_fix_unlinked_users();
DROP FUNCTION IF EXISTS auto_fix_user_auth_metadata();
DROP FUNCTION IF EXISTS ensure_person_linked(UUID);

-- Drop metadata sync functions  
DROP FUNCTION IF EXISTS sync_auth_user_metadata();
DROP FUNCTION IF EXISTS sync_existing_auth_users();
DROP FUNCTION IF EXISTS sync_person_to_auth_metadata(UUID);
DROP FUNCTION IF EXISTS refresh_auth_metadata();

-- Drop corruption fix functions
DROP FUNCTION IF EXISTS fix_corrupted_user_links();
DROP FUNCTION IF EXISTS fix_circular_person_links();

-- Drop any other metadata-related functions
DROP FUNCTION IF EXISTS migrate_auth_phone_numbers();
DROP FUNCTION IF EXISTS link_person_on_phone_verification();
DROP FUNCTION IF EXISTS link_person_on_phone_verification_fixed();
DROP FUNCTION IF EXISTS link_person_on_phone_verification_current();
DROP FUNCTION IF EXISTS handle_auth_user_phone_confirmed();

-- Drop any remaining sync functions that might exist
DROP FUNCTION IF EXISTS get_auth_person_id(UUID);

SELECT 'Emergency fix and sync functions deleted - auth system now purely auth-first' AS status;