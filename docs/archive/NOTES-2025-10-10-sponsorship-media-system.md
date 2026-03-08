# Sponsorship Media Upload System - October 10, 2025

## Overview
Implemented a complete media asset management system for the Art Battle sponsorship platform, allowing admins to upload images that automatically replace placeholders in the sponsorship SPA.

## Database Changes

### Table: `sponsorship_media`
The table already existed but lacked proper RLS policies for public access.

**Key Columns:**
- `id` (uuid, PK)
- `media_type` (varchar) - Type identifier for specific asset slots
- `title` (varchar) - Human-readable title
- `caption` (text) - Optional description
- `url` (text) - CloudFlare Images URL
- `cloudflare_id` (text) - CloudFlare image identifier
- `thumbnail_url` (text) - Thumbnail variant URL
- `event_id` (uuid, nullable) - NULL for global media, specific event ID for event-specific media
- `active` (boolean) - Whether the media is active
- `display_order` (integer) - Sort order
- `created_at`, `updated_at` (timestamps)

**Media Types Defined:**
- `hero_bg_desktop` - Hero section background (desktop, 1920×1080)
- `hero_bg_mobile` - Hero section background (mobile, 1200×900)
- `video_poster` - Video thumbnail placeholder (1600×900)
- `event_photo_packed_venue` - Event photo slot 1 (800×600)
- `event_photo_live_painting` - Event photo slot 2 (800×600)
- `event_photo_audience_engagement` - Event photo slot 3 (800×600)
- `event_photo_sponsor_visibility` - Event photo slot 4 (800×600)
- `section_bg` - Local relevance section background (1920×1080)
- `sponsor_logo_1` through `sponsor_logo_6` - Sponsor logo slots

**No RLS Policies Added:**
- Public access is handled through the RPC function `get_sponsorship_invite_details`
- RPC function uses SECURITY DEFINER to bypass RLS
- Admin access uses authenticated service role key

### RPC Function: `get_sponsorship_invite_details`

**Signature:**
```sql
get_sponsorship_invite_details(p_hash VARCHAR)
RETURNS TABLE(
  invite_id uuid,
  event_id uuid,
  event_name text,
  event_date timestamp with time zone,
  event_city varchar,
  event_venue varchar,
  city_id uuid,
  prospect_name varchar,
  prospect_email varchar,
  prospect_company varchar,
  discount_percent numeric,
  valid_until timestamp with time zone,
  country_code varchar,
  currency_code varchar,
  currency_symbol varchar,
  packages jsonb,
  media jsonb  -- ALREADY INCLUDED
)
```

**Media Aggregation Logic:**
The function already includes a media aggregation subquery that was previously implemented:

```sql
(
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', sm.id,
      'media_type', sm.media_type,
      'title', sm.title,
      'caption', sm.caption,
      'url', sm.url,
      'thumbnail_url', sm.thumbnail_url
    ) ORDER BY sm.display_order
  )
  FROM sponsorship_media sm
  WHERE (sm.event_id = si.event_id OR sm.event_id IS NULL)
    AND sm.active = true
) AS media
```

**Key Points:**
- Returns media as JSONB array
- Includes both global media (event_id IS NULL) and event-specific media
- Only returns active media
- Ordered by display_order
- Uses SECURITY DEFINER so it bypasses RLS policies

## CloudFlare Images Integration

### Existing Infrastructure
The system uses an existing CloudFlare Worker for image uploads:

**Worker URL:** `https://art-battle-image-upload-production.simon-867.workers.dev`

**Authentication:**
- Uses Supabase session access token
- Header: `Authorization: Bearer ${session.access_token}`
- Additional header: `X-Upload-Source: sponsorship_media`

**Image Processing:**
- Client-side resize before upload (max 1920×1920, 85% quality JPEG)
- Canvas-based resizing with white background
- Uploads via FormData with file blob

**Response:**
- Returns CloudFlare image ID
- Frontend constructs URL: `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${id}/public`

**Automatic Format Optimization:**
- CloudFlare Images automatically serves WebP to supported browsers
- Falls back to JPEG for older browsers
- Single URL handles all format negotiation via Accept headers

## Admin Interface Changes

