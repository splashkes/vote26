# Comprehensive RPC Functions List - Art Battle Vote26
**Date**: August 17, 2025  
**Context**: Complete catalog of all custom business logic RPC functions in the Vote26 system  
**Purpose**: Reference for broadcast caching strategy and system understanding

---

## **Vote & Weight Management** (Admin Dashboard Core)

### Vote Data Functions (High Priority for Caching)
```sql
-- Core vote data used by admin vote bars - HIGH FREQUENCY CALLS
get_event_weighted_votes(p_event_id uuid, p_round integer DEFAULT NULL)
-- Returns: art_id, raw_vote_count, weighted_vote_total
-- Used by: AdminPanel vote bars, EventDetails admin view
-- Call frequency: Every vote triggers refresh (1000+ calls/hour during events)

get_event_vote_ranges(p_event_id uuid)  
-- Returns: art_id, range_0_22, range_0_95, range_1_01, range_1_90, range_2_50, range_5_01, range_10_00, range_above_10, total_weight, total_votes
-- Used by: AdminPanel segmented vote bars
-- Call frequency: Every vote triggers refresh (1000+ calls/hour during events)

get_event_weighted_votes_by_eid(p_eid character varying, p_round integer DEFAULT NULL)
-- Returns: easel, art_id, raw_vote_count, weighted_vote_total  
-- Used by: Alternative EID-based vote queries
-- Call frequency: Medium

get_voting_leaders(p_event_id uuid)
-- Returns: jsonb voting leaderboard
-- Used by: Leaderboard displays
-- Call frequency: Medium

get_voting_summary(p_event_id uuid)
-- Returns: jsonb vote summary stats
-- Used by: Event summary dashboards
-- Call frequency: Low

get_weighted_vote_total(p_art_id uuid)
-- Returns: numeric total weight for single artwork
-- Used by: Individual artwork weight queries
-- Call frequency: Low
```

### Vote Processing Functions
```sql
calculate_vote_weight(p_person_id uuid)
-- Returns: TABLE(base_weight numeric, artist_bonus numeric, vote_history_bonus numeric, bid_history_bonus numeric, total_weight numeric)
-- Used by: Vote weight calculation system
-- Call frequency: Per vote cast

cast_vote_secure(p_eid character varying, p_round integer, p_easel integer)
-- Returns: jsonb vote result
-- Used by: Main voting function (EID-based)
-- Call frequency: Every vote action

cast_vote_secure(p_art_id text)
-- Returns: jsonb vote result  
-- Used by: Alternative voting function (art_id-based)
-- Call frequency: Every vote action

manual_refresh_vote_weights()
-- Returns: text status message
-- Used by: Admin manual refresh
-- Call frequency: Manual only
```

---

## **Auction & Bidding** (Real-time Updates Core)

### Auction Status Functions (Medium Priority for Caching)
```sql
get_auction_summary(p_event_id uuid)
-- Returns: jsonb auction overview
-- Used by: Admin auction dashboard
-- Call frequency: Medium during auctions

get_auction_timer_status(p_event_id uuid)
-- Returns: jsonb timer states for all artworks
-- Used by: Auction countdown timers, admin panel
-- Call frequency: High during auctions (every 10 seconds)

manage_auction_timer(p_event_id uuid, p_action text, p_duration_minutes integer DEFAULT 12, p_admin_phone text DEFAULT NULL)
-- Returns: jsonb operation result
-- Used by: Admin auction timer control
-- Call frequency: Admin actions only

manage_auction_timer(p_art_code text, p_action text, p_timer_minutes integer DEFAULT 12)
-- Returns: jsonb operation result
-- Used by: Alternative timer management by art code
-- Call frequency: Admin actions only
```

### Bidding Functions (High Priority for Caching)
```sql
get_bid_history_with_names(p_art_ids uuid[])
-- Returns: TABLE(id uuid, art_id uuid, person_id uuid, amount numeric, created_at timestamp, display_name text)
-- Used by: Bid history displays in EventDetails
-- Call frequency: High during auctions (every bid triggers refresh)

place_bid_secure(p_art_id uuid, p_amount numeric)
-- Returns: jsonb bid result
-- Used by: Main bidding function
-- Call frequency: Every bid action

handle_auction_extension(p_art_id uuid, p_bid_time timestamp DEFAULT now())
-- Returns: jsonb extension result
-- Used by: Automatic auction timer extensions
-- Call frequency: Triggered by late bids
```

