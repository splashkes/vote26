# Sponsorship System Data Inventory
*Generated: 2025-10-16*
*Purpose: Complete documentation before data cleanup*

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Current Data Counts](#current-data-counts)
4. [Package Templates](#package-templates)
5. [City Pricing](#city-pricing)
6. [Package Images](#package-images)
7. [Media Assets](#media-assets)
8. [Invites](#invites)
9. [Interactions](#interactions)
10. [Purchases](#purchases)
11. [Relationships](#relationships)
12. [Cleanup Considerations](#cleanup-considerations)

---

## Overview

The sponsorship system consists of 8 interconnected tables managing sponsorship packages, pricing, invites, and transactions.

### Current Data Counts
| Table | Row Count | Description |
|-------|-----------|-------------|
| `sponsorship_package_templates` | 21 | Package template definitions |
| `sponsorship_city_pricing` | 71 | City-specific pricing for packages |
| `sponsorship_package_images` | 19 | Visual samples for packages |
| `sponsorship_media` | 8 | Global media assets (hero images, logos) |
| `sponsorship_invites` | 35 | Sent sponsorship invitations |
| `sponsorship_interactions` | 314 | User interaction tracking |
| `sponsorship_purchases` | 10 | Purchase records (all pending) |
| `event_sponsorship_packages` | 0 | Event-specific package overrides |

---

## Database Schema

### Core Tables

#### 1. sponsorship_package_templates
**Purpose:** Master list of sponsorship package types
**Key Fields:**
- `id` (uuid, PK)
- `name` (text)
- `slug` (text)
- `category` (varchar) - 'personal', 'brand', 'business', 'addon'
- `description` (text)
- `benefits` (jsonb)
- `active` (boolean)
- `display_order` (integer)

#### 2. sponsorship_city_pricing
**Purpose:** City-specific pricing for each package template
**Key Fields:**
- `id` (uuid, PK)
- `city_id` (uuid, FK → cities)
- `package_template_id` (uuid, FK → sponsorship_package_templates)
- `price` (numeric)
- `currency` (varchar)

#### 3. sponsorship_package_images
**Purpose:** Visual samples/examples for packages
**Key Fields:**
- `id` (uuid, PK)
- `package_template_id` (uuid, FK → sponsorship_package_templates)
- `url` (text) - Cloudflare Images URL
- `display_order` (integer)

#### 4. sponsorship_media
**Purpose:** Global media assets (can be event-specific or global)
**Key Fields:**
- `id` (uuid, PK)
- `event_id` (uuid, FK → events, nullable)
- `media_type` (varchar) - 'hero_bg_desktop', 'event_photo_*', 'sponsor_logo_*'
- `title` (varchar)
- `url` (text) - Cloudflare Images URL
- `active` (boolean)
- `display_order` (integer)

#### 5. sponsorship_invites
**Purpose:** Sponsorship invitation tracking
**Key Fields:**
- `id` (uuid, PK)
- `hash` (varchar) - Public URL identifier
- `event_id` (uuid, FK → events)
- `prospect_name` (varchar)
- `prospect_company` (varchar)
- `prospect_email` (varchar)
- `discount_percent` (numeric)
- `valid_until` (timestamptz)
- `view_count` (integer)
- `created_at` (timestamptz)

#### 6. sponsorship_interactions
**Purpose:** User interaction tracking for analytics
**Key Fields:**
- `id` (uuid, PK)
- `invite_id` (uuid, FK → sponsorship_invites)
- `event_id` (uuid, FK → events)
- `package_id` (uuid, FK → sponsorship_package_templates, nullable)
- `interaction_type` (varchar) - 'view', 'tier_select', 'package_click', 'addon_select', 'checkout_initiated'
- `interaction_data` (jsonb)
- `created_at` (timestamptz)

#### 7. sponsorship_purchases
**Purpose:** Purchase transaction records
**Key Fields:**
- `id` (uuid, PK)
- `event_id` (uuid, FK → events)
- `invite_id` (uuid, FK → sponsorship_invites)
- `stripe_payment_intent_id` (varchar)
- `stripe_checkout_session_id` (varchar)
- `buyer_name`, `buyer_email`, `buyer_company`, `buyer_phone`
- `main_package_id` (uuid, FK → sponsorship_package_templates)
- `addon_package_ids` (uuid[])
- `package_details` (jsonb)
- `subtotal`, `discount_amount`, `tax_amount`, `total_amount` (numeric)
- `currency` (varchar)
- `logo_url`, `logo_cloudflare_id`
- `payment_status` (varchar) - 'pending', 'paid', 'failed'
- `fulfillment_status` (varchar) - 'pending', 'fulfilled'
- `fulfillment_hash` (varchar) - Unique hash for fulfillment tracking
- `created_at`, `paid_at`, `updated_at` (timestamptz)

#### 8. event_sponsorship_packages
**Purpose:** Event-specific package overrides
**Currently Empty** - designed for per-event custom packages

---

## Package Templates

### 21 Active Templates

| ID | Name | Category | Slug | Display Order |
|----|------|----------|------|---------------|
| c88003e2... | Title Sponsor | business | title-sponsor | 1 |
| bff44aa8... | Venue Sponsor | brand | venue-sponsor | 2 |
| d07658b5... | Round Sponsor | brand | round-sponsor | 3 |
| a0d55cba... | Prize Sponsor | personal | prize-sponsor | 4 |
| e05facb3... | Digital Sponsor | brand | digital-sponsor | 5 |
| 1e9617e3... | 2025-2026 Full Season Sponsiorship | business | 2026-season-–-sponsor-package | 7 |
| adc41bad... | 2025 Events Sponsorship | business | 2025-season-–-sponsor-package | 8 |
| 464cb3c6... | +20 Complimentary Guests at Every Event | addon | +20-complimentary-guests-at-every-event | 9 |
| 66c3f6c7... | 10 Art Battle Hats | addon | art-battle-hats | 9 |
| 2de4645c... | Brand Display Table | addon | vip-table | 10 |
| 73513e38... | Social Media Boost | addon | social-boost | 11 |
| 66f50d91... | Logo on Merchandise | addon | merch-logo | 12 |
| 4337cff8... | Premier Partner | business | premier-partner | 12 |
| b7788591... | Spotlight Partner | brand | spotlight-partner | 13 |
| b19814d4... | Audience Choice Partner | brand | audience-choice-partner | 14 |
| 4cba3766... | Collector's Partner | business | collector's-partner | 15 |
| 41331709... | Community Partner | personal | community-partner | 16 |
| 478ffd50... | Friends & Fun Pass | personal | friends-&-fun-pass | 17 |
| e52f2c0a... | Prize Supporter | personal | prize-supporter | 18 |
| fd6cb326... | Tactical Prize Sponsor | business | tactical-prize-sponsor | 19 |
| 2de266fa... | Supplies Sponsor | business | supplies-sponsor | 20 |

### Category Breakdown
- **Business (Tactical):** 7 packages (Title Sponsor, Full Season, Premier Partner, Collector's, Tactical Prize, Supplies)
- **Brand:** 5 packages (Venue, Round, Digital, Spotlight, Audience Choice)
- **Personal:** 4 packages (Prize Sponsor, Community, Friends & Fun, Prize Supporter)
- **Addons:** 5 packages (Complimentary Guests, Hats, Display Table, Social Boost, Merch Logo)

---

## City Pricing

### 71 City-Package Combinations

**Cities with pricing configured:**
- Amsterdam (9 packages)
- Boston (6 packages)
- Lancaster (6 packages)
- Melbourne (3 packages)
- Oakland (2 packages)
- Ottawa (6 packages)
- San Francisco (8 packages)
- Sydney (8 packages)

**Example Pricing (Sydney):**
- Title Sponsor: $5,000 AUD
- Venue Sponsor: $2,500 AUD
- Round Sponsor: $1,000 AUD
- Prize Sponsor: $800 AUD
- Digital Sponsor: $1,000 AUD
- Full Season: $15,000 AUD
- 2025 Events: $8,000 AUD
- 10 Art Battle Hats: $150 AUD

**Example Pricing (San Francisco - highest tier):**
- Title Sponsor: $3,000 USD
- Round Sponsor: $1,500 USD
- Prize Sponsor: $2,000 USD
- Digital Sponsor: $1,000 USD
- Full Season: $9,000 USD
- Social Media Boost: $500 USD
- Logo on Merchandise: $250 USD
- Community Partner: $300 USD

---

## Package Images

### 19 Cloudflare Images

**Packages with visual samples:**
- **Title Sponsor:** 4 images
- **Premier Partner:** 4 images
- **Round Sponsor:** 2 images
- **Spotlight Partner:** 2 images
- **Tactical Prize Sponsor:** 2 images
- **Venue Sponsor:** 1 image
- **Prize Sponsor:** 1 image
- **Audience Choice Partner:** 1 image
- **Community Partner:** 2 images

All images hosted on Cloudflare Images CDN:
`https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/{id}/public`

---

## Media Assets

### 8 Global Media Files

**Media Types:**
1. **Hero Backgrounds:**
   - `hero_bg_desktop` - Desktop hero image
   - `hero_bg_mobile` - Mobile hero image

2. **Event Photos:**
   - `event_photo_live_painting` - "Dragon Painting"
   - `event_photo_packed_venue` - Audience shot

3. **Sponsor Logos:**
   - `sponsor_logo_2`, `sponsor_logo_3`, `sponsor_logo_4`, `sponsor_logo_5`

All media is **global** (event_id = NULL) and active.

---

## Invites

### 35 Sent Invitations

**By Event:**
- Art Battle Victoria: 8 invites
- Art Battle Wilmington: 7 invites
- Art Battle Lancaster: 5 invites
- Art Battle Ottawa x Canadian War Museum: 5 invites
- Test invitations: 3 invites
- Art Battle Melbourne: 2 invites
- Art Battle Berkeley: 1 invite
- Art Battle Sydney City Finals: 1 invite
- AB3032 San Francisco: 1 invite
- TEST julio TEST: 2 invites

**View Statistics:**
- Total views across all invites: 314 (matches interaction count)
- Most viewed: djle8e12 (Art Battle Victoria) - 86 views
- Many invites have 0-1 views

**Discount Distribution:**
- 0%: 20 invites
- 10%: 9 invites
- 15%: 1 invite
- 20%: 1 invite
- 23.08%: 1 invite
- 30%: 2 invites
- 100%: 1 invite (test?)

**Test Invites to Clean:**
- Several invites have test data (test@test.com, gladyschperez@gmail.com)
- Multiple duplicate invites for same prospects

---

## Interactions

### 314 Tracked Interactions

**Interaction Type Breakdown:**
- `view`: 162 interactions (15 unique invites)
- `tier_select`: 96 interactions (13 unique invites)
- `package_click`: 28 interactions (9 unique invites)
- `addon_select`: 18 interactions (7 unique invites)
- `checkout_initiated`: 10 interactions (4 unique invites)

**Conversion Funnel:**
- Views → Tier Selects: 59.3% engagement
- Tier Selects → Package Clicks: 29.2%
- Package Clicks → Checkout: 35.7%
- **Overall Conversion (View to Checkout):** 6.2%

---

## Purchases

### 10 Purchase Records (All Pending)

**Purchase Summary:**
- **All purchases have status:** `pending` / `fulfillment: pending`
- **None have been paid** (paid_at = NULL)
- These are abandoned/incomplete checkouts

**By Event:**
- Art Battle Melbourne: 4 purchases ($1,215 AUD each)
- Art Battle Victoria: 5 purchases ($4,129-$6,149 CAD)
- Art Battle Berkeley: 1 purchase ($127.50 USD)

**Notable:**
- All purchases are test data
- No actual completed transactions
- All tied to test invites (qyt4ido6, djle8e12, 6nsgy6w2, zujwerwm)

---

## Relationships

### Foreign Key Dependencies

```
sponsorship_package_templates (root)
├── sponsorship_city_pricing (71 rows)
│   └── cities (external)
├── sponsorship_package_images (19 rows)
├── event_sponsorship_packages (0 rows)
│   └── events (external)
├── sponsorship_purchases.main_package_id (10 rows)
└── sponsorship_interactions.package_id (nullable)

sponsorship_invites (35 rows)
├── events (external)
├── sponsorship_interactions (314 rows)
└── sponsorship_purchases (10 rows)

sponsorship_media (8 rows)
└── events (external, nullable)

events (external)
├── event_sponsorship_packages
├── sponsorship_invites
├── sponsorship_interactions
├── sponsorship_purchases
└── sponsorship_media
```

### Cascade Behavior
- **DELETE on events:** CASCADE to all related sponsorship records
- **DELETE on sponsorship_invites:** SET NULL on purchases
- **DELETE on sponsorship_package_templates:** SET NULL on purchases

---

## Cleanup Considerations

### Safe to Delete (Test Data)
1. **All 10 purchases** - All pending/test transactions
2. **Test invites** - Invites with:
   - Email: gladyschperez@gmail.com
   - Email: test@test.com
   - Prospect names containing "TEST"
   - Events named "TEST..."

3. **Related interactions** - Will cascade from invite deletion

### Preserve (Production Assets)
1. **All 21 package templates** - Core package definitions
2. **All 71 city pricing records** - Pricing configuration
3. **All 19 package images** - Visual samples on Cloudflare
4. **All 8 media assets** - Global media files

### Production-like Invites (Review Carefully)
- Art Battle Wilmington invites to:
  - Wilmington Alliance (Info@WilmingtonAlliance.org)
  - Wilmington Brew Works (Info@wilmingtonbrewworks.com)
  - Scout Café (hello@scout-cafe.com)
  - Delaware Contemporary

- Art Battle Lancaster invites to:
  - Lancaster Arts Hotel (guestservices@lancasterartshotel.com)
  - Lancaster Brewing Company (info@lancasterbrewing.com)
  - Karen Anderer Fine Art (karen@karenandererfineart.com)
  - The Ware Center (cori.jackson@millersville.edu)

- Art Battle San Francisco invite to:
  - Dogpatch Art & Business Association (president@dbasf.com)

- Art Battle Sydney invite to:
  - Roslyn Oxley9 Gallery (oxley9@roslynoxley9.com.au)

- Art Battle Ottawa invite to:
  - Calian Group Company (calian@gmail.com)

### Recommended Cleanup SQL

```sql
-- Step 1: Delete test purchases (all pending)
DELETE FROM sponsorship_purchases WHERE payment_status = 'pending';

-- Step 2: Delete test/duplicate invites
DELETE FROM sponsorship_invites WHERE
  prospect_email LIKE '%gladyschperez%'
  OR prospect_email LIKE '%test@test%'
  OR prospect_name LIKE '%TEST%'
  OR prospect_name LIKE '%julio%'
  OR prospect_name LIKE '%test%';

-- Step 3: Verify remaining invites
SELECT
  hash,
  event_id,
  prospect_name,
  prospect_email,
  view_count
FROM sponsorship_invites
ORDER BY created_at DESC;

-- Step 4: Clean up orphaned interactions (if any)
-- Should auto-delete via CASCADE, but verify:
SELECT COUNT(*) FROM sponsorship_interactions WHERE invite_id IS NULL;
```

### Recreation Notes

**To recreate the system from scratch:**

1. **Package Templates** - Keep all 21 templates as-is
2. **City Pricing** - Keep all 71 pricing records
3. **Package Images** - Keep all 19 images (hosted on Cloudflare)
4. **Media Assets** - Keep all 8 global media files
5. **Invites** - Delete test data, preserve real prospect invites
6. **Interactions** - Will cascade delete with invites
7. **Purchases** - Delete all (all are pending test transactions)

**After cleanup, you should have:**
- 21 package templates ✓
- 71 city pricing records ✓
- 19 package images ✓
- 8 media assets ✓
- ~10-15 production invites
- 0 purchases
- Interactions related to production invites only

---

## Database Export Commands

```bash
# Export package templates
PGPASSWORD='6kEtvU9n0KhTVr5' pg_dump -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -t sponsorship_package_templates \
  --data-only --column-inserts > sponsorship_templates_backup.sql

# Export city pricing
PGPASSWORD='6kEtvU9n0KhTVr5' pg_dump -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -t sponsorship_city_pricing \
  --data-only --column-inserts > sponsorship_pricing_backup.sql

# Export package images
PGPASSWORD='6kEtvU9n0KhTVr5' pg_dump -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -t sponsorship_package_images \
  --data-only --column-inserts > sponsorship_images_backup.sql

# Export media
PGPASSWORD='6kEtvU9n0KhTVr5' pg_dump -h db.xsqdkubgyqwpyvfltnrf.supabase.co \
  -p 5432 -d postgres -U postgres \
  -t sponsorship_media \
  --data-only --column-inserts > sponsorship_media_backup.sql
```

---

*End of Inventory*
