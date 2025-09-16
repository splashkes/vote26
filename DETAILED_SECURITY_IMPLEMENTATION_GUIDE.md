# DETAILED SECURITY IMPLEMENTATION GUIDE
**Art Battle Platform - Comprehensive Security Remediation**

## CRITICAL EXPOSURE ANALYSIS

### **IMMEDIATE THREAT ASSESSMENT**

#### **🚨 MASSIVE DATA EXPOSURE CONFIRMED**
```
Total Records Exposed to Anonymous Users:
- artist_profile_aliases: 61,247 records (11 MB)
- artist_invitations: 23,922 records (7 MB)
- artist_auth_logs: 2,845 records (2.1 MB)
- payment_processing: 61 records (256 KB)
- abhq_admin_users: 36 records (184 KB)
+ 9 additional tables with full CRUD access
```

#### **PERMISSION ANALYSIS**
**EVERY EXPOSED TABLE HAS FULL ANONYMOUS ACCESS:**
- SELECT (read all data)
- INSERT (create fake records)
- UPDATE (modify existing data)
- DELETE (remove records)
- TRUNCATE (wipe entire tables)

This is a **COMPLETE SECURITY FAILURE** - anonymous users have MORE access than most authenticated users should have.

## PHASE-BY-PHASE DETAILED IMPLEMENTATION

### **PHASE 1: EMERGENCY LOCKDOWN (2 hours)**

#### **1.1 Immediate Table Lockdown (30 minutes)**

```sql
-- CRITICAL: Stop all anonymous access immediately
-- These commands MUST be run in this exact order

-- 1. Most Critical: Admin Users
ALTER TABLE abhq_admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_lockdown_admin" ON abhq_admin_users
FOR ALL TO anon USING (false);

-- 2. Payment Data
ALTER TABLE payment_processing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_lockdown_payments" ON payment_processing
FOR ALL TO anon USING (false);

-- 3. Authentication Logs
ALTER TABLE artist_auth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_lockdown_auth_logs" ON artist_auth_logs
FOR ALL TO anon USING (false);

-- 4. Artist Invitations
ALTER TABLE artist_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_lockdown_invitations" ON artist_invitations
FOR ALL TO anon USING (false);

-- 5. Profile Aliases
ALTER TABLE artist_profile_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emergency_lockdown_aliases" ON artist_profile_aliases
FOR ALL TO anon USING (false);
```

**Validation Check:**
```sql
-- Should return 0 rows (no access)
SELECT COUNT(*) FROM artist_invitations;
SELECT COUNT(*) FROM artist_auth_logs;
SELECT COUNT(*) FROM payment_processing;
```

#### **1.2 Secure Critical Views (45 minutes)**

```sql
-- Fix the auth.users exposure in artist_auth_monitor
DROP VIEW IF EXISTS artist_auth_monitor;

-- Create secure replacement without SECURITY DEFINER
CREATE VIEW artist_auth_monitor_secure AS
SELECT
    aal.id,
    aal.created_at,
    aal.event_type,
    aal.operation,
    aal.success,
    aal.error_type,
    aal.error_message,
    aal.duration_ms,
    aal.phone,
    aal.person_name,
    aal.profile_name,
    aal.entry_id,
    aal.metadata
FROM artist_auth_logs aal
WHERE
    -- Only ABHQ admins can see auth logs
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    );

-- Grant appropriate permissions
GRANT SELECT ON artist_auth_monitor_secure TO authenticated;
```

#### **1.3 Emergency Function Updates (45 minutes)**

**Critical Functions That Need Immediate Updates:**

```sql
-- Update is_admin function to work with RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if current user is in admin table
    RETURN EXISTS (
        SELECT 1
        FROM abhq_admin_users
        WHERE auth_user_id = auth.uid()
        AND active = true
    );
END;
$$;

-- Update is_super_admin function
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM abhq_admin_users
        WHERE auth_user_id = auth.uid()
        AND active = true
        AND role = 'super_admin'
    );
END;
$$;

-- Update log_artist_auth to work with RLS
CREATE OR REPLACE FUNCTION log_artist_auth(
    p_event_type text,
    p_operation text,
    p_success boolean,
    p_error_type text DEFAULT NULL,
    p_error_message text DEFAULT NULL,
    p_duration_ms integer DEFAULT NULL,
    p_phone text DEFAULT NULL,
    p_person_name text DEFAULT NULL,
    p_profile_name text DEFAULT NULL,
    p_entry_id integer DEFAULT NULL,
    p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    log_id uuid;
BEGIN
    -- Insert with service role privileges
    INSERT INTO artist_auth_logs (
        event_type, operation, success, error_type, error_message,
        duration_ms, phone, person_name, profile_name, entry_id, metadata
    ) VALUES (
        p_event_type, p_operation, p_success, p_error_type, p_error_message,
        p_duration_ms, p_phone, p_person_name, p_profile_name, p_entry_id, p_metadata
    ) RETURNING id INTO log_id;

    RETURN log_id;
END;
$$;
```