### Auction Management Functions
```sql
close_auction_manually(p_art_code text)
-- Returns: jsonb close result
-- Used by: Admin manual auction closing
-- Call frequency: Admin actions only

clear_auction_closing_time(p_art_code text)
-- Returns: jsonb clear result
-- Used by: Admin timer clearing
-- Call frequency: Admin actions only

check_and_close_expired_auctions()
-- Returns: jsonb processing result
-- Used by: Automated auction closing (cron job)
-- Call frequency: Scheduled (every 30 seconds)
```

---

## **Event Management** (Admin Tools)

### Event Data Functions
```sql
get_event_registration_count(p_event_id uuid)
-- Returns: integer registration count
-- Used by: Admin event statistics
-- Call frequency: Low

get_event_admins_with_people(p_event_id uuid)
-- Returns: TABLE(id uuid, phone character varying, admin_level character varying, people jsonb)
-- Used by: Admin user management
-- Call frequency: Low
```

### QR Code System Functions
```sql
create_event_qr_secret(p_event_id uuid)
-- Returns: text secret token
-- Used by: QR code generation for events
-- Call frequency: Event setup only

get_event_from_qr_secret(p_secret_token text)
-- Returns: uuid event_id
-- Used by: QR code validation during scanning
-- Call frequency: High during event entry

has_valid_qr_scan(p_person_id uuid, p_event_id uuid)
-- Returns: boolean scan validity
-- Used by: QR scan validation checks
-- Call frequency: Medium

cleanup_expired_qr_codes()
-- Returns: integer cleanup count
-- Used by: QR code maintenance (cron job)
-- Call frequency: Scheduled daily
```

---

## **Person & Registration Management**

### Person Management Functions
```sql
ensure_person_exists(p_phone text)
-- Returns: uuid person_id
-- Used by: Person creation/lookup during registration
-- Call frequency: High during registration periods

ensure_person_linked(p_user_id uuid)
-- Returns: uuid person_id
-- Used by: Auth user to person linking
-- Call frequency: High during authentication

get_auth_person_id()
-- Returns: uuid current user's person_id
-- Used by: Session person identification
-- Call frequency: High (called frequently in UI)

get_person_event_registration(p_person_id uuid, p_event_id uuid)
-- Returns: TABLE(registration_id uuid, registration_type character varying, registration_source character varying, registered_at timestamp, qr_code text)
-- Used by: Registration status checks
-- Call frequency: Medium

is_person_registered_for_event(p_person_id uuid, p_event_id uuid)
-- Returns: boolean registration status
-- Used by: Quick registration validation
-- Call frequency: High
```

### Profile Management Functions
```sql
create_new_profile(target_person_id uuid, profile_name text, profile_email text DEFAULT NULL, profile_phone text DEFAULT NULL)
-- Returns: TABLE(success boolean, message text, new_profile_id uuid)
-- Used by: Artist profile creation
-- Call frequency: Low

lookup_profiles_by_contact(target_phone text, target_email text DEFAULT NULL)
-- Returns: TABLE(id uuid, name character varying, email character varying, phone character varying, bio text, city character varying, website text, instagram character varying, facebook character varying, mongo_id character varying, person_id uuid, set_primary_profile_at timestamp, match_type text, score integer)
-- Used by: Artist profile searches
-- Call frequency: Low

has_primary_profile(target_person_id uuid)
-- Returns: TABLE(has_primary boolean, profile_id uuid, profile_name character varying)
-- Used by: Profile management checks
-- Call frequency: Medium

get_unified_sample_works(profile_id uuid)
-- Returns: TABLE(id uuid, title text, description text, image_url text, source_type text, display_order integer, cloudflare_id text, original_url text, compressed_url text)
-- Used by: Artist portfolio displays
-- Call frequency: Low
```

---

## **Admin & Security**

