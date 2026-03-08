# Telnyx SMS Marketing Setup Guide

**Date:** August 26, 2025  
**Purpose:** Complete setup guide for Telnyx SMS marketing system  
**Status:** Production Ready ✅

---

## 🚀 Quick Setup Checklist

### 1. **Database Setup**
```bash
# Run the migration to create all required tables
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/20250826_create_telnyx_sms_marketing_tables.sql
```

### 2. **Supabase Secrets Configuration**

Go to your Supabase Dashboard → Settings → Edge Functions → Secrets and add:

```
TELNYX_API_KEY=your_telnyx_api_key_here
TELNYX_FROM_NUMBER=+1234567890
TELNYX_WEBHOOK_SECRET=your_webhook_secret_here
```

**Required Secrets:**
- `TELNYX_API_KEY` - Your Telnyx API Bearer token
- `TELNYX_FROM_NUMBER` - Default phone number for sending SMS
- `TELNYX_WEBHOOK_SECRET` - Optional secret for webhook validation

### 3. **Deploy Edge Functions**

Deploy all the marketing SMS functions:

```bash
npx supabase functions deploy send-marketing-sms --project-ref xsqdkubgyqwpyvfltnrf
npx supabase functions deploy send-bulk-marketing-sms --project-ref xsqdkubgyqwpyvfltnrf  
npx supabase functions deploy sms-marketing-webhook --project-ref xsqdkubgyqwpyvfltnrf
npx supabase functions deploy sms-marketing-templates --project-ref xsqdkubgyqwpyvfltnrf
```

### 4. **Configure Telnyx Webhooks**

In your Telnyx dashboard, set up webhooks pointing to:
```
https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-marketing-webhook
```

---

## 📊 Database Tables Created

### Core Tables:
- `sms_outbound` - All outbound marketing messages
- `sms_inbound` - All inbound responses and replies  
- `sms_logs` - Comprehensive audit trail
- `sms_marketing_templates` - Reusable message templates
- `sms_marketing_campaigns` - Campaign management and tracking
- `sms_marketing_optouts` - Opt-out compliance management

---

## 🛠️ Edge Functions Overview

### 1. **send-marketing-sms**
Send individual marketing SMS messages
- **URL:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-marketing-sms`
- **Method:** POST
- **Auth:** Service Role Key

### 2. **send-bulk-marketing-sms**  
Send bulk SMS campaigns with rate limiting
- **URL:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-bulk-marketing-sms`
- **Method:** POST
- **Auth:** Service Role Key

### 3. **sms-marketing-webhook**
Handle Telnyx webhooks for delivery status and replies
- **URL:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-marketing-webhook`
- **Method:** POST
- **Auth:** None (webhook endpoint)

### 4. **sms-marketing-templates**
CRUD operations for message templates
- **URL:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-marketing-templates`
- **Methods:** GET, POST, PUT, DELETE
- **Auth:** Service Role Key

---

## 🔐 Security Features

- ✅ **Separate System** - No impact on existing SMS notifications
- ✅ **Secrets Management** - API keys stored in Supabase secrets
- ✅ **Opt-out Compliance** - Automatic STOP keyword handling
- ✅ **Rate Limiting** - Compliant with Telnyx limits (6 msgs/min)
- ✅ **Audit Logging** - Complete activity trail
- ✅ **Phone Validation** - E.164 format enforcement

---

## 📱 Key Features

### Marketing Compliance
- Automatic opt-out detection (STOP, UNSUBSCRIBE, etc.)
- Help request handling (HELP, INFO, etc.)
- Opt-out list management
- Audit trail for compliance

### Campaign Management  
- Template-based messaging with variables
- Bulk sending with rate limiting
- Campaign tracking and analytics
- Delivery status monitoring

### Developer Friendly
- RESTful API design
- Comprehensive error handling
- Detailed logging and monitoring
- Easy integration examples

---

## 🧪 Testing

The system includes comprehensive logging and can be tested in `test_mode` for bulk campaigns without actually sending messages.

All functions log activities to the database for monitoring and debugging.

---

## 🔗 Integration with Art Battle

This SMS marketing system is **completely separate** from the existing Art Battle notification system:

- ✅ **Zero Impact** - Existing `send_sms_instantly()` and notification functions unchanged
- ✅ **Independent** - Uses different tables, functions, and configuration
- ✅ **Purpose-Built** - Designed specifically for marketing campaigns
- ✅ **Compliant** - Built-in marketing compliance features

---

## 📞 Support

- Check function logs in Supabase Dashboard → Functions → Logs
- Monitor SMS activity in the `sms_logs` table
- Review Telnyx dashboard for API usage and delivery stats

---

*This system is ready for production marketing campaigns while keeping your existing SMS notification system completely intact.*