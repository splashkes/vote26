# SECURITY FIX IMPLEMENTATION PLAN
**Art Battle Platform - Critical Security Remediation**

## EXECUTIVE SUMMARY

Based on security breach investigation and Supabase linter findings, the platform has **CRITICAL** data exposure vulnerabilities. Anonymous users have full access to sensitive tables containing artist data, authentication logs, and payment information. This plan provides a comprehensive fix strategy while preserving all user functionality.

## IMMEDIATE THREATS IDENTIFIED

### **CRITICAL - Anonymous Access to Sensitive Data**
- `artist_invitations` (26,936 records) - FULL CRUD access
- `artist_auth_logs` (3,174 records) - FULL CRUD access
- `artist_auth_monitor` view - Exposes auth.users data
- `payment_processing` - Payment data without RLS
- `abhq_admin_users` - Admin user data exposed

### **HIGH PRIORITY - RLS Disabled Tables**
- `eventbrite_current_event_cache`
- `offers`, `offer_redemptions`, `offer_views`
- `endpoint_cache_versions`
- `artist_profile_aliases`
- Multiple backup and utility tables

### **SECURITY DEFINER VIEWS (17 instances)**
Views bypassing normal security with elevated permissions accessible to public users.

## IMPLEMENTATION STRATEGY

### **PHASE 1: IMMEDIATE LOCKDOWN (Emergency Fixes)**
**Timeline: 1-2 hours**
**Risk Level: LOW** - These are additive security measures

#### 1.1 Enable RLS on Critical Tables
```sql
-- Lock down most sensitive tables immediately
ALTER TABLE artist_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_auth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processing ENABLE ROW LEVEL SECURITY;
ALTER TABLE abhq_admin_users ENABLE ROW LEVEL SECURITY;

-- Temporarily deny all access until policies are created
CREATE POLICY "emergency_lockdown_invitations" ON artist_invitations FOR ALL TO anon USING (false);
CREATE POLICY "emergency_lockdown_auth_logs" ON artist_auth_logs FOR ALL TO anon USING (false);
CREATE POLICY "emergency_lockdown_payments" ON payment_processing FOR ALL TO anon USING (false);
CREATE POLICY "emergency_lockdown_admin" ON abhq_admin_users FOR ALL TO anon USING (false);
```

#### 1.2 Secure Artist Auth Monitor View
```sql
-- Drop the existing insecure view
DROP VIEW artist_auth_monitor;

-- Recreate without SECURITY DEFINER and without exposing auth.users
CREATE VIEW artist_auth_monitor AS
SELECT
    id, created_at, event_type, operation, success,
    error_type, error_message, duration_ms, phone,
    person_name, profile_name, entry_id, metadata
FROM artist_auth_logs
WHERE auth.role() = 'service_role' OR auth.uid() IN (
    SELECT id FROM auth.users WHERE email IN (
        SELECT email FROM abhq_admin_users WHERE active = true
    )
);
```

### **PHASE 2: GRANULAR ACCESS POLICIES (Functional Restoration)**
**Timeline: 4-6 hours**
**Risk Level: MEDIUM** - Requires testing of each policy

#### 2.1 Artist Invitations Policies
```sql
DROP POLICY "emergency_lockdown_invitations" ON artist_invitations;

-- Artists can view their own invitations
CREATE POLICY "artists_own_invitations" ON artist_invitations
FOR SELECT TO authenticated
USING (auth.uid() IN (
    SELECT id FROM auth.users WHERE phone = artist_invitations.phone
));

-- ABHQ admins can manage all invitations
CREATE POLICY "abhq_admin_all_invitations" ON artist_invitations
FOR ALL TO authenticated
USING (auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
));

-- Event admins can view invitations for their events
CREATE POLICY "event_admin_invitations" ON artist_invitations
FOR SELECT TO authenticated
USING (event_id IN (
    SELECT event_id FROM event_admins WHERE person_id = auth.uid()
));
```

#### 2.2 Authentication Logs Policies
```sql
DROP POLICY "emergency_lockdown_auth_logs" ON artist_auth_logs;

-- Only ABHQ admins can read auth logs
CREATE POLICY "abhq_admin_auth_logs" ON artist_auth_logs
FOR SELECT TO authenticated
USING (auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
));

-- System can insert logs
CREATE POLICY "system_insert_auth_logs" ON artist_auth_logs
FOR INSERT TO service_role
WITH CHECK (true);
```