### File: `/root/vote_app/vote26/art-battle-admin/src/components/sponsorship/SponsorshipMediaLibrary.jsx`

**New Features:**
1. **Required Assets Checklist**
   - Visual progress tracker showing X/8 required assets uploaded
   - Progress bar with percentage complete
   - Color-coded cards (green when uploaded, gray when missing)
   - Thumbnail preview (60×60) when uploaded
   - "Copy URL" button for each uploaded asset

2. **Asset Type Dropdown**
   - Updated from generic types to specific sponsorship asset slots
   - 14 predefined asset types matching database media_type values
   - Color-coded badges (purple for backgrounds, green for photos, orange for logos)

3. **Upload Flow**
   - File selection with preview
   - Client-side image resizing (max 1920×1920)
   - Upload to CloudFlare Worker
   - Save metadata to `sponsorship_media` table
   - Automatic refresh of asset grid

### File: `/root/vote_app/vote26/art-battle-admin/src/lib/sponsorshipAPI.js`

**Function: `uploadSponsorshipMediaFile()`**

**Previous Implementation (REMOVED):**
- Attempted to call non-existent edge function `sponsorship-upload-media`
- Used base64 encoding to pass file data

**Current Implementation:**
```javascript
export async function uploadSponsorshipMediaFile(file, eventId, mediaType, metadata = {}) {
  // Get session token
  const { data: { session } } = await supabase.auth.getSession();

  // Resize image client-side
  const resizedFile = await resizeImage(file, 1920, 1920, 0.85);

  // Upload to CloudFlare Worker
  const formData = new FormData();
  formData.append('file', resizedFile);

  const uploadResponse = await fetch(
    'https://art-battle-image-upload-production.simon-867.workers.dev',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Upload-Source': 'sponsorship_media'
      },
      body: formData
    }
  );

  // Construct CloudFlare Images URL
  const imageUrl = `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/${uploadResult.id}/public`;

  return { success: true, imageUrl, cloudflareId: uploadResult.id };
}
```

**Helper Function: `resizeImage()`**
- Canvas-based client-side resize
- Maintains aspect ratio
- White background for JPEG
- 85% quality compression
- Returns File blob

## Sponsorship SPA Changes

### File: `/root/vote_app/vote26/art-battle-sponsorship/src/App.jsx`

**Removed:**
- `getSponsorshipMedia` function import
- `media` state variable
- `loadMedia()` function
- Separate API call to fetch media

**Why:** Media is already included in the `sponsorship-invite-details` edge function response.

**Data Flow:**
1. App calls `getSponsorshipInvite(hash)`
2. Edge function calls `get_sponsorship_invite_details` RPC
3. RPC returns invite data WITH media array
4. Components receive `inviteData.media` directly

### File: `/root/vote_app/vote26/art-battle-sponsorship/src/components/HeroSection.jsx`

**Changes:**
```javascript
// Convert media array to lookup map
const mediaMap = {};
inviteData?.media?.forEach(item => {
  mediaMap[item.media_type] = item.url;
});

// Use uploaded media or fallback to placeholder
const heroBg = mediaMap.hero_bg_desktop || 'https://picsum.photos/1920/1080?random=1';
const videoPoster = mediaMap.video_poster || 'https://placehold.co/800x450/...';
```

**Applied to:**
- Hero background image (desktop)
- Video poster thumbnail

### File: `/root/vote_app/vote26/art-battle-sponsorship/src/components/LocalRelevanceSection.jsx`

**Changes:**
```javascript
// Convert media array to lookup map
const mediaMap = {};
inviteData?.media?.forEach(item => {
  mediaMap[item.media_type] = item.url;
});

// Event photos with fallbacks
const eventPhotos = [
  { url: mediaMap.event_photo_packed_venue || 'https://picsum.photos/...', label: 'Packed Venue' },
  { url: mediaMap.event_photo_live_painting || 'https://picsum.photos/...', label: 'Live Painting' },
  { url: mediaMap.event_photo_audience_engagement || 'https://picsum.photos/...', label: 'Audience Engagement' },
  { url: mediaMap.event_photo_sponsor_visibility || 'https://picsum.photos/...', label: 'Sponsor Visibility' }
];

const sectionBg = mediaMap.section_bg || 'https://picsum.photos/1920/1080?random=2';
```

