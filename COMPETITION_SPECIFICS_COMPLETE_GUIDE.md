# Competition Specifics System - Complete Guide

## Overview

The Competition Specifics System is a comprehensive platform for managing, distributing, and tracking event-specific rules, guidelines, and information across the Art Battle ecosystem. It provides role-based access control, version tracking, and complete audit logging to ensure artists always have access to the most current and relevant information.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Admin Setup & Management](#admin-setup--management)
3. [Artist Access & Viewing](#artist-access--viewing)
4. [Public/Audience Access](#publicaudience-access)
5. [Audit Logging & Tracking](#audit-logging--tracking)
6. [Database Schema](#database-schema)
7. [Edge Functions](#edge-functions)
8. [Best Practices](#best-practices)

---

## System Architecture

### Three-Tier Access Model

The system implements a three-tier access model to serve different user types:

```
┌─────────────────────────────────────────────────────────────┐
│                     COMPETITION SPECIFICS                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   ADMINS     │  │   ARTISTS    │  │   PUBLIC     │     │
│  │              │  │              │  │              │     │
│  │ • Create     │  │ • View Public│  │ • View Public│     │
│  │ • Edit       │  │ • View Artist│  │   Only       │     │
│  │ • Delete     │  │   Only       │  │              │     │
│  │ • Assign     │  │ • Tracked    │  │ • No Auth    │     │
│  │ • Preview    │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Visibility Levels

Each competition specific has a visibility setting:

- **Public** (`public`) 🌐
  - Visible to everyone: admins, artists, broadcast viewers, general public
  - Examples: General rules, event format, timing information

- **Artists Only** (`artists_only`) 👤
  - Visible only to authenticated artists and admins
  - Examples: Arrival instructions, backstage info, payment details, artist-specific guidelines

---

## Admin Setup & Management

### Creating Competition Specifics

Admins can create reusable competition specifics that can be applied to multiple events.

#### Access Point
**Art Battle Admin** → **Settings/Library** → **Competition Specifics**

#### Creating a New Specific

1. Click **"Create New"** button
2. Fill in the form:
   - **Name**: Short, descriptive title (e.g., "Open Materials Rules")
   - **Content**: Full markdown-formatted content
   - **Visibility**: Choose `public` or `artists_only`
3. Click **"Save"**

#### Features

- **Markdown Support**: Full markdown formatting including:
  - Headers (`#`, `##`, `###`)
  - Bold (`**text**`)
  - Italic (`*text*`)
  - Lists (numbered and bulleted)
  - Links, code blocks, and more

- **Live Preview**: See how the content will render before saving

- **Version Tracking**: Every edit creates a new version with timestamp

### Assigning Specifics to Events

Once created, specifics can be assigned to specific events.

#### Access Point
**Art Battle Admin** → **Event Detail** → **Competition Specifics** tab

#### Assigning Process

1. Open an event in Event Detail view
2. Navigate to **"Competition Specifics"** tab
3. Click **"+ Add existing specific to event"** dropdown
4. Select the specific(s) to add
5. **Drag and drop** to reorder (display order matters!)
6. Changes auto-save

#### Management Features

- **Drag-and-Drop Ordering**: Control the exact order specifics appear to artists
- **Preview**: Click "Preview" to see exactly how artists will see the information
- **Edit**: Click pencil icon to edit the specific globally (affects all events using it)
- **Remove**: Click X to remove from this event (doesn't delete the specific)

### Event Info Panel Display

The Event Info panel (pre-approval view) shows a summary of assigned specifics:

**Location**: Event Detail → Event Info section (above APPROVE button)

**Display Format**:
```
Competition Specifics
1. Championship Finals Timing     🌐 Public
2. Open Materials Rules           🌐 Public
3. Backstage Arrival Info         👤 Artists Only
```

This gives admins quick visibility into what rules are configured before approving an event.

---

## Artist Access & Viewing

Artists have multiple access points to view competition specifics throughout their journey.

### 1. Apply Tab - Browsing Events

**Location**: Art Battle Artists → Apply → Available Events

**Display**:
- Each event card shows a **"📋 View Specifics"** button
- Button appears below prize/advancement information
- Left-aligned for easy access

**User Flow**:
1. Artist browses available events
2. Clicks "📋 View Specifics" on any event
3. Modal opens showing all specifics for that event
4. View is logged for audit purposes

### 2. Application Submission Modal

**Location**: When clicking "Apply" on an event

**Display**:
- Shows event details including prizes and advancement info
- Full-width **"📋 View Specifics"** button below event card
- Allows artists to review rules before submitting application

**User Flow**:
1. Artist clicks "Apply" on event
2. Modal shows with application form
3. Can click "📋 View Specifics" to review rules
4. Submits application after reviewing

### 3. Invitation Acceptance Modal

**Location**: When accepting an invitation to compete

**Display**:
- Comprehensive modal with artist details form
- **"View Competition Specifics"** button prominently displayed
- Artists can review rules before accepting invitation

**User Flow**:
1. Artist receives invitation
2. Clicks to accept
3. Reviews competition specifics in detail
4. Accepts invitation with full knowledge of requirements

### 4. Confirmed Events (Home)

**Location**: Art Battle Artists → Home → My Confirmed Events

**Display**:
- Each confirmed event shows **"View Competition Specifics"** button
- Allows artists to review rules anytime before event
- Ensures artists can refresh their memory closer to event date

**User Flow**:
1. Artist views their confirmed events on Home
2. Clicks "View Competition Specifics" on upcoming event
3. Reviews latest rules and information
4. View is logged each time

### What Artists See

When viewing specifics, artists see:

```markdown
┌─────────────────────────────────────────────────────┐
│  📋 Competition Specifics                            │
│  AB3032 – San Francisco City Championship            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ⏱️ Championship Finals Timing                      │
│  🌐 Public                                           │
│  ─────────────────────────────────────────────────  │
│  [Rendered Markdown Content]                        │
│                                                      │
│  Version 3 • Last updated: Oct 22, 2025             │
│                                                      │
│  ═════════════════════════════════════════════════  │
│                                                      │
│  🎨 Open Materials Rules                            │
│  🌐 Public                                           │
│  ─────────────────────────────────────────────────  │
│  [Rendered Markdown Content]                        │
│                                                      │
│  Version 2 • Last updated: Oct 22, 2025             │
│                                                      │
│  ═════════════════════════════════════════════════  │
│                                                      │
│  📍 Backstage Arrival Instructions                  │
│  👤 Artists Only                                     │
│  ─────────────────────────────────────────────────  │
│  [Rendered Markdown Content]                        │
│                                                      │
│  Version 1 • Last updated: Oct 21, 2025             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Key Features**:
- Emoji icons for visual categorization
- Visibility badges clearly marked
- Fully rendered markdown with formatting
- Version and update timestamp for each specific
- Separators between different specifics

---

## Public/Audience Access

Public viewers (broadcast app, general website visitors) have limited access to competition specifics.

### Access Point

**Art Battle Broadcast** → **Rules Tab**

### What's Different from Artist Access

1. **No Authentication Required**: Truly public endpoint
2. **Public Only**: Only sees specifics marked as `public`
3. **Cached**: Responses cached for 5 minutes for performance
4. **No Audit Logging**: Public views are not tracked individually

### Technical Implementation

- Uses separate edge function: `public-get-event-competition-specifics`
- Deployed with `--no-verify-jwt` flag
- Uses service role key internally to bypass RLS
- Includes `Cache-Control: public, max-age=300` headers
- Optimized for CDN caching

### Display Format

Same visual format as artist view, but:
- Only shows 🌐 Public specifics
- No 👤 Artists Only content visible
- Same markdown rendering and version tracking

---

## Audit Logging & Tracking

Every time an authenticated artist views competition specifics, a detailed audit log is created.

### What Gets Logged

#### Artist Information
- `artist_profile_id`: Links to their artist profile
- `user_id`: Links to their auth account
- `user_email`: Email address for easy reference

#### Event Context
- `event_id`: UUID of the event
- `event_eid`: Human-readable event ID (e.g., "AB3032")
- `event_name`: Full event name

#### What They Viewed
- `specifics_viewed`: **Complete JSON array** of each specific:
  ```json
  [
    {
      "id": "uuid",
      "name": "Open Materials Rules",
      "visibility": "public",
      "version": 2
    },
    {
      "id": "uuid",
      "name": "Backstage Info",
      "visibility": "artists_only",
      "version": 1
    }
  ]
  ```
- `specifics_count`: Number of specifics shown

#### Session Metadata
- `ip_address`: Extracted from `X-Forwarded-For` header
- `user_agent`: Full browser/device string
- `viewed_at`: Precise UTC timestamp

### Example Audit Log Entry

```json
{
  "id": "f10e236a-e4ce-4148-92d3-7ef0ab6a192c",
  "artist_profile_id": "artist-uuid",
  "event_id": "event-uuid",
  "user_id": "user-uuid",
  "user_email": "artist@example.com",
  "event_eid": "AB3032",
  "event_name": "AB3032 – San Francisco City Championship",
  "specifics_viewed": [
    {
      "id": "ef468aa7-72a9-4933-9649-7609e7d91877",
      "name": "Test artists only",
      "visibility": "artists_only",
      "version": 1
    },
    {
      "id": "d73707ec-9391-4c8c-9528-7200fca14d5f",
      "name": "Open Materials Rules",
      "visibility": "public",
      "version": 2
    },
    {
      "id": "e47be6de-4387-4d7e-adc4-e4a8c4c96a82",
      "name": "Championship Finals Timing",
      "visibility": "public",
      "version": 3
    }
  ],
  "specifics_count": 3,
  "ip_address": "216.58.113.147",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "viewed_at": "2025-10-22T23:50:40.277536Z"
}
```

### Querying Audit Logs

#### Example: Recent Views
```sql
SELECT
  viewed_at,
  user_email,
  event_eid,
  event_name,
  specifics_count
FROM competition_specifics_view_log
ORDER BY viewed_at DESC
LIMIT 20;
```

#### Example: Specific Artist's Views
```sql
SELECT
  viewed_at,
  event_name,
  specifics_count,
  specifics_viewed
FROM competition_specifics_view_log
WHERE user_email = 'artist@example.com'
ORDER BY viewed_at DESC;
```

#### Example: Event Analytics
```sql
SELECT
  event_name,
  COUNT(*) as total_views,
  COUNT(DISTINCT user_email) as unique_artists,
  MIN(viewed_at) as first_view,
  MAX(viewed_at) as last_view
FROM competition_specifics_view_log
WHERE event_eid = 'AB3032'
GROUP BY event_name;
```

### Reproducing What Artists Saw

The audit log captures the **exact version** of each specific, allowing perfect reproduction:

```sql
-- Get what a specific artist saw at a specific time
SELECT
  cs.name,
  cs.version,
  cs.content,
  cs.visibility,
  cs.updated_at
FROM competition_specifics cs
WHERE cs.id IN (
  SELECT (jsonb_array_elements(specifics_viewed)->>'id')::uuid
  FROM competition_specifics_view_log
  WHERE id = 'f10e236a-e4ce-4148-92d3-7ef0ab6a192c'
)
ORDER BY
  CASE cs.id
    WHEN 'ef468aa7-72a9-4933-9649-7609e7d91877' THEN 1
    WHEN 'd73707ec-9391-4c8c-9528-7200fca14d5f' THEN 2
    WHEN 'e47be6de-4387-4d7e-adc4-e4a8c4c96a82' THEN 3
  END;
```

This ensures you can always prove exactly what information was provided to an artist at any point in time.

### Use Cases for Audit Logs

1. **Compliance**: Prove what rules were shown to artists
2. **Disputes**: Resolve disagreements about provided information
3. **Analytics**: Track engagement with event information
4. **Improvements**: Identify which specifics artists view most
5. **Legal**: Timestamped proof of information disclosure
6. **Behavior Analysis**: See when artists typically review rules (day before event, week before, etc.)

---

## Database Schema

### Core Tables

#### `competition_specifics`
Stores the master library of reusable specifics.

```sql
CREATE TABLE competition_specifics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('public', 'artists_only')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES people(id),
  is_deleted boolean DEFAULT false
);
```

#### `event_competition_specifics`
Links specifics to specific events with ordering.

```sql
CREATE TABLE event_competition_specifics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  competition_specific_id uuid REFERENCES competition_specifics(id),
  display_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES people(id),
  UNIQUE(event_id, competition_specific_id)
);
```

#### `competition_specifics_view_log`
Audit trail of all artist views.

```sql
CREATE TABLE competition_specifics_view_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_profile_id uuid REFERENCES artist_profiles(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL,

  -- What they viewed
  specifics_viewed jsonb NOT NULL,
  specifics_count int NOT NULL DEFAULT 0,

  -- Metadata
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  event_eid text,
  event_name text,

  -- Session tracking
  ip_address text,
  user_agent text,

  created_at timestamp with time zone DEFAULT now() NOT NULL
);
```

### Indexes

Optimized for common query patterns:

```sql
-- Competition specifics
CREATE INDEX idx_comp_spec_visibility ON competition_specifics(visibility);
CREATE INDEX idx_comp_spec_deleted ON competition_specifics(is_deleted);

-- Event specifics
CREATE INDEX idx_event_comp_spec_event ON event_competition_specifics(event_id);
CREATE INDEX idx_event_comp_spec_order ON event_competition_specifics(event_id, display_order);

-- View logs
CREATE INDEX idx_comp_spec_view_log_artist ON competition_specifics_view_log(artist_profile_id);
CREATE INDEX idx_comp_spec_view_log_event ON competition_specifics_view_log(event_id);
CREATE INDEX idx_comp_spec_view_log_viewed_at ON competition_specifics_view_log(viewed_at DESC);
CREATE INDEX idx_comp_spec_view_log_user ON competition_specifics_view_log(user_id);
```

### Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:

```sql
-- View logs: Service role full access
CREATE POLICY "Service role full access to view log"
  ON competition_specifics_view_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- View logs: Artists can read their own
CREATE POLICY "Artists can read own view logs"
  ON competition_specifics_view_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- View logs: Admins can read all
CREATE POLICY "Admins can read all view logs"
  ON competition_specifics_view_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM abhq_admin_users
      WHERE user_id = auth.uid()
      AND active = true
    )
  );
```

---

## Edge Functions

### 1. Admin Functions

#### `get-competition-specifics`
**Purpose**: Fetch all available specifics for admin management
**Auth**: Admin JWT required
**Returns**: All competition specifics with full details

#### `create-competition-specific`
**Purpose**: Create new competition specific
**Auth**: Admin JWT required (producer or super)
**Handles**: Foreign key constraints gracefully (checks if user exists in people table)

```typescript
// Check if user exists in people table first
const { data: person } = await supabase
  .from('people')
  .select('id')
  .eq('id', user.id)
  .maybeSingle();

// Only add created_by if person exists
if (person) {
  insertData.created_by = user.id;
}
```

#### `update-competition-specific`
**Purpose**: Update existing specific (increments version)
**Auth**: Admin JWT required (producer or super)
**Returns**: Updated specific with new version number

#### `get-event-competition-specifics`
**Purpose**: Fetch specifics assigned to an event
**Auth**: Admin JWT required
**Params**: `event_id` (UUID)
**Returns**: Ordered list of specifics for event

#### `set-event-competition-specifics`
**Purpose**: Assign/reorder specifics for an event
**Auth**: Admin JWT required
**Params**: `event_id`, `specifics` array with `competition_specific_id` and `display_order`

### 2. Artist Function

#### `artist-get-event-competition-specifics`
**Purpose**: Fetch and log when artists view specifics
**Auth**: Artist JWT required
**Params**: `event_id` or `event_eid`
**Returns**: Both public AND artists_only specifics
**Side Effect**: Creates audit log entry

**Implementation Flow**:
```typescript
// 1. Authenticate user
const { user } = await supabase.auth.getUser(token);

// 2. Fetch specifics (public + artists_only)
const { data: eventSpecifics } = await supabase
  .from('event_competition_specifics')
  .select(`
    display_order,
    competition_specifics!inner (
      id, name, content, visibility, version, updated_at
    )
  `)
  .eq('event_id', eventId)
  .in('competition_specifics.visibility', ['public', 'artists_only'])
  .order('display_order');

// 3. Log the view (non-blocking)
try {
  // Try to find artist profile
  const { data: artistProfile } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('person_id', user.id)
    .eq('is_primary', true)
    .maybeSingle();

  // Get request metadata
  const userAgent = req.headers.get('user-agent') || null;
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

  // Insert audit log
  await supabase
    .from('competition_specifics_view_log')
    .insert({
      artist_profile_id: artistProfile?.id || null,
      event_id: eventId,
      user_id: user.id,
      user_email: user.email,
      event_eid: eventInfo?.eid || eid,
      event_name: eventInfo?.name || null,
      specifics_viewed: specifics.map(s => ({
        id: s.id,
        name: s.name,
        visibility: s.visibility,
        version: s.version
      })),
      specifics_count: specifics.length,
      ip_address: ipAddress,
      user_agent: userAgent
    });

  console.log('Logged view for:', user.email);
} catch (logError) {
  // Don't fail request if logging fails
  console.error('Logging failed:', logError);
}

// 4. Return specifics to artist
return { success: true, event, specifics };
```

### 3. Public Function

#### `public-get-event-competition-specifics`
**Purpose**: Public access to event specifics
**Auth**: None required (deployed with `--no-verify-jwt`)
**Params**: `eid` (event EID like "AB3032")
**Returns**: Only PUBLIC specifics
**Caching**: 5-minute cache via `Cache-Control` headers
**No Logging**: Public views not tracked individually

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, max-age=300' // 5 minutes
};

// Filter to public only
const { data: eventSpecifics } = await supabase
  .from('event_competition_specifics')
  .select('...')
  .eq('event_id', eventId)
  .eq('competition_specifics.visibility', 'public') // PUBLIC ONLY
  .order('display_order');
```

---

## Best Practices

### For Admins

#### Creating Specifics

1. **Use Clear Names**: Make names searchable and descriptive
   - ✅ "Championship Finals Timing"
   - ❌ "Rules 1"

2. **Choose Visibility Carefully**:
   - Use `public` for general competition rules everyone should see
   - Use `artists_only` for sensitive operational details

3. **Write Clear Markdown**:
   ```markdown
   # Main Section Title

   ## Subsection

   - Bullet points for lists
   - **Bold** for emphasis
   - Use separators (`---`) to break up sections

   **Special Notes**
   Important information in bold
   ```

4. **Version Notes**: Document what changed when updating

#### Assigning to Events

1. **Order Matters**: Put most important/general rules first
2. **Review Before Approving**: Use Preview to verify artist view
3. **Check Event Info Panel**: Verify correct specifics are listed
4. **Seasonal Updates**: Review and update specifics quarterly

#### Managing Changes

1. **Edit Globally**: Editing a specific updates it for ALL events using it
2. **Event-Specific Needs**: Create a new specific if one event needs different rules
3. **Soft Delete**: Use `is_deleted` flag instead of hard deleting

### For System Maintenance

#### Monitoring Audit Logs

```sql
-- Daily summary
SELECT
  DATE(viewed_at) as date,
  COUNT(*) as total_views,
  COUNT(DISTINCT user_email) as unique_artists,
  COUNT(DISTINCT event_eid) as events_viewed
FROM competition_specifics_view_log
WHERE viewed_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(viewed_at)
ORDER BY date DESC;

-- Artists who haven't viewed specifics for their upcoming events
SELECT
  ea.artist_profile_id,
  ap.name,
  e.eid,
  e.name as event_name,
  e.event_start_datetime
FROM event_artists ea
JOIN artist_profiles ap ON ea.artist_profile_id = ap.id
JOIN events e ON ea.event_id = e.id
LEFT JOIN competition_specifics_view_log vl
  ON vl.event_id = e.id
  AND vl.artist_profile_id = ea.artist_profile_id
WHERE e.event_start_datetime > NOW()
  AND e.event_start_datetime < NOW() + INTERVAL '7 days'
  AND vl.id IS NULL
  AND ea.status = 'confirmed';
```

#### Performance Monitoring

```sql
-- Check view log growth
SELECT
  COUNT(*) as total_logs,
  MIN(viewed_at) as first_log,
  MAX(viewed_at) as latest_log,
  COUNT(*) / EXTRACT(EPOCH FROM (MAX(viewed_at) - MIN(viewed_at))) * 3600 as logs_per_hour
FROM competition_specifics_view_log;

-- Find specifics that are viewed most
SELECT
  jsonb_array_elements(specifics_viewed)->>'name' as specific_name,
  COUNT(*) as view_count
FROM competition_specifics_view_log
GROUP BY specific_name
ORDER BY view_count DESC
LIMIT 10;
```

---

## Troubleshooting

### Artists Can't See Specifics

1. **Check Event Assignment**: Is specific assigned to event?
   ```sql
   SELECT * FROM event_competition_specifics
   WHERE event_id = 'event-uuid';
   ```

2. **Check Visibility**: Is it marked `artists_only` but artist not authenticated?

3. **Check Function Deployment**:
   ```bash
   supabase functions list | grep artist-get
   ```

4. **Check RLS Policies**: Verify policies are correctly configured

### Audit Logs Not Recording

1. **Check Table Exists**:
   ```sql
   SELECT * FROM information_schema.tables
   WHERE table_name = 'competition_specifics_view_log';
   ```

2. **Check Function Code**: Verify logging code is present

3. **Check Permissions**: Verify service role can insert:
   ```sql
   SELECT * FROM pg_policies
   WHERE tablename = 'competition_specifics_view_log';
   ```

4. **Test Manually**:
   ```sql
   INSERT INTO competition_specifics_view_log
   (user_email, event_eid, specifics_viewed, specifics_count)
   VALUES ('test@test.com', 'AB0000', '[]'::jsonb, 0);
   ```

### Version Confusion

Query specific version from audit log:
```sql
SELECT
  cs.name,
  cs.version,
  cs.content,
  vl.viewed_at,
  vl.user_email
FROM competition_specifics_view_log vl,
  jsonb_array_elements(vl.specifics_viewed) as spec
JOIN competition_specifics cs ON cs.id = (spec->>'id')::uuid
WHERE vl.id = 'log-uuid'
  AND cs.version = (spec->>'version')::int;
```

---

## Security Considerations

### Data Privacy

1. **PII**: Artist email stored in logs for admin use only
2. **IP Addresses**: Logged for security, not exposed to artists
3. **Retention**: Consider auto-archival of logs >1 year old

### Access Control

1. **Admin Functions**: Require `abhq_admin_users` check
2. **Artist Functions**: Require valid JWT with email matching
3. **Public Functions**: No auth, but limited to public data only

---

## Future Enhancements

1. **Email Notifications**: Alert artists when rules change
2. **Read Receipts**: Track confirmation of reading
3. **Multi-language Support**: Translate specifics
4. **Rich Media**: Support images, videos in content
5. **Templates**: Pre-built templates for common event types
6. **Change History**: Full version history with diffs
7. **Approval Workflow**: Require approval before publishing changes
8. **Artist Acknowledgment**: Checkbox requiring confirmation

---

## Conclusion

The Competition Specifics System provides a robust, scalable solution for managing event rules and information across the Art Battle platform. With comprehensive audit logging, you can:

✅ **Track Engagement**: Know exactly when artists view information
✅ **Ensure Compliance**: Prove what was shown and when
✅ **Resolve Disputes**: Reproduce exact rules shown at any time
✅ **Analyze Behavior**: Understand how artists prepare for events
✅ **Maintain Quality**: Single source of truth for all event rules

---

**Document Version**: 1.0
**Last Updated**: October 22, 2025
**Status**: Complete & Deployed
**Maintained By**: Art Battle Development Team
