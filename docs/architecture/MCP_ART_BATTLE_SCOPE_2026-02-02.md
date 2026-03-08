# Art Battle MCP Server Scope

**Date:** 2026-02-02
**Status:** Draft - Open for Contributions

---

## Overview

This document outlines the scope for an MCP (Model Context Protocol) server that provides AI agents access to Art Battle system data including votes, payments, registrations, voting results, auction results, and stats.

---

## 1. Events

| Data | Source | Description |
|------|--------|-------------|
| Event list | `events` table | Upcoming/past events with dates, venues |
| Event details | `events` + joins | Full event info including artists, rounds |
| Event status | `events.enabled`, `current_round` | Live event state |
| City/venue info | `cities`, `venues` tables | Location data |

**Key columns:** `id`, `eid`, `name`, `event_start_datetime`, `venue`, `enabled`, `show_in_app`, `current_round`, `city_id`, `currency`

**⚠️ CRITICAL: Event Currency**
The `events.currency` field MUST match the country's currency. Mismatched currencies cause payment failures because:
1. Artist earnings are calculated using event currency
2. Wrong currency routes to wrong Stripe platform
3. Artists get paid incorrect amounts

**Validate Event Currency:**
```sql
-- Check if event currency matches its country
SELECT e.eid, e.name, e.currency, co.currency_code as expected
FROM events e
JOIN cities c ON e.city_id = c.id
JOIN countries co ON c.country_id = co.id
WHERE e.eid = 'AB1234';
```

---

## 2. Voting

| Data | Source | Description |
|------|--------|-------------|
| Vote counts | `votes` table | Raw vote counts per artwork |
| Weighted votes | `get_event_weighted_votes()` function | Vote totals with factors applied |
| Vote factor breakdown | `get_event_vote_ranges()` function | Distribution of vote weights |
| Round winners | `round_contestants` table | Winner data per round |
| QR scan stats | `people_qr_scans` table | Local attendance verification |
| Person vote weights | `person_vote_weights` materialized view | Cached voter weights |

**Key columns (votes):** `id`, `event_id`, `eid`, `round`, `easel`, `art_uuid`, `person_id`, `vote_factor`, `created_at`

**Database Functions:**
```sql
get_event_weighted_votes(p_event_id uuid, p_round integer)
  -- Returns: art_id, raw_vote_count, weighted_vote_total

get_event_weighted_votes_by_eid(p_eid varchar, p_round integer)
  -- Returns: easel, art_id, raw_vote_count, weighted_vote_total

get_event_vote_ranges(p_event_id uuid)
  -- Returns: art_id, range_0_22, range_0_95, range_1_01, range_1_90, range_2_50, range_5_01, range_10_00, range_above_10, total_weight, total_votes

get_weighted_vote_total(p_art_id uuid)
  -- Returns: numeric (sum of weighted votes)

calculate_vote_weight(p_person_id uuid)
  -- Returns: base_weight, artist_bonus, vote_history_bonus, bid_history_bonus, total_weight
```

---

## 3. Auctions / Bids

| Data | Source | Description |
|------|--------|-------------|
| Current bids | `bids` table | Active bid amounts per artwork |
| Bid history | `bids` + `people` | Chronological bid records |
| Auction status | `art.status`, `art.closing_time` | Artwork auction state |
| Winners | `art.winner_id` | Winning bidders |
| Artwork offers | `artwork_offers` table | Formal purchase offers |

**Key columns (bids):** `id`, `art_id`, `person_id`, `amount`, `currency_code`, `created_at`

**Key columns (art):** `id`, `art_code`, `status`, `current_bid`, `bid_count`, `winner_id`, `closing_time`, `final_price`

**Art status enum:** `active`, `closed`, `inactive`, `sold`, `cancelled`, `paid`

---

## 4. Payments

| Data | Source | Description |
|------|--------|-------------|
| Buyer payment status | `art.buyer_pay_recent_status_id` | Artwork purchase status |
| Artist payment status | `art.artist_pay_recent_status_id` | Artist payout status |
| Payment statuses | `payment_statuses` table | Status definitions |
| Payment logs | `payment_logs` table | Payment transaction history |
| Payment processing | `payment_processing` table | In-flight payments |
| Artist payments | `artist_payments` table | Artist payout records |
| Global payment requests | `global_payment_requests` table | International payment requests |
| Artist global payments | `artist_global_payments` table | Artist Stripe Connect accounts |
| Stripe API conversations | `stripe_api_conversations` table | API call logs for debugging |

