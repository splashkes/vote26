# Offers Admin UI - Implementation Plan
**Date:** 2025-11-13
**Status:** Planning - Awaiting Approval

## Overview
Build a comprehensive CRUD admin interface for managing promotional offers in the `offers` table. This interface will allow admins to create, edit, and delete offers that appear to users at `artb.art/o/{hash}` based on their RFM scores.

## Current State Analysis

### Database Schema
- **Table:** `public.offers` (30 columns)
- **Primary Key:** `id` (UUID)
- **Key Fields:**
  - Content: `name`, `description`, `terms`
  - Targeting: RFM scores (min/max for recency, frequency, monetary)
  - Geography: `geography_scope` (text[] - **ISSUE: contains city names, not UUIDs**)
  - Inventory: `total_inventory`, `redeemed_count`
  - Display: `tile_color`, `image_url`, `display_order`
  - Redemption: `redemption_link`, `redemption_message`
  - Metadata: `type`, `value`, `currency`, `active`, `start_date`, `end_date`

### Existing Offer Types (from data)
- `ticket`, `offer`, `experience`, `discount`, `offer-new`, `merchandise`, `auction_credit`

### Data Quality Issues Found
1. **Geography Scope Mismatch:** Existing data uses city NAMES (`"Toronto"`, `"San Francisco"`) not UUIDs
   - User wants UUIDs going forward
   - **SOLUTION:** UI will use UUIDs, but we need migration/cleanup strategy for existing data
2. **Display Order:** All existing offers have `display_order = 0`
   - Need better ordering system

### Redemption Count Verification
- `redeemed_count` in `offers` table MATCHES actual count from `offer_redemptions` table
- Appears to be auto-updated (likely via trigger)
- User wants to show calculated value BUT allow manual override

## User Requirements (from AskUserQuestion)

1. ✅ **RFM Filtering:** Use individual min/max score fields ONLY (ignore `rfm_segments` jsonb)
2. ✅ **Geography Scope:** Use City IDs (UUIDs) from `cities` table
3. ✅ **Images:** Upload to CDN (DigitalOcean Spaces via s3cmd)
4. ✅ **Inventory:** Show calculated `redeemed_count` but allow manual override

## Component Architecture

### File Structure
```
/root/vote_app/vote26/art-battle-admin/src/
├── components/
│   ├── OffersManagement.jsx          (Main component - list view)
│   ├── OfferFormModal.jsx             (Create/Edit modal)
│   └── OfferImageUpload.jsx           (Image upload component)
├── lib/
│   └── OffersAPI.js                   (API helper functions)
└── App.jsx                             (Add route)
```

### Navigation Integration
- **Route:** `/offers`
- **Sidebar:** Add to "Content & Marketing" section
- **Icon:** `MixIcon` or `GiftIcon` (Radix)
- **Label:** "Promo Offers"
- **Description:** "Manage promotional offers and rewards"

## UI Design

### Layout Choice: Modal-Based Editing
**Rationale:**
- Consistent with existing `PromotionSystem.jsx` pattern
- Quick access to edit without navigation
- List view always visible
- Better for bulk management

### List View (`OffersManagement.jsx`)

**Features:**
- Sortable table/card grid showing all offers
- Columns: Name, Type, Value, Geography, RFM Filters, Inventory, Active Status, Actions
- Search/filter by: name, type, active status
- Sort by: display_order, name, start_date, end_date
- Bulk actions: Activate/Deactivate selected offers
- Create button (top right)

**Display:**
```
[Create Offer] [Refresh]

Search: [________] Type: [All ▾] Status: [All ▾]

┌─────────────────────────────────────────────────────────────┐
│ Order | Name              | Type    | RFM    | Geo  | Active │
├─────────────────────────────────────────────────────────────┤
│   1   | Free Tickets      | ticket  | R:0-2  | PHI  |   ✓    │
│   2   | $50 Auction Cr    | auction | R:3-5  | All  |   ✓    │
│   3   | Send to Friend    | ticket  | R:4-5  | All  |   ✓    │
└─────────────────────────────────────────────────────────────┘
```