### **PHASE 2: GRANULAR ACCESS RESTORATION (6 hours)**

#### **2.1 Admin User Access Policies (1 hour)**

```sql
-- Remove emergency lockdown
DROP POLICY "emergency_lockdown_admin" ON abhq_admin_users;

-- Self-access: Users can view their own admin record
CREATE POLICY "admin_users_self_access" ON abhq_admin_users
FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

-- Super admin access: Can manage all admin users
CREATE POLICY "super_admin_manage_all" ON abhq_admin_users
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true AND role = 'super_admin'
    )
);

-- Admin creation: Only super admins can create new admins
CREATE POLICY "super_admin_create_admins" ON abhq_admin_users
FOR INSERT TO authenticated
WITH CHECK (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true AND role = 'super_admin'
    )
);

-- Service role can update for sync functions
CREATE POLICY "service_role_admin_sync" ON abhq_admin_users
FOR ALL TO service_role
USING (true);
```

**Test Admin Access:**
```sql
-- As super admin - should see all records
SELECT COUNT(*) FROM abhq_admin_users;

-- As regular admin - should see only own record
SELECT COUNT(*) FROM abhq_admin_users WHERE auth_user_id = auth.uid();

-- As regular user - should see 0 records
SELECT COUNT(*) FROM abhq_admin_users;
```

#### **2.2 Payment Processing Policies (1.5 hours)**

```sql
-- Remove emergency lockdown
DROP POLICY "emergency_lockdown_payments" ON payment_processing;

-- Users can view their own payments
CREATE POLICY "users_view_own_payments" ON payment_processing
FOR SELECT TO authenticated
USING (person_id = auth.uid());

-- Users can create their own payments (through functions)
CREATE POLICY "users_create_own_payments" ON payment_processing
FOR INSERT TO authenticated
WITH CHECK (person_id = auth.uid());

-- Event admins can view payments for their events
CREATE POLICY "event_admin_view_payments" ON payment_processing
FOR SELECT TO authenticated
USING (
    event_id IN (
        SELECT event_id
        FROM event_admins
        WHERE person_id = auth.uid()
    )
);

-- ABHQ admins can view all payments
CREATE POLICY "abhq_admin_view_all_payments" ON payment_processing
FOR SELECT TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- ABHQ admins can manage all payments
CREATE POLICY "abhq_admin_manage_payments" ON payment_processing
FOR UPDATE, DELETE TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Service role for automated processing
CREATE POLICY "service_role_payment_processing" ON payment_processing
FOR ALL TO service_role
USING (true);
```

**Payment Function Updates:**
```sql
-- Update payment functions to work with RLS
CREATE OR REPLACE FUNCTION complete_stripe_payment(
    payment_intent_id text,
    amount_received integer,
    stripe_fee integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
    payment_record record;
BEGIN
    -- Update payment with service role privileges
    UPDATE payment_processing
    SET
        status = 'completed',
        stripe_payment_intent_id = payment_intent_id,
        amount_received = amount_received,
        stripe_fee = stripe_fee,
        completed_at = NOW()
    WHERE stripe_payment_intent_id = payment_intent_id
    RETURNING * INTO payment_record;

    -- Return success result
    SELECT jsonb_build_object(
        'success', true,
        'payment_id', payment_record.id,
        'amount', payment_record.amount_received
    ) INTO result;

    RETURN result;
END;
$$;
```

#### **2.3 Artist Invitation Policies (1.5 hours)**