**Key columns (art - payment related):**
- `buyer_pay_recent_status_id`, `buyer_pay_recent_date`, `buyer_pay_recent_person_id`
- `artist_pay_recent_status_id`, `artist_pay_recent_date`, `artist_pay_recent_person_id`

### Artist Payment Tables

**`artist_payments`** - Core payment records:
```
id                    UUID PRIMARY KEY
artist_profile_id     UUID (FK to artist_profiles)
gross_amount          NUMERIC
net_amount            NUMERIC
platform_fee          NUMERIC
stripe_fee            NUMERIC
currency              TEXT (CAD, USD, AUD, THB, etc.)
status                TEXT (pending, processing, paid, failed, cancelled, verified)
stripe_transfer_id    TEXT (populated after successful Stripe transfer)
payment_type          TEXT (automated, manual)
payment_method        TEXT (bank_transfer, check, cash, paypal, other)
description           TEXT
created_at            TIMESTAMPTZ
paid_at               TIMESTAMPTZ
error_message         TEXT
metadata              JSONB
```

**`artist_global_payments`** - Artist Stripe Connect accounts:
```
id                    UUID PRIMARY KEY
artist_profile_id     UUID (FK to artist_profiles)
stripe_recipient_id   TEXT (acct_xxxx - Stripe Connect account ID)
status                TEXT (ready, pending, invited, needs_setup)
country               TEXT (CA, US, AU, TH, etc.)
default_currency      TEXT
metadata              JSONB (contains account_region: 'canada' or 'international')
```

**`stripe_api_conversations`** - API debugging logs:
```
id                    UUID PRIMARY KEY
payment_id            UUID
artist_profile_id     UUID
stripe_account_id     TEXT
api_endpoint          TEXT
request_method        TEXT
request_body          JSONB
response_status       INTEGER
response_body         JSONB
error_message         TEXT
created_at            TIMESTAMPTZ
```

### Payment Flow

1. **Ready to Pay**: Artist has `artist_global_payments.status = 'ready'` AND balance owed > 0
2. **Create Payment Record**: Admin clicks "Pay Now" → `process-artist-payment` creates record with `status='processing'`
3. **Execute Stripe Transfer**: Admin clicks "Process" from In Progress → `stripe-global-payments-payout` sends money
4. **Completion**: Record updated to `status='paid'` with `stripe_transfer_id` populated

### Payment Routing Logic

**CRITICAL**: Stripe transfers must go through the correct platform:
- **Canadian Stripe** (`stripe_canada_secret_key`): For artists onboarded via Canadian platform
- **International Stripe** (`stripe_intl_secret_key`): For all other artists

The routing is determined by the artist's `artist_global_payments.metadata.account_region`:
- `account_region: 'canada'` → Use Canadian Stripe key
- `account_region: 'international'` → Use International Stripe key

**⚠️ COMMON BUG**: Payment currency was incorrectly used for routing. A CAD payment doesn't mean use Canadian Stripe - it depends on where the artist's account was created!

### Database Functions for Payments

```sql
get_artist_balance_for_currency(p_artist_profile_id uuid, p_currency text)
  -- Returns: numeric (balance owed in specific currency)
  -- Calculates: earnings - payments for that currency only
  -- IMPORTANT: Counts 'processing' and 'pending' as already paid

get_ready_to_pay_artists()
  -- Returns artists ready for payment (one row per currency)
  -- Conditions: status='ready' AND balance > 0 AND no active payment

get_payment_attempts(days_back integer)
  -- Returns: processing/pending/failed payments
  -- Used by In Progress tab

get_completed_payments(days_back integer)
  -- Returns: paid/verified payments
  -- Used by Completed Payments tab
```

---

## 5. Registrations

