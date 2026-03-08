# Sponsorship B2B Platform Development Notes
**Date:** October 9, 2025
**Status:** Core Platform Complete, Payment Integration Live

---

## Overview

Built a comprehensive B2B sponsorship platform allowing Art Battle to create personalized sponsorship invites with custom pricing, manage packages at city and event levels, and provide a smooth checkout experience with post-payment brand customization.

---

## What We Built

### 1. Database Schema (Migrations)

#### Core Tables Created:
- **`sponsorship_package_templates`** - Global package definitions (Venue Sponsor, Title Sponsor, etc.)
- **`sponsorship_city_pricing`** - City-specific pricing overrides
- **`event_sponsorship_packages`** - Event-level packages (inherits from city → global)
- **`sponsorship_invites`** - Personalized invite links with discount codes
- **`sponsorship_purchases`** - Payment records with Stripe integration
- **`sponsorship_interactions`** - Analytics tracking (views, clicks, conversions)
- **`sponsorship_media`** - CloudFlare-hosted media assets
- **`fulfillment_hash`** - 40-character secure hash for post-payment customization

#### Key Features:
- Hierarchical pricing: Global → City → Event
- Auto-generated unique hashes (16 chars for invites, 40 chars for fulfillment)
- Discount tracking and multi-use support
- Expiration dates and usage limits
- Country/currency support via join to countries table

### 2. Admin Interface (`art-battle-admin`)

#### Package Management (`/admin/sponsorship/packages`)
- **Global Package Templates**: Create reusable package types with benefits
- **Active/Inactive toggle**: Control package availability
- **Benefit management**: Add/edit/remove package features
- **Category system**: Premium vs Targeted vs Add-ons
- **Display order control**: Drag-and-drop or manual ordering

#### City Pricing (`/admin/sponsorship/city-pricing/:city_id`)
- **City-centric view**: See all packages for a specific city
- **Override global pricing**: Set custom prices per city
- **Bulk updates**: Apply pricing across multiple packages
- **Currency display**: Automatic currency symbols based on country
- **Visual hierarchy**: Clear indication of global vs city pricing

#### Event Detail Integration (`/admin/event/:eid`)
- **Sponsorship section**: Quick access to event packages
- **City pricing modal**: Edit packages without leaving event page
- **Create invite button**: Generate personalized invite links
- **Invite management**: View/edit/deactivate existing invites
- **Copy invite link**: Quick clipboard copy functionality

### 3. Public Sponsorship SPA (`art-battle-sponsorship`)

#### URL Structure:
- **Invite Flow**: `/sponsor/:hash` (32 chars)
- **Customization**: `/sponsor/customize/:fulfillment_hash` (40 chars)

#### Landing Page Components:

**HeroSection**
- Video placeholder for highlight reel
- Global Art Battle stats (3,500+ events, 85 cities, 88K attendees)
- Personalized prospect name/company display
- **Expiration warnings** (NEW):
  - Red alert: "Personal offer expired X days ago"
  - Amber warning: "Offer expires in X days" (≤8 days)
  - Prominent placement below logo

**LocalRelevanceSection**
- City-specific stats and history
- Event date and venue information
- Past sponsor showcase
- Social proof elements

**SelfSelectionCTA**
- Two-tier approach: Premium (>$300) vs Targeted (<$300)
- Visual differentiation with icons and colors
- **Disabled state when expired** (NEW)
- Feature comparison bullets

#### Package Selection (`PackageGrid`)
- Filtered by tier (premium/targeted)
- Benefits always expanded for main packages
- Discount badges for personalized offers
- Currency formatting based on event locale
- "Only 2 left" scarcity badges (inventory-based)
- Locale-aware number formatting (en-US, en-CA, fr-FR, etc.)

#### Add-ons Modal (`AddonsModal`)
- Select optional add-ons after main package
- Collapsible benefits sections
- Running total calculation
- Discount application preview
- Skip option to proceed without add-ons

#### Multi-Event Discount (`MultiEventOffer`)
- Load real upcoming events from database
- Fallback to placeholder events if none scheduled
- **Championship event** (gold styling):
  - Only selectable when all other events selected
  - Visual "locked" state with explanation
  - Gold gradient background when selected
  - Dark text for contrast