```sql
-- Remove emergency lockdown
DROP POLICY "emergency_lockdown_invitations" ON artist_invitations;

-- Artists can view invitations sent to their phone number
CREATE POLICY "artists_view_own_invitations" ON artist_invitations
FOR SELECT TO authenticated
USING (
    phone IN (
        SELECT phone
        FROM auth.users
        WHERE id = auth.uid()
    )
);

-- Artists can update their own invitations (acceptance status)
CREATE POLICY "artists_update_own_invitations" ON artist_invitations
FOR UPDATE TO authenticated
USING (
    phone IN (
        SELECT phone
        FROM auth.users
        WHERE id = auth.uid()
    )
)
WITH CHECK (
    phone IN (
        SELECT phone
        FROM auth.users
        WHERE id = auth.uid()
    )
);

-- Event admins can manage invitations for their events
CREATE POLICY "event_admin_manage_invitations" ON artist_invitations
FOR ALL TO authenticated
USING (
    event_id IN (
        SELECT event_id
        FROM event_admins
        WHERE person_id = auth.uid()
    )
);

-- ABHQ admins can manage all invitations
CREATE POLICY "abhq_admin_all_invitations" ON artist_invitations
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Service role for automated invitations
CREATE POLICY "service_role_invitations" ON artist_invitations
FOR ALL TO service_role
USING (true);
```

#### **2.4 Authentication Logs Policies (1 hour)**

```sql
-- Remove emergency lockdown
DROP POLICY "emergency_lockdown_auth_logs" ON artist_auth_logs;

-- Only ABHQ admins can read auth logs
CREATE POLICY "abhq_admin_read_auth_logs" ON artist_auth_logs
FOR SELECT TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Service role can insert logs (for logging function)
CREATE POLICY "service_role_insert_auth_logs" ON artist_auth_logs
FOR INSERT TO service_role
WITH CHECK (true);

-- No updates or deletes - logs are immutable
-- (Only service role via functions if needed)
```

#### **2.5 Profile Aliases Policies (1 hour)**

```sql
-- Remove emergency lockdown
DROP POLICY "emergency_lockdown_aliases" ON artist_profile_aliases;

-- Artists can view aliases for their own profiles
CREATE POLICY "artists_view_own_aliases" ON artist_profile_aliases
FOR SELECT TO authenticated
USING (
    artist_profile_id IN (
        SELECT id
        FROM artist_profiles
        WHERE person_id = auth.uid()
    )
);

-- Artists can manage their own aliases
CREATE POLICY "artists_manage_own_aliases" ON artist_profile_aliases
FOR INSERT, UPDATE, DELETE TO authenticated
USING (
    artist_profile_id IN (
        SELECT id
        FROM artist_profiles
        WHERE person_id = auth.uid()
    )
)
WITH CHECK (
    artist_profile_id IN (
        SELECT id
        FROM artist_profiles
        WHERE person_id = auth.uid()
    )
);

-- ABHQ admins can view all aliases
CREATE POLICY "abhq_admin_view_all_aliases" ON artist_profile_aliases
FOR SELECT TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Service role for data migrations
CREATE POLICY "service_role_aliases" ON artist_profile_aliases
FOR ALL TO service_role
USING (true);
```

### **PHASE 3: OFFERS AND CACHE SYSTEMS (3 hours)**

#### **3.1 Offers System Security (1.5 hours)**

```sql
-- Enable RLS on offers tables
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_views ENABLE ROW LEVEL SECURITY;

-- Public can view active offers
CREATE POLICY "public_view_active_offers" ON offers
FOR SELECT TO anon, authenticated
USING (
    active = true
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (starts_at IS NULL OR starts_at <= NOW())
);

-- Admins can manage all offers
CREATE POLICY "admin_manage_offers" ON offers
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Users can view their own redemptions
CREATE POLICY "users_view_own_redemptions" ON offer_redemptions
FOR SELECT TO authenticated
USING (person_id = auth.uid());

-- Users can create redemptions for active offers
CREATE POLICY "users_create_redemptions" ON offer_redemptions
FOR INSERT TO authenticated
WITH CHECK (
    person_id = auth.uid()
    AND offer_id IN (
        SELECT id FROM offers
        WHERE active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    )
);

-- Admins can view all redemptions
CREATE POLICY "admin_view_all_redemptions" ON offer_redemptions
FOR SELECT TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Track offer views (analytics)
CREATE POLICY "track_offer_views" ON offer_views
FOR INSERT TO anon, authenticated
WITH CHECK (true);

-- Admins can view analytics
CREATE POLICY "admin_view_offer_analytics" ON offer_views
FOR SELECT TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);
```