#### 2.3 Payment Processing Policies
```sql
DROP POLICY "emergency_lockdown_payments" ON payment_processing;

-- Users can view their own payments
CREATE POLICY "users_own_payments" ON payment_processing
FOR SELECT TO authenticated
USING (person_id = auth.uid());

-- Event admins can view payments for their events
CREATE POLICY "event_admin_payments" ON payment_processing
FOR SELECT TO authenticated
USING (event_id IN (
    SELECT event_id FROM event_admins WHERE person_id = auth.uid()
));

-- ABHQ admins can view all payments
CREATE POLICY "abhq_admin_all_payments" ON payment_processing
FOR ALL TO authenticated
USING (auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
));
```

#### 2.4 Admin Users Protection
```sql
DROP POLICY "emergency_lockdown_admin" ON abhq_admin_users;

-- Users can view their own admin record
CREATE POLICY "users_own_admin_record" ON abhq_admin_users
FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

-- Super admins can manage all admin records
CREATE POLICY "super_admin_all_records" ON abhq_admin_users
FOR ALL TO authenticated
USING (auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users
    WHERE active = true AND role = 'super_admin'
));
```

### **PHASE 3: CACHE TABLES AND UTILITIES (Data Access Optimization)**
**Timeline: 2-3 hours**
**Risk Level: LOW** - Mostly read-only optimizations

#### 3.1 Cache Tables RLS Policies
```sql
-- Enable RLS on cache tables
ALTER TABLE eventbrite_current_event_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_cache_versions ENABLE ROW LEVEL SECURITY;

-- Public read access for cache data (these contain no sensitive info)
CREATE POLICY "public_read_eventbrite_cache" ON eventbrite_current_event_cache
FOR SELECT TO anon, authenticated
USING (true);

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
```

#### 3.2 Offers System Policies
```sql
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_views ENABLE ROW LEVEL SECURITY;

-- Public can view active offers
CREATE POLICY "public_view_active_offers" ON offers
FOR SELECT TO anon, authenticated
USING (active = true AND expires_at > NOW());

-- Users can view their own redemptions
CREATE POLICY "users_own_redemptions" ON offer_redemptions
FOR SELECT TO authenticated
USING (person_id = auth.uid());

-- Track offer views publicly (analytics)
CREATE POLICY "public_track_offer_views" ON offer_views
FOR INSERT TO anon, authenticated
WITH CHECK (true);
```

### **PHASE 4: SECURITY DEFINER VIEW REPLACEMENTS**
**Timeline: 6-8 hours**
**Risk Level: HIGH** - Requires careful testing of each view

#### 4.1 Replace Sensitive Admin Views
```sql
-- Replace admin_invitation_dashboard
DROP VIEW admin_invitation_dashboard;
CREATE VIEW admin_invitation_dashboard AS
SELECT * FROM artist_invitations
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
);

-- Replace artist_activity_with_payments
DROP VIEW artist_activity_with_payments;
CREATE VIEW artist_activity_with_payments AS
SELECT aa.*, pp.amount, pp.status as payment_status
FROM artist_activity aa
LEFT JOIN payment_processing pp ON aa.person_id = pp.person_id
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
) OR aa.person_id = auth.uid();
```

#### 4.2 Replace Operational Views
```sql
-- Replace operation_stats (admin only)
DROP VIEW operation_stats;
CREATE VIEW operation_stats AS
SELECT * FROM internal_operation_stats
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
);

-- Replace recent_errors (admin only)
DROP VIEW recent_errors;
CREATE VIEW recent_errors AS
SELECT * FROM internal_error_logs
WHERE auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
);
```

### **PHASE 5: BACKUP AND UTILITY TABLE CLEANUP**
**Timeline: 1-2 hours**
**Risk Level: LOW** - Cleanup operations

