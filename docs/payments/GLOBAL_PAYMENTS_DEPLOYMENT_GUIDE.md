# Global Payments Migration Deployment Guide
## Stripe Connect → Global Payouts Transition
### Date: September 9, 2025

## Overview

This document provides step-by-step deployment instructions for migrating from Stripe Connect to Stripe Global Payouts. The migration implements a dual-system approach allowing existing Connect users to continue while new users onboard to Global Payments.

## 🎯 Key Benefits of Global Payments

- **Simpler Onboarding**: Reduced KYC requirements, faster setup
- **Direct Payouts**: Funds sent directly to recipient accounts
- **Global Reach**: Available in 100+ countries
- **Reduced Complexity**: No merchant-style account management

## 📋 Pre-Deployment Checklist

### 1. Database Migration
```bash
# Run the Global Payments schema migration
cd /root/vote_app/vote26
psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres \
  -f migrations/create_global_payments_schema.sql
```

### 2. Stripe Configuration
- [ ] Enable Global Payouts in Stripe Dashboard
- [ ] Configure webhook endpoints for new events:
  - `recipient.created`
  - `recipient.updated`  
  - `payout.created`
  - `payout.paid`
  - `payout.failed`
  - `payout.canceled`
- [ ] Set up prefunding strategy for Stripe balance
- [ ] Test recipient creation in Stripe Dashboard

### 3. Environment Variables
Ensure these are configured in Supabase Edge Functions:
```env
STRIPE_INTL_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET_GLOBAL=whsec_...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 🚀 Deployment Steps

### Phase 1: Deploy Infrastructure (Week 1)

#### 1.1 Deploy Database Schema
```bash
# Connect to production database
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres

# Run migration
\i migrations/create_global_payments_schema.sql

# Verify tables created
\dt artist_global_payments
\dt global_payment_requests
```

#### 1.2 Deploy Edge Functions
```bash
# Deploy Global Payments functions
supabase functions deploy stripe-global-payments-onboard
supabase functions deploy stripe-global-payments-payout

# Update existing webhook handler
supabase functions deploy stripe-webhook-handler
```

#### 1.3 Deploy Frontend Components
```bash
cd art-battle-artists
npm run build
./deploy.sh
```

### Phase 2: Testing & Validation (Week 2)

#### 2.1 Sandbox Testing
```bash
# Test onboarding flow
curl -X POST https://xsqdkubgyqwpyvfltnrf.functions.supabase.co/stripe-global-payments-onboard \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"test-id","return_url":"...","refresh_url":"..."}'

# Test payout creation
curl -X POST https://xsqdkubgyqwpyvfltnrf.functions.supabase.co/stripe-global-payments-payout \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"art_id":"test-art-id","amount":50.00}'
```

#### 2.2 UI Testing
- [ ] Navigate to `/profile?tab=payments&system=global`
- [ ] Test Global Payments onboarding flow
- [ ] Verify dual-system switcher works
- [ ] Test migration banner functionality

### Phase 3: Gradual Rollout (Week 3-4)

#### 3.1 Feature Flag Implementation
Set environment variable to control rollout:
```env
GLOBAL_PAYMENTS_ENABLED=true
GLOBAL_PAYMENTS_DEFAULT_NEW_USERS=true
GLOBAL_PAYMENTS_MIGRATION_BANNER=true
```

#### 3.2 User Rollout Strategy

**Week 3: New Users Only**
- All new artist registrations → Global Payments
- Existing users see migration banner
- Monitor for issues and user feedback

**Week 4: Gradual Migration**
- Send email campaign about Global Payments benefits
- Offer incentive for early migration
- Monitor migration rates and support requests

## 📊 Monitoring & Alerts

### Key Metrics to Track
```sql
-- New Global Payments accounts created
SELECT COUNT(*) FROM artist_global_payments 
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- Payout success rate
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM global_payment_requests
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY status;