| Data | Source | Description |
|------|--------|-------------|
| Event registrations | `event_registrations` table | Who registered for events |
| Vote weights | `vote_weights` table | Pre-registered voter weights |
| QR scans | `people_qr_scans` table | In-venue QR code scans |
| Eventbrite data | `eventbrite_orders_cache` table | Ticket sales data |

**Key columns (event_registrations):** `person_id`, `event_id`, `registration_date`, `registration_method`

**Key columns (people_qr_scans):** `person_id`, `event_id`, `qr_code`, `is_valid`, `scan_timestamp`

---

## 6. Artists

| Data | Source | Description |
|------|--------|-------------|
| Artist profiles | `artist_profiles` table | Artist bios, socials, contact |
| Event assignments | `event_artists` table | Who's painting at which event |
| Art assignments | `art` table | Which easel/round for each artist |
| Artist invitations | `artist_invitations` table | Pending invites |

**Key columns (artist_profiles):** `id`, `name`, `email`, `phone`, `bio`, `abhq_bio`, `instagram`, `website`, `city_text`, `is_active`

**Key columns (event_artists):** `event_id`, `artist_id`, `status`, `easel_preference`

**Event artist status values:** `invited`, `confirmed`, `declined`, `cancelled`

---

## 7. Stats / Analytics

| Data | Source | Description |
|------|--------|-------------|
| Weekly vote overview | `get_overview_votes_weekly()` | Aggregated voting trends |
| Event analytics | `event-analytics-dashboard` edge function | Event performance metrics |
| City stats | `cities` + event aggregates | Per-city performance |
| Artist stats | `admin-artist-stats` edge function | Artist historical performance |

---

## 8. People / Users

| Data | Source | Description |
|------|--------|-------------|
| Person records | `people` table | Voter/bidder profiles |
| Auth users | `auth.users` (Supabase) | Authentication records |
| Admin users | `abhq_admin_users` table | Admin access control |

**Key columns (people):** `id`, `auth_user_id`, `phone`, `email`, `first_name`, `last_name`, `nickname`, `is_artist`

---

## Key Database Tables

```
events              -- Event definitions
art                 -- Artworks per event
votes               -- Individual votes
bids                -- Auction bids
people              -- User/voter/bidder records
artist_profiles     -- Artist information
event_artists       -- Artist-event assignments
event_registrations -- Event attendance registrations
people_qr_scans     -- QR code scan records
vote_weights        -- Pre-registered vote weights
payment_logs        -- Payment transaction logs
payment_statuses    -- Payment status definitions
round_contestants   -- Round winner tracking
cities              -- City definitions
venues              -- Venue definitions
```

---

## Key Edge Functions

| Function | Path | Description |
|----------|------|-------------|
| Admin Event Data | `/supabase/functions/admin-event-data/` | Full event admin data |
| Artist Stats | `/supabase/functions/admin-artist-stats/` | Artist performance history |
| Event Analytics | `/supabase/functions/event-analytics-dashboard/` | Event metrics |
| Public Event | `/supabase/functions/v2-public-event/` | Public event data |
| Public Events List | `/supabase/functions/v2-public-events/` | Events listing |

### Payment Edge Functions

| Function | Path | Description |
|----------|------|-------------|
| Working Admin Payments | `/supabase/functions/working-admin-payments/` | Fetches all payment dashboard data (5 tabs) |
| Process Artist Payment | `/supabase/functions/process-artist-payment/` | Creates payment record (step 1 of 2) |
| Stripe Global Payout | `/supabase/functions/stripe-global-payments-payout/` | Executes Stripe transfer (step 2 of 2) |
| Admin Reset Payment | `/supabase/functions/admin-reset-payment-status/` | Resets failed payment status |
| Stripe Connect Onboard | `/supabase/functions/stripe-global-payments-onboard/` | Creates artist Stripe Connect account |

**Payment Flow:**
```
Ready to Pay tab → Click "Pay Now"
    ↓
process-artist-payment (creates artist_payments record with status='processing')
    ↓
In Progress tab → Click "Process"
    ↓
stripe-global-payments-payout (executes Stripe transfer, updates status='paid')
    ↓
Completed Payments tab
```

---

## Suggested MCP Tools

### Read Operations

