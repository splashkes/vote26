-- Fix sync_abhq_admin_user_id function permissions
-- This fixes the "permission denied for table users" error

-- The function needs SECURITY DEFINER to access auth.users table
-- which is restricted by Row Level Security (RLS)

CREATE OR REPLACE FUNCTION sync_abhq_admin_user_id()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER -- This allows the function to bypass RLS when accessing auth.users
AS $$
BEGIN
  -- Try to find user_id from auth.users table and link it to admin record
  UPDATE abhq_admin_users 
  SET user_id = (
    SELECT id FROM auth.users WHERE email = NEW.email LIMIT 1
  )
  WHERE id = NEW.id AND user_id IS NULL;
  
  RETURN NEW;
END;
$$;

-- Verify trigger exists (it should already be there)
-- This trigger automatically links admin records to auth users on INSERT/UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'sync_abhq_admin_user_id_trigger'
      AND event_object_table = 'abhq_admin_users'
  ) THEN
    CREATE TRIGGER sync_abhq_admin_user_id_trigger
      AFTER INSERT OR UPDATE ON abhq_admin_users
      FOR EACH ROW
      EXECUTE FUNCTION sync_abhq_admin_user_id();
  END IF;
END;
$$;