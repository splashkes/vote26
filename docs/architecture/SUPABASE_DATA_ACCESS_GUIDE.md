# Supabase Data Access Guide - Extended Edition

## Overview
This guide provides comprehensive query patterns and best practices for accessing Art Battle data in Supabase PostgreSQL. This extended edition includes all tables, fields, and relationships discovered in the production database.

## Database Statistics (as of analysis)
- 939 events
- 106,899 registered people
- 15,060 artist profiles
- 14,289 art pieces
- 305,852 votes cast
- 87,207 bids placed
- 17,132 round contestants

## Core Tables Structure

### 1. People (Users/Participants)
**Table**: `people`

**Core Fields:**
- `id` (UUID): Primary key
- `email` (citext): Unique email address (case-insensitive)
- `phone` (varchar(20)): Unique phone number
- `name` (text): Full name
- `hash` (varchar(100)): Unique identifier hash
- `type` (person_type): Default 'guest'
- `created_at`, `updated_at`: Timestamps

**Profile Fields:**
- `first_name`, `last_name` (varchar(100)): Name components
- `nickname`, `nick_name` (text/varchar): Display names
- `display_phone` (varchar(20)): Formatted phone for display
- `region_code` (varchar(10)): Phone region code

**Engagement Fields:**
- `last_interaction_at`: Last activity timestamp
- `interaction_count` (int): Total interactions
- `total_spent` (numeric): Total spent in auctions
- `last_qr_scan_at`: Last QR code scan
- `last_qr_event_id`: Last event QR scanned

**Notification Settings:**
- `art_battle_news` (boolean): Newsletter subscription
- `notification_emails` (boolean): Email notifications
- `loyalty_offers` (boolean): Promotional offers
- `device_tokens` (text[]): iOS push tokens
- `android_device_tokens` (text[]): Android push tokens

**Verification & Security:**
- `verification_code` (varchar(10)): Current verification code
- `verification_code_exp`: Code expiration timestamp
- `self_registered` (boolean): Self-registration flag
- `message_blocked` (int): Message block count

**Location & Tracking:**
- `location_lat`, `location_lng` (numeric): Last known location
- `registered_at` (varchar(100)): Registration location/context
- `last_promo_sent_at`: Last promotion timestamp

**Legacy Fields:**
- `mongo_id` (text): MongoDB migration reference
- `phone_number`, `phone_number_masked`: Legacy phone fields
- `is_artist` (boolean): Artist flag

### 2. Events
**Table**: `events`

**Core Fields:**
- `id` (UUID): Primary key
- `eid` (varchar(50)): Unique event code (e.g., "AB1234")
- `name` (text): Event name
- `description` (text): Event description
- `venue` (text): Venue name
- `created_at`, `updated_at`: Timestamps

**Date & Location:**
- `event_start_datetime`, `event_end_datetime`: Event times with timezone
- `timezone_id` (UUID): Links to timezones table
- `timezone_offset` (varchar(10)): UTC offset
- `timezone_icann` (varchar(50)): IANA timezone name
- `city_id` (UUID): Links to cities table
- `country_id` (UUID): Links to countries table

**Event Configuration:**
- `enabled` (boolean): Event active flag
- `show_in_app` (boolean): Mobile app visibility
- `current_round` (int): Current competition round
- `art_width_height` (varchar(50)): Canvas dimensions

**Voting Settings:**
- `vote_by_link` (boolean): Allow voting via link
- `register_at_sms_vote` (boolean): Register on first vote
- `send_link_to_guests` (boolean): Send voting links
- `email_registration` (boolean): Allow email registration

**Auction Configuration:**
- `enable_auction` (boolean): Enable art auction
- `auction_start_bid` (numeric): Starting bid amount
- `min_bid_increment` (numeric): Minimum bid increase
- `currency` (varchar(3)): Currency code (default 'USD')
- `tax` (numeric): Tax percentage
- `auction_description` (text): Auction details
- `auction_notice` (text): Auction terms
- `admin_control_in_auction` (boolean): Admin auction control
- `send_auction_link_to_guests` (boolean): Send auction links
- `auction_close_starts_at`: Auction closing time
- `auction_close_round_delay` (int): Delay between rounds

**Communication:**
- `phone_number` (varchar(20)): Event contact phone
- `email` (varchar(255)): Event contact email
- `slack_channel` (varchar(100)): Slack integration
- `registration_confirmation_message` (text): Custom confirmation

