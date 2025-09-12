# CRITICAL ERROR: Lost Slack Message Templates

## What Happened
I overwrote the `format_slack_message` function without properly backing up all the existing message types. This is a critical error that broke existing Slack notifications.

## What I Remember From The Existing Templates

From the partial output I saw before overwriting, the function had these message types:

### 1. Auction Templates (Working/Complex)
- `auction_winner_rich` - Full rich format with header, artwork details, bidding summary, payment details
- `auction_summary` - Event summary with statistics  
- `auction_extended` - Extension notifications with new closing time
- `auction_closed` - Sold notification with winner details
- `auction_closed_no_bids` - No bids notification

### 2. Artist/Admin Templates (From DB query)
From the database, these message types were successfully used:
- `admin_invitation` 
- `artist_application`
- `artist_confirmation` 
- `artist_invitation`
- `confirmation_withdrawn`
- `invitation_accepted`
- `profile_update_success`
- `security_monitoring_test`
- `vote_cast`

### 3. Partial Template Content I Saw

**auction_winner_rich** had:
- Header with celebration emoji 🎉
- Artwork and winner details section with format showing art_code, artist_name, currency, final_bid, winner_name, winner_phone
- Accessory with artwork image if available  
- Bidding summary with fields for total_bids, avg_increment, auction_duration, extension_count
- Payment details section showing tax_percent, total_with_tax
- Context footer with event_name, round, easel, timestamp

**auction_extended** had:
- Alarm clock emoji :alarm_clock:
- New closing time with timezone
- Extension number

**auction_closed** had:
- Hammer emoji :hammer: 
- "SOLD!" message
- Art code, artist name, final bid, winner details
- Total bids count

**auction_closed_no_bids** had:
- Warning emoji :warning:
- Starting bid amount
- "No bids were placed" message

### 4. ELSE Case Structure
The function had an ELSE case that returned a basic format using `p_payload->>'message'` for unknown types.

## Recovery Strategy Needed

1. **Check git history** for the previous version of the function
2. **Restore from database backup** if available  
3. **Reconstruct from partial information** and database query results
4. **Test each message type** to ensure they still work

## Immediate Action Required
- Restore the complete function with ALL existing message types
- DO NOT add new types until existing ones are restored
- Test existing Slack notifications to ensure they work

This was a critical mistake that could break production Slack notifications.

## URGENT DISCOVERY
The supabase-functions/db-functions/format_slack_message.sql file is also incomplete! It only has:
- auction_winner_rich
- auction_summary  
- auction_extended
- auction_closed
- auction_closed_no_bids
- ELSE clause (generic fallback)

**MISSING CRITICAL TEMPLATES:**
These message types have been successfully used but are missing from the function:
- admin_invitation
- artist_application
- artist_confirmation 
- artist_invitation
- confirmation_withdrawn
- invitation_accepted
- profile_update_success
- security_monitoring_test
- vote_cast

The current function in the database and the git backup are both incomplete. This means production Slack notifications for these types are falling back to the generic ELSE case instead of proper formatted messages.

**IMMEDIATE ACTION REQUIRED:**
1. Find the complete working version of this function
2. Restore all missing message type templates  
3. Test that existing notifications still work properly

## ARCHITECTURE DISCOVERY
After examining the migrations, I discovered the Slack notification system uses TWO different approaches:

**Approach 1: Central format_slack_message function**
- Used for: auction types (auction_winner_rich, auction_summary, etc.)
- Uses CASE statement with predefined templates
- Returns formatted jsonb blocks

**Approach 2: Individual trigger functions with custom formatting** 
- Used for: artist_application, artist_confirmation, admin_invitation, etc.
- Each has its own dedicated function (like notify_artist_application_slack)
- Builds blocks directly in the trigger function
- Uses queue_slack_notification helper function

**The Issue:**
- I overwrote format_slack_message thinking it handled ALL types
- But many message types (artist_application, etc.) don't use this function at all
- They use their own individual trigger functions
- So the "missing" templates were never in format_slack_message to begin with!

**Current Status:**
- Auction notifications: Broken (missing templates in format_slack_message)
- Artist/Admin notifications: Still working (use individual functions)
- Global Payments: Need to add (should use individual function approach)

**Recovery Plan:**
1. Restore auction templates to format_slack_message function
2. Create dedicated Global Payments notification function (don't modify central function)
3. Test both approaches work together