#### **3.2 Cache Tables Security (1.5 hours)**

```sql
-- Enable RLS on cache tables
ALTER TABLE eventbrite_current_event_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_cache_versions ENABLE ROW LEVEL SECURITY;

-- Public read access for event cache (no sensitive data)
CREATE POLICY "public_read_eventbrite_cache" ON eventbrite_current_event_cache
FOR SELECT TO anon, authenticated
USING (true);

-- Public read access for endpoint cache
CREATE POLICY "public_read_endpoint_cache" ON endpoint_cache_versions
FOR SELECT TO anon, authenticated
USING (true);

-- Only service role can modify cache
CREATE POLICY "service_modify_eventbrite_cache" ON eventbrite_current_event_cache
FOR INSERT, UPDATE, DELETE TO service_role
USING (true);

CREATE POLICY "service_modify_endpoint_cache" ON endpoint_cache_versions
FOR INSERT, UPDATE, DELETE TO service_role
USING (true);

-- Admins can clear cache if needed
CREATE POLICY "admin_clear_eventbrite_cache" ON eventbrite_current_event_cache
FOR DELETE TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);
```

### **PHASE 4: SECURITY DEFINER VIEW REPLACEMENT (4 hours)**

#### **4.1 Replace Admin Dashboard Views (2 hours)**

```sql
-- Replace admin_invitation_dashboard
DROP VIEW IF EXISTS admin_invitation_dashboard;
CREATE VIEW admin_invitation_dashboard AS
SELECT
    ai.*,
    e.name as event_name,
    e.date as event_date
FROM artist_invitations ai
LEFT JOIN events e ON ai.event_id = e.id
WHERE auth.uid() IN (
    SELECT auth_user_id
    FROM abhq_admin_users
    WHERE active = true
);

-- Replace artist_activity_with_payments
DROP VIEW IF EXISTS artist_activity_with_payments;
CREATE VIEW artist_activity_with_payments AS
SELECT
    ap.id as profile_id,
    ap.name as artist_name,
    ap.city_text,
    ap.instagram,
    COUNT(DISTINCT ea.event_id) as events_participated,
    COUNT(DISTINCT pp.id) as payments_made,
    COALESCE(SUM(pp.amount), 0) as total_spent
FROM artist_profiles ap
LEFT JOIN event_artists ea ON ap.id = ea.artist_id
LEFT JOIN payment_processing pp ON ap.person_id = pp.person_id
WHERE (
    -- Artists can see their own activity
    ap.person_id = auth.uid()
    OR
    -- Admins can see all activity
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
)
GROUP BY ap.id, ap.name, ap.city_text, ap.instagram;

-- Replace artist_activity_with_global_payments
DROP VIEW IF EXISTS artist_activity_with_global_payments;
CREATE VIEW artist_activity_with_global_payments AS
SELECT
    aawp.*,
    COUNT(DISTINCT asa.id) as stripe_accounts
FROM artist_activity_with_payments aawp
LEFT JOIN artist_stripe_accounts asa ON asa.artist_profile_id = aawp.profile_id
WHERE (
    -- Artists can see their own data
    aawp.profile_id IN (
        SELECT id FROM artist_profiles WHERE person_id = auth.uid()
    )
    OR
    -- Admins can see all data
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
)
GROUP BY aawp.profile_id, aawp.artist_name, aawp.city_text,
         aawp.instagram, aawp.events_participated, aawp.payments_made, aawp.total_spent;
```

#### **4.2 Replace Operational Views (1 hour)**

```sql
-- Replace operation_stats (admin only)
DROP VIEW IF EXISTS operation_stats;
CREATE VIEW operation_stats AS
SELECT
    'total_artists' as metric,
    COUNT(*)::text as value,
    'Total registered artists' as description
FROM artist_profiles
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
)
UNION ALL
SELECT
    'total_events' as metric,
    COUNT(*)::text as value,
    'Total events' as description
FROM events
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
)
UNION ALL
SELECT
    'total_payments' as metric,
    COUNT(*)::text as value,
    'Total payments processed' as description
FROM payment_processing
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
);

-- Replace recent_errors (admin only)
DROP VIEW IF EXISTS recent_errors;
CREATE VIEW recent_errors AS
SELECT
    created_at,
    event_type,
    error_type,
    error_message,
    phone,
    person_name
FROM artist_auth_logs
WHERE success = false
AND created_at > NOW() - INTERVAL '24 hours'
AND auth.uid() IN (
    SELECT auth_user_id
    FROM abhq_admin_users
    WHERE active = true
)
ORDER BY created_at DESC
LIMIT 100;
```