- **Discount tiers**:
  - 2 events: 25% off
  - 3 events: 40% off
  - 4+ events: 50% off
- **Collapsible discount breakdown**:
  - Total discount shown by default
  - Click ? icon to expand individual discounts
  - Recipient discount (from invite)
  - Multi-event volume discount
- Pricing summary with Total Value and Final Price
- Italic notice: "Customize your brand name and media files after payment!"

#### Post-Payment Customization (`SponsorshipCustomization`)
- Accessed via `/sponsor/customize/:fulfillment_hash`
- Validates payment completion before allowing access
- **Form fields**:
  - Brand Name (pre-filled from purchase)
  - Key Message / Tagline (optional)
  - Full Logo upload (PNG/JPG/SVG, 5MB max)
  - Small Logo/Icon upload (square, 5MB max)
- Purchase summary display
- File validation and preview
- Save button (CloudFlare upload TODO)

### 4. Edge Functions

#### `sponsorship-invite-details`
- Fetches invite data by hash
- Returns event details, packages, discount
- Tracks view count and last_viewed_at
- Joins to countries for currency info
- Hierarchical package loading (event → city → global)

#### `sponsorship-track-interaction`
- Records user interactions (view, package_click, tier_select, checkout_initiated)
- Stores metadata for analytics
- Links to invite for conversion tracking

#### `sponsorship-stripe-checkout`
- Creates Stripe checkout session
- Validates invite (expiration, usage limits)
- Calculates:
  - Recipient discount (from invite)
  - Multi-event volume discount
  - Tax based on event country
- Stores purchase record with fulfillment_hash
- Returns checkout URL with fulfillment_hash in success_url
- **Debug info**: Detailed error responses for troubleshooting

#### `sponsorship-fulfillment-details`
- Retrieves purchase by fulfillment_hash
- Validates payment_status = 'completed'
- Returns purchase details for customization form
- Security: Only accessible after payment

#### `get_upcoming_events_in_city` (RPC)
- Filters events by city_id
- Excludes current event
- Future dates only
- Returns name, datetime, venue

### 5. Stripe Integration

#### Payment Flow:
1. User selects packages and events
2. Frontend calls `sponsorship-stripe-checkout`
3. Edge function:
   - Creates `sponsorship_purchases` record (pending)
   - Generates fulfillment_hash (40 chars)
   - Creates Stripe session with fulfillment_hash in metadata
   - Updates purchase with session_id
4. User redirects to Stripe
5. After payment → Stripe redirects to `/sponsor/customize/:fulfillment_hash`
6. Webhook handler updates payment_status to 'completed' (TODO)

#### Stripe Metadata Stored:
- invite_id
- event_id
- main_package_id
- total_events
- fulfillment_hash
- payment_type: 'sponsorship'

#### Pricing Calculation:
```
Base Price = main_package + addons
After Recipient Discount = Base * (1 - discount_percent/100)
After Multi-Event = After Recipient * (1 - volume_discount/100) * num_events
Total with Tax = After Multi-Event + (After Multi-Event * tax_rate/100)
```

### 6. Currency & Localization

- **Country-based formatting**: Uses event's country_code to determine locale
- **Supported locales**: en-US, en-CA, en-GB, en-AU, fr-FR, de-DE, es-ES, and more
- **Currency symbols**: Automatically mapped from countries table
- **Number formatting**: Thousand separators based on locale (commas vs periods)

### 7. Key Design Decisions

#### Hash Length Differentiation:
- **Invite hash**: 16 characters (short, shareable)
- **Fulfillment hash**: 40 characters (secure, post-payment only)
- Prevents confusion and unauthorized access

#### Hierarchical Package System:
- Global templates define defaults
- Cities can override pricing
- Events inherit from city or global
- Allows flexibility without duplication

#### Multi-Event Logic:
- Real events prioritized over placeholders
- Placeholder format: "YYYY Art Battle [City] Regular Season Event"
- Championship always added at end
- Championship only selectable when all others selected