1. `get_event_details(eid: string)` - Full event info with artists, rounds
2. `get_live_voting_status(eid: string, round?: number)` - Current vote counts and weights
3. `get_auction_status(eid: string)` - Bid status for all artworks
4. `get_bid_history(art_code: string)` - Chronological bids for artwork
5. `get_payment_summary(eid: string)` - Payment completion status
6. `get_artist_stats(artist_id: string)` - Artist performance history
7. `get_artist_events(artist_id: string)` - Events for an artist
8. `search_events(query: string, date_range?: {start, end})` - Find events
9. `get_attendance_stats(eid: string)` - QR scans, registrations
10. `get_round_winners(eid: string)` - Winners per round
11. `get_person_vote_history(person_id: string)` - Voting history for a person
12. `get_upcoming_events(limit?: number)` - Next N events

### Aggregate/Stats Operations

13. `get_city_stats(city_id: string)` - Stats for a city
14. `get_weekly_overview()` - Weekly voting/bidding trends
15. `get_event_comparison(eids: string[])` - Compare multiple events

---

## Database Connection

```
Host: db.xsqdkubgyqwpyvfltnrf.supabase.co
Port: 5432
Database: postgres
User: postgres
Password: 6kEtvU9n0KhTVr5
```

---

## Quick Reference - PSQL Syntax

### Basic Connection
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres
```

### Run a Query
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "SELECT * FROM events LIMIT 5;"
```

### Run a Query with Expanded Output (vertical)
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -x -c "SELECT * FROM events WHERE eid = 'AB4001';"
```

### Run a Migration File
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.artb.art -p 5432 -d postgres -U postgres -f migrations/[MIGRATION_FILE].sql
```

### Common Meta-Commands
```sql
\d tablename          -- Describe table structure
\d+ tablename         -- Describe with extra info
\dt                   -- List tables
\df                   -- List functions
\df+ function_name    -- Show function definition
\dT+ enum_name        -- Show enum values
\x                    -- Toggle expanded output
```

### Get Function Definition
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "SELECT pg_get_functiondef('function_name'::regproc);"
```

### Check RLS Policies
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -c "SELECT polname, polcmd, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = 'table_name'::regclass;"
```

---

## Common Queries Reference

### Get Event by EID
```sql
SELECT * FROM events WHERE eid = 'AB4001';
```

### Get Votes for Artwork
```sql
SELECT v.*, p.phone, p.first_name
FROM votes v
LEFT JOIN people p ON v.person_id = p.id
WHERE v.art_uuid = 'uuid-here'
ORDER BY v.created_at DESC;
```

### Get Weighted Votes for Event
```sql
SELECT * FROM get_event_weighted_votes_by_eid('AB4001', 1);
```

### Get Bids for Artwork
```sql
SELECT b.*, p.phone, p.first_name
FROM bids b
LEFT JOIN people p ON b.person_id = p.id
WHERE b.art_id = 'uuid-here'
ORDER BY b.amount DESC;
```

### Get All Art for Event
```sql
SELECT a.art_code, a.round, a.easel, a.status, a.current_bid, ap.name as artist
FROM art a
LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
WHERE a.event_id = 'event-uuid-here'
ORDER BY a.round, a.easel;
```

### Get Person by Phone
```sql
SELECT * FROM people WHERE phone = '+16471234567';
```

### Check QR Scans for Event
```sql
SELECT COUNT(*) FROM people_qr_scans WHERE event_id = 'event-uuid-here';
```

### Update Vote Factor (careful!)
```sql
UPDATE votes SET vote_factor = 0.11
WHERE art_uuid = 'uuid-here'
AND created_at < NOW() - INTERVAL '30 minutes';
```

---

## Payments Troubleshooting

### Check Artist Balance by Currency
```sql
SELECT
  get_artist_balance_for_currency('artist-profile-uuid', 'CAD') as cad_balance,
  get_artist_balance_for_currency('artist-profile-uuid', 'USD') as usd_balance;
```

### Find Artist by Entry ID or Name
```sql
SELECT id, name, entry_id, email, phone
FROM artist_profiles
WHERE entry_id = 310957 OR name ILIKE '%artist name%';
```