### Admin Permission Functions
```sql
check_event_admin_permission(p_event_id uuid, p_required_level text, p_user_id uuid DEFAULT auth.uid(), p_user_phone character varying DEFAULT NULL)
-- Returns: boolean permission status
-- Used by: Admin access control throughout system
-- Call frequency: High for admin users

get_user_admin_level(p_event_id uuid, p_user_id uuid DEFAULT auth.uid(), p_user_phone character varying DEFAULT NULL)
-- Returns: text admin level
-- Used by: Admin level determination
-- Call frequency: High for admin users

is_super_admin()
-- Returns: boolean super admin status
-- Used by: Super admin privilege checks
-- Call frequency: Medium

admin_update_art_status(p_art_code text, p_new_status text, p_admin_phone text DEFAULT NULL)
-- Returns: jsonb update result
-- Used by: Admin artwork status management
-- Call frequency: Admin actions only
```

### Security & Rate Limiting Functions
```sql
check_rate_limit(p_ip_address text, p_window_minutes integer DEFAULT 5, p_max_attempts integer DEFAULT 10)
-- Returns: boolean rate limit status
-- Used by: Rate limiting protection
-- Call frequency: High (every request)

block_ip_address(p_ip_address text, p_duration_minutes integer DEFAULT 60, p_reason text DEFAULT 'rate_limit')
-- Returns: void
-- Used by: IP blocking for security
-- Call frequency: Security events only

is_ip_blocked(p_ip_address text)
-- Returns: boolean block status
-- Used by: IP block checks
-- Call frequency: High (every request)

check_photo_permission(p_event_id uuid, p_user_phone text)
-- Returns: boolean photo permission
-- Used by: Photo upload authorization
-- Call frequency: Photo upload attempts

check_my_photo_permission(p_event_id uuid)
-- Returns: boolean photo permission for current user
-- Used by: Photo upload UI display
-- Call frequency: Medium
```

---

## **Payment Processing**

### Payment Status Functions
```sql
get_payment_status(p_art_id uuid)
-- Returns: TABLE(has_payment boolean, payment_status text, payment_method text, amount numeric, currency character varying, completed_at timestamp, stripe_session_id text)
-- Used by: Payment status displays
-- Call frequency: Medium

get_artist_payment_status(p_art_id uuid)
-- Returns: TABLE(payment_status text, gross_amount numeric, net_amount numeric, currency character varying, paid_at timestamp, has_buyer_payment boolean, buyer_payment_status text)
-- Used by: Artist payment tracking
-- Call frequency: Low

complete_stripe_payment(p_session_id text, p_payment_intent_id text, p_payment_method text DEFAULT 'stripe')
-- Returns: jsonb completion result
-- Used by: Stripe payment completion webhooks
-- Call frequency: Payment completions only

mark_artwork_paid(p_art_id uuid, p_payment_reference text DEFAULT NULL)
-- Returns: boolean success status
-- Used by: Manual payment marking
-- Call frequency: Admin actions only
```

---

## **Messaging & Notifications**

### Slack Integration Functions
```sql
queue_slack_message(p_channel character varying, p_message text, p_priority integer DEFAULT 5)
-- Returns: jsonb queue result
-- Used by: Slack message queueing system
-- Call frequency: Event-driven

process_slack_queue()
-- Returns: jsonb processing result
-- Used by: Slack queue processing (cron job)
-- Call frequency: Scheduled (every minute)

get_slack_queue_status()
-- Returns: jsonb queue status
-- Used by: Admin monitoring
-- Call frequency: Low

manual_process_slack_queue()
-- Returns: jsonb processing result
-- Used by: Manual queue processing
-- Call frequency: Manual only

send_slack_message(p_channel character varying, p_text text, p_thread_ts character varying DEFAULT NULL, p_priority integer DEFAULT 5)
-- Returns: jsonb send result
-- Used by: Direct Slack messaging
-- Call frequency: Event-driven

format_slack_message(p_type character varying, p_payload jsonb)
-- Returns: jsonb formatted message
-- Used by: Slack message formatting
-- Call frequency: Event-driven

add_slack_channel(p_channel_name character varying, p_channel_id character varying)
-- Returns: void
-- Used by: Slack channel management
-- Call frequency: Setup only

cache_slack_channel(p_channel_name character varying, p_channel_id character varying)
-- Returns: void
-- Used by: Slack channel caching
-- Call frequency: Setup only

cleanup_slack_test_data()
-- Returns: jsonb cleanup result
-- Used by: Test data cleanup
-- Call frequency: Manual only
```