#### **4.3 Replace Monitoring Views (1 hour)**

```sql
-- Replace v_channel_resolution_status
DROP VIEW IF EXISTS v_channel_resolution_status;
CREATE VIEW v_channel_resolution_status AS
SELECT
    channel_id,
    status,
    last_updated,
    error_count
FROM internal_channel_status
WHERE auth.uid() IN (
    SELECT auth_user_id
    FROM abhq_admin_users
    WHERE active = true
);

-- Replace v_sms_queue_status
DROP VIEW IF EXISTS v_sms_queue_status;
CREATE VIEW v_sms_queue_status AS
SELECT
    queue_name,
    pending_count,
    failed_count,
    last_processed
FROM internal_sms_queue_stats
WHERE auth.uid() IN (
    SELECT auth_user_id
    FROM abhq_admin_users
    WHERE active = true
);

-- Replace v_auction_stale_lots
DROP VIEW IF EXISTS v_auction_stale_lots;
CREATE VIEW v_auction_stale_lots AS
SELECT
    lot_id,
    event_id,
    last_bid_time,
    status
FROM auction_lots
WHERE status = 'stale'
AND (
    -- Event admins can see their event's lots
    event_id IN (
        SELECT event_id FROM event_admins WHERE person_id = auth.uid()
    )
    OR
    -- ABHQ admins can see all
    auth.uid() IN (
        SELECT auth_user_id FROM abhq_admin_users WHERE active = true
    )
);
```

### **PHASE 5: UTILITY TABLES AND CLEANUP (2 hours)**

#### **5.1 Backup Tables Security (30 minutes)**

```sql
-- Enable RLS on backup tables
ALTER TABLE corrupted_phone_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_notifications_backup_20250829 ENABLE ROW LEVEL SECURITY;

-- Only super admins can access backup data
CREATE POLICY "super_admin_phone_backup" ON corrupted_phone_backup
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true AND role = 'super_admin'
    )
);

CREATE POLICY "super_admin_slack_backup" ON slack_notifications_backup_20250829
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true AND role = 'super_admin'
    )
);
```

#### **5.2 Utility Tables Security (1 hour)**

```sql
-- Enable RLS on utility tables
ALTER TABLE scheduled_chart_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE eb_links ENABLE ROW LEVEL SECURITY;

-- Admins can manage scheduled commands
CREATE POLICY "admin_chart_commands" ON scheduled_chart_commands
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Public can view active EB links
CREATE POLICY "public_view_eb_links" ON eb_links
FOR SELECT TO anon, authenticated
USING (active = true);

-- Admins can manage EB links
CREATE POLICY "admin_manage_eb_links" ON eb_links
FOR ALL TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true
    )
);

-- Service role for automated operations
CREATE POLICY "service_role_chart_commands" ON scheduled_chart_commands
FOR ALL TO service_role
USING (true);

CREATE POLICY "service_role_eb_links" ON eb_links
FOR ALL TO service_role
USING (true);
```

#### **5.3 Schema Migrations Security (30 minutes)**

```sql
-- Handle schema migrations table
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Only super admins can view migration history
CREATE POLICY "super_admin_migrations" ON schema_migrations
FOR SELECT TO authenticated
USING (
    auth.uid() IN (
        SELECT auth_user_id
        FROM abhq_admin_users
        WHERE active = true AND role = 'super_admin'
    )
);

-- Service role can manage migrations
CREATE POLICY "service_role_migrations" ON schema_migrations
FOR ALL TO service_role
USING (true);
```

## COMPREHENSIVE TESTING PROCEDURES

### **TEST PHASE 1: Security Validation (2 hours)**

#### **Anonymous User Test Suite**
```sql
-- Test 1: Verify no access to sensitive data
-- Run as anonymous user (should all fail or return 0)
SELECT COUNT(*) FROM artist_invitations;      -- Should fail
SELECT COUNT(*) FROM artist_auth_logs;        -- Should fail
SELECT COUNT(*) FROM payment_processing;      -- Should fail
SELECT COUNT(*) FROM abhq_admin_users;        -- Should fail

-- Test 2: Verify public data still accessible
SELECT COUNT(*) FROM events WHERE published = true;  -- Should work
SELECT COUNT(*) FROM offers WHERE active = true;     -- Should work
SELECT COUNT(*) FROM eventbrite_current_event_cache; -- Should work
```

