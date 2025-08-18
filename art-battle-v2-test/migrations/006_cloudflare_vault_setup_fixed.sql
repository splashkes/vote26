-- Store Cloudflare credentials in Supabase Vault
-- These will be accessible to admin users via RLS policies

-- Store Cloudflare credentials as secrets using vault functions
SELECT vault.create_secret('CLOUDFLARE_ACCOUNT_ID', '8679deebf60af4e83f621a3173b3f2a4');
SELECT vault.create_secret('CLOUDFLARE_ACCOUNT_HASH', 'IGZfH_Pl-6S6csykNnXNJw');
SELECT vault.create_secret('CLOUDFLARE_IMAGE_DELIVERY_URL', 'https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw');

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_cloudflare_config();

-- Create a function to retrieve Cloudflare config for authorized admin users
CREATE OR REPLACE FUNCTION get_cloudflare_config()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_phone text;
  is_admin boolean;
  account_id text;
  account_hash text;
  delivery_url text;
BEGIN
  -- Get the user's phone number from auth metadata
  user_phone := auth.jwt() -> 'user_metadata' ->> 'phone';
  
  -- Check if user is admin (add more admin phone numbers as needed)
  is_admin := user_phone IN ('+14163025959'); -- Simon's phone
  
  -- If not admin, return null
  IF NOT is_admin THEN
    RETURN null;
  END IF;
  
  -- Retrieve secrets from vault
  SELECT decrypted_secret INTO account_id 
  FROM vault.decrypted_secrets 
  WHERE name = 'CLOUDFLARE_ACCOUNT_ID';
  
  SELECT decrypted_secret INTO account_hash 
  FROM vault.decrypted_secrets 
  WHERE name = 'CLOUDFLARE_ACCOUNT_HASH';
  
  SELECT decrypted_secret INTO delivery_url 
  FROM vault.decrypted_secrets 
  WHERE name = 'CLOUDFLARE_IMAGE_DELIVERY_URL';
  
  -- Return configuration as JSON
  RETURN json_build_object(
    'accountId', account_id,
    'accountHash', account_hash,
    'deliveryUrl', delivery_url,
    'uploadUrl', format('https://api.cloudflare.com/client/v4/accounts/%s/images/v1', account_id)
  );
END;
$$;

-- Grant execute permission to authenticated users (RLS will handle admin check)
GRANT EXECUTE ON FUNCTION get_cloudflare_config() TO authenticated;

-- Check if admin_users table exists with correct structure
DO $$
BEGIN
  -- Check if table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users') THEN
    -- Create table
    CREATE TABLE admin_users (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      name TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Enable RLS on admin_users table
    ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
    
    -- Only admins can view admin users
    CREATE POLICY "Admin users viewable by admins" ON admin_users
      FOR SELECT
      USING (
        auth.jwt() -> 'user_metadata' ->> 'phone' IN (
          SELECT phone FROM admin_users
        )
      );
  END IF;
END $$;

-- Insert initial admin user
INSERT INTO admin_users (phone, name) 
VALUES ('+14163025959', 'Simon')
ON CONFLICT (phone) DO NOTHING;

-- Drop and recreate the function to use admin_users table
DROP FUNCTION IF EXISTS get_cloudflare_config();

CREATE OR REPLACE FUNCTION get_cloudflare_config()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_phone text;
  is_admin boolean;
  account_id text;
  account_hash text;
  delivery_url text;
BEGIN
  -- Get the user's phone number from auth metadata
  user_phone := auth.jwt() -> 'user_metadata' ->> 'phone';
  
  -- Check if user is in admin_users table
  SELECT EXISTS(
    SELECT 1 FROM admin_users WHERE phone = user_phone
  ) INTO is_admin;
  
  -- If not admin, return null
  IF NOT is_admin THEN
    RETURN null;
  END IF;
  
  -- Retrieve secrets from vault
  SELECT decrypted_secret INTO account_id 
  FROM vault.decrypted_secrets 
  WHERE name = 'CLOUDFLARE_ACCOUNT_ID';
  
  SELECT decrypted_secret INTO account_hash 
  FROM vault.decrypted_secrets 
  WHERE name = 'CLOUDFLARE_ACCOUNT_HASH';
  
  SELECT decrypted_secret INTO delivery_url 
  FROM vault.decrypted_secrets 
  WHERE name = 'CLOUDFLARE_IMAGE_DELIVERY_URL';
  
  -- Return configuration as JSON
  RETURN json_build_object(
    'accountId', account_id,
    'accountHash', account_hash,
    'deliveryUrl', delivery_url,
    'uploadUrl', format('https://api.cloudflare.com/client/v4/accounts/%s/images/v1', account_id)
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_cloudflare_config() TO authenticated;

-- Note: To add more admin users, simply insert into admin_users table:
-- INSERT INTO admin_users (phone, name) VALUES ('+1234567890', 'New Admin');