### SMS & Notification Functions
```sql
queue_sms_message(p_phone character varying, p_message text, p_priority integer DEFAULT 5, p_message_type character varying DEFAULT 'general', p_reference_id uuid DEFAULT NULL)
-- Returns: jsonb queue result
-- Used by: SMS message queueing
-- Call frequency: Event-driven

process_sms_queue()
-- Returns: jsonb processing result
-- Used by: SMS queue processing (cron job)
-- Call frequency: Scheduled (every 30 seconds)

get_message_queue_stats()
-- Returns: TABLE(status text, channel text, count bigint, oldest_message timestamp)
-- Used by: Message queue monitoring
-- Call frequency: Low

get_notification_badge_count(p_person_id uuid)
-- Returns: integer notification count
-- Used by: UI notification badges
-- Call frequency: High

mark_notification_read(p_notification_id uuid)
-- Returns: boolean success status
-- Used by: Notification management
-- Call frequency: User actions

check_sms_results()
-- Returns: void
-- Used by: SMS delivery result checking (cron job)
-- Call frequency: Scheduled (every 5 minutes)
```

---

## **System Monitoring & Maintenance**

### Realtime Performance Monitoring (Critical for WAL Lag Analysis)
```sql
get_realtime_queue_stats()
-- Returns: TABLE(metric_name text, metric_value bigint, metric_unit text, last_updated timestamp, status text)
-- Used by: Realtime system monitoring
-- Call frequency: Monitoring systems

get_realtime_slot_details()
-- Returns: TABLE(slot_name text, slot_type text, active boolean, wal_lag_bytes bigint, confirmed_flush_lsn pg_lsn, restart_lsn pg_lsn)
-- Used by: Replication slot monitoring
-- Call frequency: Monitoring systems

get_table_realtime_activity()
-- Returns: TABLE(table_name text, total_changes bigint, recent_changes bigint, avg_change_size numeric, last_change_time timestamp)
-- Used by: Table activity analysis
-- Call frequency: Monitoring systems
```

### System Maintenance Functions
```sql
cleanup_expired_qr_codes()
-- Returns: integer cleanup count
-- Used by: QR code maintenance (cron job)
-- Call frequency: Scheduled daily

cleanup_security_logs()
-- Returns: integer cleanup count
-- Used by: Security log maintenance (cron job)
-- Call frequency: Scheduled daily

compress_old_logs()
-- Returns: void
-- Used by: Log compression (cron job)
-- Call frequency: Scheduled weekly

delete_expired_logs()
-- Returns: void
-- Used by: Log deletion (cron job)
-- Call frequency: Scheduled monthly

manual_refresh_vote_weights()
-- Returns: text status message
-- Used by: Manual vote weight refresh
-- Call frequency: Manual only
```

### Configuration & Secret Management
```sql
get_secret(secret_name text)
-- Returns: text secret value
-- Used by: Application configuration
-- Call frequency: Application startup

get_vault_secret(secret_name text)
-- Returns: text vault secret value
-- Used by: Secure configuration access
-- Call frequency: Application startup

get_cloudflare_config()
-- Returns: jsonb cloudflare configuration
-- Used by: Cloudflare integration setup
-- Call frequency: Application startup
```

---

## **HTTP & External Integration Functions**

### HTTP Client Functions (pg_net extension)
```sql
http(request http_request)
-- Returns: http_response
-- Used by: Generic HTTP requests

http_get(uri character varying)
http_get(uri character varying, data jsonb)
-- Returns: http_response
-- Used by: HTTP GET requests

http_post(uri character varying, content character varying, content_type character varying)
http_post(uri character varying, data jsonb)
-- Returns: http_response
-- Used by: HTTP POST requests

http_put(uri character varying, content character varying, content_type character varying)
-- Returns: http_response
-- Used by: HTTP PUT requests

http_delete(uri character varying)
http_delete(uri character varying, content character varying, content_type character varying)
-- Returns: http_response
-- Used by: HTTP DELETE requests

http_patch(uri character varying, content character varying, content_type character varying)
-- Returns: http_response
-- Used by: HTTP PATCH requests

http_head(uri character varying)
-- Returns: http_response
-- Used by: HTTP HEAD requests

http_header(field character varying, value character varying)
-- Returns: http_header
-- Used by: HTTP header construction

http_list_curlopt()
-- Returns: TABLE(curlopt text, value text)
-- Used by: HTTP client configuration

http_set_curlopt(curlopt character varying, value character varying)
-- Returns: boolean
-- Used by: HTTP client option setting

http_reset_curlopt()
-- Returns: boolean
-- Used by: HTTP client option reset
```