**Media & Sponsorship:**
- `video_stream` (text): Video stream URL
- `live_stream` (text): Live stream URL
- `sponsor_text` (text): Sponsor message
- `sponsor_logo_id` (UUID): Links to media_files

**Ticketing:**
- `price` (varchar(50)): Ticket price text
- `ticket_link` (text): Ticket purchase URL

**Legacy:**
- `mongo_id` (varchar(24)): MongoDB migration reference

### 3. Artist Profiles
**Table**: `artist_profiles`

**Core Fields:**
- `id` (UUID): Primary key
- `entry_id` (int): Unique artist entry number
- `name` (varchar(255)): Artist display name
- `person_id` (UUID): Optional link to people table
- `created_at`, `updated_at`: Timestamps

**Profile Information:**
- `bio` (text): Artist biography
- `years_experience` (int): Years as artist
- `specialties` (text[]): Art specialties/styles
- `studio_location` (text): Studio address

**Social Media:**
- `website` (text): Personal website
- `instagram` (varchar(100)): Instagram handle
- `facebook` (varchar(100)): Facebook profile
- `twitter` (varchar(100)): Twitter handle

**Location:**
- `city_text` (varchar(100)): City name as text
- `city_id` (UUID): Links to cities table

**Engagement Metrics:**
- `followers_count` (int): Number of followers
- `votes_count` (int): Total votes received
- `score` (int): Generated column (votes_count + followers_count)

**Data Quality:**
- `is_duplicate` (boolean): Duplicate flag
- `mongo_id` (varchar(24)): MongoDB migration reference

### 4. Art Pieces
**Table**: `art`

**Core Fields:**
- `id` (UUID): Primary key
- `art_code` (varchar(50)): Unique code "EID-ROUND-EASEL" (e.g., "AB1234-1-5")
- `event_id` (UUID): Links to events
- `artist_id` (UUID): Links to artist_profiles
- `round` (int): Competition round number
- `easel` (int): Easel position in round
- `status` (art_status): Art piece status
- `created_at`, `updated_at`: Timestamps

**Artwork Details:**
- `description` (text): Art piece description
- `width_and_height` (varchar(50)): Canvas dimensions

**Bidding Information:**
- `starting_bid` (numeric): Initial bid amount
- `current_bid` (numeric): Current highest bid
- `bid_count` (int): Number of bids
- `winner_id` (UUID): Winning bidder (links to people)

**Voting:**
- `vote_count` (int): Number of votes received

**Payment Tracking (Artist):**
- `artist_pay_recent_status_id` (UUID): Links to payment_statuses
- `artist_pay_recent_date`: Last artist payment date
- `artist_pay_recent_person_id` (UUID): Person who paid artist
- `artist_pay_recent_user_id` (UUID): Admin who processed payment

**Payment Tracking (Buyer):**
- `buyer_pay_recent_status_id` (UUID): Links to payment_statuses
- `buyer_pay_recent_date`: Last buyer payment date
- `buyer_pay_recent_person_id` (UUID): Person who paid for art
- `buyer_pay_recent_user_id` (UUID): Admin who processed payment

**Legacy:**
- `mongo_lot_id` (varchar(24)): MongoDB lot reference

### 5. Rounds & Round Contestants

**Table**: `rounds`
- `id` (UUID): Primary key
- `event_id` (UUID): Links to events
- `round_number` (int): Round sequence number
- `is_finished` (boolean): Round completion status
- `video_url` (text): Round video recording
- `created_at`, `updated_at`: Timestamps
- Unique constraint: (event_id, round_number)

**Table**: `round_contestants`
- `id` (UUID): Primary key
- `round_id` (UUID): Links to rounds
- `artist_id` (UUID): Links to artist_profiles
- `art_id` (UUID): Links to art piece
- `easel_number` (int): Artist position in round
- `enabled` (boolean): Contestant active flag
- `is_winner` (int): Winner flag (0 or 1)
- `enable_auction` (int): Allow auction for this artist
- `vote_by_link` (boolean): Allow link voting
- `created_at`: Timestamp
- Unique constraint: (round_id, easel_number)

### 6. Votes & Bids