### Check Artist's Stripe Account Setup
```sql
SELECT agp.*, ap.name, ap.entry_id
FROM artist_global_payments agp
JOIN artist_profiles ap ON agp.artist_profile_id = ap.id
WHERE ap.entry_id = 310957;
-- Look for: status='ready', stripe_recipient_id exists, metadata.account_region
```

### Check Artist's Earnings (Paid Art)
```sql
SELECT a.art_code, a.current_bid, a.status, e.eid, e.name, e.currency,
       COALESCE(a.final_price, a.current_bid, 0) * e.artist_auction_portion as artist_portion
FROM art a
JOIN events e ON a.event_id = e.id
WHERE a.artist_id = 'artist-profile-uuid'
AND a.status = 'paid'
ORDER BY a.created_at DESC;
```

### Check Artist's Payment History
```sql
SELECT id, gross_amount, currency, status, stripe_transfer_id, created_at, error_message
FROM artist_payments
WHERE artist_profile_id = 'artist-profile-uuid'
ORDER BY created_at DESC;
```

### Find Stuck Payments (Processing with No Stripe Transfer)
```sql
SELECT ap.id, apr.name, apr.entry_id, ap.gross_amount, ap.currency, ap.status, ap.created_at
FROM artist_payments ap
JOIN artist_profiles apr ON ap.artist_profile_id = apr.id
WHERE ap.status IN ('processing', 'pending')
AND ap.stripe_transfer_id IS NULL
ORDER BY ap.created_at DESC;
```

### Delete Stuck Payment (careful!)
```sql
DELETE FROM artist_payments
WHERE id = 'payment-uuid-here'
AND status IN ('processing', 'pending', 'failed')
AND stripe_transfer_id IS NULL;
```

### Check Stripe API Errors for Payment
```sql
SELECT api_endpoint, response_status, error_message, request_body, response_body, created_at
FROM stripe_api_conversations
WHERE payment_id = 'payment-uuid-here'
ORDER BY created_at DESC;
```

### Find Events with Wrong Currency (Currency Mismatch)
```sql
SELECT e.eid, e.name, e.currency as event_currency, co.name as country, co.currency_code as expected
FROM events e
JOIN cities c ON e.city_id = c.id
JOIN countries co ON c.country_id = co.id
WHERE e.currency != co.currency_code AND e.currency IS NOT NULL
ORDER BY co.name;
```

### Fix Event Currency to Match Country
```sql
UPDATE events e
SET currency = co.currency_code
FROM cities c, countries co
WHERE e.city_id = c.id
AND c.country_id = co.id
AND e.eid = 'AB1234';
```

### Fix ALL Events Currency to Match Country (careful!)
```sql
UPDATE events e
SET currency = co.currency_code
FROM cities c, countries co
WHERE e.city_id = c.id
AND c.country_id = co.id
AND e.currency != co.currency_code
AND e.currency IS NOT NULL;
```

### Common Payment Issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Currency mismatch** | Payment fails, wrong Stripe platform | Fix event currency, delete stuck payment, retry |
| **No payment ID** | "No payment ID found" error | Bug in UI - payment_id not captured. Refresh page, retry |
| **Insufficient funds** | Stripe error about balance | Check Stripe dashboard balance, enable manual payouts |
| **Account not ready** | "Account not ready" error | Artist needs to complete Stripe onboarding |
| **Wrong Stripe platform** | Transfer to account on different platform | Artist was onboarded to wrong platform, or currency routing bug |
| **Balance shows 0** | Artist not appearing in Ready to Pay | Check for stuck 'processing' payments blocking balance calculation |

### Country Currency Reference

| Country | Currency Code | Stripe Platform |
|---------|---------------|-----------------|
| Canada | CAD | Canadian |
| USA | USD | International |
| Australia | AUD | International |
| Thailand | THB | International |
| Netherlands | EUR | International |
| New Zealand | NZD | International |
| UK | GBP | International |
| Mexico | MXN | International |

### Delete Bids Over Amount (careful!)
```sql
DELETE FROM bids
WHERE art_id = 'uuid-here'
AND amount > 70.00
RETURNING id, amount;
```