#### **Authenticated User Test Suite**
```sql
-- Test 3: User can access own data
SELECT COUNT(*) FROM artist_profiles WHERE person_id = auth.uid();
SELECT COUNT(*) FROM payment_processing WHERE person_id = auth.uid();

-- Test 4: User cannot access other users' data
SELECT COUNT(*) FROM payment_processing WHERE person_id != auth.uid(); -- Should be 0
```

#### **Admin User Test Suite**
```sql
-- Test 5: Admin can access admin functions
SELECT is_admin();                           -- Should return true
SELECT COUNT(*) FROM abhq_admin_users;       -- Should see all admin records
SELECT COUNT(*) FROM artist_invitations;     -- Should see all invitations

-- Test 6: Super admin has elevated access
SELECT is_super_admin();                     -- Should return true
SELECT COUNT(*) FROM corrupted_phone_backup; -- Should see backup data
```

### **TEST PHASE 2: Functionality Validation (4 hours)**

#### **Artist Workflow Testing (1.5 hours)**

**Test Script: Artist Registration and Profile Management**
```javascript
// Test artist can register
const { data: user, error: signUpError } = await supabase.auth.signUp({
  phone: '+1234567890',
  password: 'testpassword123'
});

// Test artist can create profile
const { data: profile, error: profileError } = await supabase
  .from('artist_profiles')
  .insert({
    name: 'Test Artist',
    bio: 'Test bio',
    city_text: 'Test City'
  });

// Test artist can view own invitations
const { data: invitations, error: inviteError } = await supabase
  .from('artist_invitations')
  .select('*');

// Test artist can update own profile
const { data: updated, error: updateError } = await supabase
  .from('artist_profiles')
  .update({ bio: 'Updated bio' })
  .eq('id', profile.id);
```

#### **Admin Workflow Testing (1.5 hours)**

**Test Script: Admin Dashboard Functionality**
```javascript
// Test admin login
const { data: admin, error: loginError } = await supabase.auth.signInWithPassword({
  email: 'admin@artbattle.com',
  password: 'adminpassword'
});

// Test admin can view all artists
const { data: artists, error: artistError } = await supabase
  .from('artist_profiles')
  .select('*');

// Test admin can manage invitations
const { data: invites, error: inviteError } = await supabase
  .from('artist_invitations')
  .select('*');

// Test admin can view payment data
const { data: payments, error: paymentError } = await supabase
  .from('payment_processing')
  .select('*');

// Test admin dashboard views work
const { data: dashboard, error: dashError } = await supabase
  .from('admin_invitation_dashboard')
  .select('*');
```

#### **Public User Testing (1 hour)**

**Test Script: Public User Functionality**
```javascript
// Test public can view events
const { data: events, error: eventError } = await supabase
  .from('events')
  .select('*')
  .eq('published', true);

// Test public can view active offers
const { data: offers, error: offerError } = await supabase
  .from('offers')
  .select('*')
  .eq('active', true);

// Test public cannot access sensitive data
const { data: sensitive, error: sensitiveError } = await supabase
  .from('artist_invitations')
  .select('*');
// Should error or return empty

// Test public can vote
const { data: vote, error: voteError } = await supabase
  .from('votes')
  .insert({
    art_id: 'test-art-id',
    score: 8
  });
```

### **PERFORMANCE IMPACT ASSESSMENT**

#### **Query Performance Testing**

**Before Implementation:**
```sql
-- Baseline performance (no RLS)
EXPLAIN ANALYZE SELECT COUNT(*) FROM artist_invitations;
EXPLAIN ANALYZE SELECT * FROM artist_profiles LIMIT 100;
EXPLAIN ANALYZE SELECT * FROM payment_processing WHERE person_id = 'test-uuid';
```

**After Implementation:**
```sql
-- With RLS performance
EXPLAIN ANALYZE SELECT COUNT(*) FROM artist_invitations;
EXPLAIN ANALYZE SELECT * FROM artist_profiles LIMIT 100;
EXPLAIN ANALYZE SELECT * FROM payment_processing WHERE person_id = auth.uid();
```