**Table**: `votes`
- `id` (UUID): Primary key
- `event_id` (UUID): Links to events
- `round` (int): Round number
- `art_id` (UUID): Links to art piece voted for
- `person_id` (UUID): Links to voter
- `auth_method` (auth_method): How vote was authenticated
- `auth_timestamp`: When authenticated
- `ip_address` (inet): Voter IP address
- `user_agent` (text): Browser/app info
- `location_lat`, `location_lng` (numeric): Vote location
- `vote_factor` (numeric): Vote weight multiplier (default 1.0)
- `created_at`: Timestamp
- Unique constraint: (event_id, round, person_id) - one vote per person per round

**Table**: `bids`
- `id` (UUID): Primary key
- `art_id` (UUID): Links to art piece
- `person_id` (UUID): Links to bidder
- `amount` (numeric): Bid amount
- `ip_address` (inet): Bidder IP address
- `created_at`: Timestamp

### 7. Media Files

**Table**: `media_files`
- `id` (UUID): Primary key
- `url` (text): File URL/path
- `type` (varchar): File type (image, video, etc.)
- `metadata` (jsonb): Additional file metadata
- `created_at`: Timestamp

**Table**: `art_media` (Junction table)
- `id` (UUID): Primary key
- `art_id` (UUID): Links to art
- `media_id` (UUID): Links to media_files
- `created_at`: Timestamp

**Table**: `pics` (Alternative media storage)
- `id` (UUID): Primary key
- `art_id` (UUID): Links to art
- `url` (text): Image URL
- `thumbnail_url` (text): Thumbnail URL
- `uploaded_by` (UUID): Links to people
- `created_at`: Timestamp

## Additional Tables

### 8. Administrative Tables

**Table**: `admin_users`
- Admin user accounts for system management
- Referenced by payment tracking in art table

**Table**: `admin_settings`
- System-wide configuration settings

### 9. Location Tables

**Table**: `cities`
- `id` (UUID): Primary key
- `name`: City name
- `state`: State/province
- `country`: Country name
- Referenced by events and artist_profiles

**Table**: `countries`
- `id` (UUID): Primary key
- `name`: Country name
- `code`: Country code

**Table**: `timezones`
- `id` (UUID): Primary key
- `name`: Timezone display name
- `offset`: UTC offset
- `iana_name`: IANA timezone identifier

### 10. Communication & Notifications

**Table**: `notifications`
- `id` (UUID): Primary key
- `person_id` (UUID): Recipient
- `type`: Notification type
- `title`, `message`: Content
- `event_id`, `art_id`: Related entities
- `related_person_id`: Other person involved
- `created_at`: Timestamp

**Table**: `notification_preferences`
- Per-person notification settings

**Table**: `notification_reads`
- Tracks read status of notifications

**Table**: `message_queue`
- Outbound message queue for SMS/email

**Table**: `announcements`
- System-wide announcements

### 11. Artist Management

**Table**: `artists` (Legacy table)
- Older artist data structure
- Links to people table

**Table**: `artist_applications`
- Artist applications for events
- Links person, event, and approval status

**Table**: `artist_extended_info`
- Additional artist profile data
- Links to people table

**Table**: `artist_followers`
- `artist_id`: Artist being followed
- `follower_id`: Person following
- Many-to-many relationship

**Table**: `artist_merge_log`
- Tracks artist profile merges
- `master_artist_id`: Surviving profile

**Table**: `artist_woocommerce_products`
- Integration with WooCommerce for artist merchandise

### 12. Event Operations

**Table**: `event_phone_numbers`
- Multiple phone numbers per event
- SMS gateway configuration

**Table**: `cached_event_data`
- Performance cache for event data

**Table**: `event_analysis_history`
- AI/ML analysis results for events

### 13. Payment & Commerce

**Table**: `payment_statuses`
- Payment status definitions
- Referenced by art payment tracking

**Table**: `payment_logs`
- Detailed payment transaction history
- Links to person, art, admin_user

**Table**: `stripe_charges`
- Stripe payment integration
- Links to person and includes charge details

### 14. Voting & Engagement

**Table**: `vote_weights`
- Custom vote weights per person per event
- Allows vote multipliers for VIPs

**Table**: `voting_logs`
- Detailed voting activity logs

**Table**: `people_interactions`
- Tracks all person interactions with events

### 15. System & Analytics

**Table**: `system_logs`
- Application activity logs

**Table**: `system_logs_compressed`
- Archived/compressed logs

**Table**: `ai_analysis_cache`
- Cached AI analysis results

**Table**: `verification_codes`
- Phone/email verification codes
- Links to event and person

**Table**: `registration_logs`
- Detailed registration tracking

### 16. Marketing & Promotions

