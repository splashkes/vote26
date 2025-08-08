-- Add Cloudflare API key and email to Vault
-- These are needed for the Edge Function to request direct upload URLs

-- Store API credentials
SELECT vault.create_secret('CLOUDFLARE_API_KEY', 'ZqrN7cxwB44CXBPlzcfd0FiGkMVtLQytvBe29JYM');
SELECT vault.create_secret('CLOUDFLARE_EMAIL', 'simon@artbattle.com');

-- Create a function to retrieve vault secrets (only for Edge Functions)
CREATE OR REPLACE FUNCTION get_vault_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_value text;
  user_phone text;
  is_admin boolean;
BEGIN
  -- This function should only be called from Edge Functions
  -- which run with service role permissions
  
  -- For extra security, we could also check if the caller is admin
  user_phone := auth.jwt() -> 'user_metadata' ->> 'phone';
  
  -- Check if user is in admin_users table
  SELECT EXISTS(
    SELECT 1 FROM admin_users WHERE phone = user_phone
  ) INTO is_admin;
  
  -- If not admin and not service role, deny access
  IF NOT is_admin AND current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
    RETURN null;
  END IF;
  
  -- Retrieve secret from vault
  SELECT decrypted_secret INTO secret_value 
  FROM vault.decrypted_secrets 
  WHERE name = secret_name;
  
  RETURN secret_value;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_vault_secret(text) TO service_role;

-- Add Heading import to AdminImageUpload
-- Note: You need to update the Cloudflare API key and email above with your actual values