---

## **Trigger Functions** (Database Event Handlers)

```sql
-- Authentication & User Management Triggers
handle_auth_user_created()
-- Returns: trigger
-- Used by: Auto-create person record on auth user creation

handle_phone_verification()
-- Returns: trigger
-- Used by: Process phone verification events

link_person_on_phone_verification()
-- Returns: trigger
-- Used by: Link person to auth user on phone verification

log_phone_verification()
-- Returns: trigger
-- Used by: Log phone verification attempts

-- Data Integrity Triggers
ensure_single_primary_image()
-- Returns: trigger
-- Used by: Enforce single primary image per artwork

ensure_single_featured_work()
-- Returns: trigger
-- Used by: Enforce single featured work per profile

enforce_sample_works_limit()
-- Returns: trigger
-- Used by: Limit sample works per profile

-- Performance & Maintenance Triggers
cleanup_old_logs()
-- Returns: trigger
-- Used by: Auto-cleanup old log entries

check_lead_changes()
-- Returns: trigger
-- Used by: Monitor lead status changes

-- Notification Triggers
queue_bid_notification()
-- Returns: trigger
-- Used by: Queue notifications for new bids

trigger_auction_closed_notification()
-- Returns: trigger
-- Used by: Send notifications when auctions close

notify_auth_webhook()
-- Returns: trigger
-- Used by: Call auth webhook for user events

sync_round_contestants_to_art()
-- Returns: trigger
-- Used by: Sync round contestant changes to art table
```

---

## **Priority Functions for Broadcast Caching Strategy**

### **High Priority** (Called 100+ times/hour during events)
1. **`get_event_weighted_votes`** - Admin vote bars refresh on every vote
2. **`get_event_vote_ranges`** - Admin vote range segments refresh on every vote  
3. **`get_bid_history_with_names`** - Bid displays refresh on every bid
4. **`get_auction_timer_status`** - Auction timers refresh every 10 seconds
5. **`get_auth_person_id`** - Called frequently throughout UI
6. **`is_person_registered_for_event`** - Registration checks
7. **`check_event_admin_permission`** - Admin access control

### **Medium Priority** (Called 10-50 times/hour during events)
1. **`get_auction_summary`** - Admin auction dashboard
2. **`get_voting_summary`** - Vote leaderboards
3. **`has_valid_qr_scan`** - QR validation checks
4. **`get_notification_badge_count`** - UI notification badges

### **Low Priority** (Called < 10 times/hour)
1. **`get_voting_leaders`** - Periodic leaderboard updates
2. **`get_event_registration_count`** - Admin statistics
3. **`get_payment_status`** - Payment status checks

---

## **Cache Endpoint Strategy**

Based on this analysis, the optimal cacheable data URLs would be:

```
https://artb.art/data/votes/{event_id}-{round}           # get_event_weighted_votes + get_event_vote_ranges
https://artb.art/data/bids/{art_id}                      # get_bid_history_with_names  
https://artb.art/data/auction-timers/{event_id}         # get_auction_timer_status
https://artb.art/data/auction-summary/{event_id}        # get_auction_summary
https://artb.art/data/voting-summary/{event_id}         # get_voting_summary
https://artb.art/data/registration-count/{event_id}     # get_event_registration_count
```

These endpoints would cache for 60 seconds via nginx, dramatically reducing database load during high-frequency events while maintaining near real-time updates through broadcast invalidation triggers.

---

**Generated**: August 17, 2025  
**Total Functions Catalogued**: 150+  
**High Priority for Caching**: 7 functions  
**System Coverage**: Complete Vote26 business logic layer