**Table**: `promotion_logs`
- Promotional message history
- Links to person and campaign

**Table**: `promotion_videos`
- Promotional video content

**Table**: `assigned_promotions`
- Person-specific promotions

**Table**: `assigned_email_campaigns`
- Email campaign assignments

### 17. Utilities

**Table**: `short_urls`
- URL shortener for sharing

**Table**: `sms_config`
- SMS gateway configuration

**Table**: `user_preferences`
- Per-person app preferences

**Table**: `schema_migrations`
- Database migration tracking

## Common Query Patterns

### Finding People

```sql
-- Find person by email
SELECT * FROM people WHERE email = 'user@example.com';

-- Find person by phone
SELECT * FROM people WHERE phone = '+1234567890';

-- Search people by name (case-insensitive)
SELECT * FROM people WHERE name ILIKE '%john%';

-- Find people who registered recently
SELECT * FROM people 
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- Find people by hash
SELECT * FROM people WHERE hash = 'abc123def456';

-- Find people with notification preferences
SELECT p.*, 
  p.art_battle_news as newsletter,
  p.notification_emails as emails,
  p.loyalty_offers as offers
FROM people p
WHERE p.notification_emails = true;

-- Find people who have spent money
SELECT p.*, p.total_spent
FROM people p
WHERE p.total_spent > 0
ORDER BY p.total_spent DESC;

-- Find people by device tokens (for push notifications)
SELECT * FROM people 
WHERE device_tokens IS NOT NULL AND array_length(device_tokens, 1) > 0
   OR android_device_tokens IS NOT NULL AND array_length(android_device_tokens, 1) > 0;
```

### Working with Events

```sql
-- Find event by EID
SELECT e.*, c.name as city_name, t.name as timezone_name
FROM events e
JOIN cities c ON e.city_id = c.id
JOIN timezones t ON e.timezone_id = t.id
WHERE e.eid = 'AB1234';

-- Find upcoming events
SELECT e.*, c.name as city_name
FROM events e
JOIN cities c ON e.city_id = c.id
WHERE e.date >= CURRENT_DATE
ORDER BY e.date;

-- Find events in a specific city
SELECT e.*
FROM events e
JOIN cities c ON e.city_id = c.id
WHERE c.name = 'Toronto'
ORDER BY e.date DESC;

-- Get event with participant counts
SELECT 
  e.*,
  COUNT(DISTINCT rc.artist_id) as artist_count,
  COUNT(DISTINCT v.person_id) as voter_count
FROM events e
LEFT JOIN rounds r ON r.event_id = e.id
LEFT JOIN round_contestants rc ON rc.round_id = r.id
LEFT JOIN art a ON a.event_id = e.id
LEFT JOIN votes v ON v.art_id = a.id
WHERE e.eid = 'AB1234'
GROUP BY e.id;
```

### Artist Queries

```sql
-- Find artist by entry ID
SELECT * FROM artist_profiles WHERE entry_id = 12345;

-- Find artists with their associated person data
SELECT 
  ap.*,
  p.email,
  p.phone
FROM artist_profiles ap
LEFT JOIN people p ON ap.person_id = p.id
WHERE ap.entry_id = 12345;

-- Top artists by score
SELECT * FROM artist_profiles
ORDER BY score DESC
LIMIT 20;

-- Search artists by name with their stats
SELECT 
  ap.*,
  COUNT(DISTINCT a.id) as artworks_count,
  COUNT(DISTINCT a.event_id) as events_participated
FROM artist_profiles ap
LEFT JOIN art a ON a.artist_id = ap.id
WHERE ap.name ILIKE '%smith%'
GROUP BY ap.id
ORDER BY ap.score DESC;

-- Artists who participated in multiple events
SELECT 
  ap.entry_id,
  ap.name,
  COUNT(DISTINCT a.event_id) as event_count,
  array_agg(DISTINCT e.eid ORDER BY e.date DESC) as event_eids
FROM artist_profiles ap
JOIN art a ON a.artist_id = ap.id
JOIN events e ON a.event_id = e.id
GROUP BY ap.id
HAVING COUNT(DISTINCT a.event_id) > 1
ORDER BY event_count DESC;
```

### Art & Competition Queries