### Create/Edit Modal (`OfferFormModal.jsx`)

**Modal Structure:**
```
┌─ Create/Edit Offer ────────────────────────────────── [X] ─┐
│                                                              │
│ [Tabs: Basic Info | Targeting | Display | Redemption]      │
│                                                              │
│ === Basic Info Tab ===                                      │
│ Name:        [_____________________________________]        │
│ Description: [_____________________________________]        │
│              [_____________________________________]        │
│ Terms:       [_____________________________________]        │
│              [_____________________________________]        │
│ Type:        [ticket ▾]  (dropdown with 7 types)           │
│ Value:       [50.00] Currency: [CAD ▾]                     │
│                                                              │
│ === Targeting Tab ===                                       │
│ Geography Scope:                                            │
│   [Select Cities...] [X Toronto] [X Vancouver]             │
│   ☐ Available everywhere (empty = all cities)              │
│                                                              │
│ RFM Score Filters:                                          │
│   Recency:   Min [1] ─────●───── [5] Max                   │
│   Frequency: Min [1] ─────●───── [5] Max                   │
│   Monetary:  Min [1] ─────●───── [5] Max                   │
│   Note: Leave at 1-5 to target all users                   │
│                                                              │
│ === Display Tab ===                                         │
│ Display Order: [3] (lower = shown first)                   │
│ Tile Color:    [#3a88fe] [Color picker]                    │
│ Image:         [Upload Image] [Current: ✓]                 │
│                                                              │
│ === Redemption Tab ===                                      │
│ Redemption Link:    [https://...]                          │
│ Redemption Message: [Optional custom message...]           │
│                                                              │
│ === Inventory & Dates ===                                   │
│ Total Inventory: [100] offers                               │
│ Redeemed: [23] (calculated) ☐ Manual override [___]        │
│ Available: 77 remaining                                     │
│                                                              │
│ Start Date: [2025-01-01 00:00] (empty = active now)        │
│ End Date:   [2025-12-31 23:59] (empty = no expiry)         │
│                                                              │
│ ☑ Active (show to users)                                   │
│                                                              │
│                          [Cancel] [Save Offer]              │
└─────────────────────────────────────────────────────────────┘
```

## Form Fields Specification

### Tab 1: Basic Info
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | text | Yes | Max 255 chars |
| description | textarea | No | - |
| terms | textarea | No | - |
| type | select | No | One of 7 types or free-form |
| value | number | No | Decimal (10,2) |
| currency | select | No | Default: CAD |

### Tab 2: Targeting
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| geography_scope | multi-select cities | No | UUID array, empty = all |
| min_recency_score | slider (1-5) | No | Must be ≤ max |
| max_recency_score | slider (1-5) | No | Must be ≥ min |
| min_frequency_score | slider (1-5) | No | Must be ≤ max |
| max_frequency_score | slider (1-5) | No | Must be ≥ min |
| min_monetary_score | slider (1-5) | No | Must be ≤ max |
| max_monetary_score | slider (1-5) | No | Must be ≥ min |

**NOTE on RFM:** Data shows scores 0-5, but schema suggests 1-5. **Decision needed from user.**

### Tab 3: Display
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| display_order | number | No | Integer, default 0 |
| tile_color | color picker | No | Hex format #RRGGBB |
| image_url | file upload OR text | No | Generated from upload |

### Tab 4: Redemption
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| redemption_link | text | No | Valid URL |
| redemption_message | textarea | No | - |

### Bottom Section: Inventory & Dates
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| total_inventory | number | No | Integer ≥ 0 |
| redeemed_count | display + override | No | Integer, show calculated |
| start_date | datetime-local | No | - |
| end_date | datetime-local | No | Must be > start_date |
| active | checkbox | No | Default: true |

