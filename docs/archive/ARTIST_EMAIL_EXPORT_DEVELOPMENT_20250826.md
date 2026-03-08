# Artist Email Export System Development
**Date: August 26, 2025**

## Project Overview
Developed a comprehensive artist email generation system that creates personalized email content for each artist after Art Battle events. The system generates ready-to-copy email templates that include payment information, artwork details, and appropriate messaging based on sales status.

## Requirements Analysis
The user requested a text-only endpoint similar to the existing CSV export that would generate full email content for each artist at an event. Key requirements included:

- **Individual artist emails** (not per artwork, since some artists have multiple pieces)
- **Comprehensive payment information** with specific payment methods (Stripe, Cash, Other)
- **Personalized subject lines** including payment amounts owed
- **Detailed artwork status** with round/easel info and payment status
- **Regional payment method variations** (e.g., Canadian events show Interac e-Transfer)
- **Clean text formatting** without download headers for easy copy/paste

## Technical Implementation

### Edge Function Creation
Created `/root/vote_app/vote26/art-battle-broadcast/supabase/functions/artist-email-export/index.ts`

**Key Features:**
- Uses EID-based URL routing: `/artist-email-export/{EVENT_EID}`
- No JWT verification required (configured in config.toml)
- Returns `text/plain` content type (no forced download)
- Proper newline formatting for readability

### Database Integration
**Data Sources:**
1. `events` table - Event details and city information via JOIN with `cities` table
2. `art` table - Artwork details (code, round, easel, status, current_bid)
3. `artist_profiles` table - Artist information (name, email, entry_id)
4. `payment_logs` table - Manual admin payment records (via `get_payment_logs_admin` RPC)
5. `payment_processing` table - Stripe payment records
6. `payment_statuses` table - Payment status descriptions (via `get_payment_statuses_admin` RPC)

**Data Processing Logic:**
- Groups artworks by artist_id to create individual artist emails
- Filters out artworks without Artist Entry IDs
- Calculates 50% artist share from total sales
- Determines payment status from multiple sources (manual logs + Stripe payments)

### Payment Status Logic
**Critical Implementation Detail:**
The system checks payment status in this order:
1. **Manual payment logs** (`payment_logs` table) - for admin-marked payments
2. **Stripe payments** (`payment_processing` table) - for automated Stripe payments
3. **Artwork status** - fallback to 'paid' status interpretation

**Payment Status Outputs:**
- `PAID VIA STRIPE` - Stripe payment completed
- `PAID BY CASH` - Manual cash payment logged by admin
- `PAID BY OTHER` - Manual payment with other method
- `NOT PAID YET` - No payment recorded

### Email Content Structure
**For Artists with Sales:**
```
Subject: Art Battle {City} - Payment Information Required (${amount} owed)

Thank you for participating in Art Battle {City}! Congratulations on the sale of your painting(s)...

Event Link: https://artb.art/event/{EVENT_UUID}

{Detailed artwork list with payment status}

Payment method instructions (regional variations)

Payment timeline and contact information
```

**For Artists without Sales:**
```
Subject: Art Battle {City} - Thank you for participating!

Thank you for participating in Art Battle {City}! Thank you for showcasing your artistic talents...

Event Link: https://artb.art/event/{EVENT_UUID}

{Artwork list showing "NO BIDS"}
```

## Technical Challenges and Solutions

### Challenge 1: Payment Data Split Across Tables
**Problem:** Payment information stored in two separate tables:
- `payment_logs` - Manual admin payments
- `payment_processing` - Stripe automated payments

**Solution:** Created lookup maps for both data sources and implemented cascading logic to check manual payments first, then Stripe payments as fallback.

### Challenge 2: City Information Missing
**Problem:** Initial query failed because `events.city` column doesn't exist
**Solution:** Added JOIN with `cities` table via foreign key relationship to get city name

### Challenge 3: Artwork Status Recognition
**Problem:** Artworks with status 'paid' weren't being recognized as sold artworks
**Solution:** Updated logic to treat both 'sold' and 'paid' statuses as sold artworks

### Challenge 4: URL Structure Change
**Problem:** Original individual artwork URLs (artb.art/a/a/{art_code}) no longer valid
**Solution:** Switched to single event URL format: `https://artb.art/event/{EVENT_UUID}`

### Challenge 5: Text Formatting Issues
**Problem:** 
- Initial implementation used escaped newlines (`\\n`) causing display issues
- Download headers forcing file download instead of display
- Poor readability in terminal/browser

**Solution:** 
- Switched to proper newlines (`\n`) in JavaScript strings
- Removed Content-Disposition header to prevent download
- Used `text/plain` content type for clean display

## Configuration Changes
Added to `/root/vote_app/vote26/art-battle-broadcast/supabase/config.toml`:
```toml
[functions.artist-email-export]
verify_jwt = false
```

## Regional Customization
**Payment Method Instructions:**
- **Default (US):** PayPal or Zelle
- **Canada:** Interac e-Transfer or PayPal

Logic automatically detects Canadian cities (Toronto, Montreal) and adjusts payment instructions accordingly.

## Output Format
**Text Structure:**
```
ARTIST EMAIL CONTENT FOR {EID} - {EVENT_NAME}
Generated: {TIMESTAMP}
================================================================================

ARTIST 1 of {TOTAL}
Name: {ARTIST_NAME}
Email: {ARTIST_EMAIL}
Artworks: {ART_CODES}
Subject: {EMAIL_SUBJECT}
------------------------------------------------------------
{EMAIL_BODY_CONTENT}
================================================================================
```

**Detailed Artwork Status Format:**
```
AB2995-1-3 (Round 1, Easel 3) SOLD for $65 - Buyer has PAID VIA STRIPE
AB2995-2-1 (Round 2, Easel 1) NO BIDS
```

## API Endpoint
**URL Format:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/artist-email-export/{EVENT_EID}`

**Example:** `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/artist-email-export/AB2995`

**Response:** Plain text content ready for copy/paste into email clients

## Testing and Validation
**Test Events:**
- AB2986 (Pittsburgh) - Artists without sales
- AB2995 (Sydney) - Artists with Stripe payments

**Validation Confirmed:**
- ✅ Correct payment status detection (Stripe vs manual vs unpaid)
- ✅ Proper artist grouping and share calculations
- ✅ Regional payment method variations
- ✅ Clean text formatting without download
- ✅ Detailed artwork status with round/easel information
- ✅ Single event URL format

## Production Deployment
Function successfully deployed to Supabase Edge Functions and tested with real event data. Ready for production use by Art Battle team for post-event artist communications.

## Future Considerations
1. **Additional Regional Variations** - Easy to extend for other countries/payment methods
2. **Email Template Customization** - Template could be made configurable per event
3. **Bulk Email Integration** - Could potentially integrate with email service providers
4. **Artist Communication Tracking** - Could log when emails are sent to artists

## Development Timeline
- **Initial Requirements:** Artist email generation system request
- **Core Implementation:** Edge function with database integration
- **Payment Logic Refinement:** Handling split payment data sources
- **Formatting Improvements:** Text display optimization
- **URL Structure Update:** Single event URL implementation
- **Final Testing:** Validation with real event data

**Total Development Time:** ~2 hours
**Function Size:** 69.31kB (deployed)
**Database Queries:** 6 main queries + lookup operations
**Error Handling:** Comprehensive with fallback logic for missing data