### Fix Cached Current Bid on Art
```sql
UPDATE art
SET current_bid = (SELECT MAX(amount) FROM bids WHERE art_id = art.id),
    bid_count = (SELECT COUNT(*) FROM bids WHERE art_id = art.id)
WHERE id = 'uuid-here';
```

---

## External APIs (Keys Shielded in MCP)

The MCP server holds API keys securely - agents never see raw credentials.

### Stripe API

**Use Cases:**
- Look up payment intent status
- Check customer payment methods
- Verify Connect account status
- Get payout history for artists
- Refund processing status

**Suggested MCP Tools:**

| Tool | Description |
|------|-------------|
| `stripe_get_payment_intent(payment_intent_id)` | Get payment intent details |
| `stripe_get_customer(customer_id)` | Get customer info |
| `stripe_list_customer_payments(customer_id, limit?)` | Recent payments for customer |
| `stripe_get_connect_account(account_id)` | Get Connect account status |
| `stripe_get_account_balance(account_id)` | Get Connect account balance |
| `stripe_list_payouts(account_id, limit?)` | Get payout history |
| `stripe_get_refund(refund_id)` | Get refund status |
| `stripe_search_customers(email_or_phone)` | Find customer by email/phone |

**Stripe Account Types:**
- **Platform (US):** Main Art Battle Stripe account
- **Platform (International):** Global payments account
- **Connect Accounts:** Individual artist payout accounts

**Key Stripe Objects:**
```
payment_intent    -- A payment attempt
customer          -- Buyer record
charge            -- Completed payment
refund            -- Refund record
transfer          -- Money moved to Connect account
payout            -- Money sent to artist bank
account           -- Connect account (artist)
```

**Environment Variables (stored in MCP, never exposed):**
```
STRIPE_SECRET_KEY           -- Platform API key
STRIPE_WEBHOOK_SECRET       -- Webhook verification
STRIPE_CONNECT_CLIENT_ID    -- Connect OAuth
```

---

### Eventbrite API

**Use Cases:**
- Fetch ticket sales data
- Get attendee lists
- Check order status

**Suggested MCP Tools:**

| Tool | Description |
|------|-------------|
| `eventbrite_get_event(event_id)` | Get event details |
| `eventbrite_list_attendees(event_id)` | Get attendee list |
| `eventbrite_get_order(order_id)` | Get order details |
| `eventbrite_get_sales_summary(event_id)` | Ticket sales summary |

---

### Telnyx API (SMS)

**Use Cases:**
- Check SMS delivery status
- Get message history
- Check account balance

**Suggested MCP Tools:**

| Tool | Description |
|------|-------------|
| `telnyx_get_message(message_id)` | Get SMS status |
| `telnyx_get_balance()` | Check account balance |
| `telnyx_list_messages(phone?, limit?)` | Message history |

---

### Twilio API (Legacy SMS)

**Use Cases:**
- Check legacy SMS delivery
- Message history lookup

**Suggested MCP Tools:**

| Tool | Description |
|------|-------------|
| `twilio_get_message(message_sid)` | Get SMS status |
| `twilio_list_messages(phone?, limit?)` | Message history |

---

## Security Considerations

**API Key Shielding:**
- All external API keys stored in MCP server environment
- Agents NEVER see raw API keys - only call MCP tools
- MCP acts as secure proxy to external services

**Database Access:**
- MCP uses service_role key for read access
- Write operations should be limited/audited
- Dangerous operations (DELETE, UPDATE) require confirmation

**PII Protection:**
- Full phone numbers masked in responses (show last 4 only)
- Email addresses partially masked
- Payment card details never exposed (use Stripe references)

**Rate Limiting:**
- Expensive queries should be rate limited
- External API calls should respect provider limits
- Cache frequently accessed data where appropriate

---

## Contributors

- [Add your name here]

---

## Changelog

- 2026-02-02: Initial draft
- 2026-02-02: Added comprehensive artist payments section with tables, flow, and routing logic
- 2026-02-02: Added payments troubleshooting section with common queries and issues
- 2026-02-02: Added payment edge functions documentation
- 2026-02-02: Added event currency validation (critical for payment accuracy)
