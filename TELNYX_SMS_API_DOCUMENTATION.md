# Telnyx SMS Marketing API Documentation

**Date:** August 26, 2025  
**System:** Independent SMS marketing via Telnyx API  
**Status:** Production Ready ✅

---

## 🎯 Overview

Complete API documentation for the Telnyx SMS marketing system. This system operates **independently** from existing SMS notifications and is designed specifically for marketing campaigns.

---

## 🔒 Authentication

All functions require Supabase Service Role Key in the Authorization header:

```
Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY
Content-Type: application/json
```

---

## 📨 1. Send Individual Marketing SMS

**Endpoint:** `POST /functions/v1/send-marketing-sms`

### Request Body:
```json
{
  "to": "+1234567890",
  "message": "Hi {{name}}! Check out our new Art Battle event!",
  "from": "+1987654321",
  "template_id": "uuid-here",
  "campaign_id": "uuid-here", 
  "metadata": {
    "source": "website_signup",
    "user_id": "123"
  }
}
```

### Parameters:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string | ✅ | Recipient phone number (E.164 format) |
| `message` | string | ✅ | SMS message content |
| `from` | string | ❌ | Sender number (defaults to env var) |
| `template_id` | string | ❌ | Link to message template |
| `campaign_id` | string | ❌ | Link to campaign |
| `metadata` | object | ❌ | Additional data for logging |

### Response:
```json
{
  "success": true,
  "message": "SMS sent successfully via Telnyx",
  "details": {
    "outbound_id": "uuid-here",
    "telnyx_message_id": "msg_xyz123",
    "from": "+1987654321",
    "to": "+1234567890",
    "character_count": 45,
    "message_parts": 1,
    "status": "sent",
    "timestamp": "2025-08-26T15:30:45Z"
  }
}
```

### Example Usage:
```javascript
const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-marketing-sms', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '+1234567890',
    message: 'Welcome to Art Battle! Your exclusive event invite inside: artb.art/xyz'
  })
});

const result = await response.json();
```

---

## 📬 2. Send Bulk Marketing Campaign

**Endpoint:** `POST /functions/v1/send-bulk-marketing-sms`

### Request Body:
```json
{
  "campaign_id": "uuid-here",
  "template_id": "uuid-here",
  "recipients": [
    {
      "phone": "+1234567890",
      "variables": {
        "name": "Alice",
        "event": "Toronto Battle"
      }
    },
    {
      "phone": "+1987654321", 
      "variables": {
        "name": "Bob",
        "event": "Vancouver Battle"
      }
    }
  ],
  "message": "Hi {{name}}! Join us at {{event}}!",
  "rate_limit": 6,
  "test_mode": false,
  "metadata": {
    "campaign_name": "Summer 2025 Promotion"
  }
}
```

### Parameters:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `recipients` | array | ✅ | Array of phone numbers or objects with phone/variables |
| `message` | string | ⚠️ | Required if no template_id |
| `template_id` | string | ⚠️ | Required if no message |
| `campaign_id` | string | ❌ | Campaign tracking ID |
| `rate_limit` | number | ❌ | Messages per minute (default: 6) |
| `test_mode` | boolean | ❌ | Test without sending (default: false) |
| `from` | string | ❌ | Sender number |
| `metadata` | object | ❌ | Campaign metadata |

### Response:
```json
{
  "success": true,
  "message": "Bulk SMS campaign completed",
  "results": {
    "total_processed": 100,
    "total_skipped": 5,
    "sent": 95,
    "failed": 0,
    "test_mode": false,
    "messages": [
      {
        "phone": "+1234567890",
        "status": "sent",
        "outbound_id": "uuid-here",
        "telnyx_message_id": "msg_xyz123",
        "character_count": 42,
        "message_parts": 1
      }
    ],
    "skipped": [
      {
        "phone": "+1555555555",
        "reason": "Opted out"
      }
    ],
    "campaign_id": "uuid-here"
  }
}
```

---

## 📋 3. Template Management

**Endpoint:** `GET/POST/PUT/DELETE /functions/v1/sms-marketing-templates`

### Create Template (POST):
```json
{
  "name": "Event Invitation",
  "description": "Standard event invitation template",
  "message_template": "Hi {{name}}! You're invited to {{event}} on {{date}}. RSVP: {{link}}",
  "variables": ["name", "event", "date", "link"],
  "category": "invitation",
  "is_active": true,
  "created_by": "user-uuid"
}
```

### List Templates (GET):
```
GET /functions/v1/sms-marketing-templates?category=invitation&is_active=true&limit=20
```