## Image Upload Strategy

### DigitalOcean Spaces Upload (via Edge Function)

**Why Edge Function instead of direct s3cmd:**
- s3cmd requires server-side execution (can't run from browser)
- Need secure credential management
- Browser security prevents direct S3 uploads without CORS

**Solution: Create Supabase Edge Function**

**New Function:** `admin-offers-image-upload`

**Flow:**
1. Browser: User selects image file
2. Browser: Resize image to max 800x800 (client-side canvas)
3. Browser: POST file to edge function
4. Edge Function: Validate admin auth
5. Edge Function: Upload to S3 using credentials from env
6. Edge Function: Return public CDN URL
7. Browser: Set `image_url` field in form

**S3 Path:** `s3://artb/promo_offers/offer_images/{offer-id}-{timestamp}.jpg`
**CDN URL:** `https://artb.tor1.cdn.digitaloceanspaces.com/promo_offers/offer_images/{filename}`

**Alternative (Simpler):** Use existing Cloudflare upload like `PromoImageUploadModal.jsx`
- **User must decide:** DigitalOcean Spaces or Cloudflare?

## City Selection UI

### Multi-Select with Search

**Implementation:**
```jsx
// Load cities on mount
const [cities, setCities] = useState([]);
const [selectedCityIds, setSelectedCityIds] = useState([]);

// Fetch from cities table
const { data } = await supabase
  .from('cities')
  .select('id, name')
  .order('name');

// Display
<ScrollArea maxHeight="200px">
  <TextField placeholder="Search cities..." />
  {filteredCities.map(city => (
    <Checkbox
      checked={selectedCityIds.includes(city.id)}
      label={city.name}
    />
  ))}
</ScrollArea>
```

**Special Case:** Empty array = "Available everywhere"
- Show checkbox: "Available in all cities (no restrictions)"
- When checked, clear selectedCityIds array

## RFM Score Inputs

### Dual Slider Pattern (Radix UI)

```jsx
<Box>
  <Flex justify="between" mb="2">
    <Text>Recency Score</Text>
    <Text>Min: {recencyMin} | Max: {recencyMax}</Text>
  </Flex>
  <Slider
    min={0}
    max={5}
    step={1}
    value={[recencyMin, recencyMax]}
    onValueChange={([min, max]) => {
      setRecencyMin(min);
      setRecencyMax(max);
    }}
  />
</Box>
```

**Decision Needed:** RFM range 0-5 or 1-5?
- Data shows 0-5
- Schema comments suggest 1-5
- **Recommend 0-5 to match existing data**

## Inventory Display Strategy

### "Show Both" = Calculated + Override Option

**UI Design:**
```jsx
<Box>
  <Flex align="center" gap="2">
    <Text>Redeemed Count:</Text>
    <Badge color="blue">{calculatedCount} (from redemptions table)</Badge>
  </Flex>

  <Flex align="center" gap="2" mt="2">
    <Checkbox
      checked={useManualOverride}
      label="Manual override"
    />
    {useManualOverride && (
      <TextField
        type="number"
        value={manualCount}
        onChange={(e) => setManualCount(e.target.value)}
      />
    )}
  </Flex>

  <Text size="1" color="gray">
    Available: {totalInventory - (useManualOverride ? manualCount : calculatedCount)}
  </Text>
</Box>
```

**When to use manual override:**
- Importing legacy data
- Correcting errors
- Testing scenarios

## Data Fetching Strategy

### API Functions (`lib/OffersAPI.js`)

```javascript
// Fetch all offers
export async function getAllOffers() {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      *,
      actual_redemptions:offer_redemptions(count)
    `)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  return { data, error };
}