```sql
-- Find art by code
SELECT a.*, ap.name as artist_name, e.name as event_name
FROM art a
JOIN artist_profiles ap ON a.artist_id = ap.id
JOIN events e ON a.event_id = e.id
WHERE a.art_code = 'AB1234-1-5';

-- Get all art for an event with vote counts
SELECT 
  a.art_code,
  a.round,
  a.easel,
  ap.name as artist_name,
  COUNT(v.id) as vote_count
FROM art a
JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN votes v ON v.art_id = a.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
GROUP BY a.id, ap.name
ORDER BY a.round, a.easel;

-- Find round winners
SELECT 
  r.round_number,
  rc.easel_number,
  ap.name as winner_name,
  ap.entry_id
FROM rounds r
JOIN round_contestants rc ON rc.round_id = r.id
JOIN artist_profiles ap ON rc.artist_id = ap.id
WHERE r.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
  AND rc.is_winner = true
ORDER BY r.round_number;

-- Get competition bracket for an event
SELECT 
  r.round_number,
  rc.easel_number,
  ap.name as artist_name,
  ap.entry_id,
  rc.is_winner
FROM rounds r
JOIN round_contestants rc ON rc.round_id = r.id
JOIN artist_profiles ap ON rc.artist_id = ap.id
WHERE r.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
ORDER BY r.round_number, rc.easel_number;
```

### Voting Analysis

```sql
-- Top voted art pieces in an event
SELECT 
  a.art_code,
  ap.name as artist_name,
  COUNT(v.id) as vote_count
FROM art a
JOIN artist_profiles ap ON a.artist_id = ap.id
JOIN votes v ON v.art_id = a.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
GROUP BY a.id, ap.name
ORDER BY vote_count DESC
LIMIT 10;

-- Voting patterns by round
SELECT 
  r.round_number,
  COUNT(DISTINCT v.person_id) as unique_voters,
  COUNT(v.id) as total_votes,
  ROUND(COUNT(v.id)::numeric / COUNT(DISTINCT a.id), 2) as avg_votes_per_art
FROM rounds r
JOIN art a ON a.event_id = r.event_id AND a.round = r.round_number
LEFT JOIN votes v ON v.art_id = a.id
WHERE r.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
GROUP BY r.round_number
ORDER BY r.round_number;

-- Find people who voted in an event
SELECT DISTINCT
  p.name,
  p.email,
  COUNT(v.id) as votes_cast
FROM people p
JOIN votes v ON v.person_id = p.id
JOIN art a ON v.art_id = a.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
GROUP BY p.id
ORDER BY votes_cast DESC;
```

### Auction/Bid Queries

```sql
-- Current highest bid for each art piece
SELECT DISTINCT ON (a.id)
  a.art_code,
  ap.name as artist_name,
  b.amount as current_bid,
  p.name as highest_bidder,
  b.created_at as bid_time
FROM art a
JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN bids b ON b.art_id = a.id
LEFT JOIN people p ON b.person_id = p.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
ORDER BY a.id, b.amount DESC NULLS LAST;

-- Bidding activity timeline
SELECT 
  b.created_at,
  a.art_code,
  ap.name as artist_name,
  p.name as bidder_name,
  b.amount
FROM bids b
JOIN art a ON b.art_id = a.id
JOIN artist_profiles ap ON a.artist_id = ap.id
JOIN people p ON b.person_id = p.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
ORDER BY b.created_at DESC;

-- Total auction revenue by event
SELECT 
  e.eid,
  e.name,
  e.date,
  COUNT(DISTINCT a.id) as artworks_sold,
  SUM(max_bids.highest_bid) as total_revenue
FROM events e
JOIN art a ON a.event_id = e.id
JOIN LATERAL (
  SELECT MAX(b.amount) as highest_bid
  FROM bids b
  WHERE b.art_id = a.id
) max_bids ON true
WHERE max_bids.highest_bid IS NOT NULL
GROUP BY e.id
ORDER BY e.date DESC;
```

### Media Queries

```sql
-- Get all media for an art piece
SELECT 
  mf.url,
  mf.type,
  mf.metadata
FROM media_files mf
JOIN art_media am ON mf.id = am.media_id
WHERE am.art_id = (SELECT id FROM art WHERE art_code = 'AB1234-1-5');

-- Find all images for an event
SELECT 
  a.art_code,
  ap.name as artist_name,
  mf.url,
  mf.metadata
FROM media_files mf
JOIN art_media am ON mf.id = am.media_id
JOIN art a ON am.art_id = a.id
JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
  AND mf.type = 'image'
ORDER BY a.round, a.easel;

-- Count media by type for an event
SELECT 
  mf.type,
  COUNT(*) as count
FROM media_files mf
JOIN art_media am ON mf.id = am.media_id
JOIN art a ON am.art_id = a.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
GROUP BY mf.type;
```