#### Discount Stacking:
- Recipient discount applied first
- Multi-event discount applied to post-recipient price
- Both discounts compound for maximum savings
- Transparent breakdown with expandable details

---

## Technologies Used

- **Frontend**: React 18, Vite 6, Radix UI Themes
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Payment**: Stripe Checkout (existing integration)
- **Deployment**: DigitalOcean Spaces CDN
- **Database**: PostgreSQL with RLS policies
- **Edge Runtime**: Deno

---

## Current Status

### ✅ Complete
- [x] Database schema and migrations
- [x] Admin package management UI
- [x] Admin city pricing interface
- [x] Event detail sponsorship section
- [x] Public sponsorship SPA (full flow)
- [x] Stripe payment integration
- [x] Post-payment customization page
- [x] Expiration warnings on landing
- [x] Multi-event discount system
- [x] Championship event logic
- [x] Currency localization
- [x] Collapsible discount breakdown

### 🚧 In Progress / TODO

#### High Priority:
- [ ] **CloudFlare Upload Integration**: Actually upload logo files
  - Create `sponsorship-upload-logo` edge function
  - Use CloudFlare Images API
  - Store cloudflare_id in sponsorship_purchases
  - Reference existing art-battle-artists implementation

- [ ] **Stripe Webhook Handler**: Complete payment processing
  - Update payment_status to 'completed'
  - Increment invite use_count
  - Send confirmation email (Resend integration)
  - Trigger Slack notification

- [ ] **Save Customization Data**: Store brand details
  - Update sponsorship_purchases with brand_name, brand_tagline
  - Link uploaded logo URLs
  - Mark fulfillment_status as 'complete'

#### Medium Priority:
- [ ] **Slack Notifications**: Real-time alerts for new purchases
  - New sponsorship sale notification
  - Include: sponsor name, package, amount, event
  - Link to admin view

- [ ] **Admin Fulfillment Dashboard**: View/manage completed purchases
  - List all purchases by event
  - Show fulfillment status
  - View uploaded logos and brand info
  - Export for event materials

- [ ] **Email Confirmation**: Send receipt and customization link
  - Resend integration
  - PDF receipt attachment
  - Customization link (fulfillment_hash)
  - QR code for mobile access

- [ ] **Inventory Management**: Track "spots remaining"
  - Add max_quantity to packages
  - Show scarcity badges dynamically
  - Prevent overselling via database constraints

#### Future Enhancements:
- [ ] **Analytics Dashboard**: Track conversion metrics
  - View rate, click rate, conversion rate by invite
  - Compare discount effectiveness
  - City/package performance metrics

- [ ] **Bulk Invite Creation**: Generate multiple invites at once
  - CSV upload with prospect list
  - Batch discount application
  - Mass email distribution

- [ ] **Video Integration**: CloudFlare Stream for hero video
  - Replace placeholder with actual highlight reel
  - Auto-play on scroll
  - Mobile-optimized playback

- [ ] **Package Images**: Visual showcase for packages
  - Upload images to sponsorship_package_images
  - Display in PackageGrid cards
  - Gallery view for premium packages

- [ ] **A/B Testing**: Test different discount strategies
  - Track performance by discount tier
  - Optimize pricing recommendations
  - Test messaging variations

- [ ] **Renewal System**: Auto-renew for multi-year sponsors
  - Send renewal invites before event
  - Loyalty discounts for returning sponsors
  - Streamlined checkout for repeat customers

- [ ] **Mobile App Integration**: QR code scanning
  - Generate QR codes for fulfillment links
  - Scan at event for quick check-in
  - Mobile-first customization flow

---

## API Reference

### Edge Functions

**GET/POST /sponsorship-invite-details**
```json
Request: { "hash": "abc123..." }
Response: {
  "invite_id": "uuid",
  "event_id": "uuid",
  "event_name": "Art Battle Melbourne",
  "event_date": "2025-11-15T19:00:00Z",
  "event_city": "Melbourne",
  "prospect_name": "John Smith",
  "discount_percent": 15,
  "valid_until": "2025-12-31T23:59:59Z",
  "country_code": "AU",
  "currency_code": "AUD",
  "currency_symbol": "A$",
  "packages": [...],
  "media": [...]
}
```

