# Art Battle Skill Areas Reference
## 50 Operational Skill Areas with Context, Tools, Data Structures & Keywords

> Generated from ~60MB of Claude conversation history across 5 projects, 147 database tables, 444 PL/pgSQL functions, and 185 edge functions.

---

## 1. Event Lookup by EID / City / Date

**What:** Find event details by EID code (e.g. AB4001), city name, date range, or UUID. Check enabled/show_in_app flags, timezone, venue.

**Primary Tables:**
- `events` — id (uuid), eid (varchar), name, enabled, show_in_app, event_start_datetime, event_end_datetime, timezone_icann, timezone_offset, city_id, venue_id, currency, capacity, applications_open, event_level
- `cities` — id, name, country_id, state_province, timezone_id
- `venues` — id, name, address, city_id, default_capacity

**Key DB Functions:**
- `get_cities_with_all_events()`, `get_events_for_city_all()`, `get_batch_event_metrics()`
- `get_events_with_people_counts_by_city()`, `format_event_datetime_local()`

**Edge Functions:** `admin-event-data`, `v2-public-events`, `v2-public-event`

**Admin UI:** `/admin/events`, `/admin/events/:eventId` — EventDashboard, EventDetail components

**Common Queries:**
```sql
SELECT id, eid, name, enabled, show_in_app, event_start_datetime, timezone_icann, city_id
FROM events WHERE eid = 'AB4001';

SELECT e.eid, e.name, c.name as city FROM events e
JOIN cities c ON e.city_id = c.id WHERE c.name ILIKE '%Toronto%';
```

**Adjacent Keywords:** EID, event_start_datetime, timezone_icann, show_in_app, enabled, event_level, city_id, venue_id

---

## 2. Person / User Lookup

**What:** Find people by UUID, phone, email, or name in the people table. Identify auth linkage, registration history, spending.

**Primary Tables:**
- `people` — id, email (citext), phone, phone_number, name, first_name, last_name, nick_name, type, auth_user_id, hash, total_spent, interaction_count, last_interaction_at, last_qr_scan_at, last_qr_event_id, superseded_by, verified
- `people_interactions` — tracks per-event touchpoints
- `people_qr_scans` — QR scan history per event/person

**Key DB Functions:**
- `lookup_profiles_by_contact()`, `multi_profile_lookup()`, `get_auth_person_id()`
- `merge_duplicate_people()`, `ensure_person_exists()`

**Edge Functions:** `admin-sms-get-contacts`, `admin-duplicate-profile-search`

**Admin UI:** `/admin/people` — PeopleManagement component

**Common Queries:**
```sql
SELECT * FROM people WHERE phone LIKE '%4165551234%';
SELECT * FROM people WHERE email = 'someone@example.com';
SELECT * FROM people WHERE id = '<uuid>';
SELECT * FROM people WHERE auth_user_id = '<auth-uuid>';
```

**Adjacent Keywords:** person_id, auth_user_id, phone_number, hash, superseded_by, merge, verified, interaction_count, total_spent

---

## 3. Artist Profile Lookup

**What:** Find artist profiles by phone number, entry_id, artist_number, name, or person UUID. Check bio, country, linked accounts.

**Primary Tables:**
- `artist_profiles` — id, person_id, name, phone, email, city, country, bio, abhq_bio, entry_id, city_id, is_duplicate, superseded_by, manual_payment_override, linked_how, sample_works_urls, phone_verified_at
- `artist_profile_aliases` — alternate names/identifiers
- `artist_sample_works` — portfolio images

**Key DB Functions:**
- `get_primary_artist_profile()`, `has_primary_profile()`, `set_profile_as_primary()`
- `admin_insert_artist_profile()`, `create_new_profile()`
- `generate_artist_id()`, `get_next_entry_id()`

**Edge Functions:** `artist-get-my-profile`, `admin-artists-search`, `admin-artist-search-broadcast`, `admin-get-sample-works`

**Admin UI:** `/admin/artists` — ArtistsManagement, BulkArtistView components

**Common Queries:**
```sql
SELECT * FROM artist_profiles WHERE phone LIKE '%5551234%';
SELECT * FROM artist_profiles WHERE entry_id = 12345;
SELECT * FROM artist_profiles WHERE person_id = '<uuid>';
SELECT ap.*, p.auth_user_id FROM artist_profiles ap JOIN people p ON ap.person_id = p.id WHERE ap.name ILIKE '%Smith%';
```

**Adjacent Keywords:** entry_id, person_id, superseded_by, is_duplicate, abhq_bio, linked_how, manual_payment_override, sample_works_urls

---

## 4. Artwork & Bid Lookup

**What:** Query art and bids tables for specific artworks, bid history, current_bid, bid_count, auction status.

**Primary Tables:**
- `art` — id, art_code, artist_id, event_id, round, easel, status (ENUM), starting_bid, current_bid, bid_count, vote_count, winner_id, closing_time, auction_extended, extension_count, final_price, artist_number
- `bids` — id, art_id, person_id, amount, currency_code, ip_address, created_at
- `art_media` — additional images per artwork
- `art_media_ai_caption` — AI-generated artwork descriptions
- `art_payment_status` — (view) art_id, artist_name, payment_status, payment_amount

**Key DB Functions:**
- `get_admin_auction_details()`, `get_admin_bid_history()`, `get_bid_history_with_names()`
- `generate_auction_summary()`, `get_auction_summary()`, `get_comprehensive_auction_export()`
- `count_bids_by_event()`, `check_and_close_expired_auctions()`

**Edge Functions:** `admin-auction-data`, `v2-public-bids`, `auction-csv-export`, `secure-bid`

**Common Queries:**
```sql
SELECT a.*, e.eid FROM art a JOIN events e ON a.event_id = e.id WHERE e.eid = 'AB4001';
SELECT b.*, p.name FROM bids b JOIN people p ON b.person_id = p.id WHERE b.art_id = '<uuid>' ORDER BY b.amount DESC;
SELECT * FROM art WHERE status = 'sold' AND winner_id IS NOT NULL AND event_id = '<uuid>';
```

**Adjacent Keywords:** art_code, current_bid, bid_count, final_price, winner_id, closing_time, auction_extended, extension_count, status (unsold/sold/paid)

---

## 5. Vote Data Investigation

**What:** Query voting logs, vote_factors, vote weights for specific rounds/artists/events. Investigate vote counts and weight calculations.

**Primary Tables:**
- `votes` — id, event_id, eid, round, easel, art_id, artist_profile_id, person_id, vote_factor, ip_address, phone, hash, location_lat/lng, timestamp
- `vote_weights` — id, event_id, person_id, vote_factor, vote_factor_info (jsonb), phone_number, from_source, status
- `voting_logs` — additional logging

**Key DB Functions:**
- `cast_vote_secure()`, `calculate_vote_weight()`, `refresh_vote_weights()`, `manual_refresh_vote_weights()`
- `get_voting_leaders()`, `get_voting_summary()`, `get_weighted_vote_total()`
- `get_event_total_votes()`, `get_event_weighted_votes()`, `get_event_vote_ranges()`
- `count_votes_by_event()`

**Edge Functions:** `v2-public-votes`, `v2-public-vote-analytics`

**Admin UI:** LiveMonitor component with `useVoteAnalytics` hook (10-second poll)

**Common Queries:**
```sql
SELECT round, easel, count(*), sum(vote_factor) as weighted FROM votes WHERE event_id = '<uuid>' GROUP BY round, easel ORDER BY round, weighted DESC;
SELECT * FROM vote_weights WHERE event_id = '<uuid>' AND person_id = '<uuid>';
SELECT vote_factor_info FROM vote_weights WHERE event_id = '<uuid>' AND vote_factor > 1;
```

**Adjacent Keywords:** vote_factor, vote_factor_info, from_source (qr/link/sms), weighted_votes, cast_vote_secure, vote_weight

---

## 6. Duplicate Artist Profile Resolution

**What:** Identify and merge duplicate profiles by phone/email. Manage superseded_by linking, primary profile designation.

**Primary Tables:**
- `artist_profiles` — superseded_by, is_duplicate, set_primary_profile_at, linked_how
- `people` — superseded_by
- `artist_profile_aliases` — alternate identifiers

**Key DB Functions:**
- `analyze_artist_profiles_for_merge()`, `merge_duplicate_people()`
- `set_profile_as_primary()`, `has_primary_profile()`
- `lookup_profiles_by_contact()`, `multi_profile_lookup()`
- `transition_artist_account()`, `transfer_stripe_account()`

**Edge Functions:** `admin-duplicate-profile-search`, `admin-reconcile-profile`, `admin-transfer-profile-data`

**Admin UI:** `/admin/duplicate-profiles` — DuplicateProfileResolver component

**Common Queries:**
```sql
SELECT * FROM artist_profiles WHERE phone LIKE '%5551234%' ORDER BY created_at;
SELECT a.*, b.name as superseded_name FROM artist_profiles a LEFT JOIN artist_profiles b ON a.superseded_by = b.id WHERE a.phone = b.phone AND a.id != b.id;
```