### Update Template (PUT):
```
PUT /functions/v1/sms-marketing-templates?id=template-uuid
```

### Delete Template (DELETE):
```  
DELETE /functions/v1/sms-marketing-templates?id=template-uuid
```

---

## 🔗 4. Webhook Handler

**Endpoint:** `POST /functions/v1/sms-marketing-webhook`

This endpoint receives webhooks from Telnyx for:
- Inbound SMS replies
- Delivery confirmations  
- Delivery failures
- Message status updates

### Webhook Events Handled:
- `message.received` - Inbound SMS from recipients
- `message.sent` - Outbound message sent confirmation
- `message.delivered` - Message delivered successfully
- `message.delivery_failed` - Message delivery failed

### Auto-Response Features:
- **STOP Keywords** - Automatically processes opt-out requests
- **HELP Keywords** - Logs help requests for follow-up
- **Compliance** - Maintains opt-out list automatically

---

## 📊 5. Campaign Analytics

Query the database directly for campaign analytics:

### Outbound Message Stats:
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(character_count) as avg_chars
FROM sms_outbound 
WHERE campaign_id = 'your-campaign-id'
GROUP BY status;
```

### Campaign Performance:
```sql
SELECT 
  c.name,
  c.total_recipients,
  c.messages_sent,
  c.messages_delivered,
  c.messages_failed,
  ROUND((c.messages_delivered::decimal / c.messages_sent) * 100, 2) as delivery_rate
FROM sms_marketing_campaigns c
WHERE c.id = 'your-campaign-id';
```

### Opt-out Rate:
```sql
SELECT 
  COUNT(*) as total_optouts,
  COUNT(*) FILTER (WHERE opted_out_at >= NOW() - INTERVAL '30 days') as recent_optouts
FROM sms_marketing_optouts
WHERE is_active = true;
```

---

## 🚫 6. Opt-out Management

### Check Opt-out Status:
```sql
SELECT is_phone_opted_out('+1234567890');
```

### Manual Opt-out:
```sql
INSERT INTO sms_marketing_optouts (phone_number, source)
VALUES ('+1234567890', 'manual');
```

### Remove Opt-out:
```sql
UPDATE sms_marketing_optouts 
SET is_active = false 
WHERE phone_number = '+1234567890';
```

---

## ⚠️ Error Codes & Handling

### Common Response Codes:
- `200` - Success
- `400` - Bad Request (missing fields, invalid data)
- `401` - Unauthorized (missing/invalid auth)
- `404` - Not Found (template/campaign not found)
- `429` - Rate Limited
- `500` - Internal Server Error

### Error Response Format:
```json
{
  "success": false,
  "error": "Phone number has opted out of marketing messages",
  "phone": "+1234567890"
}
```

---

## 🔄 Rate Limiting & Best Practices

### Telnyx Rate Limits:
- **Long Code Numbers:** 6 messages/minute/number
- **Toll Free Numbers:** 1,200 messages/minute/number  
- **Account-wide:** 10 messages/second

### Best Practices:
1. **Respect Opt-outs** - Always check opt-out status
2. **Message Length** - Stay under 160 chars for single part
3. **Rate Limiting** - Use built-in rate limiting for bulk sends
4. **Testing** - Use `test_mode: true` for campaign testing
5. **Monitoring** - Check `sms_logs` table for issues

---

## 🧪 Testing Examples

### Test Individual SMS:
```bash
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-marketing-sms" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Test message from Art Battle SMS marketing!"
  }'
```

### Test Template Creation:
```bash
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/sms-marketing-templates" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Welcome Message",
    "message_template": "Welcome {{name}} to Art Battle!",
    "variables": ["name"],
    "category": "welcome"
  }'
```

### Test Bulk Campaign (Test Mode):
```bash
curl -X POST "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-bulk-marketing-sms" \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [{"phone": "+1234567890", "variables": {"name": "Test"}}],
    "message": "Hi {{name}}, this is a test!",
    "test_mode": true
  }'
```

---

## 📈 Monitoring & Logging

### Key Tables to Monitor:
- `sms_outbound` - All outbound messages and their status
- `sms_inbound` - All replies and inbound messages  
- `sms_logs` - Comprehensive audit trail
- `sms_marketing_optouts` - Opt-out compliance

### Function Logs:
Check Supabase Dashboard → Functions → [Function Name] → Logs for real-time debugging.

---

*This API provides a complete SMS marketing solution that operates independently from your existing SMS notification system.*