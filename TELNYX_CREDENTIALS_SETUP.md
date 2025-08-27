# Telnyx Credentials Setup

**Date:** August 26, 2025  
**Status:** Ready for Production

## 🔐 Credentials Provided

- **API Key:** `REDACTED_TELNYX_API_KEY`
- **Public Key (Webhook Validation):** `REDACTED_TELNYX_WEBHOOK_SECRET`

## 📝 Setup Instructions

### 1. Add to Supabase Secrets

Go to Supabase Dashboard → Settings → Edge Functions → Secrets:

```
TELNYX_API_KEY=REDACTED_TELNYX_API_KEY
TELNYX_WEBHOOK_SECRET=REDACTED_TELNYX_WEBHOOK_SECRET
```

### 2. Configure Default Phone Number

You'll need to set your Telnyx phone number:
```
TELNYX_FROM_NUMBER=+1XXXXXXXXXX
```

### 3. Configure Telnyx Webhooks

In your Telnyx dashboard, set webhook URL to:
```
https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-marketing-webhook
```

## ✅ Ready for Testing

Once credentials are added, you can test the system immediately!