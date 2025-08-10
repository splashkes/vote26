-- Create the abhq_admin_users table (separate from main app's event_admins)
CREATE TABLE IF NOT EXISTS abhq_admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  level TEXT NOT NULL DEFAULT 'voting',
  events_access UUID[] DEFAULT '{}',  -- Array of event IDs user can access
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  notes TEXT
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_abhq_admin_users_email ON abhq_admin_users(email);
CREATE INDEX IF NOT EXISTS idx_abhq_admin_users_active ON abhq_admin_users(active);
CREATE INDEX IF NOT EXISTS idx_abhq_admin_users_level ON abhq_admin_users(level);

-- Add RLS (Row Level Security)
ALTER TABLE abhq_admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own admin record
CREATE POLICY "Users can view their own admin record" 
  ON abhq_admin_users FOR SELECT 
  USING (auth.email() = email);

-- Policy: Super admins can view all admin records
CREATE POLICY "Super admins can view all admin records" 
  ON abhq_admin_users FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM abhq_admin_users 
      WHERE email = auth.email() 
      AND level = 'super' 
      AND active = true
    )
  );

-- Policy: Super admins can insert/update admin records
CREATE POLICY "Super admins can manage admin records" 
  ON abhq_admin_users FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM abhq_admin_users 
      WHERE email = auth.email() 
      AND level = 'super' 
      AND active = true
    )
  );

-- Add trigger to sync user_id from auth.users
CREATE OR REPLACE FUNCTION sync_abhq_admin_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to find user_id from auth.users table
  UPDATE abhq_admin_users 
  SET user_id = (
    SELECT id FROM auth.users WHERE email = NEW.email LIMIT 1
  )
  WHERE id = NEW.id AND user_id IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_abhq_admin_user_id_trigger
  AFTER INSERT OR UPDATE ON abhq_admin_users
  FOR EACH ROW
  EXECUTE FUNCTION sync_abhq_admin_user_id();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_abhq_admin_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_abhq_admin_updated_at_trigger
  BEFORE UPDATE ON abhq_admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_abhq_admin_updated_at();