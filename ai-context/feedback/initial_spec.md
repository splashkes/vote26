# Art Battle Feedback System - Initial Specification

**Version:** 1.0
**Date:** October 15, 2025
**Status:** SPECIFICATION ONLY - DO NOT IMPLEMENT YET

---

## Table of Contents

1. [System Overview](#system-overview)
2. [User Types & Feedback Contexts](#user-types--feedback-contexts)
3. [Database Schema](#database-schema)
4. [Feedback Question Templates](#feedback-question-templates)
5. [UI Integration Points](#ui-integration-points)
6. [Slack Integration](#slack-integration)
7. [Incentive System](#incentive-system)
8. [Future Extensibility](#future-extensibility)
9. [Metrics & Analytics](#metrics--analytics)
10. [Implementation Phases](#implementation-phases)

---

## 1. System Overview

### Purpose
Collect structured and actionable feedback from multiple stakeholder types (artists, guests, auction buyers, producers) to:
- Measure Net Promoter Score (NPS) and satisfaction
- Identify pain points in the Art Battle experience
- Generate leads (venue suggestions, private event interest)
- Improve operations across events, technology, payments, and artist experience
- Collect demographic data (with incentives)

### Core Principles
- **Event-centric**: ~99% of feedback tied to specific events
- **Context-aware**: Different questions for different contexts
- **Structured feedback**: Primarily sliders (1-5), multiple choice, NPS
- **Follow-up enabled**: Users can request team follow-up (posts to Slack)
- **Incentivized**: Guests get free friend ticket for demographic data
- **Non-intrusive**: Can always be skipped, appears at logical moments

---

## 2. User Types & Feedback Contexts

### 2.1 Artists
**Primary System:** `art-battle-artists` (https://artb.art/profile/)

**Feedback Triggers:**
- **Post-Event (Primary)**: Modal pops up when accessing profile after event completion
- **On-Demand**: Always available via feedback info box on profile (like payment/info boxes)
- **Accessible Anytime**: Can provide feedback for any past event they participated in

**Feedback Categories:**
| Category | Description | Example Questions |
|----------|-------------|-------------------|
| Event Organization | Overall event quality | "How organized was the event?" (1-5) |
| Producer Communication | Producer responsiveness/professionalism | "How satisfied were you with producer communication?" (1-5) |
| Artwork Handling | Safety, storage, shipping | "How well was your artwork handled?" (1-5) |
| Technology | Voting system, app, display | "How smooth was the technology during the event?" (1-5) |
| Payment Ease | Payment timeliness, process | "How easy was it to receive payment?" (1-5) |
| Art Quality | Peer artist quality | "Quality of fellow artists" (1-5) |
| Venue Quality | Venue suitability | "How suitable was the venue?" (1-5) |
| Overall Experience | NPS-style | "How likely to participate again?" (1-10) |

**Follow-up Options:**
- "Request follow-up from Art Battle team" (checkbox)
- Free-text field: "What should we follow up about?"

---

### 2.2 Guests
**Primary System:** `art-battle-broadcast` (voting/auction interface)

**Feedback Triggers:**
- **Auction End (Primary)**: Modal pops up when auction ends AND guest is still in system
- **Broadcast Trigger**: Admin can broadcast feedback request to all connected guests simultaneously
- **Can Be Skipped**: Always dismissible

**Feedback Categories:**
| Category | Description | Example Questions |
|----------|-------------|-------------------|
| Event Experience | Overall enjoyment | "How would you rate tonight's event?" (1-5) |
| Art Quality | Artists and artwork | "Quality of the artwork" (1-5) |
| Venue Quality | Venue experience | "How was the venue?" (1-5) |
| Technology | Voting/auction experience | "How easy was it to vote/bid?" (1-5) |
| Overall NPS | Recommendation likelihood | "How likely to recommend Art Battle?" (1-10) |
| Lead Generation | Business opportunities | "Would you like a private Art Battle event?" (Yes/No) |
| Venue Leads | Better venue suggestions | "Know a better venue? Share details" (text) |

**Demographic Data Collection (Incentivized):**
In exchange for **free friend ticket**:
- Age range (dropdown: 18-24, 25-34, 35-44, 45-54, 55-64, 65+)
- Gender (dropdown: Male, Female, Non-binary, Prefer not to say)
- Occupation/Industry (dropdown or text)
- How did you hear about us? (dropdown: Friend, Social Media, Event Listing, etc.)
- Zip/Postal Code (text)

---

### 2.3 Future User Types (Extensibility)

#### Auction Buyers
**System:** TBD (likely `art-battle-broadcast` or post-purchase email)
**Triggers:** After purchase, after delivery
**Categories:** Purchase experience, artwork quality, delivery, payment ease

#### Producers (Local Event Organizers)
**System:** TBD (likely admin interface or email)
**Triggers:** Post-event wrap-up
**Categories:** Artist quality, HQ support, technology, payment processing, marketing support

---

## 3. Database Schema

### 3.1 Core Tables

#### `feedback_submissions`
Primary table storing all feedback submissions.

```sql
CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context
  event_id UUID REFERENCES events(id),           -- Event this feedback is about (nullable for general feedback)
  event_eid VARCHAR REFERENCES events(eid),      -- Denormalized for easier querying
  feedback_context VARCHAR NOT NULL,             -- 'post_event', 'on_demand', 'auction_end', 'broadcast_trigger'

  -- Respondent (polymorphic - could be artist, guest, buyer, producer)
  respondent_type VARCHAR NOT NULL,              -- 'artist', 'guest', 'auction_buyer', 'producer'
  person_id UUID REFERENCES people(id),          -- NULL if anonymous
  artist_profile_id UUID REFERENCES artist_profiles(id), -- If respondent is artist

  -- Submission metadata
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,

  -- Follow-up
  requests_followup BOOLEAN DEFAULT FALSE,
  followup_message TEXT,
  followup_status VARCHAR DEFAULT 'pending',     -- 'pending', 'contacted', 'resolved', 'no_action_needed'
  followup_slack_ts VARCHAR,                     -- Slack thread timestamp for tracking

  -- Structured responses (JSONB for flexibility)
  responses JSONB NOT NULL,                      -- { "question_id": response_value, ... }

  -- Demographic data (for guests)
  demographic_data JSONB,                        -- { "age_range": "25-34", "gender": "Female", ... }

  -- Internal tracking
  sentiment_score NUMERIC,                       -- Future: AI sentiment analysis (-1 to 1)
  tags TEXT[],                                   -- Future: AI or manual tags ['payment_issue', 'venue_complaint']
  internal_notes TEXT,                           -- Staff notes

  -- Incentive tracking
  incentive_granted BOOLEAN DEFAULT FALSE,
  incentive_type VARCHAR,                        -- 'free_friend_ticket', null
  incentive_granted_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_event ON feedback_submissions(event_id);
CREATE INDEX idx_feedback_respondent ON feedback_submissions(person_id);
CREATE INDEX idx_feedback_artist ON feedback_submissions(artist_profile_id);
CREATE INDEX idx_feedback_type ON feedback_submissions(respondent_type);
CREATE INDEX idx_feedback_followup ON feedback_submissions(requests_followup) WHERE requests_followup = TRUE;
CREATE INDEX idx_feedback_submitted_at ON feedback_submissions(submitted_at DESC);
```

---

#### `feedback_question_templates`
Defines reusable question templates for different contexts.

```sql
CREATE TABLE feedback_question_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Question definition
  question_id VARCHAR UNIQUE NOT NULL,           -- 'artist_post_event_organization', 'guest_nps', etc.
  question_text TEXT NOT NULL,                   -- "How organized was the event?"
  question_type VARCHAR NOT NULL,                -- 'slider_1_5', 'slider_1_10', 'multiple_choice', 'text', 'yes_no'

  -- Configuration
  options JSONB,                                 -- For multiple choice: ["Option 1", "Option 2"]
  is_required BOOLEAN DEFAULT FALSE,

  -- Context applicability
  applicable_contexts TEXT[],                    -- ['post_event', 'on_demand']
  applicable_respondent_types TEXT[],            -- ['artist', 'guest']

  -- Display
  display_order INTEGER,
  section_heading VARCHAR,                       -- Groups questions: "Event Experience", "Payment", etc.

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX idx_question_templates_active ON feedback_question_templates(is_active) WHERE is_active = TRUE;
```

---

#### `feedback_broadcast_triggers`
Tracks broadcast feedback requests (for guests in art-battle-broadcast).

```sql
CREATE TABLE feedback_broadcast_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  event_id UUID NOT NULL REFERENCES events(id),
  event_eid VARCHAR REFERENCES events(eid),

  -- Broadcast details
  triggered_by UUID REFERENCES people(id),       -- Admin who triggered it
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  broadcast_type VARCHAR DEFAULT 'manual',       -- 'manual', 'auction_end_auto'

  -- Tracking
  guest_count_at_trigger INTEGER,                -- How many guests were connected
  responses_count INTEGER DEFAULT 0,             -- How many submitted

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

#### `feedback_incentive_redemptions`
Tracks incentive fulfillment (e.g., free friend tickets).

```sql
CREATE TABLE feedback_incentive_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  feedback_submission_id UUID REFERENCES feedback_submissions(id),
  person_id UUID REFERENCES people(id),

  incentive_type VARCHAR NOT NULL,               -- 'free_friend_ticket'
  incentive_code VARCHAR UNIQUE,                 -- Redemption code (e.g., "FRIEND-2025-ABC123")

  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  redeemed_at TIMESTAMP WITH TIME ZONE,
  redeemed_for_event_id UUID REFERENCES events(id),

  expires_at TIMESTAMP WITH TIME ZONE,           -- Optional expiration

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 3.2 Verified Table References

**Existing Tables (Verified via psql):**

| Table Name | Key Columns | Notes |
|------------|-------------|-------|
| `events` | `id` (UUID), `eid` (VARCHAR), `name`, `event_start_datetime`, `event_end_datetime`, `slack_channel` | Main event data |
| `people` | `id` (UUID), `email`, `phone`, `name`, `type`, `person_id`, `hash` | Guest/user data |
| `artist_profiles` | `id` (UUID), `person_id` (UUID), `entry_id` (INT), `name`, `email`, `phone` | Artist data |
| `artist_confirmations` | `artist_profile_id`, `event_eid`, `confirmation_status` | Artist event participation |
| `votes` | `person_id`, `event_id`, `round`, `easel` | Guest voting activity |
| `event_admins` | `event_id`, `phone`, `admin_level` | Event producers/admins |

---

## 4. Feedback Question Templates

### 4.1 Artist Post-Event Questions

```json
[
  {
    "question_id": "artist_post_event_organization",
    "question_text": "How organized was the event?",
    "question_type": "slider_1_5",
    "section_heading": "Event Experience",
    "display_order": 1
  },
  {
    "question_id": "artist_post_event_producer_communication",
    "question_text": "How satisfied were you with producer communication?",
    "question_type": "slider_1_5",
    "section_heading": "Producer & Staff",
    "display_order": 2
  },
  {
    "question_id": "artist_post_event_artwork_handling",
    "question_text": "How well was your artwork handled and stored?",
    "question_type": "slider_1_5",
    "section_heading": "Artwork & Materials",
    "display_order": 3
  },
  {
    "question_id": "artist_post_event_technology",
    "question_text": "How smooth was the technology (voting, displays, timers)?",
    "question_type": "slider_1_5",
    "section_heading": "Technology",
    "display_order": 4
  },
  {
    "question_id": "artist_post_event_payment",
    "question_text": "How easy was it to receive payment?",
    "question_type": "slider_1_5",
    "section_heading": "Payment",
    "display_order": 5
  },
  {
    "question_id": "artist_post_event_peer_quality",
    "question_text": "Quality of fellow artists",
    "question_type": "slider_1_5",
    "section_heading": "Artists",
    "display_order": 6
  },
  {
    "question_id": "artist_post_event_venue",
    "question_text": "How suitable was the venue?",
    "question_type": "slider_1_5",
    "section_heading": "Venue",
    "display_order": 7
  },
  {
    "question_id": "artist_post_event_nps",
    "question_text": "How likely are you to participate in another Art Battle event?",
    "question_type": "slider_1_10",
    "section_heading": "Overall",
    "display_order": 8,
    "is_required": true
  },
  {
    "question_id": "artist_post_event_highlights",
    "question_text": "What was the highlight of this event?",
    "question_type": "text",
    "section_heading": "Additional Feedback",
    "display_order": 9
  },
  {
    "question_id": "artist_post_event_improvements",
    "question_text": "What could we improve?",
    "question_type": "text",
    "section_heading": "Additional Feedback",
    "display_order": 10
  }
]
```

---

### 4.2 Guest Post-Auction Questions

```json
[
  {
    "question_id": "guest_auction_event_rating",
    "question_text": "How would you rate tonight's event?",
    "question_type": "slider_1_5",
    "section_heading": "Event Experience",
    "display_order": 1
  },
  {
    "question_id": "guest_auction_art_quality",
    "question_text": "Quality of the artwork",
    "question_type": "slider_1_5",
    "section_heading": "Art & Artists",
    "display_order": 2
  },
  {
    "question_id": "guest_auction_venue",
    "question_text": "How was the venue?",
    "question_type": "slider_1_5",
    "section_heading": "Venue",
    "display_order": 3
  },
  {
    "question_id": "guest_auction_technology",
    "question_text": "How easy was it to vote and bid?",
    "question_type": "slider_1_5",
    "section_heading": "Technology",
    "display_order": 4
  },
  {
    "question_id": "guest_auction_nps",
    "question_text": "How likely are you to recommend Art Battle to a friend?",
    "question_type": "slider_1_10",
    "section_heading": "Overall",
    "display_order": 5,
    "is_required": true
  },
  {
    "question_id": "guest_auction_private_event_interest",
    "question_text": "Would you like to host a private Art Battle event?",
    "question_type": "yes_no",
    "section_heading": "Opportunities",
    "display_order": 6
  },
  {
    "question_id": "guest_auction_venue_suggestion",
    "question_text": "Know a great venue for Art Battle? Share details:",
    "question_type": "text",
    "section_heading": "Opportunities",
    "display_order": 7
  },
  {
    "question_id": "guest_auction_general_feedback",
    "question_text": "Any other feedback?",
    "question_type": "text",
    "section_heading": "Additional Feedback",
    "display_order": 8
  }
]
```

---

### 4.3 Guest Demographic Questions (Incentivized)

```json
[
  {
    "question_id": "guest_demo_age_range",
    "question_text": "What's your age range?",
    "question_type": "multiple_choice",
    "options": ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
    "section_heading": "About You (Get a Free Friend Ticket!)",
    "display_order": 1,
    "is_required": true
  },
  {
    "question_id": "guest_demo_gender",
    "question_text": "Gender",
    "question_type": "multiple_choice",
    "options": ["Male", "Female", "Non-binary", "Prefer not to say"],
    "section_heading": "About You (Get a Free Friend Ticket!)",
    "display_order": 2,
    "is_required": true
  },
  {
    "question_id": "guest_demo_occupation",
    "question_text": "Occupation/Industry",
    "question_type": "text",
    "section_heading": "About You (Get a Free Friend Ticket!)",
    "display_order": 3
  },
  {
    "question_id": "guest_demo_how_heard",
    "question_text": "How did you hear about Art Battle?",
    "question_type": "multiple_choice",
    "options": ["Friend", "Social Media (Instagram/Facebook)", "Event Listing Site", "Google Search", "Been Before", "Other"],
    "section_heading": "About You (Get a Free Friend Ticket!)",
    "display_order": 4,
    "is_required": true
  },
  {
    "question_id": "guest_demo_postal_code",
    "question_text": "Zip/Postal Code",
    "question_type": "text",
    "section_heading": "About You (Get a Free Friend Ticket!)",
    "display_order": 5
  }
]
```

---

## 5. UI Integration Points

### 5.1 Artists (art-battle-artists)

#### Location: `art-battle-artists/src/components/`

**A. Post-Event Modal Trigger**
- **File:** `Home.jsx` or new `FeedbackModal.jsx`
- **Trigger Logic:**
  - On component mount, check if user has completed events WITHOUT feedback
  - Query: `SELECT event_id FROM artist_confirmations WHERE artist_profile_id = ? AND event_end_datetime < NOW() AND event_id NOT IN (SELECT event_id FROM feedback_submissions WHERE artist_profile_id = ?)`
  - Show modal if results found
  - Modal appears ONCE per event (track dismissed state in localStorage or DB)

**B. Feedback Info Box (Always Available)**
- **File:** `Home.jsx` (alongside `PaymentStatusBanner`, `ServerNotes`)
- **UI Component:** Similar to existing info boxes
- **Content:**
  ```
  📝 Share Your Feedback
  Help us improve! Share feedback about your recent events.
  [View My Events & Give Feedback] (button)
  ```
- **Click Action:** Opens `FeedbackModal` with list of past events

**C. Feedback Modal Component**
```jsx
// FeedbackModal.jsx
<Dialog.Root open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
  <Dialog.Content style={{ maxWidth: 600 }}>
    <Dialog.Title>Event Feedback: {event.name}</Dialog.Title>

    {/* Section 1: Event Experience */}
    <Heading size="4">Event Experience</Heading>
    <Slider question="How organized was the event?" min={1} max={5} />
    <Slider question="Producer communication" min={1} max={5} />

    {/* Section 2: Technology & Payment */}
    <Heading size="4">Technology & Payment</Heading>
    <Slider question="Technology smoothness" min={1} max={5} />
    <Slider question="Payment ease" min={1} max={5} />

    {/* ... more sections ... */}

    {/* NPS Question (required) */}
    <Heading size="4">Overall</Heading>
    <Slider
      question="How likely to participate again?"
      min={1}
      max={10}
      required
      labels={["Not at all likely", "Extremely likely"]}
    />

    {/* Follow-up Request */}
    <Checkbox>Request follow-up from Art Battle team</Checkbox>
    {requestsFollowup && (
      <TextArea placeholder="What should we follow up about?" />
    )}

    {/* Submit */}
    <Button onClick={handleSubmit}>Submit Feedback</Button>
    <Button variant="ghost" onClick={handleSkip}>Skip for Now</Button>
  </Dialog.Content>
</Dialog.Root>
```

**D. Edge Function**
- **File:** `/root/vote_app/vote26/supabase/functions/submit-feedback/index.ts`
- **Endpoint:** `POST /functions/v1/submit-feedback`
- **Body:**
  ```json
  {
    "event_id": "uuid",
    "respondent_type": "artist",
    "artist_profile_id": "uuid",
    "responses": {
      "artist_post_event_organization": 4,
      "artist_post_event_nps": 9,
      ...
    },
    "requests_followup": true,
    "followup_message": "Had issues with payment timing"
  }
  ```
- **Actions:**
  1. Insert into `feedback_submissions`
  2. If `requests_followup = true`, post to Slack
  3. Return success

---

### 5.2 Guests (art-battle-broadcast)

#### Location: `art-battle-broadcast/src/components/`

**A. Auction End Modal Trigger**
- **File:** `AuctionView.jsx` or new `GuestFeedbackModal.jsx`
- **Trigger Logic:**
  - When auction state changes to `closed` AND guest is still connected
  - Show modal ONCE (track in session storage: `feedback_shown_${event_id}`)
  - Delay 5 seconds after auction close to avoid immediate disruption

**B. Broadcast Trigger (Admin-initiated)**
- **Admin Interface:** New button in admin broadcast panel
- **Action:** Emits WebSocket/Supabase Realtime message to all connected guests
- **Message Payload:**
  ```json
  {
    "type": "FEEDBACK_REQUEST",
    "event_id": "uuid",
    "broadcast_id": "uuid"
  }
  ```
- **Guest Response:** Opens `GuestFeedbackModal` for all connected guests simultaneously

**C. Guest Feedback Modal Component**
```jsx
// GuestFeedbackModal.jsx
<Dialog.Root open={showGuestFeedback} onOpenChange={setShowGuestFeedback}>
  <Dialog.Content style={{ maxWidth: 600 }}>
    <Dialog.Title>How was tonight's Art Battle?</Dialog.Title>

    {/* Quick Ratings */}
    <Slider question="Event rating" min={1} max={5} />
    <Slider question="Art quality" min={1} max={5} />
    <Slider question="Venue" min={1} max={5} />
    <Slider question="Voting/bidding ease" min={1} max={5} />

    {/* NPS */}
    <Slider
      question="How likely to recommend Art Battle?"
      min={1}
      max={10}
      required
    />

    {/* Lead Generation */}
    <Checkbox>Interested in hosting a private Art Battle event</Checkbox>
    <TextArea placeholder="Know a great venue? Share details" />

    {/* Demographic Incentive Section */}
    <Callout.Root color="green">
      <Callout.Icon>🎁</Callout.Icon>
      <Callout.Text>
        Answer 5 quick questions, get a FREE friend ticket!
      </Callout.Text>
    </Callout.Root>

    {showDemographicQuestions && (
      <>
        <Select question="Age range" options={["18-24", "25-34", ...]} required />
        <Select question="Gender" options={["Male", "Female", ...]} required />
        <TextInput question="Occupation" />
        <Select question="How did you hear about us?" options={[...]} required />
        <TextInput question="Zip/Postal Code" />
      </>
    )}

    <Button onClick={handleSubmit}>
      {showDemographicQuestions ? "Submit & Get Free Ticket" : "Submit Feedback"}
    </Button>
    <Button variant="ghost" onClick={handleSkip}>Skip</Button>
  </Dialog.Content>
</Dialog.Root>
```

**D. Edge Function**
- **File:** `/root/vote_app/vote26/supabase/functions/submit-guest-feedback/index.ts`
- **Actions:**
  1. Insert into `feedback_submissions`
  2. If demographic data provided:
     - Set `incentive_type = 'free_friend_ticket'`
     - Generate unique code: `FRIEND-2025-{RANDOM}`
     - Insert into `feedback_incentive_redemptions`
     - Return code to guest UI
  3. If private event interest or venue suggestion:
     - Post to Slack with high-priority tag
  4. Return success + incentive code

---

## 6. Slack Integration

### 6.1 Slack Webhook Posts

**Channel:** Event-specific channel (from `events.slack_channel`) or default `#feedback`

#### A. Artist Follow-up Request
**Trigger:** Artist submits feedback with `requests_followup = true`

**Slack Message Format:**
```
🎨 Artist Feedback Follow-up Request

**Event:** AB3049 - Art Battle Melbourne (Oct 11, 2025)
**Artist:** Vicki Soar (#310423)

**NPS Score:** 7/10

**Follow-up Request:**
"Had issues with payment timing - took 3 weeks to receive funds"

**Top Ratings:**
✅ Event Organization: 5/5
✅ Venue: 5/5
⚠️ Payment Ease: 2/5

[View Full Feedback](https://artb.art/admin/feedback/abc-123)
```

**Action Buttons:**
- `Mark as Contacted`
- `Mark as Resolved`

---

#### B. Guest Private Event Lead
**Trigger:** Guest indicates interest in private event

**Slack Message Format:**
```
🎉 Private Event Lead

**Event:** AB3049 - Art Battle Melbourne (Oct 11, 2025)
**Guest:** John Doe (john@example.com)
**Phone:** +61 400 123 456

**Interested in:** Hosting a private Art Battle event

**Guest NPS:** 10/10 (Promoter!)

[Contact Guest](mailto:john@example.com)
```

---

#### C. Guest Venue Suggestion
**Trigger:** Guest provides venue suggestion

**Slack Message Format:**
```
📍 Venue Suggestion

**Event:** AB3049 - Art Battle Melbourne (Oct 11, 2025)
**From:** Sarah Smith

**Suggestion:**
"The Rooftop Bar on Collins St would be perfect - huge space, good sound system, they host events regularly. Contact: manager@rooftopbar.com"

[View on Google Maps](...)
```

---

### 6.2 Slack Configuration

**Environment Variables:**
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_FEEDBACK_CHANNEL=#feedback
```

**Per-Event Override:**
Use `events.slack_channel` if available, otherwise fall back to `SLACK_FEEDBACK_CHANNEL`.

---

## 7. Incentive System

### 7.1 Free Friend Ticket (Guests)

**Eligibility:**
- Complete all 5 required demographic questions
- Valid email/phone for ticket delivery

**Code Generation:**
```
Format: FRIEND-{YEAR}-{EVENT_EID}-{RANDOM_6_CHARS}
Example: FRIEND-2025-AB3049-X7K2M9
```

**Redemption:**
- Code stored in `feedback_incentive_redemptions.incentive_code`
- Guest receives code immediately in UI after submission
- Code also emailed to guest (future enhancement)
- Valid for any future Art Battle event (configurable expiration)
- Redemption tracked when used

**UI Display:**
```
✅ Thank you for your feedback!

🎁 Here's your free friend ticket code:
FRIEND-2025-AB3049-X7K2M9

Share this code with a friend - they can use it to get free entry to any Art Battle event!

[Email Me This Code] [Copy Code]
```

---

## 8. Future Extensibility

### 8.1 Additional Respondent Types

**Schema supports:**
- `respondent_type = 'auction_buyer'`
- `respondent_type = 'producer'`
- `respondent_type = 'volunteer'`

**Question Templates:**
- Add new templates with `applicable_respondent_types = ['auction_buyer']`
- Reuse existing UI components

**Integration Points:**
- Auction buyers: Email link post-purchase or in-app modal after delivery
- Producers: Email link after event or in admin portal
- Volunteers: QR code at event or email link

---

### 8.2 Advanced Features (Future)

**A. Sentiment Analysis**
- Use AI to analyze free-text responses
- Populate `feedback_submissions.sentiment_score` (-1 to 1)
- Auto-tag pain points: `tags = ['payment_delay', 'venue_complaint']`

**B. Trend Analysis Dashboard**
- Aggregate NPS scores by region, producer, time period
- Identify recurring issues (e.g., "payment" mentioned in 30% of responses)
- Track improvement over time

**C. A/B Testing**
- Show different question sets to different users
- Measure response rates and data quality

**D. Multi-language Support**
- Add `language_code` to `feedback_submissions`
- Store translations in `feedback_question_templates.translations` (JSONB)

---

## 9. Metrics & Analytics

### 9.1 Core Metrics (Query Examples)

#### Overall NPS Score
```sql
SELECT
  AVG(CASE
    WHEN (responses->>'artist_post_event_nps')::numeric >= 9 THEN 1
    WHEN (responses->>'artist_post_event_nps')::numeric <= 6 THEN -1
    ELSE 0
  END) * 100 AS nps_score
FROM feedback_submissions
WHERE respondent_type = 'artist'
  AND responses->>'artist_post_event_nps' IS NOT NULL;
```

#### Response Rate by Event
```sql
SELECT
  e.name,
  COUNT(DISTINCT ac.artist_profile_id) AS total_artists,
  COUNT(DISTINCT fs.artist_profile_id) AS responded,
  ROUND(COUNT(DISTINCT fs.artist_profile_id)::numeric / COUNT(DISTINCT ac.artist_profile_id) * 100, 1) AS response_rate_pct
FROM events e
JOIN artist_confirmations ac ON ac.event_eid = e.eid
LEFT JOIN feedback_submissions fs ON fs.event_id = e.id AND fs.artist_profile_id = ac.artist_profile_id
WHERE e.event_end_datetime < NOW()
GROUP BY e.id, e.name
ORDER BY e.event_start_datetime DESC;
```

#### Top Pain Points (Text Analysis)
```sql
SELECT
  responses->>'artist_post_event_improvements' AS improvement_suggestion,
  COUNT(*) AS mention_count
FROM feedback_submissions
WHERE respondent_type = 'artist'
  AND responses->>'artist_post_event_improvements' IS NOT NULL
  AND responses->>'artist_post_event_improvements' != ''
GROUP BY responses->>'artist_post_event_improvements'
ORDER BY mention_count DESC
LIMIT 20;
```

#### Private Event Leads
```sql
SELECT
  fs.id,
  e.name AS event_name,
  p.name AS guest_name,
  p.email,
  p.phone,
  fs.submitted_at
FROM feedback_submissions fs
JOIN events e ON e.id = fs.event_id
LEFT JOIN people p ON p.id = fs.person_id
WHERE respondent_type = 'guest'
  AND (responses->>'guest_auction_private_event_interest')::boolean = TRUE
ORDER BY fs.submitted_at DESC;
```

---

### 9.2 Dashboard Views (Future)

**Feedback Analytics Dashboard:**
- NPS trend over time (line chart)
- Category ratings (radar chart: organization, payment, venue, etc.)
- Response rate by event (bar chart)
- Top improvement suggestions (word cloud)
- Follow-up queue (table: pending, contacted, resolved)
- Lead pipeline (private events, venue suggestions)

---

## 10. Implementation Phases

### Phase 1: MVP (Artists Only)
**Scope:**
- Database schema (all tables)
- Artist post-event feedback modal in `art-battle-artists`
- Artist feedback info box (on-demand access)
- Question templates for artists
- Slack integration for follow-up requests
- Basic edge function: `submit-feedback`

**Deliverables:**
1. Migration file: `20251015_create_feedback_tables.sql`
2. React components: `FeedbackModal.jsx`, `FeedbackInfoBox.jsx`
3. Edge function: `submit-feedback/index.ts`
4. Slack webhook integration
5. UI integration in `Home.jsx`

**Success Criteria:**
- Artists can submit feedback for past events
- Feedback stored in database
- Follow-up requests post to Slack
- Modal appears post-event (dismissable)

---

### Phase 2: Guest Feedback & Incentives
**Scope:**
- Guest feedback modal in `art-battle-broadcast`
- Auction-end trigger
- Broadcast trigger (admin-initiated)
- Demographic questions + incentive system
- Free friend ticket code generation
- Lead generation (private events, venues)

**Deliverables:**
1. React components: `GuestFeedbackModal.jsx`
2. Edge function: `submit-guest-feedback/index.ts`
3. Incentive code generation logic
4. Broadcast WebSocket/Realtime integration
5. Admin broadcast button

**Success Criteria:**
- Guests see feedback modal at auction end
- Admins can broadcast feedback request
- Demographic data captured
- Free ticket codes generated and displayed
- Private event leads post to Slack

---

### Phase 3: Analytics & Reporting
**Scope:**
- Admin dashboard for viewing feedback
- NPS calculations and trending
- Pain point analysis
- Response rate tracking
- Export to CSV

**Future Phases:**
- Sentiment analysis (AI)
- Auction buyer feedback
- Producer feedback
- Multi-language support

---

## Appendix A: Table Column Reference

### Verified Existing Tables

#### `events`
- `id` (UUID, PK)
- `eid` (VARCHAR, unique)
- `name` (TEXT)
- `event_start_datetime` (TIMESTAMPTZ)
- `event_end_datetime` (TIMESTAMPTZ)
- `slack_channel` (VARCHAR)
- `city_id` (UUID, FK to cities)
- `country_id` (UUID, FK to countries)

#### `people`
- `id` (UUID, PK)
- `email` (USER-DEFINED type)
- `phone` (VARCHAR)
- `name` (TEXT)
- `type` (USER-DEFINED enum)
- `hash` (VARCHAR)

#### `artist_profiles`
- `id` (UUID, PK)
- `person_id` (UUID, FK to people)
- `entry_id` (INT, unique artist number)
- `name` (VARCHAR)
- `email` (VARCHAR)
- `phone` (VARCHAR)

#### `artist_confirmations`
- `artist_profile_id` (UUID, FK)
- `event_eid` (TEXT, FK)
- `confirmation_status` (TEXT)

#### `votes`
- `person_id` (UUID, FK)
- `event_id` (UUID, FK)
- `round` (INT)
- `timestamp` (TIMESTAMPTZ)

---

## Appendix B: UI Component Library

**Radix UI Components Used:**
- `Dialog.Root`, `Dialog.Content`, `Dialog.Title` - Modal
- `Slider` - Rating sliders (1-5, 1-10)
- `Select` - Dropdown choices
- `TextArea` - Free-text responses
- `Checkbox` - Yes/no, follow-up requests
- `Button` - Submit, skip
- `Callout.Root` - Incentive banner, info messages
- `Heading`, `Text`, `Flex`, `Box` - Layout

---

## Appendix C: Edge Function Endpoints

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/submit-feedback` | POST | Submit artist feedback | Yes (JWT) |
| `/submit-guest-feedback` | POST | Submit guest feedback | No (anonymous or JWT) |
| `/trigger-feedback-broadcast` | POST | Admin triggers guest feedback request | Yes (admin) |
| `/get-feedback-questions` | GET | Retrieve question templates for context | No |
| `/redeem-friend-ticket` | POST | Redeem incentive code for free ticket | No |

---

**END OF SPECIFICATION**

---

## Notes for Implementation

1. **DO NOT START CODING YET** - This is spec only
2. All table/column names verified against production database
3. Question templates are examples - refine based on team feedback
4. Slack integration requires webhook URL configuration
5. Incentive system requires integration with ticketing system (TBD)
6. UI mockups needed before frontend implementation
7. Test plan required before deployment
8. Analytics dashboard is Phase 3 - focus on data collection first

**Next Steps:**
1. Review this spec with stakeholders
2. Get approval on database schema
3. Finalize question wording with team
4. Design UI mockups for both artist and guest modals
5. Define Slack channel structure
6. Create migration files
7. Implement Phase 1 (Artists)