**Expected Impact:**
- **Admin queries**: 5-10% slower (additional permission checks)
- **User queries**: Minimal impact (already filtered)
- **Public queries**: No impact (cache tables unchanged)

#### **Index Optimization**

**Required New Indexes:**
```sql
-- Support RLS policies efficiently
CREATE INDEX IF NOT EXISTS idx_artist_invitations_phone ON artist_invitations(phone);
CREATE INDEX IF NOT EXISTS idx_payment_processing_person_id ON payment_processing(person_id);
CREATE INDEX IF NOT EXISTS idx_abhq_admin_users_auth_user_id ON abhq_admin_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_person_id ON artist_profiles(person_id);

-- Support common admin queries
CREATE INDEX IF NOT EXISTS idx_artist_auth_logs_created_at ON artist_auth_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_artist_invitations_event_id ON artist_invitations(event_id);
```

## ROLLBACK PROCEDURES

### **Emergency Rollback (5 minutes)**

**If critical functionality breaks:**
```sql
-- Disable RLS on all critical tables immediately
ALTER TABLE artist_invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE artist_auth_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processing DISABLE ROW LEVEL SECURITY;
ALTER TABLE abhq_admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE artist_profile_aliases DISABLE ROW LEVEL SECURITY;

-- This restores original (insecure) functionality
-- while you debug the issue
```

### **Granular Rollback (Per Table)**

**If specific table has issues:**
```sql
-- Example: Artist invitations having issues
ALTER TABLE artist_invitations DISABLE ROW LEVEL SECURITY;

-- Fix the policy
DROP POLICY "problematic_policy" ON artist_invitations;
CREATE POLICY "fixed_policy" ON artist_invitations ...;

-- Re-enable RLS
ALTER TABLE artist_invitations ENABLE ROW LEVEL SECURITY;
```

### **View Rollback**

**Restore original SECURITY DEFINER views if needed:**
```sql
-- Keep backups of original view definitions
-- Example restore:
DROP VIEW admin_invitation_dashboard;
CREATE VIEW admin_invitation_dashboard WITH (security_definer=true) AS
SELECT * FROM artist_invitations; -- Original insecure definition
```

## POST-IMPLEMENTATION MONITORING

### **Security Monitoring Checklist**

#### **Daily Checks (5 minutes)**
```sql
-- Verify no anonymous access to sensitive data
SELECT COUNT(*) FROM artist_invitations; -- Should fail from anon user
SELECT COUNT(*) FROM artist_auth_logs;   -- Should fail from anon user

-- Check for failed authentication attempts
SELECT COUNT(*) FROM artist_auth_logs
WHERE success = false AND created_at > NOW() - INTERVAL '24 hours';
```

#### **Weekly Checks (15 minutes)**
```sql
-- Run Supabase security linter
-- Should show 0 critical security issues

-- Check RLS policy effectiveness
SELECT
    schemaname, tablename,
    CASE WHEN rowsecurity THEN 'ENABLED' ELSE 'DISABLED' END as rls_status
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
AND tablename IN (
    'artist_invitations', 'artist_auth_logs', 'payment_processing',
    'abhq_admin_users', 'artist_profile_aliases'
);

-- All should show 'ENABLED'
```

#### **Monthly Audits (1 hour)**
```sql
-- Review all policies for effectiveness
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check for any new tables without RLS
SELECT tablename
FROM pg_tables t
LEFT JOIN pg_class c ON c.relname = t.tablename
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
AND c.relrowsecurity = false;

-- Should return empty result
```

### **Performance Monitoring**

#### **Key Metrics to Track**
- **API response times** (should remain <200ms for most queries)
- **Database CPU usage** (RLS adds ~5-10% overhead)
- **Failed authentication rate** (should decrease with better security)
- **Admin query performance** (acceptable if <500ms)

#### **Alert Thresholds**
- API response time >500ms for simple queries
- Database CPU >80% sustained
- >10 failed auth attempts per minute from same IP
- Any anonymous access to sensitive tables

---

**Implementation Guide Created**: September 16, 2025
**Estimated Total Time**: 24 hours over 3 days
**Risk Level**: MANAGED with proper testing and rollback procedures
**Success Criteria**: Zero critical security issues + full functionality preserved

**CONFIDENTIAL - SECURITY IMPLEMENTATION GUIDE**