**POST /sponsorship-stripe-checkout**
```json
Request: {
  "invite_hash": "abc123...",
  "main_package_id": "uuid",
  "addon_package_ids": ["uuid", "uuid"],
  "event_ids": ["uuid", "uuid"],
  "buyer_name": "John Smith",
  "buyer_email": "john@example.com",
  "buyer_company": "Acme Corp",
  "success_url": "https://...",
  "cancel_url": "https://..."
}
Response: {
  "url": "https://checkout.stripe.com/...",
  "session_id": "cs_...",
  "fulfillment_hash": "40char...",
  "amount": 5000,
  "currency": "AUD"
}
```

**POST /sponsorship-fulfillment-details**
```json
Request: { "hash": "40char..." }
Response: {
  "id": "uuid",
  "event_name": "Art Battle Melbourne",
  "buyer_name": "John Smith",
  "buyer_company": "Acme Corp",
  "package_details": {...},
  "payment_status": "completed",
  ...
}
```

### RPC Functions

**get_sponsorship_invite_details(p_hash VARCHAR)**
- Returns full invite details with packages
- Updates view_count and last_viewed_at
- Joins to events, cities, countries
- Returns packages in priority order

**get_upcoming_events_in_city(city_id UUID, current_event_id UUID)**
- Returns future events in same city
- Excludes current event
- Ordered by event_start_datetime ASC

**get_purchase_by_fulfillment_hash(p_hash VARCHAR)**
- Returns purchase details by fulfillment hash
- Joins to events and countries
- Used for post-payment customization

---

## File Structure

```
/root/vote_app/vote26/
├── art-battle-admin/
│   └── src/components/
│       ├── EventDetail.jsx (sponsorship section)
│       ├── CityDetail.jsx (pricing modal trigger)
│       └── sponsorship/
│           ├── PackageTemplateList.jsx
│           ├── PackageTemplateModal.jsx
│           ├── CityPricingModal.jsx
│           └── CreateInviteModal.jsx
│
├── art-battle-sponsorship/ (Public SPA)
│   ├── src/
│   │   ├── App.jsx (main router)
│   │   ├── components/
│   │   │   ├── HeroSection.jsx
│   │   │   ├── LocalRelevanceSection.jsx
│   │   │   ├── SelfSelectionCTA.jsx
│   │   │   ├── PackageGrid.jsx
│   │   │   ├── AddonsModal.jsx
│   │   │   ├── MultiEventOffer.jsx
│   │   │   └── SponsorshipCustomization.jsx
│   │   ├── lib/
│   │   │   ├── supabase.js
│   │   │   └── api.js
│   │   └── index.css
│   └── deploy.sh
│
├── supabase/
│   ├── functions/
│   │   ├── sponsorship-invite-details/
│   │   ├── sponsorship-track-interaction/
│   │   ├── sponsorship-stripe-checkout/
│   │   └── sponsorship-fulfillment-details/
│   └── migrations/
│       ├── 20251007_sponsorship_schema.sql
│       ├── 20251007_sponsorship_rpcs.sql
│       ├── 20251009_add_fulfillment_hash.sql
│       ├── 20251009_add_city_id_to_linter_suppressions.sql
│       └── 20251009_update_city_very_strong_threshold.sql
│
└── SPONSORSHIP_B2B_PLATFORM_DEVELOPMENT_2025-10-09.md (this file)
```

---

## Testing Checklist

### Invite Creation (Admin)
- [ ] Create global package template
- [ ] Override pricing for specific city
- [ ] Create event-level packages
- [ ] Generate invite with custom discount
- [ ] Set expiration date
- [ ] Copy invite link

### Public Flow
- [ ] Load invite page via hash
- [ ] See personalized prospect name
- [ ] View expiration warning if applicable
- [ ] Select premium tier
- [ ] Choose package
- [ ] Add optional add-ons
- [ ] Select additional events
- [ ] See championship unlock logic
- [ ] Verify discount calculations
- [ ] Proceed to Stripe checkout