**Applied to:**
- Section background image
- 4 event photo slots

### File: `/root/vote_app/vote26/art-battle-sponsorship/src/lib/api.js`

**Added (but unused):**
```javascript
export async function getSponsorshipMedia() {
  const { data, error } = await supabase
    .from('sponsorship_media')
    .select('*')
    .eq('active', true)
    .is('event_id', null)
    .order('display_order', { ascending: true });

  // Create map
  const mediaMap = {};
  data?.forEach(item => {
    mediaMap[item.media_type] = item.url;
  });

  return { data: mediaMap, error: null };
}
```

**Note:** This function was created but ultimately not used because media is already included in the invite details RPC response.

## Technical Architecture

### Data Flow Diagram

```
┌─────────────┐
│   Admin     │
│  Uploads    │
│   Image     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  Client-side Resize         │
│  (1920×1920, 85% quality)   │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  CloudFlare Worker          │
│  (existing upload endpoint) │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  CloudFlare Images          │
│  Returns: image ID          │
└──────┬──────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  Save to DB:                │
│  sponsorship_media table    │
│  - media_type               │
│  - url (CloudFlare)         │
│  - cloudflare_id            │
│  - active = true            │
│  - event_id = null          │
└─────────────────────────────┘

                ┌──────────────────┐
                │   User visits    │
                │  Sponsorship SPA │
                └────────┬─────────┘
                         │
                         ▼
                ┌─────────────────────────┐
                │  Edge Function:         │
                │  sponsorship-invite-    │
                │  details                │
                └────────┬────────────────┘
                         │
                         ▼
                ┌─────────────────────────┐
                │  RPC Function:          │
                │  get_sponsorship_       │
                │  invite_details         │
                │  (includes media query) │
                └────────┬────────────────┘
                         │
                         ▼
                ┌─────────────────────────┐
                │  Returns JSONB:         │
                │  {                      │
                │    packages: [...],     │
                │    media: [             │
                │      {media_type, url}  │
                │    ]                    │
                │  }                      │
                └────────┬────────────────┘
                         │
                         ▼
                ┌─────────────────────────┐
                │  React Components:      │
                │  - Convert array to map │
                │  - Use URLs or fallback │
                │  - Render images        │
                └─────────────────────────┘
```

### Security Model

**Admin Upload:**
- Requires authenticated session (service role key in admin)
- CloudFlare Worker validates Supabase access token
- Database insert uses authenticated user context

**Public Access:**
- No direct database queries from frontend
- All data flows through edge function → RPC
- RPC uses SECURITY DEFINER to bypass RLS
- Only returns active media for the specific invite

**No RLS Policies Needed:**
- Public reads handled via RPC function
- RPC has SECURITY DEFINER privilege
- Admin writes use service role authentication

## Error Fixes During Implementation

### Issue 1: Missing Text Import
**Error:** `Constructor requires 'new' operator` in sponsorship SPA
**Location:** `/root/vote_app/vote26/art-battle-sponsorship/src/App.jsx:302`
**Cause:** Used `<Text>` component without importing from Radix UI
**Fix:** Added `Text` to imports from `@radix-ui/themes`

### Issue 2: CORS Header Rejection
**Error:** `Request header field X-Media-Type is not allowed by Access-Control-Allow-Headers`
**Cause:** CloudFlare Worker doesn't allow custom `X-Media-Type` header
**Fix:** Removed `X-Media-Type` header, kept only `Authorization` and `X-Upload-Source`

### Issue 3: Edge Function 404
**Error:** `Preflight response is not successful. Status code: 404` for `sponsorship-upload-media`
**Cause:** Attempted to create new edge function instead of using existing infrastructure
**Fix:** Removed edge function approach, used existing CloudFlare Worker directly

### Issue 4: Redundant Data Fetch
**Issue:** Frontend making separate API call to fetch media
**Cause:** Didn't realize RPC function already returns media
**Fix:** Removed `getSponsorshipMedia` API call, used `inviteData.media` from edge function response

## Performance Optimizations

1. **Single Data Fetch**
   - Media included in initial invite details request
   - No additional round trips to database
   - Reduces latency and database load