### Analytics & Reports

```sql
-- Event summary dashboard
WITH event_stats AS (
  SELECT id FROM events WHERE eid = 'AB1234'
)
SELECT 
  (SELECT COUNT(DISTINCT artist_id) FROM round_contestants rc 
   JOIN rounds r ON rc.round_id = r.id 
   WHERE r.event_id = event_stats.id) as total_artists,
  (SELECT COUNT(*) FROM rounds WHERE event_id = event_stats.id) as total_rounds,
  (SELECT COUNT(DISTINCT person_id) FROM votes v 
   JOIN art a ON v.art_id = a.id 
   WHERE a.event_id = event_stats.id) as unique_voters,
  (SELECT COUNT(*) FROM votes v 
   JOIN art a ON v.art_id = a.id 
   WHERE a.event_id = event_stats.id) as total_votes,
  (SELECT COUNT(DISTINCT person_id) FROM bids b 
   JOIN art a ON b.art_id = a.id 
   WHERE a.event_id = event_stats.id) as unique_bidders,
  (SELECT SUM(amount) FROM (
    SELECT MAX(amount) as amount 
    FROM bids b 
    JOIN art a ON b.art_id = a.id 
    WHERE a.event_id = event_stats.id 
    GROUP BY a.id
  ) max_bids) as total_revenue
FROM event_stats;

-- Artist performance history
SELECT 
  e.eid,
  e.name as event_name,
  e.date,
  a.round,
  a.easel,
  COUNT(DISTINCT v.id) as votes,
  MAX(b.amount) as highest_bid,
  CASE 
    WHEN rc.is_winner THEN 'Winner'
    WHEN rc.id IS NOT NULL THEN 'Contestant'
    ELSE 'Participant'
  END as result
FROM artist_profiles ap
JOIN art a ON a.artist_id = ap.id
JOIN events e ON a.event_id = e.id
LEFT JOIN votes v ON v.art_id = a.id
LEFT JOIN bids b ON b.art_id = a.id
LEFT JOIN rounds r ON r.event_id = e.id AND r.round_number = a.round
LEFT JOIN round_contestants rc ON rc.round_id = r.id AND rc.artist_id = ap.id
WHERE ap.entry_id = 12345
GROUP BY e.id, a.id, rc.id
ORDER BY e.date DESC;

-- City-based event statistics
SELECT 
  c.name as city,
  c.state,
  c.country,
  COUNT(DISTINCT e.id) as event_count,
  COUNT(DISTINCT DATE_TRUNC('year', e.date)) as years_active,
  MIN(e.date) as first_event,
  MAX(e.date) as last_event
FROM cities c
JOIN events e ON e.city_id = c.id
GROUP BY c.id
ORDER BY event_count DESC;
```

### Additional Table Queries

#### Artist Management

```sql
-- Find artist followers
SELECT 
  af.artist_id,
  ap.name as artist_name,
  p.name as follower_name,
  p.email as follower_email
FROM artist_followers af
JOIN artist_profiles ap ON af.artist_id = ap.id
JOIN people p ON af.follower_id = p.id
WHERE af.artist_id = (SELECT id FROM artist_profiles WHERE entry_id = 12345);

-- Get artist applications for an event
SELECT 
  aa.*,
  p.name as applicant_name,
  p.email as applicant_email,
  ap.entry_id
FROM artist_applications aa
JOIN people p ON aa.person_id = p.id
LEFT JOIN artist_profiles ap ON ap.person_id = p.id
WHERE aa.event_id = (SELECT id FROM events WHERE eid = 'AB1234');

-- Find merged artist profiles
SELECT 
  aml.*,
  master.name as master_name,
  master.entry_id as master_entry_id
FROM artist_merge_log aml
JOIN artist_profiles master ON aml.master_artist_id = master.id
ORDER BY aml.created_at DESC;
```

#### Notifications & Communications

```sql
-- Get unread notifications for a person
SELECT n.*, nr.read_at
FROM notifications n
LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.person_id = n.person_id
WHERE n.person_id = (SELECT id FROM people WHERE email = 'user@example.com')
  AND nr.read_at IS NULL
ORDER BY n.created_at DESC;

-- Check notification preferences
SELECT 
  p.name,
  np.*
FROM notification_preferences np
JOIN people p ON np.person_id = p.id
WHERE p.email = 'user@example.com';

-- View message queue status
SELECT 
  mq.*,
  p.name,
  p.email,
  p.phone
FROM message_queue mq
JOIN people p ON mq.person_id = p.id
WHERE mq.status = 'pending'
ORDER BY mq.created_at;
```