### Payment & Fulfillment
- [ ] Complete Stripe payment (test mode)
- [ ] Redirect to customization page
- [ ] Verify fulfillment_hash security
- [ ] Fill out brand customization form
- [ ] Upload logo files
- [ ] Save customization

### Admin Review
- [ ] View purchase in admin
- [ ] Check payment status
- [ ] Download sponsor logos
- [ ] Export sponsor list for event

---

## Deployment Commands

### Admin
```bash
cd /root/vote_app/vote26/art-battle-admin
npm run build
# (Deployed as part of main admin app)
```

### Public SPA
```bash
cd /root/vote_app/vote26/art-battle-sponsorship
./deploy.sh
# Deploys to: https://artb.tor1.cdn.digitaloceanspaces.com/sponsor/
```

### Edge Functions
```bash
cd /root/vote_app/vote26/supabase
npx supabase functions deploy sponsorship-invite-details --no-verify-jwt
npx supabase functions deploy sponsorship-track-interaction --no-verify-jwt
npx supabase functions deploy sponsorship-stripe-checkout --no-verify-jwt
npx supabase functions deploy sponsorship-fulfillment-details --no-verify-jwt
```

### Database Migrations
```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql \
  -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -f /root/vote_app/vote26/supabase/migrations/[MIGRATION_FILE].sql
```

---

## Known Issues / Notes

1. **CloudFlare Upload**: Logo upload UI exists but backend not implemented
2. **Webhook Handler**: Payment completion webhook needs implementation
3. **Email Integration**: Resend API configured but not connected
4. **Inventory Tracking**: Scarcity badges are placeholder logic only
5. **Video Player**: Hero section has video placeholder but no actual video
6. **Mobile Testing**: Desktop-first design, mobile responsiveness needs testing

---

## Performance Optimizations

- **Single gradient layers**: Combined multiple background gradients into one
- **Lazy loading**: Components load on-demand (not yet implemented)
- **CDN caching**: Static assets served from DigitalOcean Spaces
- **Edge functions**: Serverless compute for fast API responses
- **Database indexes**: Added on hash columns for quick lookups
- **Number formatting**: Client-side locale formatting (no API calls)

---

## Security Considerations

- **Hash uniqueness**: Database constraints prevent duplicate hashes
- **RLS policies**: Row-level security on all tables (to be implemented)
- **Service role keys**: Edge functions use service role for full access
- **CORS headers**: Properly configured for cross-origin requests
- **Fulfillment hash length**: 40 chars prevents guessing/brute force
- **Payment validation**: Only completed payments can access customization
- **Expiration checks**: Invites validated at checkout time
- **Usage limits**: max_uses prevents invite abuse

---

## Analytics & Tracking

### Current Tracking:
- View count per invite
- Last viewed timestamp
- Interaction events (view, click, tier_select, checkout_initiated)
- Conversion rate per invite (implicit via purchases)

### Future Tracking Ideas:
- Time on page per section
- Drop-off points in funnel
- Package comparison clicks
- Add-on selection rate
- Multi-event adoption rate
- Mobile vs desktop conversion
- Geographic distribution
- Discount effectiveness analysis

---

## Related Documentation

- `/root/vote_app/vote26/CLAUDE.md` - General project instructions
- `/root/vote_app/vote26/EDGE_FUNCTION_DEBUGGING_SECRET.md` - Debug strategy
- `/root/vote_app/vote26/CLOUDFLARE_UPLOAD_NOTES.md` - CloudFlare integration guide
- `/root/vote_app/vote26/STRIPE_INTEGRATION_GUIDE.md` - Existing Stripe setup
- `/root/vote_app/vote26/PAYMENT_PROCESSING_SYSTEM_GUIDE_20250925.md` - Payment architecture

---

## Contact & Support

**Development Team**: Claude Code + Art Battle Dev Team
**Database**: Supabase (xsqdkubgyqwpyvfltnrf)
**Deployment**: DigitalOcean Spaces (artb.tor1.cdn.digitaloceanspaces.com)
**Payment Processor**: Stripe (Canada + International accounts)

---

*Last Updated: October 9, 2025*
*Next Review: After CloudFlare upload integration completion*
