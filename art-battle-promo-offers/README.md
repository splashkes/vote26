# Art Battle Promo Offers System

A loyalty-based promotional offers system that allows Art Battle to create targeted offers for users based on their RFM (Recency, Frequency, Monetary) scores.

## Overview

- **Public App**: Users access personalized offers via unique hash link (`https://artb.art/o/{HASH}`)
- **Admin App**: ABHQ admins create and manage offers with RFM targeting
- **Database**: Uses existing `offers`, `offer_redemptions`, and `offer_views` tables
- **Edge Functions**: Supabase functions handle offer logic and redemptions

## Features

### Public User Experience
- **Hash-based Access**: No login required - users access via unique URL
- **Personalized Offers**: Offers filtered by RFM score and geography
- **Beautiful UI**: Tailwind-based cards with animations
- **Offer Redemption**: Click-to-redeem with unique redemption codes
- **Inventory Tracking**: Real-time inventory display
- **Expiry Warnings**: Shows expiry date when within 7 days

### Admin Dashboard
- **RFM Sliders**: Target offers by Recency, Frequency, and Monetary scores (1-5 scale)
- **Geography Targeting**: Select specific cities for offers
- **Inventory Management**: Set total inventory and track redemptions
- **Analytics**: View total views and redemptions per offer
- **Offer Types**: Tickets, merchandise, auction credits, discounts, experiences
- **Active/Inactive Toggle**: Control offer visibility
- **Display Order**: Control how offers are sorted

## Tech Stack

- **Frontend**: React 19 + Vite + Radix UI
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL (Supabase)
- **Deployment**: DigitalOcean CDN
- **Auth**: Supabase Auth (Phone OTP for admins)

## Key Components

### React App (`src/`)
- `App.jsx` - Main router and theme provider
- `PublicOfferViewer.jsx` - Public-facing offer viewer
- `AdminDashboard.jsx` - Admin dashboard with auth check
- `OfferDetail.jsx` - Offer create/edit form
- `RFMSliders.jsx` - Min/max sliders for RFM targeting
- `AuthContext.jsx` - Authentication state management

### Supabase Functions (`/root/vote_app/vote26/supabase/functions/`)
- `promo-offers-public` - Fetch offers for a user hash
- `promo-offers-redeem` - Redeem an offer
- `promo-offers-track-view` - Track offer views for analytics

### Database Tables
- `offers` - Offer definitions with RFM criteria
- `offer_redemptions` - Redemption records
- `offer_views` - View tracking for analytics
- `rfm_score_cache` - Cached RFM scores (30-min TTL)
- `people` - User data with unique hash

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

```bash
# Deploy to CDN
./deploy.sh
```

Deployment script:
- Builds React app with Vite
- Uploads to DigitalOcean Spaces CDN
- Sets cache headers (index.html: no-cache, assets: 1 year)
- Deploys to `/promo_offers` path

## URLs

- **CDN**: `https://artb.tor1.cdn.digitaloceanspaces.com/promo_offers/`
- **Public**: `https://artb.art/o/{USER_HASH}`
- **Admin**: `https://artb.art/promo_offers/`

## Database Migrations

1. `20251003_backfill_people_hashes.sql` - Backfilled 11,220 users with unique hashes
2. `20251003_promo_offers_helper_functions.sql` - Created `get_person_top_cities()` function

## RFM Scoring

Users are scored 1-5 on three dimensions:

- **Recency**: Days since last activity (5 = most recent)
- **Frequency**: Total activities (5 = most frequent)
- **Monetary**: Total spent (5 = highest value)

Admins set min/max values for each dimension to target specific user segments.

### Example Targeting

- **Champions** (R:5 F:5 M:5): Your best customers
- **Recent High-Spenders** (R:4-5 M:4-5): Recently engaged, high value
- **At-Risk** (R:1-2 F:4-5): Past champions who haven't engaged recently
- **New Customers** (F:1-2): Low activity, potential to grow

## Security

- **Public App**: No authentication required (access via unique hash)
- **Admin App**: Requires ABHQ admin login (phone OTP)
- **Edge Functions**: Service role for database access
- **RLS Policies**: Row-level security on all tables

## Hash System

- Every person has a unique 8-character hash
- Used in URLs: `https://artb.art/o/abc12xyz`
- Backfilled for 127,359 active users (100% coverage)
- Auto-generated for new users via `custom_access_token_hook`

## Environment Variables

Required in Supabase Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Next Steps

1. **Deploy Edge Functions**:
   ```bash
   cd /root/vote_app/vote26/supabase/functions
   supabase functions deploy promo-offers-public
   supabase functions deploy promo-offers-redeem
   supabase functions deploy promo-offers-track-view
   ```

2. **Deploy React App**:
   ```bash
   cd /root/vote_app/vote26/art-battle-promo-offers
   ./deploy.sh
   ```

3. **Test Public URL**: Visit `https://artb.art/o/{HASH}` with a valid user hash

4. **Test Admin**: Visit `https://artb.art/promo_offers/admin`

## Support

For issues or questions, contact Art Battle HQ technical team.