2. **Client-Side Resize**
   - Images resized before upload (max 1920×1920)
   - Reduces upload bandwidth and CloudFlare storage
   - Faster upload times

3. **CloudFlare Images CDN**
   - Global CDN delivery
   - Automatic format optimization (WebP/JPEG)
   - Browser-specific serving via Accept headers
   - No separate WebP + JPEG files needed

4. **JSONB Aggregation**
   - Media aggregated in single query
   - Efficient array-to-map conversion in frontend
   - O(n) lookup performance

## Files Modified

### Admin
- `/root/vote_app/vote26/art-battle-admin/src/components/sponsorship/SponsorshipMediaLibrary.jsx` (major refactor)
- `/root/vote_app/vote26/art-battle-admin/src/lib/sponsorshipAPI.js` (upload function rewrite)

### Sponsorship SPA
- `/root/vote_app/vote26/art-battle-sponsorship/src/App.jsx` (removed separate media fetch)
- `/root/vote_app/vote26/art-battle-sponsorship/src/components/HeroSection.jsx` (media integration)
- `/root/vote_app/vote26/art-battle-sponsorship/src/components/LocalRelevanceSection.jsx` (media integration)
- `/root/vote_app/vote26/art-battle-sponsorship/src/lib/api.js` (added unused getSponsorshipMedia function)

### Database
- No migrations required
- RPC function `get_sponsorship_invite_details` already included media
- Table `sponsorship_media` already existed with correct schema

## Testing Results

**Test Case:** Upload "Event Photo: Live Painting"
- ✅ Image uploaded successfully to CloudFlare
- ✅ Database record created with correct media_type
- ✅ URL stored: `https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/artist-null-1760106733662/public`
- ✅ Active flag set to true
- ✅ Event ID set to null (global media)
- ✅ Image appears in admin checklist with thumbnail
- ✅ Image delivered in RPC response
- ✅ Image displayed in sponsorship SPA (second photo slot)

## Future Enhancements

1. **Image Variants**
   - Define CloudFlare variants for different sizes
   - Add thumbnail_url to display in admin grid
   - Use variants for responsive images (desktop/mobile)

2. **Bulk Upload**
   - Allow uploading multiple images at once
   - Drag-and-drop interface
   - Progress indicators for each file

3. **Image Editing**
   - Crop, rotate, adjust brightness/contrast
   - Preview before saving
   - Replace existing images

4. **Event-Specific Media**
   - Allow uploading media for specific events
   - Override global media with event-specific media
   - UI toggle for global vs. event-specific

5. **Media Library Search**
   - Filter by media type
   - Search by title/caption
   - Date range filters

6. **Usage Tracking**
   - Track which invites use which media
   - Report on media usage statistics
   - Identify unused media for cleanup

## Database Query Examples

**Check uploaded media:**
```sql
SELECT media_type, title, url, active, event_id
FROM sponsorship_media
ORDER BY created_at DESC
LIMIT 5;
```

**Get media for specific invite (via RPC):**
```sql
SELECT * FROM get_sponsorship_invite_details('invite-hash-here');
```

**Count media by type:**
```sql
SELECT media_type, COUNT(*)
FROM sponsorship_media
WHERE active = true AND event_id IS NULL
GROUP BY media_type
ORDER BY media_type;
```

## Deployment

**Admin:** https://artb.tor1.cdn.digitaloceanspaces.com/admin/
**Sponsorship SPA:** https://artb.tor1.cdn.digitaloceanspaces.com/sponsor/

**Deployment Commands:**
```bash
# Admin
cd /root/vote_app/vote26/art-battle-admin && ./deploy.sh

# Sponsorship SPA
cd /root/vote_app/vote26/art-battle-sponsorship && ./deploy.sh
```

**Cache Versions:**
- Admin: 1760106292
- Sponsorship SPA: 1760107179

## Related Documentation

- Designer Asset Specifications: `/root/vote_app/vote26/DESIGNER_ASSETS_SPECIFICATIONS.md`
- Designer Asset List: `/root/vote_app/vote26/DESIGNER_ASSETS_LIST.md`

---

**Author:** Claude (AI Assistant)
**Date:** October 10, 2025
**Session:** Sponsorship media system implementation