#### Payment Tracking

```sql
-- Get payment history for an art piece
SELECT 
  pl.*,
  p.name as payer_name,
  ps.name as payment_status,
  au.name as processed_by
FROM payment_logs pl
JOIN people p ON pl.person_id = p.id
JOIN payment_statuses ps ON pl.status_id = ps.id
LEFT JOIN admin_users au ON pl.admin_user_id = au.id
WHERE pl.art_id = (SELECT id FROM art WHERE art_code = 'AB1234-1-5')
ORDER BY pl.created_at DESC;

-- Find Stripe charges by person
SELECT 
  sc.*,
  p.name,
  p.email
FROM stripe_charges sc
JOIN people p ON sc.person_id = p.id
WHERE p.email = 'user@example.com'
ORDER BY sc.created_at DESC;

-- Art pieces with payment status
SELECT 
  a.art_code,
  ap.name as artist_name,
  ps_artist.name as artist_payment_status,
  ps_buyer.name as buyer_payment_status,
  a.artist_pay_recent_date,
  a.buyer_pay_recent_date
FROM art a
JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN payment_statuses ps_artist ON a.artist_pay_recent_status_id = ps_artist.id
LEFT JOIN payment_statuses ps_buyer ON a.buyer_pay_recent_status_id = ps_buyer.id
WHERE a.event_id = (SELECT id FROM events WHERE eid = 'AB1234');
```

#### Voting Analytics

```sql
-- Get vote weights for VIP voters
SELECT 
  vw.*,
  p.name,
  p.email,
  e.eid,
  e.name as event_name
FROM vote_weights vw
JOIN people p ON vw.person_id = p.id
JOIN events e ON vw.event_id = e.id
WHERE vw.weight > 1.0
ORDER BY e.event_start_datetime DESC;

-- Analyze voting patterns with weights
SELECT 
  v.round,
  COUNT(DISTINCT v.person_id) as voters,
  SUM(v.vote_factor) as weighted_votes,
  AVG(v.vote_factor) as avg_weight
FROM votes v
WHERE v.event_id = (SELECT id FROM events WHERE eid = 'AB1234')
GROUP BY v.round
ORDER BY v.round;

-- Track person interactions
SELECT 
  pi.*,
  p.name,
  e.eid,
  e.name as event_name
FROM people_interactions pi
JOIN people p ON pi.person_id = p.id
JOIN events e ON pi.event_id = e.id
WHERE p.email = 'user@example.com'
ORDER BY pi.created_at DESC;
```

#### System & Logging

```sql
-- Recent verification codes
SELECT 
  vc.*,
  p.name,
  p.phone,
  e.eid
FROM verification_codes vc
JOIN people p ON vc.person_id = p.id
LEFT JOIN events e ON vc.event_id = e.id
WHERE vc.created_at >= NOW() - INTERVAL '1 hour'
  AND vc.used_at IS NULL
ORDER BY vc.created_at DESC;

-- Promotion log analysis
SELECT 
  pl.*,
  p.name,
  p.email,
  e.eid
FROM promotion_logs pl
JOIN people p ON pl.person_id = p.id
LEFT JOIN events e ON pl.event_id = e.id
WHERE pl.created_at >= NOW() - INTERVAL '7 days'
ORDER BY pl.created_at DESC;

-- Event phone numbers configuration
SELECT 
  epn.*,
  e.eid,
  e.name
FROM event_phone_numbers epn
JOIN events e ON epn.event_id = e.id
WHERE e.event_start_datetime >= NOW()
ORDER BY e.event_start_datetime;
```

### Performance Optimization Tips

