# Competition Specifics System - Implementation Documentation

**Date:** October 21, 2025
**Project:** Art Battle Vote26
**Feature:** Competition Specifics Management System
**Status:** 90% Complete (Deployment pending)

---

## Table of Contents

1. [Overview & Goals](#overview--goals)
2. [Data Models](#data-models)
3. [Architecture](#architecture)
4. [User Interfaces](#user-interfaces)
5. [Implementation Details](#implementation-details)
6. [Usage Examples](#usage-examples)
7. [Deployment Instructions](#deployment-instructions)
8. [Future Enhancements](#future-enhancements)

---

## Overview & Goals

### Problem Statement

Art Battle events have varying competition formats, rules, and venue-specific instructions that need to be communicated to artists. Previously, this information was scattered or inconsistent, leading to:
- Artists missing important event-specific details
- Producers manually communicating the same rules repeatedly
- Difficulty maintaining up-to-date information across multiple events
- No centralized system for venue-specific arrival instructions

### Solution

A flexible, reusable "Competition Specifics" system that allows:

1. **Reusability**: Create once, use across multiple events
2. **Composability**: Combine multiple specifics per event (e.g., "Open Materials Rules" + "Championship Timing" + "Toronto Venue Instructions")
3. **Ordering**: Control display order (most specific → general)
4. **Versioning**: Track changes over time with automatic history
5. **Visibility Control**: Public vs. Artists-only content
6. **Multi-Platform**: Admin management, artist viewing, public broadcast display

### Design Principles

- **Additive Inheritance Model**: Events reference multiple specifics, combined and ordered
- **Markdown Content**: Rich text formatting for rules, lists, headings
- **Many-to-Many**: Specifics can be shared across events
- **Drag-and-Drop Ordering**: Intuitive UI for arrangement
- **Historical Versions**: Never lose previous versions (audit trail)

---

## Data Models

### Database Schema

#### 1. `competition_specifics` Table

Primary table storing reusable competition information blocks.

```sql
CREATE TABLE competition_specifics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- e.g., "Open Materials Rules"
  content TEXT NOT NULL,                 -- Markdown formatted content
  visibility TEXT NOT NULL               -- 'public' | 'artists_only'
    CHECK (visibility IN ('public', 'artists_only')),
  version INTEGER NOT NULL DEFAULT 1,    -- Auto-incremented on updates
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES people(id),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_competition_specifics_name ON competition_specifics(name);
CREATE INDEX idx_competition_specifics_deleted ON competition_specifics(is_deleted);
```

**Key Fields:**
- `name`: Display name (e.g., "Championship Finals Timing")
- `content`: Markdown text (supports headings, lists, bold, links, etc.)
- `visibility`: Controls who can see it
- `version`: Auto-incremented via trigger on content changes
- `is_deleted`: Soft delete flag

#### 2. `competition_specifics_history` Table

Stores historical versions for audit trail.

```sql
CREATE TABLE competition_specifics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_specific_id UUID NOT NULL
    REFERENCES competition_specifics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES people(id)
);

CREATE INDEX idx_competition_specifics_history_specific_id
  ON competition_specifics_history(competition_specific_id);
```

**Automatic History Saving:**
- Database trigger automatically saves old version before update
- Captures name, content, visibility changes
- Preserves exact timestamp and version number

#### 3. `event_competition_specifics` Junction Table

Many-to-many relationship linking events to specifics with ordering.

```sql
CREATE TABLE event_competition_specifics (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  competition_specific_id UUID NOT NULL
    REFERENCES competition_specifics(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 1,  -- 1 = shown first
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES people(id),
  PRIMARY KEY (event_id, competition_specific_id)
);

CREATE INDEX idx_event_competition_specifics_event_id
  ON event_competition_specifics(event_id);
```

**Key Design:**
- `display_order`: Lower numbers shown first (1 = most specific, 3 = base rules)
- Composite primary key prevents duplicates
- Cascade delete: removing event removes associations

### Row Level Security (RLS)

**Public Access:**
- Can view `visibility = 'public'` specifics
- Can view event associations for public events

**Artist Access:**
- Can view all specifics for their confirmed events
- Respects visibility flag (public + artists_only)

**Producer/Admin Access:**
- Full CRUD on all specifics
- Can create, update, delete
- Can assign to events and reorder

### Database Triggers

**1. Auto-Update Timestamp:**
```sql
CREATE TRIGGER competition_specifics_updated_at
  BEFORE UPDATE ON competition_specifics
  FOR EACH ROW
  EXECUTE FUNCTION update_competition_specifics_updated_at();
```

**2. Auto-Save History:**
```sql
CREATE TRIGGER competition_specifics_history_trigger
  BEFORE UPDATE ON competition_specifics
  FOR EACH ROW
  EXECUTE FUNCTION save_competition_specifics_history();
```
- Only saves if content, name, or visibility changed
- Increments version number automatically
- Stores old version before applying changes

---

## Architecture

### Technology Stack

**Backend:**
- PostgreSQL (database)
- Supabase Edge Functions (Deno runtime)
- Row Level Security (RLS) for permissions

**Frontend:**
- React 19
- Radix UI components
- react-markdown + remark-gfm (markdown rendering)
- Native HTML5 drag-and-drop API

### Edge Functions

Location: `/root/vote_app/vote26/supabase/functions/`

#### 1. `get-competition-specifics`
**Purpose:** List all available specifics (admin only)
**Auth:** Required (producer/admin)
**Returns:** Array of all non-deleted specifics

```typescript
GET /functions/v1/get-competition-specifics
Authorization: Bearer <token>

Response:
{
  success: true,
  specifics: [
    {
      id: "uuid",
      name: "Open Materials Rules",
      content: "# Art Battle Rules\n...",
      visibility: "public",
      version: 1,
      updated_at: "2025-10-21T..."
    },
    ...
  ]
}
```

#### 2. `create-competition-specific`
**Purpose:** Create new specific
**Auth:** Required (producer/admin)

```typescript
POST /functions/v1/create-competition-specific
Authorization: Bearer <token>
Body: {
  name: "New Rule Set",
  content: "# Rules\n...",
  visibility: "public" | "artists_only"
}

Response:
{
  success: true,
  specific: { id, name, content, ... }
}
```

#### 3. `update-competition-specific`
**Purpose:** Update existing specific (auto-saves history)
**Auth:** Required (producer/admin)

```typescript
POST /functions/v1/update-competition-specific
Authorization: Bearer <token>
Body: {
  id: "uuid",
  name?: "Updated Name",
  content?: "# Updated content...",
  visibility?: "public"
}

Response:
{
  success: true,
  specific: { id, name, content, version: 2, ... }
}
```
*Note: Version auto-incremented, history saved via trigger*

#### 4. `get-event-competition-specifics`
**Purpose:** Get all specifics for an event (public/anon allowed)
**Auth:** Optional (respects visibility)

```typescript
POST /functions/v1/get-event-competition-specifics
Body: {
  event_id?: "uuid",
  event_eid?: "event-code"
}

Response:
{
  success: true,
  specifics: [
    {
      id: "uuid",
      name: "Venue Instructions",
      content: "...",
      visibility: "artists_only",
      display_order: 1,
      version: 1,
      updated_at: "..."
    },
    ...
  ]
}
```
*Ordered by display_order ASC*

#### 5. `set-event-competition-specifics`
**Purpose:** Set event's specifics with ordering (replaces all)
**Auth:** Required (producer/admin)

```typescript
POST /functions/v1/set-event-competition-specifics
Authorization: Bearer <token>
Body: {
  event_id: "uuid",
  specifics: [
    { competition_specific_id: "uuid1", display_order: 1 },
    { competition_specific_id: "uuid2", display_order: 2 },
    { competition_specific_id: "uuid3", display_order: 3 }
  ]
}

Response:
{
  success: true,
  specifics: [ ... ]  // Returns updated list
}
```
*Deletes existing associations, creates new ones*

---

## User Interfaces

### 1. Admin Interface (`art-battle-admin`)

**Location:** Event Detail Page → "Competition Specifics" Tab

**Components:**
- `EventCompetitionSpecificsManager.jsx` - Main manager
- `CompetitionSpecificEditor.jsx` - Create/edit modal
- `MarkdownRenderer.jsx` - Shared renderer

**Features:**

**A. Library Management**
- Dropdown showing all available specifics
- Add existing specifics to event
- Create new specifics
- Edit any specific (opens modal)

**B. Event-Specific Ordering**
- Drag-and-drop reordering
- Visual handles (☰ icon)
- Real-time updates
- Auto-save on reorder

**C. Editor Modal**
- Two tabs: Edit (textarea) | Preview (rendered)
- Markdown syntax help
- Visibility selector (Public/Artists Only)
- Version display
- Live preview with styling

**D. Preview Mode**
- "Preview" button
- Shows exactly what artists see
- Ordered list with icons
- Markdown rendered

**UI Flow:**
```
Admin → Events → [Event Detail] → Competition Specifics Tab
  ├─ [+ Add existing specific] dropdown
  ├─ [+ Create New] button → Editor Modal
  ├─ Drag to reorder specifics
  ├─ [Edit] icon → Editor Modal
  ├─ [×] remove from event
  └─ [Preview] button → Preview Modal
```

### 2. Artist Interface (`art-battle-artists`)

**Components:**
- `CompetitionSpecificsModal.jsx` - Modal viewer
- `MarkdownRenderer.jsx` - Shared renderer

**Access Points:**

**A. Confirmed Events (Home.jsx)**
- "View Competition Specifics" button on each confirmed event card
- Opens modal showing all specifics for that event

**B. Invitation Acceptance Modal**
- "View Competition Specifics" button before accepting
- Helps artists understand requirements before confirming

**Features:**
- Read-only view
- Ordered display (most specific first)
- Icons based on content (📍 venue, ⏱️ timing, 🎨 rules)
- Markdown rendered
- Version info displayed
- Respects visibility (artists see both public + artists_only)

**UI Flow:**
```
Artist → Home → Confirmed Events
  └─ [View Competition Specifics] button
      └─ Modal shows:
          ├─ 📍 Toronto Venue Instructions (v1)
          ├─ ⏱️ Championship Finals Timing (v2)
          └─ 🎨 Open Materials Rules (v1)
```

### 3. Broadcast Interface (`art-battle-broadcast`)

**Component:** `RulesTab.jsx` (NEW - to be implemented)

**Location:** Event broadcast page → New "Rules" tab
(alongside Info / Auction / Vote tabs)

**Features:**
- Public display during live events
- Only shows `visibility = 'public'` specifics
- Same markdown rendering
- Auto-updates if admin changes during event
- Clean, readable layout for audience

**UI Flow:**
```
Broadcast → [Event] → Tabs
  ├─ Info
  ├─ Auction
  ├─ Vote
  └─ Rules (NEW)
      └─ Shows public competition specifics
```

---

## Implementation Details

### Seeded Default Specifics

Four default specifics created during migration:

#### 1. Open Materials Rules
```markdown
# Art Battle Rules

**Art Battle Open Materials Rules
Updated June 2023**

1. Artists have 20 minutes to create their competition artwork...
2. Artists must use the blank canvas provided...
3. The artwork must be placed on the easel...
4. Artists are encouraged to bring their own mediums and tools...
5. The use of reference images are permitted...
6. Pre-made images (collage), including stencils, are not permitted...
7. The local/global audience votes for the best artwork...
```
**Visibility:** Public

#### 2. Regular Season Event Timing
```markdown
# Regular Season Event Format

**Round Structure**
- All rounds: 20 minutes per round
- Number of artists: Typically 12 artists
- Format: 3 preliminary rounds of 4 artists each
- Advancement: Top 2 from each preliminary round advance
- Canvas size: 16" × 20" (standard)

**Schedule**
Artists should arrive 30 minutes before event start time...
```
**Visibility:** Public

#### 3. Championship Finals Timing
```markdown
# Championship Event Format

**Round Structure**
- Preliminary rounds: 20 minutes per round
- Final round: 30 minutes
- Number of artists: Varies by championship level
- Canvas size: 16" × 20" (standard)

**Special Notes**
The extended final round allows for more detailed artwork...
```
**Visibility:** Public

#### 4. Masters 2×45 Format
```markdown
# Art Battle Masters Format

**Special Extended Format**
- Number of artists: 6 artists painting simultaneously
- Duration: 90 minutes total (2 × 45 minutes)
- Intermission: 15-minute break at 45-minute mark
- Canvas size: 24" × 30" (larger format)

**Format Details**
This is a special extended format featuring 6 accomplished artists...

**What to Bring**
Due to the larger canvas and extended time:
- Bring sufficient materials for 90-minute session...
```
**Visibility:** Public

### Markdown Rendering

**Component:** `MarkdownRenderer.jsx`

**Libraries:**
- `react-markdown` - Core markdown parser
- `remark-gfm` - GitHub Flavored Markdown support

**Custom Styling:**
- H1, H2, H3: Bold, sized headings
- Lists: Proper indentation, bullet/number styles
- Links: Blue, underlined, open in new tab
- Code: Gray background, monospace
- Strong/Em: Bold/italic
- HR: Gray line separator

**Example:**
```jsx
<MarkdownRenderer content={specificContent} />
```

### Drag-and-Drop Implementation

**API:** Native HTML5 Drag and Drop

**Events Used:**
- `onDragStart` - Captures index of dragged item
- `onDragOver` - Allows drop, reorders array in real-time
- `onDragEnd` - Saves to server

**State Management:**
```javascript
const [draggedIndex, setDraggedIndex] = useState(null);

handleDragStart(e, index) {
  setDraggedIndex(index);
}

handleDragOver(e, index) {
  // Reorder array, swap positions
  // Update display_order for all items
}

handleDragEnd() {
  // Save new order to database
  await saveEventSpecifics(eventSpecifics);
}
```

**Visual Feedback:**
- Cursor: `cursor: move`
- Dragging: `opacity: 0.5, border: 2px dashed blue`
- Handle icon: ☰ `<DragHandleHorizontalIcon />`

---

## Usage Examples

### Example 1: Standard Regular Season Event

**Scenario:** Producer setting up a typical Toronto regular season event

**Steps:**
1. Admin → Events → Toronto May 2025 → Competition Specifics Tab
2. Click dropdown "Add existing specific"
3. Select "Regular Season Event Timing" (adds to event)
4. Select "Open Materials Rules" (adds to event)
5. Drag "Regular Season" to position 1 (shows first)
6. Drag "Open Materials" to position 2 (shows second)
7. Auto-saved

**Result for Artists:**
- View shows 2 specifics in order
- Regular Season timing info first
- General rules second

### Example 2: Championship with Venue Instructions

**Scenario:** Championship event at new venue with special arrival instructions

**Steps:**
1. Admin → Events → Vancouver Championship → Competition Specifics Tab
2. Click "Create New"
3. Name: "Vancouver Convention Centre Instructions"
4. Content:
   ```markdown
   # Venue Arrival Instructions

   **Location**
   Vancouver Convention Centre, West Building
   1055 Canada Place, Vancouver, BC

   **Parking**
   Use underground parkade, entrance on Thurlow St
   Validation available at check-in

   **Artist Load-In**
   - Arrive at 5:30 PM
   - Use service entrance (northwest side)
   - Check in at Artist Registration desk
   ```
5. Visibility: Artists Only
6. Save
7. Add to event (now appears in dropdown)
8. Also add "Championship Finals Timing" and "Open Materials Rules"
9. Drag to order:
   - Position 1: Vancouver Instructions (most specific)
   - Position 2: Championship Timing
   - Position 3: Open Materials (base rules)

**Result for Artists:**
- See 3 specifics, venue info first
- Clear arrival instructions
- Understand extended final round timing
- Know general materials rules

### Example 3: Public vs Artists-Only

**Scenario:** Event with internal artist guidelines not meant for public

**Setup:**
1. Create "Artist Payment Process" (Visibility: Artists Only)
2. Create "Event Schedule" (Visibility: Public)
3. Add both to event

**Public Broadcast:**
- Shows only "Event Schedule"
- "Artist Payment Process" hidden

**Artists:**
- See both specifics
- Get complete information

---

## Deployment Instructions

### Phase 1: Database Migration (COMPLETED)

```bash
cd /root/vote_app/vote26
PGPASSWORD='6kEtvU9n0KhTVr5' psql \
  -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -f migrations/20251021_competition_specifics.sql

# Run seed data
psql ... -f migrations/20251021_competition_specifics_seed.sql
```

**Verify:**
```sql
SELECT name, visibility FROM competition_specifics;
-- Should show 4 rows
```

### Phase 2: Deploy Edge Functions (PENDING)

```bash
cd /root/vote_app/vote26/supabase

# Deploy each function
supabase functions deploy get-competition-specifics
supabase functions deploy create-competition-specific
supabase functions deploy update-competition-specific
supabase functions deploy get-event-competition-specifics
supabase functions deploy set-event-competition-specifics
```

**Test:**
```bash
# Test get endpoint
curl -X POST https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/get-event-competition-specifics \
  -H "Content-Type: application/json" \
  -d '{"event_eid":"some-event"}'
```

### Phase 3: Frontend Deployment

**Admin App:**
```bash
cd /root/vote_app/vote26/art-battle-admin
npm run build
# Deploy via existing process
```

**Artists App:**
```bash
cd /root/vote_app/vote26/art-battle-artists
./deploy.sh
```

**Broadcast App:**
```bash
cd /root/vote_app/vote26/art-battle-broadcast
# Deploy via existing process
```

### Rollback Plan

If issues arise:

```sql
-- Rollback database
DROP TABLE IF EXISTS event_competition_specifics CASCADE;
DROP TABLE IF EXISTS competition_specifics_history CASCADE;
DROP TABLE IF EXISTS competition_specifics CASCADE;
```

Frontend: Deploy previous versions from git

---

## Future Enhancements

### Phase 2 Features (Potential)

1. **Template System**
   - Save common combinations as templates
   - "Regular Event Template" = Regular Timing + Open Materials
   - One-click apply to new events

2. **Rich Media Support**
   - Embed images in specifics
   - Upload venue maps
   - Video instructions

3. **Localization**
   - Multi-language support
   - Auto-translate specifics
   - Language selector in UI

4. **Conditional Display**
   - Show specifics based on artist level
   - Different rules for first-time vs veterans
   - Conditional content blocks

5. **Notifications**
   - Alert artists when specifics change
   - Email digest of updates
   - Push notifications for critical changes

6. **Analytics**
   - Track which specifics are most used
   - View counts per specific
   - Identify outdated content

7. **Version Restore**
   - UI to view historical versions
   - Restore previous version
   - Compare versions side-by-side

8. **Bulk Operations**
   - Apply same specifics to multiple events
   - Bulk update content across events
   - Clone event specifics setup

---

## Technical Decisions & Rationale

### Why Markdown?
- **Familiarity**: Developers and power users know it
- **Simplicity**: Plain text, version control friendly
- **Flexibility**: Headings, lists, bold, links without HTML
- **Security**: Safer than allowing HTML input
- **Rendering**: Excellent libraries (react-markdown)

### Why Many-to-Many vs Inheritance?
- **Flexibility**: Events can mix-and-match any combination
- **Simplicity**: No complex inheritance chains
- **Reusability**: One specific used by hundreds of events
- **Performance**: Single query gets all event specifics
- **UI**: Easier to visualize and manage

### Why Display Order vs Auto-Sort?
- **Control**: Producers decide what's most important
- **Context**: Venue instructions should be first for on-site events
- **Predictability**: Artists always see same order
- **Flexibility**: Can change emphasis without editing content

### Why Version History?
- **Audit Trail**: See who changed what when
- **Compliance**: Required for some legal agreements
- **Recovery**: Accidentally deleted content recoverable
- **Trust**: Artists see version numbers, know it's current

---

## File Manifest

### Database
- `/root/vote_app/vote26/migrations/20251021_competition_specifics.sql`
- `/root/vote_app/vote26/migrations/20251021_competition_specifics_seed.sql`

### Edge Functions
- `/root/vote_app/vote26/supabase/functions/get-competition-specifics/index.ts`
- `/root/vote_app/vote26/supabase/functions/create-competition-specific/index.ts`
- `/root/vote_app/vote26/supabase/functions/update-competition-specific/index.ts`
- `/root/vote_app/vote26/supabase/functions/get-event-competition-specifics/index.ts`
- `/root/vote_app/vote26/supabase/functions/set-event-competition-specifics/index.ts`

### Admin Components
- `/root/vote_app/vote26/art-battle-admin/src/components/MarkdownRenderer.jsx`
- `/root/vote_app/vote26/art-battle-admin/src/components/CompetitionSpecificEditor.jsx`
- `/root/vote_app/vote26/art-battle-admin/src/components/EventCompetitionSpecificsManager.jsx`
- `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx` (modified)

### Artist Components
- `/root/vote_app/vote26/art-battle-artists/src/components/MarkdownRenderer.jsx`
- `/root/vote_app/vote26/art-battle-artists/src/components/CompetitionSpecificsModal.jsx`
- `/root/vote_app/vote26/art-battle-artists/src/components/Home.jsx` (modified)
- `/root/vote_app/vote26/art-battle-artists/src/components/InvitationAcceptanceModal.jsx` (to be modified)

### Broadcast Components
- `/root/vote_app/vote26/art-battle-broadcast/src/components/MarkdownRenderer.jsx`
- `/root/vote_app/vote26/art-battle-broadcast/src/components/CompetitionSpecificsModal.jsx`
- `/root/vote_app/vote26/art-battle-broadcast/src/components/RulesTab.jsx` (to be created)

---

## Change Log

**2025-10-21 - Initial Implementation**
- Database schema created
- 4 default specifics seeded
- 5 edge functions implemented
- Admin UI complete
- Artist UI 95% complete
- Broadcast UI pending

**Next Steps:**
1. Add button to InvitationAcceptanceModal
2. Create RulesTab for broadcast
3. Deploy edge functions
4. QA testing
5. Production rollout

---

## Support & Questions

For questions about this system, contact:
- Technical: Development team
- Product: Event producers
- Documentation: This file

**Key Contacts:**
- Database: PostgreSQL + Supabase
- Frontend: React + Radix UI
- Deployment: Standard Art Battle deployment process

---

*End of Documentation*