#### 5.1 Secure Backup Tables
```sql
-- Enable RLS on backup tables
ALTER TABLE corrupted_phone_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_notifications_backup_20250829 ENABLE ROW LEVEL SECURITY;

-- Only super admins can access backups
CREATE POLICY "super_admin_only_backups" ON corrupted_phone_backup
FOR ALL TO authenticated
USING (auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users
    WHERE active = true AND role = 'super_admin'
));
```

#### 5.2 Utility Tables
```sql
-- Enable RLS on utility tables
ALTER TABLE scheduled_chart_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE eb_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_profile_aliases ENABLE ROW LEVEL SECURITY;

-- Appropriate access policies for each
CREATE POLICY "admin_chart_commands" ON scheduled_chart_commands
FOR ALL TO authenticated
USING (auth.uid() IN (
    SELECT auth_user_id FROM abhq_admin_users WHERE active = true
));
```

## TESTING STRATEGY

### **Functionality Testing Checklist**

#### **Artist Workflows**
- [ ] Artist registration and login
- [ ] Profile creation and editing
- [ ] Sample works upload
- [ ] Event participation
- [ ] Payment processing
- [ ] Invitation acceptance

#### **Admin Workflows**
- [ ] ABHQ admin dashboard access
- [ ] Event admin permissions
- [ ] Artist invitation management
- [ ] Payment processing oversight
- [ ] Analytics and reporting

#### **Public User Workflows**
- [ ] Event browsing and voting
- [ ] Offer viewing and redemption
- [ ] Public data access (events, cached data)
- [ ] Anonymous user functionality

#### **API Endpoint Testing**
- [ ] All REST API endpoints function correctly
- [ ] RPC functions work as expected
- [ ] No unauthorized data exposure
- [ ] Proper error handling

### **Security Validation Testing**

#### **Access Control Verification**
- [ ] Anonymous users cannot access sensitive data
- [ ] Users can only access their own data
- [ ] Admin permissions work correctly
- [ ] Cross-user data isolation verified

#### **Data Exposure Check**
```sql
-- Test anonymous access (should return no sensitive data)
SELECT COUNT(*) FROM artist_invitations; -- Should fail or return 0
SELECT COUNT(*) FROM artist_auth_logs;   -- Should fail or return 0
SELECT COUNT(*) FROM payment_processing; -- Should fail or return 0
```

## ROLLBACK STRATEGY

### **Emergency Rollback Commands**
```sql
-- If something breaks, quickly disable RLS to restore functionality
ALTER TABLE artist_invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE artist_auth_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_processing DISABLE ROW LEVEL SECURITY;
-- etc.

-- Re-enable after fixing policies
```

### **Granular Rollback**
- Each phase can be independently rolled back
- Policies can be dropped and recreated individually
- Views can be restored from backup definitions

## IMPLEMENTATION TIMELINE

### **Day 1: Emergency Response (8 hours)**
- Phase 1: Immediate lockdown (2 hours)
- Phase 2: Core functionality restoration (6 hours)

### **Day 2: Complete Remediation (8 hours)**
- Phase 3: Cache and utility tables (3 hours)
- Phase 4: Security definer views (4 hours)
- Phase 5: Cleanup (1 hour)

### **Day 3: Testing and Validation (8 hours)**
- Comprehensive functionality testing (6 hours)
- Security validation (2 hours)

## SUCCESS CRITERIA

### **Security Objectives**
- [ ] Zero anonymous access to sensitive data
- [ ] All tables have appropriate RLS policies
- [ ] No SECURITY DEFINER views exposing sensitive data
- [ ] Supabase linter shows zero critical security issues

### **Functionality Objectives**
- [ ] All artist workflows function normally
- [ ] All admin capabilities preserved
- [ ] All public user features work
- [ ] API performance unchanged
- [ ] No data loss or corruption

## POST-IMPLEMENTATION MONITORING

### **Security Monitoring**
- Weekly Supabase linter scans
- Monthly access log audits
- Quarterly security policy reviews

### **Performance Monitoring**
- API response time tracking
- Database query performance
- User experience metrics

---

**Plan Created**: September 16, 2025
**Priority**: CRITICAL - IMMEDIATE IMPLEMENTATION REQUIRED
**Estimated Effort**: 24 hours over 3 days
**Risk Level**: LOW with proper testing and rollback procedures

**CONFIDENTIAL - INTERNAL SECURITY REMEDIATION**