1. **Use Indexes**: Key indexed fields discovered in production:
   
   **People table indexes:**
   - `idx_people_email` on email
   - `idx_people_phone` on phone  
   - `idx_people_hash` on hash
   - `idx_people_mongo_id` on mongo_id
   - `idx_people_updated_at` on updated_at
   - Unique constraints on email, phone, hash, mongo_id
   
   **Events table indexes:**
   - `events_eid_key` unique on eid
   - `idx_events_city` on city_id
   - `idx_events_enabled_show` composite on (enabled, show_in_app)
   - `idx_events_start_date` on event_start_datetime
   
   **Artist_profiles indexes:**
   - `idx_artist_profiles_entry_id` on entry_id (unique)
   - `idx_artist_profiles_person` on person_id
   - `idx_artist_profiles_score` on score DESC
   - `idx_artist_profiles_mongo_id` on mongo_id
   
   **Art table indexes:**
   - `art_art_code_key` unique on art_code
   - `art_event_id_round_easel_key` unique composite on (event_id, round, easel)
   - `idx_art_artist_id` on artist_id
   - `idx_art_event_id` on event_id
   - `idx_art_mongo_lot_id` on mongo_lot_id
   
   **Votes indexes:**
   - `votes_event_id_round_person_id_key` unique on (event_id, round, person_id)
   - `idx_votes_art_id` on art_id
   - `idx_votes_person_id` on person_id
   - `idx_votes_event_id` on event_id
   - `idx_votes_event_round` composite on (event_id, round)
   
   **Bids indexes:**
   - `idx_bids_art_id` on art_id
   - `idx_bids_person_id` on person_id
   - `idx_bids_amount` on amount DESC

2. **Efficient Joins**: 
   - Always join through UUID relationships when possible
   - Use the unique constraints to ensure data integrity
   - Leverage composite indexes for multi-column filters

3. **Use CTEs for Complex Queries**:
   ```sql
   WITH artist_events AS (
     SELECT artist_id, COUNT(DISTINCT event_id) as event_count
     FROM art
     GROUP BY artist_id
   ),
   artist_votes AS (
     SELECT a.artist_id, COUNT(v.id) as total_votes
     FROM art a
     JOIN votes v ON v.art_id = a.id
     GROUP BY a.artist_id
   )
   SELECT 
     ap.*,
     ae.event_count,
     av.total_votes
   FROM artist_profiles ap
   JOIN artist_events ae ON ap.id = ae.artist_id
   LEFT JOIN artist_votes av ON ap.id = av.artist_id
   WHERE ae.event_count > 5;
   ```

4. **Leverage Generated Columns**: 
   - The `score` column on artist_profiles is auto-calculated from votes_count + followers_count
   - This avoids runtime calculations and is indexed for fast sorting

5. **Use EXPLAIN ANALYZE**: Always check query plans for optimization opportunities

6. **Batch Operations**: 
   - When inserting votes or bids, use batch inserts
   - Use COPY for large data imports

7. **Connection Pooling**: 
   - Use connection pooling for high-traffic operations
   - Supabase provides built-in connection pooling

8. **Materialized Views**: Consider creating materialized views for:
   - Event statistics dashboards
   - Artist leaderboards
   - Historical analytics

9. **Partitioning**: For very large tables like votes and system_logs, consider:
   - Partitioning by date range
   - Using system_logs_compressed for archived data

### Common Patterns

**Finding related data:**
```sql
-- Get complete context for any entity
-- Example: Full details for an art piece
SELECT 
  a.*,
  e.name as event_name,
  e.eid,
  ap.name as artist_name,
  ap.entry_id,
  r.round_number,
  array_agg(DISTINCT mf.url) as media_urls,
  COUNT(DISTINCT v.id) as vote_count,
  MAX(b.amount) as highest_bid
FROM art a
JOIN events e ON a.event_id = e.id
JOIN artist_profiles ap ON a.artist_id = ap.id
LEFT JOIN rounds r ON r.event_id = e.id AND r.round_number = a.round
LEFT JOIN art_media am ON am.art_id = a.id
LEFT JOIN media_files mf ON mf.id = am.media_id
LEFT JOIN votes v ON v.art_id = a.id
LEFT JOIN bids b ON b.art_id = a.id
WHERE a.art_code = 'AB1234-1-5'
GROUP BY a.id, e.id, ap.id, r.id;
```

**Pagination pattern:**
```sql
-- Paginated results with cursor
SELECT * FROM artist_profiles
WHERE score < $1  -- $1 is the last score from previous page
ORDER BY score DESC
LIMIT 20;
```

**Search pattern:**
```sql
-- Multi-field search
SELECT DISTINCT p.*
FROM people p
WHERE 
  p.name ILIKE '%' || $1 || '%' OR
  p.email ILIKE '%' || $1 || '%' OR
  p.phone LIKE '%' || $1 || '%'
ORDER BY p.created_at DESC;
```