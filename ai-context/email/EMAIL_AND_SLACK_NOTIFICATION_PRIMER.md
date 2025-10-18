# Email and Slack Notification System Primer
**Art Battle Vote26 Application**
*Last Updated: October 16, 2025*

## Table of Contents
1. [Overview](#overview)
2. [Email Notification System](#email-notification-system)
3. [Slack Notification System](#slack-notification-system)
4. [Timezone Handling](#timezone-handling)
5. [Architecture & Data Flow](#architecture--data-flow)
6. [Key Files & Functions](#key-files--functions)
7. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
8. [Adding New Notifications](#adding-new-notifications)

---

## Overview

The Art Battle platform sends automated notifications via email and Slack for artist-related events. All notifications use **timezone-aware date formatting** to display event dates in the venue's local timezone, not UTC.

### Critical Principle
**All event dates must be displayed in the venue's local timezone**, never in UTC or the user's browser timezone. This prevents confusion when artists see event dates that differ by a day due to timezone conversion.

---

## Email Notification System

### Email Types

#### 1. Application Received
- **Trigger**: Artist submits application to event
- **Function**: `submit-application/index.ts`
- **Template**: `emailTemplates.applicationReceived()`
- **Sent to**: Artist's email
- **Content**:
  - Confirmation of application receipt
  - Event details (EID, name, date, venue, city)
  - Message: "If we have space available, we will send you an invitation"

#### 2. Artist Invited
- **Trigger**: Admin sends invitation OR database trigger on `artist_invitations` INSERT
- **Functions**:
  - `admin-send-invitation/index.ts` (manual invite)
  - `send_artist_invitation_email()` (database trigger)
- **Template**: `emailTemplates.artistInvited()`
- **Sent to**: Artist's email
- **Content**:
  - Invitation to paint at event
  - Event details with timezone-corrected date
  - Call to action: Accept invitation via dashboard

#### 3. Artist Confirmed
- **Trigger**: Artist accepts invitation
- **Function**: `accept-invitation/index.ts`
- **Template**: `emailTemplates.artistConfirmed()`
- **Sent to**: Artist's email
- **Content**:
  - Confirmation of participation
  - Artist number assignment
  - Event details with timezone-corrected date
  - Instructions (arrive 30 min early, etc.)

#### 4. Artist Cancelled
- **Trigger**: Artist withdraws from event
- **Function**: `cancel-confirmation/index.ts`
- **Template**: `emailTemplates.artistCancelled()`
- **Sent to**: Artist's email
- **Content**:
  - Confirmation of cancellation
  - Event details
  - Encouragement to apply for future events

#### 5. Payment Notification
- **Trigger**: Manual trigger via `populate-email-queue` function
- **Functions**:
  - `populate-email-queue/index.ts` (queues emails)
  - `email-queue-manager/index.ts` (sends emails)
- **Template**: `emailTemplates.paymentNotification()`
- **Sent to**: Artist's email
- **Content**:
  - Sales summary if artwork sold
  - Artist's 50% share of sales
  - Payment method instructions (Interac/PayPal/Zelle based on city)
  - Event details

### Email Template Structure

All email templates in `/root/vote_app/vote26/supabase/functions/_shared/emailTemplates.ts` follow this pattern:

```typescript
emailTemplates.templateName: (data: {
  artistName: string
  eventEid: string
  eventName: string
  eventStartDateTime: string  // Raw UTC datetime from database
  eventVenue: string
  cityName: string
  // ... other fields
}) => {
  // Convert UTC to local timezone
  const eventDate = formatEventDateTime(data.eventStartDateTime, data.cityName);

  return {
    subject: 'Email subject',
    html: '...',  // HTML email body
    text: '...'   // Plain text fallback
  };
}
```

### Email Sending Flow

```
Edge Function → emailTemplates.xxx() → send-custom-email → AWS SES → Artist
```

1. Edge function (e.g., `submit-application`) triggers
2. Fetches event data including raw `event_start_datetime` (UTC)
3. Calls email template with raw UTC datetime
4. Template converts to local timezone using `formatEventDateTime()`
5. Template returns formatted email (subject, HTML, text)
6. Edge function calls `send-custom-email` edge function
7. `send-custom-email` uses AWS SES to send email

---

## Slack Notification System

### Slack Notification Types

#### 1. Artist Application
- **Trigger**: Database trigger on `artist_applications` INSERT
- **Function**: `notify_artist_application_slack()`
- **Channel**: Event's `slack_channel` or `artist-notify` (fallback)
- **Content**:
  - Header: "📝 [Artist Name] applied to [EID] ([City] - [Local Date])"
  - Artist details and location
  - Application message preview
  - Sample artwork image (if available)
  - Admin link to artist profile

#### 2. Artist Invitation
- **Trigger**: Database trigger on `artist_invitations` INSERT
- **Function**: `notify_artist_invitation_slack()`
- **Channel**: Event's `slack_channel` or `artist-notify` (fallback)
- **Content**:
  - Header: "[Artist Name] invited to [EID]"
  - Email status indicator (📤 Email Sent / ❌ No Email Found)
  - Producer's invitation message
  - Artist details
  - Event details with local timezone date

#### 3. Artist Confirmation
- **Trigger**: Database trigger on `artist_confirmations` INSERT
- **Function**: `notify_artist_confirmation_slack()`
- **Channel**: Event's `slack_channel` or `artist-notify` (fallback)
- **Content**:
  - Header: "[Artist Name] confirmed for [EID]"
  - Legal name, pronouns, location
  - Artist number
  - Social media handles
  - Message to organizers
  - Event details with local timezone date

#### 4. Artist Cancellation
- **Trigger**: Confirmation withdrawal via `cancel-confirmation` edge function
- **Function**: Direct call to `queue_slack_notification()`
- **Channel**: Event's `slack_channel` or `profile-debug` (fallback)
- **Content**:
  - Header: "🚫 [Artist Name] withdrew from [EID]"
  - Artist details and artist number
  - Event details with local timezone date
  - Withdrawal reason
  - Withdrawal timestamp

### Slack Message Flow

```
Database Trigger → notify_xxx_slack() → queue_slack_notification() → slack_notifications table → Cron Job → Slack API
```

1. Database trigger fires on table INSERT/UPDATE
2. Trigger function builds Slack blocks with timezone-aware date
3. Calls `queue_slack_notification()` to insert into `slack_notifications` table
4. Cron job (`process-slack-queue`) picks up pending notifications
5. Cron job sends to Slack API
6. Status updated to 'sent' or 'failed'

### Slack Channel Resolution

Slack notifications use channel lookup:
1. Check if event has `slack_channel` field populated
2. Remove '#' prefix if present
3. Call `resolve_slack_channel()` to get channel ID
4. If channel ID found: Insert with `channel_id` and `status='pending'`
5. If channel ID not found: Insert with `status='pending_lookup'` and `needs_channel_lookup=true`
6. Cron job handles lookup and retries

---

## Timezone Handling

### The Problem We Solved

Events are stored in the database with `event_start_datetime` as UTC timestamps. Without timezone conversion:
- A Toronto event at 7:30 PM EST (Nov 18, 2025) is stored as `2025-11-19 00:30:00+00`
- Old code displayed: "Wednesday, November 19, 2025" ❌
- Correct display: "Tuesday, November 18, 2025, 7:30 PM" ✅

### The Solution

#### SQL Function: `format_event_datetime_local()`
**Location**: `/root/vote_app/vote26/supabase/migrations/20251016_fix_slack_notification_timezones.sql`

```sql
CREATE FUNCTION format_event_datetime_local(
    utc_datetime TIMESTAMPTZ,
    city_name TEXT
) RETURNS TEXT
```

Maps city names to IANA timezones:
- Toronto → America/Toronto
- Amsterdam → Europe/Amsterdam
- Sydney → Australia/Sydney
- etc.

Converts UTC to local timezone and formats as: `"Mon DD, YYYY"`

#### TypeScript Function: `formatEventDateTime()`
**Location**: `/root/vote_app/vote26/supabase/functions/_shared/emailTemplates.ts`

```typescript
export const formatEventDateTime = (
  utcDateTime: string,
  cityName: string
): string => {
  // Maps cities to IANA timezones
  const timezoneMap = {
    'Toronto': 'America/Toronto',
    // ... more cities
  };

  const venueTimezone = timezoneMap[cityName] || 'UTC';

  return new Date(utcDateTime).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: venueTimezone
  });
};
```

### Usage Rules

**✅ CORRECT - Pass raw UTC datetime:**
```typescript
emailTemplates.applicationReceived({
  // ... other fields
  eventStartDateTime: eventData.event_start_datetime,  // Raw UTC from DB
  cityName: eventData.cities?.name
});
```

**❌ WRONG - Pre-formatting the date:**
```typescript
// DON'T DO THIS
const eventDate = new Date(eventData.event_start_datetime)
  .toLocaleDateString('en-US', { ... });

emailTemplates.applicationReceived({
  eventDate: eventDate  // Already formatted = loses timezone info
});
```

### Supported Cities

Current timezone mappings include:
- **North America**: Toronto, Ottawa, Montreal, Vancouver, Boston, New York, Los Angeles, San Francisco, Oakland, Seattle, Chicago, Wilmington, Lancaster
- **Europe**: Amsterdam, London, Paris, Berlin
- **Asia**: Bangkok, Singapore, Tokyo
- **Pacific**: Sydney, Melbourne, Brisbane, Perth, Auckland

---

## Architecture & Data Flow

### Email Architecture

```
┌─────────────────┐
│ Edge Function   │
│ (e.g., submit-  │
│  application)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ emailTemplates.ts   │
│ - formatEventDateTime()
│ - applicationReceived()
│ - artistInvited()   │
│ - etc.              │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ send-custom-email   │
│ Edge Function       │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ AWS SES             │
└─────────────────────┘
```

### Slack Architecture

```
┌──────────────────────┐
│ Database Trigger     │
│ (INSERT on table)    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────┐
│ notify_xxx_slack()       │
│ - Fetches event & artist │
│ - Formats date locally   │
│ - Builds Slack blocks    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ queue_slack_notification()│
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ slack_notifications      │
│ table (pending)          │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Cron Job                 │
│ process-slack-queue      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Slack API                │
└──────────────────────────┘
```

---

## Key Files & Functions

### Edge Functions
- **`/root/vote_app/vote26/supabase/functions/submit-application/index.ts`**
  - Sends application received email

- **`/root/vote_app/vote26/supabase/functions/admin-send-invitation/index.ts`**
  - Admin manually sends invitation email

- **`/root/vote_app/vote26/supabase/functions/accept-invitation/index.ts`**
  - Sends confirmation email when artist accepts

- **`/root/vote_app/vote26/supabase/functions/cancel-confirmation/index.ts`**
  - Sends cancellation email and Slack notification

- **`/root/vote_app/vote26/supabase/functions/populate-email-queue/index.ts`**
  - Queues payment notification emails for post-event

- **`/root/vote_app/vote26/supabase/functions/email-queue-manager/index.ts`**
  - Manages and sends queued emails (approve, send, preview)

- **`/root/vote_app/vote26/supabase/functions/send-custom-email/index.ts`**
  - Core email sending function (uses AWS SES)

### Shared Templates
- **`/root/vote_app/vote26/supabase/functions/_shared/emailTemplates.ts`**
  - All email templates
  - `formatEventDateTime()` timezone utility

- **`/root/vote_app/vote26/supabase/functions/_shared/cors.ts`**
  - CORS headers for edge functions

### Database Functions
- **`format_event_datetime_local(utc_datetime, city_name)`**
  - SQL timezone conversion utility

- **`notify_artist_application_slack()`**
  - Trigger on `artist_applications` INSERT

- **`notify_artist_invitation_slack()`**
  - Trigger on `artist_invitations` INSERT

- **`notify_artist_confirmation_slack()`**
  - Trigger on `artist_confirmations` INSERT

- **`send_artist_invitation_email()`**
  - Trigger on `artist_invitations` INSERT

- **`queue_slack_notification(channel, type, text, blocks, event_id)`**
  - Queues Slack messages

### Database Tables
- **`artist_applications`**
  - Trigger: `artist_application_slack_notification` → `notify_artist_application_slack()`

- **`artist_invitations`**
  - Trigger: `send_artist_invitation_email()` (emails)
  - Trigger: `notify_artist_invitation_slack()` (Slack)

- **`artist_confirmations`**
  - Trigger: `artist_confirmation_slack_notification` → `notify_artist_confirmation_slack()`

- **`artist_payment_email_queue`**
  - Stores queued payment emails
  - Status: `draft`, `ready_for_review`, `approved`, `sent`, `failed`

- **`slack_notifications`**
  - Stores queued Slack messages
  - Status: `pending`, `pending_lookup`, `sent`, `failed`

### Migrations
- **`20251016_fix_slack_notification_timezones.sql`**
  - Creates `format_event_datetime_local()` function
  - Updates application and confirmation Slack triggers

- **`20251016_fix_invitation_timezones.sql`**
  - Updates invitation Slack and email triggers

---

## Common Issues & Troubleshooting

### Issue: Wrong Event Date in Email/Slack

**Symptom**: Event shows as November 19 when it should be November 18

**Cause**: Date formatted without timezone conversion

**Fix**: Ensure you're passing raw `event_start_datetime` to templates:
```typescript
// ✅ Correct
eventStartDateTime: eventData.event_start_datetime

// ❌ Wrong
eventDate: new Date(eventData.event_start_datetime).toLocaleDateString()
```

### Issue: Venue Shows as Blank

**Symptom**: Email shows "Location: " with no venue name

**Cause**: Event has empty `venue` field in database

**Fix**: Update the event record in the database:
```sql
UPDATE events SET venue = 'Venue Name' WHERE eid = 'ABXXXX';
```

**Note**: Venues should always be populated; we removed fallback "TBD" values to surface this data issue.

### Issue: Email Not Sent

**Symptom**: No email received by artist

**Diagnostic Steps**:
1. Check edge function logs in Supabase dashboard
2. Verify artist has email address:
   ```sql
   SELECT ap.name, ap.email, p.email, au.email
   FROM artist_profiles ap
   LEFT JOIN people p ON ap.person_id = p.id
   LEFT JOIN auth.users au ON p.auth_user_id = au.id
   WHERE ap.id = 'profile-id';
   ```
3. Check `send-custom-email` function logs
4. Check AWS SES bounce/complaint reports

**Common Causes**:
- Artist has no email in any table
- AWS SES bounced email (invalid address)
- Email in spam folder

### Issue: Slack Notification Not Sent

**Symptom**: No Slack message posted

**Diagnostic Steps**:
1. Check `slack_notifications` table:
   ```sql
   SELECT * FROM slack_notifications
   WHERE event_id = (SELECT id FROM events WHERE eid = 'ABXXXX')
   ORDER BY created_at DESC;
   ```
2. Check notification status: `pending`, `pending_lookup`, `sent`, `failed`
3. Check `process-slack-queue` cron job logs
4. Verify Slack channel exists and bot has access

**Common Causes**:
- Channel doesn't exist
- Bot not invited to channel
- Invalid channel ID
- Cron job not running

### Issue: Missing City Timezone

**Symptom**: Date shows in UTC despite having city

**Cause**: City not in timezone map

**Fix**: Add city to both timezone maps:
1. SQL function in migration:
   ```sql
   WHEN 'New City' THEN 'America/Timezone'
   ```
2. TypeScript function in `emailTemplates.ts`:
   ```typescript
   'New City': 'America/Timezone'
   ```

Find IANA timezone: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

---

## Adding New Notifications

### Adding a New Email Template

1. **Add template to `emailTemplates.ts`:**
   ```typescript
   newNotification: (data: {
     artistName: string
     eventEid: string
     eventStartDateTime: string  // Always use raw UTC
     cityName: string
     // ... other fields
   }) => {
     const eventDate = formatEventDateTime(data.eventStartDateTime, data.cityName);

     return {
       subject: 'Subject Line',
       html: `
         <div>
           <h1>Title</h1>
           <p>Hello ${data.artistName},</p>
           <p>Event: ${data.eventEid} on ${eventDate}</p>
         </div>
       `,
       text: `
         Hello ${data.artistName},
         Event: ${data.eventEid} on ${eventDate}
       `
     };
   }
   ```

2. **Call from edge function:**
   ```typescript
   const emailData = emailTemplates.newNotification({
     artistName: profileData.name,
     eventEid: eventData.eid,
     eventStartDateTime: eventData.event_start_datetime,  // Raw UTC
     cityName: eventData.cities?.name
   });

   await fetch(`${supabaseUrl}/functions/v1/send-custom-email`, {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${serviceKey}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       to: artistEmail,
       subject: emailData.subject,
       html: emailData.html,
       text: emailData.text,
       from: 'hello@artbattle.com'
     })
   });
   ```

3. **Deploy:**
   ```bash
   cd /root/vote_app/vote26/supabase
   supabase functions deploy your-function-name
   ```

### Adding a New Slack Notification

1. **Create database trigger function:**
   ```sql
   CREATE OR REPLACE FUNCTION notify_new_event_slack()
   RETURNS TRIGGER AS $$
   DECLARE
     event_info RECORD;
     city_name TEXT;
     event_date_local TEXT;
     slack_blocks JSONB;
     slack_channel TEXT;
   BEGIN
     -- Get event info with city
     SELECT e.name, e.eid, e.event_start_datetime, e.slack_channel, c.name as city_name
     INTO event_info
     FROM events e
     LEFT JOIN cities c ON e.city_id = c.id
     WHERE e.id = NEW.event_id;

     -- Get city and format date in local timezone
     city_name := COALESCE(event_info.city_name, 'Unknown');
     event_date_local := format_event_datetime_local(
       event_info.event_start_datetime,
       city_name
     );

     -- Determine channel
     slack_channel := COALESCE(
       LTRIM(event_info.slack_channel, '#'),
       'artist-notify'
     );

     -- Build Slack blocks
     slack_blocks := jsonb_build_array(
       jsonb_build_object(
         'type', 'header',
         'text', jsonb_build_object(
           'type', 'plain_text',
           'text', 'New Event: ' || event_info.eid
         )
       ),
       jsonb_build_object(
         'type', 'section',
         'text', jsonb_build_object(
           'type', 'mrkdwn',
           'text', '*Date:* ' || event_date_local
         )
       )
     );

     -- Queue notification
     PERFORM queue_slack_notification(
       slack_channel,
       'new_event',
       'New Event: ' || event_info.eid,
       slack_blocks,
       event_info.id
     );

     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```

2. **Create trigger:**
   ```sql
   CREATE TRIGGER new_event_slack_notification
   AFTER INSERT ON your_table
   FOR EACH ROW
   EXECUTE FUNCTION notify_new_event_slack();
   ```

3. **Deploy migration:**
   ```bash
   PGPASSWORD='...' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
     -p 5432 -d postgres -U postgres \
     -f /path/to/migration.sql
   ```

### Testing Notifications

**Test Email:**
```bash
# Call edge function directly
curl -X POST 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/submit-application' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "artist_profile_id": "...",
    "event_id": "...",
    "application_message": "Test application"
  }'
```

**Test Slack:**
```sql
-- Manually trigger Slack notification
INSERT INTO artist_applications (
  artist_profile_id,
  event_id,
  event_eid,
  application_status,
  artist_number
) VALUES (
  'test-profile-id',
  'test-event-id',
  'ABTEST',
  'pending',
  '999'
);

-- Check if queued
SELECT * FROM slack_notifications
WHERE message_type = 'artist_application'
ORDER BY created_at DESC LIMIT 1;
```

---

## Best Practices

### DO:
✅ Always pass raw UTC `event_start_datetime` to email templates
✅ Always use `formatEventDateTime()` or `format_event_datetime_local()` for dates
✅ Include city name for timezone conversion
✅ Test notifications in staging before production
✅ Log email send attempts with artist email and result
✅ Handle missing email addresses gracefully
✅ Use Slack blocks for rich formatting
✅ Set appropriate Slack channels per event

### DON'T:
❌ Pre-format dates before passing to templates
❌ Use `toLocaleDateString()` without timezone parameter
❌ Assume dates in database are in local time
❌ Send emails without checking for email address
❌ Use hardcoded channel names in Slack notifications
❌ Ignore email/Slack failures silently
❌ Display dates in user's browser timezone for event info

---

## Maintenance Checklist

### When Adding a New City:
- [ ] Add to `format_event_datetime_local()` SQL function
- [ ] Add to `formatEventDateTime()` TypeScript function
- [ ] Find correct IANA timezone identifier
- [ ] Test with sample event in that city
- [ ] Deploy migration and functions

### When Modifying Email Templates:
- [ ] Update both HTML and text versions
- [ ] Test timezone conversion with UTC datetime
- [ ] Verify all template parameters are used
- [ ] Check mobile email rendering
- [ ] Deploy all affected edge functions

### When Debugging Date Issues:
- [ ] Check if raw UTC datetime is passed
- [ ] Verify city name matches timezone map
- [ ] Check database event record has correct datetime
- [ ] Test `format_event_datetime_local()` directly in SQL
- [ ] Review edge function logs for errors

---

## Related Documentation
- AWS SES Email Function Guide: `/root/vote_app/vote26/AWS_SES_EMAIL_FUNCTION_GUIDE_20250826.md`
- Invitation Email System Fix: `/root/vote_app/vote26/INVITATION_EMAIL_SYSTEM_FIX_2025-09-04.md`
- Invitation Email Monitoring: `/root/vote_app/vote26/INVITATION_EMAIL_MONITORING_GUIDE.md`
- Artist Email Export: `/root/vote_app/vote26/ARTIST_EMAIL_EXPORT_DEVELOPMENT_20250826.md`

---

**For questions or issues, contact the development team.**