**Adjacent Keywords:** superseded_by, is_duplicate, merge, reconcile, primary_profile, linked_how, transition_artist_account

---

## 7. Artist Name Renaming

**What:** Update display names in event_artists and round_contestants while preserving legal names in confirmations.

**Primary Tables:**
- `artist_profiles` — name (display name)
- `event_artists` — event_id, artist_id, artist_number
- `round_contestants` — round_id, artist_id, easel_number
- `artist_confirmations` — legal_name (preserved separately)

**Key DB Functions:**
- `admin_update_artist_bio()`, `admin_update_artist_promo_image()`

**Edge Functions:** `update-profile-clean`

**Admin UI:** ArtistsManagement, artist detail modal

**Common Queries:**
```sql
UPDATE artist_profiles SET name = 'New Display Name' WHERE id = '<uuid>';
-- Legal name stays in artist_confirmations.legal_name
SELECT ap.name, ac.legal_name FROM artist_profiles ap JOIN artist_confirmations ac ON ac.artist_profile_id = ap.id WHERE ap.id = '<uuid>';
```

**Adjacent Keywords:** display_name, legal_name, artist_number, abhq_bio, pronouns

---

## 8. Artist Bio Editing

**What:** Edit ABHQ bios vs. artist-submitted bios. Two separate fields: bio (artist's own) and abhq_bio (admin-curated).

**Primary Tables:**
- `artist_profiles` — bio (artist-written), abhq_bio (admin-curated)

**Key DB Functions:**
- `admin_update_artist_bio()`

**Edge Functions:** `admin-update-abhq-bio`

**Admin UI:** Artist detail view, bio editing panel

**Common Queries:**
```sql
SELECT id, name, bio, abhq_bio FROM artist_profiles WHERE id = '<uuid>';
UPDATE artist_profiles SET abhq_bio = 'Curated bio text...' WHERE id = '<uuid>';
```

**Adjacent Keywords:** bio, abhq_bio, admin_update_artist_bio

---

## 9. Artist Country / Region Correction

**What:** Fix country dropdown pre-population, 2-digit code processing, profile data quality for international artists.

**Primary Tables:**
- `artist_profiles` — country (2-char code), city, city_text, city_id
- `countries` — id, name, code
- `cities` — id, name, country_id

**Key Files:**
- `art-battle-admin/src/lib/countryFlags.js` — country ISO codes and flag emoji mappings
- `art-battle-artists/src/components/InternationalPhoneInput` — phone + country formatting

**Common Queries:**
```sql
SELECT id, name, country, city, city_text FROM artist_profiles WHERE country IS NULL OR length(country) != 2;
SELECT DISTINCT country FROM artist_profiles ORDER BY country;
UPDATE artist_profiles SET country = 'CA' WHERE id = '<uuid>';
```

**Adjacent Keywords:** country code, region_code, ISO 3166, city_id, city_text, countryFlags

---

## 10. Artist Invitation Management

**What:** Send/expire/withdraw invitations, track status (pending/accepted/expired/withdrawn), invitation history per event.

**Primary Tables:**
- `artist_invitations` — id, artist_profile_id, event_eid, artist_number, status (ENUM: pending/accepted/expired/withdrawn), accepted_at, message_from_producer
- `artist_applications` — id, artist_profile_id, event_id, application_status, message_to_producer
- `artist_confirmations` — id, artist_profile_id, event_eid, confirmation_status, legal_name, social_usernames, payment_method, confirmation_date

**Key DB Functions:**
- `get_artist_invitation_history()`, `get_latest_invitations_summary()`
- `record_invitation_reminder_sent()`
- `notify_artist_invitation_slack()`, `notify_artist_application_slack()`, `notify_artist_confirmation_slack()`

**Edge Functions:** `admin-send-invitation`, `admin-expire-invitation`, `accept-invitation`, `cancel-confirmation`, `submit-application`

**Admin UI:** `/admin/events/:eventId/artists`, `/admin/invitations` — ArtistManagement, InvitationManagement

**Common Queries:**
```sql
SELECT ai.*, ap.name FROM artist_invitations ai JOIN artist_profiles ap ON ai.artist_profile_id = ap.id WHERE ai.event_eid = 'AB4001';
SELECT * FROM artist_applications WHERE event_id = '<uuid>' AND application_status = 'pending';
SELECT * FROM artist_confirmations WHERE event_eid = 'AB4001';
```

**Adjacent Keywords:** invitation_status, accepted_at, application_status, confirmation_status, event_eid, artist_number, message_from_producer

---

## 11. Stripe Payment Processing

**What:** Execute Stripe transfers, handle CA vs International platform routing, debug transfer failures, verify payout.

**Primary Tables:**
- `artist_payments` — id, artist_profile_id, art_id, gross_amount, platform_fee, stripe_fee, net_amount, currency, status, stripe_transfer_id, stripe_payout_id, payment_type, payment_method, error_message
- `artist_stripe_accounts` — stripe_account_id, stripe_account_type, onboarding_status, charges_enabled, payouts_enabled, country, currency
- `artist_global_payments` — stripe_recipient_id, status, country, default_currency (for Global Payments / cross-border)
- `global_payment_requests` — stripe_recipient_id, stripe_payout_id, amount_minor, currency, status, idempotency_key

**Key DB Functions:**
- `complete_stripe_payment()`, `complete_stripe_payment_with_race_check()`
- `get_admin_payment_data()`, `get_enhanced_payments_admin_data()`, `get_simple_admin_payments_data()`
- `get_pending_payments_for_processing()`, `get_ready_to_pay_artists()`
- `mark_artwork_paid()`, `mark_payment_processing()`

**Edge Functions:** `stripe-webhook-handler`, `stripe-connect-onboard`, `stripe-onboarding-return`, `stripe-account-details`, `stripe-create-checkout`, `stripe-payment-status`, `stripe-payment-success`, `stripe-global-payments-onboard`, `stripe-global-payments-payout`, `auto-process-artist-payments`

**Admin UI:** `/admin/payments` — PaymentsAdminTabbed component

**Adjacent Keywords:** stripe_account_id, stripe_transfer_id, charges_enabled, payouts_enabled, platform_fee, net_amount, stripe_account_region (CA vs intl)

---

## 12. Payment Currency Resolution

**What:** Fix currency mismatches (USD vs THB vs AUD), ensure artwork currency used not artist home currency. Exchange rate lookups.

**Primary Tables:**
- `events` — currency (event's currency)
- `art` — current_bid, final_price (in event currency)
- `artist_payments` — currency, gross_amount, net_amount
- `exchange_rates` — currency_code (3-char), rate_to_usd, last_updated, source
- `artist_stripe_accounts` — currency (artist's Stripe currency)
- `artist_global_payments` — default_currency

**Key DB Functions:**
- `update_exchange_rates_cron()`, `get_available_currencies()`
- `get_artist_balance_for_currency()`, `get_artist_balance_and_currency()`

**Edge Functions:** `update-exchange-rates`, `test-currency-conversion`, `test-fx-quotes-api`, `test-fx-roundtrip`, `test-stripe-fx-rates`

**Key Files:** `art-battle-broadcast/src/utils/currency.js` — multi-currency formatting

**Common Queries:**
```sql
SELECT * FROM exchange_rates ORDER BY currency_code;
SELECT e.currency as event_currency, a.current_bid, ap.currency as payment_currency FROM art a JOIN events e ON a.event_id = e.id LEFT JOIN artist_payments ap ON ap.art_id = a.id WHERE e.eid = 'AB4001';
```

**Adjacent Keywords:** currency_code, rate_to_usd, exchange_rates, default_currency, FX, cross-border, destination_amount

---

## 13. Manual Payment Recording

**What:** Record Interac, WISE-SWIFT, WISE-OTHER payments, override 14-day wait periods. Handle non-Stripe payment methods.

**Primary Tables:**
- `artist_payments` — payment_type, payment_method (stripe/interac/wise-swift/wise-other/manual), description, reference, created_by
- `artist_manual_payment_requests` — artist_profile_id, payment_method, payment_details, country_code, preferred_currency, status, admin_notes, processed_by, requested_amount, events_referenced
- `artist_profiles` — manual_payment_override, manual_payment_override_at, manual_payment_override_by

**Key DB Functions:**
- `notify_manual_payment_request_slack()`

**Edge Functions:** `admin-add-manual-adjustment`, `admin-toggle-manual-payment-override`, `admin-get-manual-payment-request`

**Common Queries:**
```sql
SELECT * FROM artist_manual_payment_requests WHERE status = 'pending';
UPDATE artist_profiles SET manual_payment_override = true, manual_payment_override_at = now() WHERE id = '<uuid>';
INSERT INTO artist_payments (artist_profile_id, art_id, gross_amount, net_amount, currency, status, payment_type, payment_method, description, reference, created_by) VALUES (...);
```

**Adjacent Keywords:** manual_payment_override, interac, wise, payment_method, reference, created_by, reason_category

---

## 14. Artist Payment Ledger Queries

**What:** Calculate amounts owed per-artist/per-event, cross-event balance reconciliation, payment history.

**Primary Tables:**
- `artist_payments` — all payment records per art_id
- `art` — status, current_bid, final_price per artwork
- `artist_manual_adjustments` — ad-hoc credits/debits

**Key DB Functions:**
- `get_artists_owed()`, `get_artists_owed_money()`, `get_enhanced_admin_artists_owed()`
- `get_event_artists_owed()`, `get_admin_artist_payments_data()`
- `get_artist_balance_and_currency()`, `get_artist_balance_for_currency()`
- `get_overdue_artist_payments()`
- `get_artist_event_history()`

**Edge Functions:** `artist-account-ledger`, `admin-artist-payments-list`, `admin-event-artist-payments`, `event-admin-payments`, `simple-admin-payments`, `working-admin-payments`

**Admin UI:** PaymentsAdminTabbed — ledger view per artist

**Adjacent Keywords:** gross_amount, net_amount, platform_fee, stripe_fee, owed, balance, ledger, reconciliation

---

## 15. Payment Status Lifecycle Fixes

**What:** Debug stuck payments, fix SOLD→PAID transitions, clean up duplicate payment records, race conditions.

**Primary Tables:**
- `art` — status (unsold/sold/paid/etc.)
- `artist_payments` — status (pending/processing/completed/failed)
- `payment_processing` — processing state machine
- `payment_processing_control` — toggle payment processing on/off
- `payment_logs` — detailed payment event log

**Key DB Functions:**
- `get_artwork_payment_race_status()`, `complete_stripe_payment_with_race_check()`
- `identify_status_corrections()`, `apply_status_corrections()`
- `get_payment_status()`, `get_payment_status_health()`
- `toggle_payment_processing()`
- `get_payment_audit_events()`, `get_payment_logs_admin()`

**Edge Functions:** `admin-reset-payment-status`, `stripe-payment-status`, `recover-stripe-events`

**Common Queries:**
```sql
SELECT a.id, a.status as art_status, ap.status as payment_status, ap.stripe_transfer_id FROM art a LEFT JOIN artist_payments ap ON ap.art_id = a.id WHERE a.event_id = '<uuid>' AND a.status = 'sold';
SELECT * FROM payment_logs WHERE art_id = '<uuid>' ORDER BY created_at;
```

**Adjacent Keywords:** payment_status, art_status, race_condition, idempotency_key, processing_control, stuck, reset

---

## 16. Payment Invitation & Reminders

**What:** Send SMS/email to artists for Stripe setup, 1-day and 15-day automated reminders.

**Primary Tables:**
- `payment_setup_invitations` — artist_profile_id, invitation_method (sms/email), recipient_email/phone, status, invitation_type, delivery_metadata
- `artist_payment_reminder_emails` — reminder tracking
- `artist_payment_email_queue` — queued payment emails

**Key DB Functions:**
- `send_payment_setup_invitation()`, `log_payment_setup_invitation()`
- `audit_payment_setup_invitations()`

**Edge Functions:** `admin-send-payment-invite`, `admin-send-payment-reminder`, `send-payment-reminder-1day`, `send-payment-reminder-15day`, `send-payment-setup-reminder`

**Adjacent Keywords:** invitation_method, payment_setup, reminder, 1day, 15day, sms, email, onboarding

---

## 17. Event Visibility Debugging

**What:** Diagnose why events don't show in vote app or broadcast — RLS, enabled flags, show_in_app, API filter logic.

**Primary Tables:**
- `events` — enabled (boolean), show_in_app (boolean)
- RLS policies on events table

**Key Files:**
- `art-battle-broadcast/src/lib/PublicDataManager.js` — singleton cache, event filtering logic
- `v2-public-events` edge function — public event list with filters
- `endpoint_cache_versions` — cache invalidation tracking

**Key DB Functions:**
- `broadcast_events_cache_invalidation()`, `manual_cache_invalidation()`
- `get_event_cache_versions()`, `update_endpoint_cache_version()`

**Edge Functions:** `v2-public-events`, `v2-public-event`

**Debugging Checklist:**
1. Check `enabled = true` AND `show_in_app = true`
2. Check `event_start_datetime` is set and valid
3. Check cache invalidation: `endpoint_cache_versions` for stale data
4. Check RLS policies allow public/anon access
5. Check PublicDataManager cache in browser

**Adjacent Keywords:** enabled, show_in_app, RLS, cache_invalidation, PublicDataManager, endpoint_cache_versions

---

## 18. Event Configuration & Editing

**What:** Set auction pricing, timezone, venue, capacity, target artists, rounds, wildcard, ticket link, and all event fields.

**Primary Tables:**
- `events` — ~80 columns covering all config (auction_start_bid, min_bid_increment, currency, capacity, target_artists_booked, expected_number_of_rounds, wildcard_expected, ticket_link, door_time, paint_time, showtime, event_level, advances_to_event_id, etc.)
- `rounds` — event_id, round_number, is_finished, closing_time
- `round_contestants` — round_id, artist_id, easel_number, enabled

**Key DB Functions:**
- `admin_toggle_event_applications()`, `admin_delete_event_safely()`
- `set_round_timer()`, `set_event_auction_closing_times()`

**Edge Functions:** `admin-create-event`, `admin-update-event`, `admin-rounds-data`

**Admin UI:** `/admin/events/:eventId` — EventDetail with tabs for all config areas

**Adjacent Keywords:** auction_start_bid, min_bid_increment, capacity, target_artists_booked, wildcard_expected, expected_number_of_rounds, event_level, advances_to_event_id

---

## 19. Event Linter / Health Check

**What:** Run rule-based validation (missing artists, no venue, unpaid artwork, etc.), manage rule CRUD and suppressions.

**Primary Tables:**
- `event_linter_rules` — rule_id, name, description, severity, category, context, conditions (jsonb), message, status, hit_count
- `linter_suppressions` — rule_id, event_id, artist_id, city_id, suppressed_by, suppressed_until, reason

**Key DB Functions:**
- `increment_rule_hit_count()`

**Edge Functions:** `event-linter`, `event-linter-ai-analysis`, `test-linter-rule`

**Key Files:** `art-battle-admin/src/lib/eventLinter.js` — client-side validation engine (80+ rules in YAML-like format)

**Admin UI:** `/admin/event-linter` — EventLinter component with rule management, severity filtering, category grouping

**Adjacent Keywords:** lint_rule, severity (error/warning/info), category, conditions (jsonb), suppression, hit_count, health_score

---

## 20. Post-Event Summary Generation

**What:** Calculate auction totals, CC processing fees, ticket revenue, generate producer-ready reports.

**Primary Tables:**
- `art` — current_bid, final_price per artwork
- `bids` — bid amounts
- `events` — producer_tickets_sold, producer_tickets_currency, food_beverage_revenue, other_revenue
- `eventbrite_api_cache` — gross_revenue, ticket_revenue, eventbrite_fees, payment_processing_fees, net_deposit, taxes_collected

**Key DB Functions:**
- `generate_event_completion_summary()`, `generate_auction_summary()`
- `get_event_auction_revenue()`, `get_event_ticket_revenue()`, `get_event_ticket_sales()`
- `get_event_payment_summary()`, `get_comprehensive_auction_export()`
- `get_high_value_event_recap()`

**Edge Functions:** `auction-csv-export`, `event-analytics-dashboard`, `public-analytics`

**Admin UI:** EventDetail summary tab, PDF export via paperwork-service

**External:** `paperwork-service-*.ondigitalocean.app/api/v1/event-pdf/{eid}` — PDF generation

**Adjacent Keywords:** auction_total, gross_revenue, net_deposit, processing_fees, ticket_revenue, producer_tickets, food_beverage_revenue

---

## 21. Event Approval Workflow

**What:** Validate missing fields, manage approval status for upcoming events.

**Primary Tables:**
- `events` — event_info_approved_by, event_info_approved_at
- Event linter rules flagging incomplete events

**Key DB Functions:**
- `get_overview_upcoming_events_8weeks()`, `get_overview_missing_venue()`, `get_overview_missing_timezone()`
- `get_overview_missing_city()`, `get_overview_ticket_link_coverage()`
- `get_overview_artist_readiness()`

**Admin UI:** EventDashboard overview metrics, health scores per event

**Adjacent Keywords:** event_info_approved_by, approved_at, readiness, overview_metrics, upcoming_events

---

## 22. Live Auction Bid Management

**What:** Delete erroneous bids, fix current_bid/bid_count sync, identify suspicious bidding patterns.

**Primary Tables:**
- `bids` — id, art_id, person_id, amount, ip_address, created_at
- `art` — current_bid, bid_count, winner_id, auction_extended, extension_count
- `blocked_ips` — ip_address, blocked_at, blocked_until, reason, attempt_count

**Key DB Functions:**
- `process_bid_secure()`, `check_and_extend_auction()`, `handle_auction_extension()`
- `get_admin_bid_history()`, `get_bid_history_with_names()`
- `get_bidding_audit_events()`, `is_ip_blocked()`
- `simulate_bidding_activity()` — test helper

**Edge Functions:** `secure-bid`, `admin-auction-data`, `update-bidder-info`

**Common Queries:**
```sql
SELECT b.*, p.name, p.phone FROM bids b JOIN people p ON b.person_id = p.id WHERE b.art_id = '<uuid>' ORDER BY b.created_at DESC;
DELETE FROM bids WHERE id = '<bid-uuid>'; -- then update art.current_bid/bid_count
UPDATE art SET current_bid = (SELECT MAX(amount) FROM bids WHERE art_id = '<uuid>'), bid_count = (SELECT COUNT(*) FROM bids WHERE art_id = '<uuid>') WHERE id = '<uuid>';
```

**Adjacent Keywords:** current_bid, bid_count, auction_extended, extension_count, blocked_ips, suspicious, ip_address

---

## 23. Auction Timing Investigation

**What:** Debug auction open/close timing issues, audit trail analysis, extension rules.

**Primary Tables:**
- `art` — closing_time, auction_extended, extension_count
- `rounds` — closing_time, is_finished
- `events` — auction_close_starts_at, auction_close_round_delay, admin_control_in_auction

**Key DB Functions:**
- `check_and_close_expired_auctions()`, `check_auction_closing()`
- `set_event_auction_closing_times()`, `clear_auction_closing_time()`
- `manage_auction_timer()`, `get_auction_timer_status()`, `get_auction_timer_status_by_round()`
- `close_auction_manually()`, `admin_actually_close_auction_items()`
- `trigger_auction_closed_notification()`

**Edge Functions:** `admin-auction-data`, `timer-data`

**Adjacent Keywords:** closing_time, auction_close_starts_at, auction_close_round_delay, extension, admin_control_in_auction, manually_close

---

## 24. Auction Revenue & Pricing

**What:** Configure start_bid/min_increment, post-event auction summary calculations, artist portion.

**Primary Tables:**
- `events` — auction_start_bid, min_bid_increment, currency, artist_auction_portion, tax
- `art` — starting_bid, current_bid, final_price

**Key DB Functions:**
- `generate_auction_summary()`, `get_event_auction_revenue()`, `get_event_auction_revenue_by_eid()`

**Common Queries:**
```sql
SELECT eid, auction_start_bid, min_bid_increment, currency, artist_auction_portion, tax FROM events WHERE eid = 'AB4001';
SELECT SUM(final_price) as total, COUNT(*) as sold FROM art WHERE event_id = '<uuid>' AND status = 'sold';
```

**Adjacent Keywords:** auction_start_bid, min_bid_increment, artist_auction_portion, tax, final_price, revenue

---

## 25. Vote Factor / Weight Correction

**What:** Fix online vs local vote weight misclassification during live events.

**Primary Tables:**
- `vote_weights` — vote_factor, vote_factor_info (jsonb with breakdown), from_source
- `votes` — vote_factor (snapshot at time of vote)

**Key DB Functions:**
- `calculate_vote_weight()`, `refresh_vote_weights()`, `manual_refresh_vote_weights()`

**vote_factor_info jsonb structure:**
```json
{"base": 1, "qr_bonus": 0.5, "artist_bonus": 0, "history_bonus": 0.2, "total": 1.7}
```

**Common Queries:**
```sql
SELECT vw.*, p.name FROM vote_weights vw JOIN people p ON vw.person_id = p.id WHERE vw.event_id = '<uuid>' AND vw.vote_factor > 1 ORDER BY vw.vote_factor DESC;
UPDATE vote_weights SET vote_factor = 1.0, vote_factor_info = '{"base":1}' WHERE id = '<uuid>';
```

**Adjacent Keywords:** vote_factor, vote_factor_info, from_source, qr_bonus, base_weight, local vs online, refresh_vote_weights

---

## 26. Vote Weight Calculation Analysis

**What:** Investigate base weight, QR scan bonus, artist bonus, vote history contributions.

**Primary Tables:**
- `vote_weights` — vote_factor_info (jsonb)
- `people_qr_scans` — person_id, event_id, scanned_at
- `people_interactions` — history for frequency bonus

**Key DB Functions:**
- `calculate_vote_weight()` — the main weight algorithm
- `has_valid_qr_scan()` — checks QR scan eligibility

**Weight Components (from vote_factor_info):**
- `base`: always 1
- `qr_bonus`: 0.5 if QR scanned at event
- `artist_bonus`: bonus for being a competing artist
- `history_bonus`: based on past event attendance

**Adjacent Keywords:** calculate_vote_weight, vote_factor_info, qr_bonus, history_bonus, artist_bonus, base_weight

---

## 27. QR Code Upgrade Flow

**What:** Trace QR scan path from UI through edge functions for local voter verification and weight upgrade.

**Primary Tables:**
- `qr_codes` — code, event_id, is_active, expires_at
- `event_qr_secrets` — event_id, secret_token, is_active
- `qr_validation_attempts` — validation logging
- `people_qr_scans` — scan records

**Key DB Functions:**
- `create_event_qr_secret()`, `generate_qr_secret_token()`
- `get_event_from_qr_secret()`, `record_validation_attempt()`
- `cleanup_expired_qr_codes()`

**Edge Functions:** `validate-qr-scan`, `admin-qr-data`

**Admin UI:** QRAdminPanel in broadcast app, `/qr/:secretToken` — QRDisplay app

**Flow:** QR displayed → scanned by attendee → `validate-qr-scan` called → `has_valid_qr_scan` checked → vote_weight updated with qr_bonus

**Adjacent Keywords:** qr_code, secret_token, qr_scan, upgrade, validate, qr_bonus, event_qr_secrets

---

## 28. Eventbrite Ticket Data Sync

**What:** Poll Eventbrite API for sales, revenue, fees, taxes, net deposit; handle 6-hour cache.

**Primary Tables:**
- `eventbrite_api_cache` — event_id, eid, eventbrite_id, total_tickets_sold, gross_revenue, ticket_revenue, taxes_collected, eventbrite_fees, payment_processing_fees, net_deposit, currency_code, data_quality_score, data_quality_flags, fetched_at, is_stale
- `eventbrite_orders_cache` — detailed order data
- `eventbrite_orders_summary` — aggregated order summaries
- `eventbrite_current_event_cache` — latest cache entry per event
- `eventbrite_latest_fresh_cache` — non-stale entries
- `eventbrite_data_quality_summary` — quality metrics

**Key DB Functions:**
- `get_latest_eventbrite_cache()`, `get_eventbrite_orders_summary()`
- `has_eventbrite_orders_cached()`, `get_event_ticket_sales()`, `get_event_ticket_revenue()`

**Edge Functions:** (Eventbrite polling typically happens in Go API or cron)

**Common Queries:**
```sql
SELECT * FROM eventbrite_api_cache WHERE eid = 'AB4001' ORDER BY fetched_at DESC LIMIT 1;
SELECT eid, total_tickets_sold, gross_revenue, net_deposit, data_quality_score FROM eventbrite_api_cache WHERE is_stale = false ORDER BY fetched_at DESC;
```

**Adjacent Keywords:** eventbrite_id, total_tickets_sold, gross_revenue, net_deposit, taxes_collected, eventbrite_fees, data_quality_score, is_stale, 6-hour cache

---

## 29. Eventbrite ID Mapping

**What:** Fix mismatched eventbrite_id→event EID assignments.

**Primary Tables:**
- `events` — eventbrite_id (varchar)
- `eb_links` — mapping table
- `eventbrite_api_cache` — eid, eventbrite_id cross-reference

**Common Queries:**
```sql
SELECT eid, eventbrite_id FROM events WHERE eventbrite_id IS NOT NULL ORDER BY event_start_datetime DESC;
UPDATE events SET eventbrite_id = '1234567890' WHERE eid = 'AB4001';
```

**Adjacent Keywords:** eventbrite_id, eb_links, eid mapping, ticket sync

---

## 30. Eventbrite Tax & Fee Breakdown

**What:** Display tax carve-out within net deposit, fee calculations.

**Primary Tables:**
- `eventbrite_api_cache` — gross_revenue, ticket_revenue, taxes_collected, eventbrite_fees, payment_processing_fees, total_fees, net_deposit, currency_code

**Formula:** `net_deposit = gross_revenue - eventbrite_fees - payment_processing_fees`
**Tax:** `taxes_collected` is included in gross_revenue, carved out separately

**Adjacent Keywords:** taxes_collected, eventbrite_fees, payment_processing_fees, net_deposit, total_fees, gross_revenue

---

## 31. Meta Ads Campaign Lookup

**What:** Fetch ad spend, budget, ROAS by event; match campaigns to events by EID in campaign name.

**Primary Tables:**
- `meta_ads_cache_cron_log` — executed_at, status, total_events, successful, failed, skipped, errors, duration_ms, response
- `events` — meta_ads_budget, other_ads_budget

**Key DB Functions:**
- `cache_meta_ads_data()`, `get_overview_facebook_budget()`

**Edge Functions:** (Meta Ads caching via cron / Go backend)

**Matching Logic:** Campaign names contain EID (e.g. "AB4001 Toronto Event Promo") → regex extract to match to event

**Adjacent Keywords:** meta_ads_budget, other_ads_budget, ROAS, ad_spend, facebook, campaign_name, EID matching

---

## 32. Meta Ads Token & Cache Management

**What:** Long-lived token refresh, daily cron cache refresh, currency conversion for ad spend.

**Primary Tables:**
- `meta_ads_cache_cron_log` — cron execution tracking
- `exchange_rates` — for converting ad spend currency

**Cron:** Daily cache refresh job runs `cache_meta_ads_data()`

**Adjacent Keywords:** long_lived_token, access_token, cron, cache_refresh, currency_conversion, exchange_rates

---

## 33. SMS Marketing Campaign Builder

**What:** Audience segmentation (RFM scoring), scheduling with timezone handling, template variables, sending.

**Primary Tables:**
- `sms_marketing_campaigns` — name, template_id, status, recipient_list, total_recipients, messages_sent/delivered/failed, replies_received, opt_outs, scheduled_at, targeting_criteria, total_cost_cents, event_id
- `sms_marketing_templates` — message templates with variables
- `sms_marketing_optouts` — opt-out tracking
- `rfm_score_cache` — person_id, recency_score, frequency_score, monetary_score, total_score, segment, segment_code

**Key DB Functions:**
- `get_sms_audience()`, `get_sms_audience_ids_only()`, `get_sms_audience_paginated()`
- `get_people_for_campaign()`, `calculate_rfm_score_for_person()`, `check_rfm_cache_batch()`
- `is_phone_opted_out()`

**Edge Functions:** `admin-sms-create-campaign`, `admin-sms-promotion-audience`, `admin-sms-rfm-batch`, `admin-sms-rfm-batch-stream`, `send-bulk-marketing-sms`, `send-marketing-sms`, `sms-scheduled-campaigns-cron`, `sms-marketing-templates`

**Key Files:** `art-battle-admin/src/lib/rfmScoring.js` — RFM scoring via `/functions/v1/rfm-scoring`

**Admin UI:** `/admin/sms-marketing` — PromotionSystem component with RFMSliders

**Adjacent Keywords:** rfm, recency, frequency, monetary, segment, targeting_criteria, template_id, opt_out, scheduled_at, telnyx

---

## 34. SMS Conversation Interface

**What:** Two-way SMS viewing and replying per contact, conversation status tracking.

**Primary Tables:**
- `sms_inbound` — telnyx_message_id, from_phone, to_phone, message_body, is_stop_request, is_help_request, auto_replied
- `sms_outbound` — telnyx_message_id, campaign_id, to_phone, message_body, status, telnyx_status, cost_cents
- `sms_conversation_status` — conversation state tracking
- `sms_config` — system SMS configuration

**Key DB Functions:**
- `get_current_sms_conversation_status()`, `get_sms_conversation_status_history()`
- `log_sms_activity()`, `check_sms_results()`

**Edge Functions:** `admin-sms-get-conversation`, `admin-sms-get-conversation-status`, `admin-sms-send-message`, `sms-twilio-webhook`, `sms-marketing-webhook`

**Admin UI:** `/admin/sms-conversations` — SMSConversations component

**Adjacent Keywords:** sms_inbound, sms_outbound, telnyx, twilio, from_phone, to_phone, conversation_status, stop_request

---

## 35. SMS Winner / Payment Notifications

**What:** Verify auction winner texts are delivered, debug silent failures.

**Primary Tables:**
- `sms_outbound` — delivery status per message
- `message_queue` — queued notifications
- `notifications` — notification records

**Key DB Functions:**
- `send_auction_winner_broadcast()`, `send_rich_winner_notification()`
- `send_auction_closing_notifications()`, `send_not_winning_notifications()`
- `queue_bid_confirmation()`, `queue_bid_notification()`, `queue_outbid_notification()`

**Edge Functions:** `send-sms`

**Adjacent Keywords:** winner_notification, outbid, bid_confirmation, message_queue, notification, delivery_status

---

## 36. Slack Notification Integration

**What:** Wire up Slack alerts for manual payment requests, offer redemptions, artist applications, etc.

**Primary Tables:**
- `slack_notifications` — queued Slack messages
- `slack_channels` — channel name cache
- `slack_templates` — message templates
- `slack_analytics` — delivery metrics
- `event_slack_settings` — per-event channel config

**Key DB Functions:**
- `queue_slack_notification()`, `process_slack_queue()`, `process_slack_queue_batch()`
- `process_slack_notification_via_edge()`, `manual_process_slack_queue()`
- `notify_manual_payment_request_slack()`, `notify_artist_application_slack()`
- `notify_artist_confirmation_slack()`, `notify_artist_invitation_slack()`
- `notify_profile_update_slack()`, `notify_round_complete()`, `notify_round_starting()`
- `detect_slack_spam()`, `slack_queue_health_check()`
- `resolve_slack_channel()`, `cache_slack_channel()`

**Edge Functions:** `slack-webhook`, `slack-channel-lookup`

**Adjacent Keywords:** slack_channel, queue_slack_notification, slack_template, event_slack_settings, socket_mode

---

## 37. Email Queue Management

**What:** Clear stuck emails, monitor queue status, debug AWS SES delivery.

**Primary Tables:**
- `email_logs` — recipient, sender, subject, status, method, error_message, event_id
- `artist_payment_email_queue` — payment-specific email queue
- `artist_payment_reminder_emails` — reminder tracking

**Key DB Functions:**
- `get_email_queue_stats()`, `get_message_queue_stats()`

**Edge Functions:** `email-queue-manager`, `send-email`, `send-email-test`, `send-custom-email`, `simple-email-viewer`, `test-basic-email`, `test-basic-smtp`, `test-ses`, `test-smtp`

**Admin UI:** `/admin/email-queue` — EmailQueueDashboard component

**Adjacent Keywords:** email_logs, SES, SMTP, email_status, stuck, delivery, bounce

---

## 38. Email Template Development

**What:** Artist invitations, payment reminders, application confirmations with correct event details.

**Primary Tables:**
- `email_logs` — tracks sent emails with subjects
- `assigned_email_campaigns` — campaign assignments

**Edge Functions:** `send-email`, `send-custom-email`, `email-template-showcase`, `send-artist-invitation-email` (DB function)

**Key DB Functions:**
- `send_artist_invitation_email()`, `send_payment_setup_invitation()`
- `send_admin_invitation_slack()`, `send_admin_confirmation_slack()`

**Adjacent Keywords:** email_template, invitation_email, payment_reminder, SES, SMTP, template_variables

---

## 39. Edge Function Development & Deployment

**What:** Create/debug/deploy Deno edge functions with JWT auth, CORS, RLS bypass via service_role key.

**Key Locations:**
- `/root/vote_app/vote26/supabase/functions/` — 185 edge functions
- `/root/vote_app/vote26/supabase/functions/_shared/` — shared utilities (cors, supabase client, auth helpers)
- `/root/vote_app/vote26/supabase-functions/` — copy for reference

**Deploy Command:** `supabase functions deploy <function-name> --project-ref xsqdkubgyqwpyvfltnrf`

**Key Patterns:**
- CORS headers in every function
- JWT verification via `supabase.auth.getUser()`
- Service role client for RLS bypass
- Response-body debugging (no native logs — see EDGE_FUNCTION_DEBUGGING_SECRET.md)

**185 Functions** including: admin-*, artist-*, stripe-*, sms-*, sponsorship-*, promo-offers-*, v2-public-*, test-*, app-*

**Adjacent Keywords:** Deno, edge_function, service_role, JWT, CORS, supabase functions deploy, _shared

---

## 40. Edge Function Debugging

**What:** Custom response-body debugging since Supabase has NO function logs.

**Key File:** `/root/vote_app/vote26/EDGE_FUNCTION_DEBUGGING_SECRET.md` — explains the debugging approach

**Approach:** Since `supabase functions logs` returns nothing useful, debugging is done by:
1. Adding debug info to response body/headers
2. Using `system_logs` table for persistent logging
3. Using `recent_errors` table for error tracking
4. Testing with `check-env` edge function

**Primary Tables:**
- `system_logs` — persistent log entries from edge functions
- `system_logs_compressed` — archived logs
- `recent_errors` — error tracking

**Key DB Functions:**
- `cleanup_old_logs()`, `compress_old_logs()`, `delete_expired_logs()`
- `refresh_log_statistics()`

**Adjacent Keywords:** EDGE_FUNCTION_DEBUGGING_SECRET, response_body_debug, system_logs, recent_errors, no_function_logs

---

## 41. Database Migration Execution

**What:** Write and run SQL migrations via psql against production.

**Key Location:** `/root/vote_app/vote26/migrations/` — 280+ migration files

**Command:**
```bash
PGPASSWORD='caxpo8-hamwej-kufcoW' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/<MIGRATION_FILE>.sql
```

**Primary Tables:**
- `schema_migrations` — migration tracking

**Naming Convention:** descriptive names like `add_weekly_trend_overview_functions.sql`, `fix_get_admin_auction_details.sql`

**Adjacent Keywords:** migration, psql, PGPASSWORD, schema_migrations, ALTER TABLE, CREATE FUNCTION

---

## 42. RLS Policy Management

**What:** Add/fix Row Level Security policies for admin access patterns, public read, authenticated write.

**Common Patterns:**
- Public/anon: SELECT on events, art, rounds for vote app
- Authenticated: INSERT on votes, bids
- Service role: bypass for edge functions
- Admin: check via `get_user_admin_level()` or `is_super_admin()`

**Key DB Functions:**
- `get_user_admin_level()`, `is_super_admin()`, `get_current_user_admin_info()`
- `check_event_admin_permission()`

**Migration Examples:**
- `fix_authenticated_insert_policies.sql`
- `fix_admin_layout_auth_check.sql`

**Adjacent Keywords:** RLS, row_level_security, policy, anon, authenticated, service_role, admin_level, super_admin

---

## 43. Database Function (PL/pgSQL) Development

**What:** Create stored functions, CTEs, aggregation queries, complex business logic in the database.

**444 public functions** organized by domain:
- `admin_*` — admin operations (20+)
- `get_*` — data retrieval (150+)
- `process_*` — queue processing (15+)
- `notify_*` — notification triggers (10+)
- `send_*` — outbound messaging (15+)
- `queue_*` — queue insertion (10+)
- `check_*` — validation/checks (15+)
- `broadcast_*` — cache invalidation (6+)
- `generate_*` — ID/summary generation (10+)

**Patterns:**
- Functions use `SECURITY DEFINER` for RLS bypass
- Return types: TABLE, SETOF, jsonb, void
- Common: CTEs, window functions, COALESCE, date arithmetic

**Adjacent Keywords:** PL/pgSQL, SECURITY DEFINER, CREATE OR REPLACE FUNCTION, CTE, RETURNS TABLE, jsonb

---

## 44. CDN Deploy & Cache Busting

**What:** Run deploy.sh, s3cmd uploads, MIME type fixes, cache-control headers.

**Key Files:**
- `/root/vote_app/vote26/art-battle-vote/deploy.sh` — main deploy script (npm build + CDN upload)
- Various deploy.sh in each SPA directory

**Deploy includes:** npm run build → s3cmd sync to CDN → cache-control header setting

**SPAs deployed separately:**
- art-battle-admin, art-battle-broadcast, art-battle-artists, art-battle-sponsorship
- art-battle-promo-offers, art-battle-host, art-battle-timer, art-battle-qr
- art-battle-results, art-battle-promo-materials, art-battle-mui

**CDN:** artb.art domain, DigitalOcean Spaces, Cloudflare for images

**Adjacent Keywords:** deploy.sh, s3cmd, CDN, cache-control, MIME type, npm run build, artb.art

---

## 45. DigitalOcean App Platform Management

**What:** Monitor builds/deploys, check logs, update app specs for hosted services.

**Services on DO:**
- paperwork-service — PDF generation (`/api/v1/event-pdf/{eid}`)
- Possibly Go API backends

**Adjacent Keywords:** DigitalOcean, app_platform, paperwork-service, app_spec, build_logs, deploy

---

## 46. Git Secret Scrubbing & Hygiene

**What:** git-filter-repo for leaked tokens, .gitignore maintenance, case collision resolution.

**Key Files:**
- `.gitignore` — exclusion patterns
- Migration: `DELETE_ABANDONED_ACCOUNTS.sql` renamed to fix case collision (recent commit `69cdacc`)

**Adjacent Keywords:** git-filter-repo, .gitignore, case_collision, secret_scrub, BFG, token leak

---

## 47. Admin Component Development

**What:** Event detail pages, payment dashboards, spreadsheet grid views, modals, tabbed interfaces.

**Key Location:** `/root/vote_app/vote26/art-battle-admin/src/`

**Major Components:**
- EventDashboard — master event list with health scores
- EventDetail — event editor with tabs
- PaymentsAdminTabbed — payment ledger
- ArtistsManagement / BulkArtistView — artist directory
- PeopleManagement — attendee database
- DuplicateProfileResolver — identity reconciliation
- SMSConversations — two-way SMS
- PromotionSystem — SMS campaigns
- EmailQueueDashboard — email monitoring

**Shared Libraries:**
- `/lib/supabase.js` — client init
- `/lib/eventLinter.js` — validation engine
- `/lib/sponsorshipAPI.js` — sponsorship CRUD
- `/lib/OffersAPI.js` — offers CRUD
- `/lib/AdminBulkArtistAPI.js` — bulk operations
- `/lib/rfmScoring.js` — RFM scoring
- `/lib/countryFlags.js` — country codes
- `/lib/cloudflare.js` — image upload

**Context Providers:** AuthContext, AdminContext, EventsContext, AppContexts

**Tech Stack:** React, Vite, Radix UI

**Adjacent Keywords:** React, Vite, Radix, component, modal, tabbed, grid, dashboard, context_provider

---

## 48. Promotional Offers System

**What:** Hash-authenticated offer pages, redemption tracking, RFM-targeted offers, CDN deployment at /promo_offers.

**Primary Tables:**
- `offers` — name, type, value, currency, rfm segment filters (min/max recency/frequency/monetary), geography_scope, total_inventory, redeemed_count, active, start_date/end_date, image_url, tile_color, redemption_link
- `offer_redemptions` — offer_id, user_id, redemption_code, status, redeemed_at
- `offer_views` — tracking views
- `artwork_offers` — offers tied to specific artworks

**Key DB Functions:**
- `get_person_active_offer()`, `get_active_offers_for_artwork()`
- `expire_old_offers()`, `expire_old_offers_with_broadcast()`

**Edge Functions:** `promo-offers-public`, `promo-offers-redeem`, `promo-offers-track-view`, `admin-offer-to-bidder`, `admin-get-offer-history`

**Admin UI:** `/admin/offers` — OffersManagement; `/o/admin` — promo offers admin
**Public UI:** `/o/:hash` — PublicOfferViewer with RFM display

**Key Files:** `art-battle-admin/src/lib/OffersAPI.js`, `art-battle-promo-offers/src/lib/api.js`

**Adjacent Keywords:** offer, redemption, hash, rfm_segments, geography_scope, inventory, tile_color, promo

---

## 49. Sponsorship System

**What:** Package templates, city-specific pricing, hash-based invite links, media uploads, checkout flow.

**Primary Tables:**
- `sponsorship_package_templates` — name, slug, benefits (jsonb), category, display_order
- `sponsorship_city_pricing` — per-city pricing matrix
- `sponsorship_media` — asset library
- `sponsorship_invites` — hash, prospect_name/email/company, discount_percent, valid_until, max_uses, use_count, view_count, skip_multi_event
- `sponsorship_purchases` — stripe_checkout_session_id, buyer info, package_details, subtotal, discount, tax, total, fulfillment_status, fulfillment_hash
- `sponsorship_interactions` — tracking (views, clicks, checkouts)
- `sponsorship_package_images` — package imagery
- `event_sponsorship_packages` — per-event package config

**Key DB Functions:**
- `admin_generate_sponsorship_invite()`, `generate_sponsorship_invite_hash()`
- `get_sponsorship_invite_details()`, `admin_get_event_sponsorship_summary()`
- `track_sponsorship_interaction()`, `get_purchase_by_fulfillment_hash()`
- `generate_fulfillment_hash()`

**Edge Functions:** `sponsorship-invite-details`, `sponsorship-track-interaction`, `sponsorship-stripe-checkout`, `sponsorship-fulfillment-details`

**Admin UI:** `/admin/sponsorship-packages` — SponsorshipPackages with sub-components: PackageTemplateList, CityPricingManager, SponsorshipMediaLibrary, InvitesAndDiscounts, InviteTracking, EventSponsorshipSetup

**Public UI:** art-battle-sponsorship app — `/sponsor/:hash` (landing → selection → checkout), `/sponsor/customize/:hash` (post-purchase)

**Key Files:** `art-battle-admin/src/lib/sponsorshipAPI.js`, `art-battle-sponsorship/src/lib/api.js`

**Adjacent Keywords:** sponsorship, invite_hash, prospect, discount_percent, fulfillment, package_template, city_pricing, checkout

---

## 50. Live Event Support / Real-Time Troubleshooting

**What:** Mission-critical debugging during live events — auction failures, vote errors, visibility issues, bid sync problems.

**Key Areas to Check During Live Events:**

1. **Voting not working:**
   - Check `events.enabled` and `events.show_in_app`
   - Check `rounds` — is current round's `is_finished = false`?
   - Check `round_contestants.enabled = true`
   - Check `cast_vote_secure()` for errors
   - Check `vote_weights` for the voter

2. **Auction not working:**
   - Check `art.closing_time` — is auction still open?
   - Check `events.enable_auction`
   - Check `process_bid_secure()` for errors
   - Check `blocked_ips` for blocked bidders

3. **Event not visible:**
   - Check `events.enabled = true`, `events.show_in_app = true`
   - Check `endpoint_cache_versions` for stale cache
   - Run `manual_cache_invalidation()`

4. **Payment failures:**
   - Check `artist_stripe_accounts.charges_enabled`
   - Check `payment_processing_control`
   - Check `payment_logs` for errors

**Key DB Functions:**
- `manual_cache_invalidation()`, `refresh_vote_weights()`
- `close_auction_manually()`, `admin_actually_close_auction_items()`
- `check_and_close_expired_auctions()`

**Edge Functions:** `check-env` (test connectivity), `validate-qr-scan`, `secure-bid`, `v2-public-event`

**Admin UI:** `/admin/events/:eventId/live` — LiveMonitor with real-time polling

**Adjacent Keywords:** live_event, real-time, troubleshoot, emergency, cache_invalidation, stuck, race_condition, mission_critical

---

## Quick Reference: All 147 Tables

```
abhq_admin_users, admin_audit_log, admin_audit_logs, admin_invitation_dashboard,
admin_recent_items, admin_users, ai_analysis_cache, app_analytics_sessions,
app_content_analytics, app_curated_content, app_engagement_events, app_error_events,
app_exposure_tracking, app_performance_metrics, app_personalization_profiles,
art, art_media, art_media_ai_caption, art_payment_status,
artist_activity_with_global_payments, artist_activity_with_payments, artist_ai_intel,
artist_applications, artist_auth_logs, artist_auth_monitor_secure, artist_confirmations,
artist_global_payments, artist_invitations, artist_invites, artist_manual_adjustments,
artist_manual_payment_requests, artist_note_dismissals, artist_payment_email_queue,
artist_payment_reminder_emails, artist_payments, artist_profile_aliases, artist_profiles,
artist_sample_works, artist_stripe_accounts, artwork_offers, assigned_email_campaigns,
assigned_promotions, bids, blocked_ips, cached_event_data, cities,
competition_specifics, competition_specifics_history, competition_specifics_view_log,
corrupted_phone_backup, countries, cron_secrets, eb_links, email_logs,
endpoint_cache_versions, event_admins, event_analysis_history, event_artists,
event_auth_logs, event_competition_specifics, event_linter_rules, event_qr_secrets,
event_registrations, event_slack_settings, event_sponsorship_packages,
eventbrite_api_cache, eventbrite_current_event_cache, eventbrite_data_quality_summary,
eventbrite_latest_fresh_cache, eventbrite_orders_cache, eventbrite_orders_summary,
events, exchange_rates, feedback_broadcast_triggers, feedback_incentive_redemptions,
feedback_question_templates, feedback_submissions, global_payment_requests,
linter_suppressions, media_files, message_queue, messages, meta_ads_cache_cron_log,
notification_preferences, notification_reads, notifications, offer_redemptions,
offer_views, offers, operation_stats, payment_invitations, payment_logs,
payment_processing, payment_processing_control, payment_reminders,
payment_setup_invitations, payment_statuses, people, people_interactions,
people_qr_scans, promo_materials, promotion_logs, qr_codes, qr_validation_attempts,
recent_errors, registration_logs, rfm_score_cache, round_contestants, rounds,
scheduled_chart_commands, schema_migrations, security_audit_logs, slack_analytics,
slack_channels, slack_notifications, slack_notifications_backup_20250829,
slack_templates, sms_config, sms_conversation_status, sms_inbound, sms_logs,
sms_marketing_campaigns, sms_marketing_optouts, sms_marketing_templates, sms_outbound,
sms_webhook_debug, sponsorship_city_pricing, sponsorship_interactions,
sponsorship_invites, sponsorship_media, sponsorship_package_images,
sponsorship_package_templates, sponsorship_purchases, stripe_api_conversations,
stripe_charges, system_logs, system_logs_compressed, timezones, tmpl_assets,
tmpl_outputs, tmpl_templates, venue_logos, venues, vote_weights, votes,
votes_old_backup, voting_logs
```

## Quick Reference: All 185 Edge Functions

```
_shared, accept-invitation, admin-add-manual-adjustment, admin-artist-ai-intel,
admin-artist-payments-list, admin-artist-search-broadcast, admin-artist-stats,
admin-artist-workflow, admin-artists-search, admin-artwork-ai-analysis,
admin-auction-data, admin-city-analytics, admin-content-actions, admin-content-library,
admin-content-stats, admin-create-event, admin-delete-abandoned-accounts,
admin-delete-stripe-batch, admin-duplicate-profile-search, admin-event-artist-payments,
admin-event-data, admin-expire-invitation, admin-get-events-for-sms,
admin-get-manual-payment-request, admin-get-offer-history, admin-get-payment-reminder-history,
admin-get-sample-works, admin-offer-to-bidder, admin-qr-data, admin-reconcile-profile,
admin-reset-payment-status, admin-rounds-data, admin-security-monitor,
admin-send-invitation, admin-send-payment-invite, admin-send-payment-reminder,
admin-set-password, admin-sms-create-campaign, admin-sms-get-all-person-ids,
admin-sms-get-contacts, admin-sms-get-conversation, admin-sms-get-conversation-status,
admin-sms-promotion-audience, admin-sms-rfm-batch, admin-sms-rfm-batch-stream,
admin-sms-send-message, admin-telnyx-get-balance, admin-toggle-manual-payment-override,
admin-transfer-profile-data, admin-update-abhq-bio, admin-update-event,
app-analytics-batch, app-analytics-batch-simple, app-content-curator,
app-feed-personalized, artist-account-ledger, artist-get-event-competition-specifics,
artist-get-my-profile, artist-get-notes, auction-csv-export, auth-metrics,
auth-monitor-cron, auth-monitoring-queries, auth-webhook, auto-process-artist-payments,
cancel-confirmation, check-env, check-instant-payout-eligibility,
check-other-profiles-balance, create-competition-specific, create-profile-clean,
cron-cleanup-abandoned-accounts, custom-access-token, echo-admin-data,
email-queue-manager, email-template-showcase, event-admin-payments,
event-analytics-dashboard, event-linter, event-linter-ai-analysis,
promo-offers-public, promo-offers-redeem, promo-offers-track-view, public-analytics,
public-get-event-competition-specifics, recover-stripe-events, secure-bid,
send-bulk-marketing-sms, send-custom-email, send-email, send-email-test,
send-marketing-sms, send-payment-reminder-15day, send-payment-reminder-1day,
send-payment-setup-reminder, send-sms, set-event-competition-specifics,
simple-admin-payments, simple-email-viewer, slack-channel-lookup, slack-webhook,
sms-marketing-templates, sms-marketing-webhook, sms-scheduled-campaigns-cron,
sms-twilio-webhook, sponsorship-fulfillment-details, sponsorship-invite-details,
sponsorship-stripe-checkout, sponsorship-track-interaction, stripe-account-details,
stripe-connect-onboard, stripe-create-checkout, stripe-global-payments-onboard,
stripe-global-payments-payout, stripe-onboarding-return, stripe-payment-status,
stripe-payment-success, stripe-webhook-handler, submit-application, submit-feedback,
test-*, timer-data, update-bidder-info, update-competition-specific,
update-exchange-rates, update-profile-clean, v2-public-bids, v2-public-event,
v2-public-events, v2-public-vote-analytics, v2-public-votes, validate-qr-scan,
working-admin-payments, wp-artists-export
```

## Quick Reference: Key SPA Applications

| App | Path | Purpose |
|-----|------|---------|
| art-battle-admin | /admin | Full admin control panel |
| art-battle-broadcast | / | Public voting/bidding interface |
| art-battle-artists | /profile | Artist profile & payment dashboard |
| art-battle-sponsorship | /sponsor | Sponsor checkout flow |
| art-battle-promo-offers | /o | Marketing offers |
| art-battle-host | /wizard | Event planning wizard |
| art-battle-timer | /timer | Event countdown display |
| art-battle-qr | /qr | QR code display |
| art-battle-results | /results | Event results display |
| art-battle-promo-materials | /promo | Design studio |
| art-battle-mui | /analytics | Analytics dashboard |

## Key Connection Info

- **DB (psql):** `PGPASSWORD='...' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres`
- **Public API:** `https://db.artb.art`
- **Edge Functions:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/<name>`
- **CDN:** artb.art
- **Migrations Dir:** `/root/vote_app/vote26/migrations/`
- **Functions Dir:** `/root/vote_app/vote26/supabase/functions/`
- **Admin SPA:** `/root/vote_app/vote26/art-battle-admin/`
- **Debugging:** See `/root/vote_app/vote26/EDGE_FUNCTION_DEBUGGING_SECRET.md`

---

## MCP Environment Requirements

### Core CLI Tools

| Tool | Version | Used For | Skills |
|------|---------|----------|--------|
| **psql** | 14.20 | Direct DB queries, migrations, all lookups | #1-5, #6-9, #11-15, #22-26, #41-43 |
| **node** | 22.21 | Build SPAs, run scripts, vote-worker | #44, #47 |
| **npm/npx** | 10.9.4 | Package management, builds | #44, #47 |
| **supabase** | 2.39.2 (update to 2.75.0) | Deploy edge functions, manage secrets | #39-40 |
| **s3cmd** | 2.2.0 | CDN deploy to DigitalOcean Spaces | #44 |
| **stripe** | 1.17.2 (update to 1.37.1) | Payment debugging, account inspection | #11-15 |
| **git** | 2.34.1 | Version control, secret scrubbing | #46 |
| **go** | 1.22.3 | abcli, daily-auto-analysis, paperwork-service | #20, #28-31 |
| **curl/jq** | 7.81/1.6 | API testing, JSON processing | cross-cutting |
| **gh** | (installed) | GitHub PR/issue management | #46 |
| **doctl** | 1.151.0 | DigitalOcean app platform management | #45 |
| **aws** | 2.28.16 | SES email, S3 operations | #37-38 |
| **docker** | 28.2.2 | Container management | #45 |
| **wrangler** | 4.27.0 | Cloudflare Workers (image uploads) | #47 |
| **twilio** | 6.1.0 | SMS debugging, number management | #33-35 |
| **pm2** | 6.0.10 | Process management (vote-worker) | #50 |
| **python3** | 3.10.12 | Utility scripts | misc |
| **puppeteer** | 24.16.2 | PDF/screenshot generation | #20 |

### Custom In-House Tools

| Tool | Location | Purpose | Skills |
|------|----------|---------|--------|
| **abcli** | `/root/vote_app/abcli/abcli` | Query events, artists, sales, eventbrite, RFM, user-activity | #1-5, #14, #28-31, #33 |
| **vote-worker** | `/root/vote_app/vote-worker/server.js` (pm2) | BullMQ job processor, Slack socket mode, MongoDB bridge | #36, #50 |
| **daily-auto-analysis** | `/root/vote_app/daily-auto-analysis/` | Cron scripts: promotions, email, EB cache, AI prefetch | #28, #31-32, #37 |
| **deploy.sh** (x11) | Each SPA directory | Build + CDN upload per app | #44 |

**abcli subcommands:**
```
artists           Query and analyze Art Battle artists
config            Manage CLI configuration
event-mapping     Tools for mapping EventBrite events to Art Battle events
eventbrite        Access and analyze Eventbrite event data
events            Query and analyze Art Battle events
producers         Query producer incentive metrics
query             Execute custom queries
rfm               RFM score management and batch processing
sales             Query and analyze Art Battle sales data
sales-correlation Analyze correlation between artist booking timing and sales
user-activity     Query user activity across events, votes, and bids
```

### Runtimes

| Runtime | Version | Purpose |
|---------|---------|---------|
| **Node.js** | 22.21 | SPAs, vote-worker, edge function testing |
| **Go** | 1.22.3 | abcli, daily-auto-analysis, paperwork-service |
| **Deno** | NOT INSTALLED | Edge function local dev — currently deploy-blind, no local testing |
| **Python** | 3.10.12 | Utility scripts |

### Background Services

| Service | Manager | Status | Details |
|---------|---------|--------|---------|
| **vote-worker** | pm2 (`worker`) | online (3M uptime) | BullMQ + Slack socket mode + MongoDB |
| **Redis** | external | running | Used by vote-worker for BullMQ job queues |
| **MongoDB** | external (MONGO_URI) | running | Legacy data bridge (contestants, voting logs, artist apps) |

### External API Integrations (Supabase Secrets)

| Service | Secret Keys | Skills |
|---------|------------|--------|
| **Stripe** (2 platforms) | `stripe_canada_secret_key`, `stripe_intl_secret_key`, `stripe_canada_publishable_key`, `stripe_intl_publishable_key`, 3 webhook secrets | #11-16 |
| **Telnyx** | `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER` | #33-35 |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | #33-35 |
| **Eventbrite** | `EVENTBRITE_ACCESS_TOKEN`, `EB_ORG_ID` | #28-30 |
| **Meta/Facebook** | `META_ACCESS_TOKEN` | #31-32 |
| **Slack** | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET` | #36 |
| **OpenAI** | `OPENAI_API_KEY` | AI analysis, linter AI |
| **Cloudflare** | via wrangler config | Image uploads |
| **AWS SES** | via `~/.aws/config` (region: us-east-2) | #37-38 |
| **DigitalOcean Spaces** | via `~/.s3cfg` (host: tor1.digitaloceanspaces.com) | #44 CDN |

### Supabase Internal Secrets

| Key | Purpose |
|-----|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS bypass for edge functions |
| `SUPABASE_ANON_KEY` | Public/anon access |
| `SUPABASE_URL` | API base URL |
| `SUPABASE_DB_URL` | Direct DB connection string |
| `AUTH_HOOK_SECRET` | Custom auth hook verification |
| `CUSTOM_ACCESS_TOKEN_SECRET` | JWT customization |
| `CRON_SECRET_EXCHANGE_RATES` | Exchange rate cron auth |
| `CRON_SECRET_META_ADS` | Meta ads cron auth |
| `SITE_URL` | App site URL for auth redirects |

### Database Access Methods

| Method | Host | Port | Use |
|--------|------|------|-----|
| **psql direct** | `db.xsqdkubgyqwpyvfltnrf.supabase.co` | 5432 | Migrations, direct queries, skill execution |
| **Supabase REST** | `https://xsqdkubgyqwpyvfltnrf.supabase.co` | 443 | Edge functions, PostgREST, realtime |
| **Public CDN proxy** | `https://db.artb.art` | 443 | Public API access |

### Cron Jobs (6 active)

| Time (UTC) | Script | Purpose |
|------------|--------|---------|
| 06:00 | `/root/ArtBattleAPIs/artbattle-go/scripts/daily_artist_sync.sh` | MySQL→Supabase artist form sync |
| 07:00 | `/root/vote_app/daily-auto-analysis/wrappers/runDailyPromotionUpdate.sh` | Promotion refresh |
| 08:00 | `/root/vote_app/daily-auto-analysis/wrappers/runEmailCampaignUpdate.sh` | Email campaign processing |
| 09:00 | `/root/vote_app/daily-auto-analysis/wrappers/runEventBriteCache.sh` | Eventbrite data cache |
| 10:00 | `/root/vote_app/daily-auto-analysis/wrappers/runEbSalesAnalyzer.sh` | Sales analysis |
| 11:00 | `/root/vote_app/daily-auto-analysis/wrappers/runAIPrefetch.sh` | AI analysis prefetch |

### npm Global Packages

```
@anthropic-ai/claude-code@2.1.62
@babel/node@7.27.1
@openai/codex@0.36.0
@supabase/supabase-js@2.55.0
jscodeshift@17.3.0
nodemon@2.0.20
pm2@6.0.10
puppeteer@24.16.2
twilio-cli@6.1.0
wrangler@4.27.0
```

### vote-worker Dependencies (via .env)

| Variable | Purpose |
|----------|---------|
| `MONGO_URI` | MongoDB connection for legacy data |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_URI` | BullMQ job queue |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_SIGNING_SECRET` | Slack socket mode |
| `STRIPE_PK` / `STRIPE_SK` | Stripe API access |

### Key Config File Locations

| File | Purpose |
|------|---------|
| `~/.s3cfg` | s3cmd config (DO Spaces, tor1 region) |
| `~/.aws/config` | AWS CLI config (SES, us-east-2) |
| `~/.config/gh/hosts.yml` | GitHub CLI auth (account: splashkes) |
| `/root/vote_app/vote-worker/.env` | vote-worker secrets |
| `/root/vote_app/vote26/ai-context/facebook/.env` | Meta API tokens |
| `/root/vote_app/vote26/supabase/.temp/project-ref` | Linked Supabase project: `xsqdkubgyqwpyvfltnrf` |

### What Needs Fixing / Installing

| Item | Status | Action |
|------|--------|--------|
| **Deno runtime** | NOT INSTALLED | Install for edge function local testing |
| **Stripe CLI config** | `~/.config/stripe/config.toml` missing | Run `stripe login` |
| **Supabase CLI** | v2.39.2 outdated | Update to v2.75.0 |
| **Stripe CLI** | v1.17.2 outdated | Update to v1.37.1 |

### MCP Minimum Viable Environment

For the MCP server to execute all 50 skills, it needs at minimum:

1. **psql** — the single most critical tool (covers ~35 of 50 skills with direct SQL)
2. **DB password** — `caxpo8-hamwej-kufcoW` for direct psql access
3. **supabase CLI** — edge function deploy + secrets management
4. **abcli** — pre-built structured queries (events, artists, sales, EB, RFM)
5. **curl + jq** — ad-hoc edge function calls and API testing
6. **s3cmd** — CDN deploys
7. **stripe CLI** (authed) — payment inspection/debugging
8. **node/npm** — SPA builds
9. **go** — abcli compilation and daily-auto tools
10. **Supabase service role key** — for edge function calls that bypass RLS