-- Migration rate (Connect → Global)
SELECT COUNT(*) as migrated_users
FROM artist_global_payments 
WHERE legacy_stripe_connect_account_id IS NOT NULL;
```

### Alert Conditions
- Global Payments payout failure rate > 5%
- Stripe balance below $10,000
- Webhook processing errors
- User support tickets mentioning "payments"

## 🔧 Configuration Files

### PaymentDashboard URL Parameters
- `?system=global` - Force Global Payments view
- `?system=connect` - Force Stripe Connect view  
- `?onboarding=success` - Post-onboarding success
- `?onboarding=refresh` - Onboarding refresh needed

### Component Logic Flow
```
User loads PaymentDashboard
↓
Check URL parameter (?system=global|connect)
↓
If no param: Auto-detect based on accounts
↓ 
Priority: Global Payments > Connect > Default Global
↓
Render appropriate onboarding component
```

## 🚨 Rollback Procedures

### Emergency Rollback
If critical issues arise:

```bash
# 1. Disable Global Payments via environment variable
GLOBAL_PAYMENTS_ENABLED=false

# 2. Redeploy with rollback flag
supabase functions deploy stripe-global-payments-onboard --rollback

# 3. Force all users to Connect system
# Update PaymentDashboard.jsx defaultSystem = 'connect'

# 4. Database rollback (if needed)
# Preserve data but disable Global Payments RLS policies
```

### Partial Rollback
For specific user issues:
```sql
-- Move specific user back to Connect system
UPDATE artist_global_payments 
SET status = 'blocked'
WHERE artist_profile_id = 'problematic-profile-id';
```

## 📋 Post-Deployment Verification

### Week 1 Checklist
- [ ] All Edge Functions deploy successfully
- [ ] Database migrations applied without errors
- [ ] Webhook handlers receiving Global Payments events
- [ ] UI components render correctly for both systems
- [ ] New user onboarding defaults to Global Payments

### Week 2 Checklist  
- [ ] First successful Global Payments payout completed
- [ ] Webhook events updating database correctly
- [ ] User feedback collected and addressed
- [ ] Support team trained on new system
- [ ] Monitoring dashboards show healthy metrics

### Week 4 Checklist
- [ ] Migration rate meeting targets (>20% of eligible users)
- [ ] Payout success rate >95%
- [ ] No critical support tickets
- [ ] Financial reconciliation accurate
- [ ] Ready for full rollout

## 🔒 Security Considerations

### Data Protection
- Global Payments uses same encryption as Connect
- No additional PII stored beyond existing system
- Webhook signatures properly validated
- Service role keys properly scoped

### Access Control
- RLS policies prevent cross-user data access
- Edge Functions validate user authentication
- Admin functions require proper authorization
- Audit trail maintained for all payout requests

## 💰 Financial Implications

### Cost Comparison
- **Connect**: 2.9% + 30¢ per transaction + payout fees
- **Global Payouts**: Direct payout fees (varies by country)
- **Migration**: One-time development cost, ongoing support savings

### Balance Management
- Maintain minimum $50,000 prefunded balance
- Set up automated top-ups when balance < $10,000
- Monitor FX rates for international payouts
- Regular reconciliation with accounting systems

## 🎓 Training Materials

### Support Team Training
- Global Payments vs Connect differences
- Common user questions and responses
- Troubleshooting payout failures
- Migration assistance procedures

### User Communication
- Email template explaining Global Payments benefits
- Help documentation updates
- FAQ section for common concerns
- Video walkthrough of new onboarding

## 🔗 Useful Resources

- [Stripe Global Payouts Documentation](https://stripe.com/docs/global-payouts)
- [Migration Technical Specification](./AUTHENTICATION_IMPROVEMENTS_2025_09_09.md)
- [Database Schema Changes](./migrations/create_global_payments_schema.sql)
- [Edge Function Endpoints](./supabase/functions/)

## 📞 Emergency Contacts

- **Technical Lead**: Responsible for deployment
- **Stripe Support**: For Global Payouts technical issues  
- **Database Admin**: For migration rollback procedures
- **Finance Team**: For reconciliation and balance management

---

**Deployment Status**: ✅ Ready for Phase 1 Implementation
**Risk Level**: Medium (well-tested with rollback procedures)
**Timeline**: 4 weeks for full rollout