// Fetch single offer with redemption count
export async function getOffer(offerId) {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      *,
      actual_redemptions:offer_redemptions(count)
    `)
    .eq('id', offerId)
    .single();

  return { data, error };
}

// Create offer
export async function createOffer(offerData) {
  const { data, error } = await supabase
    .from('offers')
    .insert([offerData])
    .select()
    .single();

  return { data, error };
}

// Update offer
export async function updateOffer(offerId, updates) {
  const { data, error } = await supabase
    .from('offers')
    .update(updates)
    .eq('id', offerId)
    .select()
    .single();

  return { data, error };
}

// Delete offer
export async function deleteOffer(offerId) {
  const { data, error } = await supabase
    .from('offers')
    .delete()
    .eq('id', offerId);

  return { data, error };
}

// Fetch all cities for geography scope
export async function getAllCities() {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name')
    .order('name');

  return { data, error };
}
```

## Validation Rules

### Critical Validations
1. ✅ **Date Range:** `end_date` must be after `start_date` (if both set)
2. ✅ **RFM Scores:** Min must be ≤ Max for each dimension
3. ✅ **RFM Range:** Scores must be between 0-5 (or 1-5, pending decision)
4. ✅ **Inventory:** `total_inventory` ≥ `redeemed_count`
5. ✅ **Name:** Required, max 255 chars
6. ✅ **Color:** Valid hex format (#RRGGBB) if provided
7. ✅ **Geography:** UUIDs must exist in cities table

### Form Validation Flow
```javascript
const validateOffer = (formData) => {
  const errors = {};

  if (!formData.name || formData.name.trim() === '') {
    errors.name = 'Name is required';
  }

  if (formData.end_date && formData.start_date) {
    if (new Date(formData.end_date) <= new Date(formData.start_date)) {
      errors.end_date = 'End date must be after start date';
    }
  }

  if (formData.min_recency_score > formData.max_recency_score) {
    errors.recency = 'Min recency must be ≤ max recency';
  }

  // ... similar for frequency and monetary

  if (formData.redeemed_count > formData.total_inventory) {
    errors.inventory = 'Redeemed count cannot exceed total inventory';
  }

  return errors;
};
```

## Error Handling

### RLS Policy Check
- Existing policy: `admin_manage_offers` checks `abhq_admin_users` table
- If user lacks permission: Show error "You don't have permission to manage offers"
- Log error and session details for debugging

### Database Errors
- Duplicate name: "An offer with this name already exists"
- Foreign key violation (cities): "Invalid city selected"
- Network error: "Unable to connect to database. Please try again."

### Upload Errors
- File too large: "Image must be under 5MB"
- Invalid format: "Please upload JPG, PNG, or WebP"
- S3 failure: "Upload failed. Please try again."

## Security Considerations

### RLS Policies (Already Exist)
- ✅ `admin_manage_offers` - Limits access to authenticated admins
- ✅ `public_view_active_offers` - Public can only see active, non-expired offers
- ✅ `service_role_offers` - Service role has full access

### Image Upload Security
- File type validation (client + server)
- File size limit (5MB max)
- Filename sanitization (remove special chars)
- Admin auth check in edge function

### Input Sanitization
- HTML escape user input (Radix handles this)
- SQL injection protected by Supabase client
- XSS protection via React

## Testing Strategy

### Test URLs (Existing)
1. `https://artb.art/o/l9ov1sbd` - Rogelio (2 eligible offers)
2. `https://artb.art/o/mbc9mpva` - User "5" (2 eligible offers)
3. `https://artb.art/o/mahfzj73` - User "12" (2 eligible offers)

### Test Scenarios
1. ✅ Create new offer with RFM filters → Verify appears for matching users
2. ✅ Update offer geography → Verify only shows in selected cities
3. ✅ Set inventory limit → Verify offer hides when limit reached
4. ✅ Schedule offer (start/end dates) → Verify only shows during window
5. ✅ Deactivate offer → Verify immediately hides from public view
6. ✅ Upload offer image → Verify displays in public viewer
7. ✅ Manual redemption override → Verify inventory calculation correct

### Edge Cases
- Empty geography_scope array (should show everywhere)
- NULL RFM scores (should match all users)
- Past end_date (should not show)
- Future start_date (should not show yet)
- Total inventory = redeemed count (should hide or show "sold out")

## Migration Strategy for Existing Data

### Geography Scope Cleanup

**Problem:** Existing offers use city NAMES, new UI uses UUIDs

**Solutions:**
1. **Write migration script** to convert names → UUIDs
   ```sql
   UPDATE offers
   SET geography_scope = (
     SELECT array_agg(c.id::text)
     FROM cities c
     WHERE c.name = ANY(geography_scope)
   )
   WHERE geography_scope IS NOT NULL
     AND array_length(geography_scope, 1) > 0;
   ```

2. **Hybrid UI (temporary):** Show existing names, save as UUIDs
   - Not recommended - creates data inconsistency

**Recommendation:** Run migration BEFORE deploying UI

### Display Order Cleanup

**Problem:** All offers have `display_order = 0`

**Solution:** Manual reordering after UI deployed
- Admin uses drag-drop or number input
- Or run one-time script to space them out (1, 2, 3, ...)

## Deployment Checklist

### Pre-Deployment
- [ ] User approval of this plan
- [ ] Decide: RFM score range (0-5 or 1-5)?
- [ ] Decide: Image upload destination (DigitalOcean or Cloudflare)?
- [ ] Run geography_scope migration if using UUIDs
- [ ] Test offers table RLS policies work for admin user

### Development Order
1. [ ] Create `OffersAPI.js` with CRUD functions
2. [ ] Create `OffersManagement.jsx` with list view
3. [ ] Create `OfferFormModal.jsx` with tabs
4. [ ] Create image upload component/function
5. [ ] Add route to `App.jsx`
6. [ ] Add navigation to `AdminSidebar.jsx`
7. [ ] Test all CRUD operations
8. [ ] Test RFM filtering logic with test URLs
9. [ ] Deploy admin app via `deploy.sh`

### Post-Deployment
- [ ] Verify admin can create/edit/delete offers
- [ ] Verify offers appear correctly on test URLs
- [ ] Verify RFM filtering works (create test offer with R:5 only)
- [ ] Verify geography filtering (city-specific offer)
- [ ] Verify image upload works
- [ ] Document any manual data cleanup needed

## Open Questions for User

1. **RFM Score Range:** Use 0-5 (matches data) or 1-5 (schema hint)?
2. **Image Upload:** DigitalOcean Spaces (via edge function) or Cloudflare (like existing)?
3. **Geography Migration:** Run migration now or handle legacy data in UI?
4. **Offer Type:** Strict dropdown or free-form text input?
5. **Display Order:** Manual number input or drag-and-drop UI?
6. **Preview Feature:** Include "Preview Offer" button to see how it looks to users?

## Success Criteria

- ✅ Admin can create new offers in under 2 minutes
- ✅ RFM-targeted offers only show to matching users
- ✅ Geography-restricted offers only show in selected cities
- ✅ Inventory tracking prevents over-redemption
- ✅ Image upload works reliably
- ✅ All validation prevents bad data
- ✅ UI is intuitive (no training required)
- ✅ No security vulnerabilities introduced

## Estimated Complexity

**Development Time:** 6-8 hours
- List view: 1 hour
- Form modal (4 tabs): 3 hours
- Image upload: 1-2 hours (depends on edge function)
- API functions: 1 hour
- Testing & refinement: 1-2 hours

**Risk Level:** Medium
- Geography migration could break existing offers if not careful
- Image upload edge function is new infrastructure
- RFM filtering logic must match public viewer exactly

---

## Next Steps

1. **User Review:** Approve this plan or request changes
2. **Answer Open Questions:** Make decisions on 6 open questions above
3. **Start Development:** Follow development order checklist
4. **Iterative Testing:** Test each component as built

**Status:** ⏸️ Awaiting user approval to proceed
