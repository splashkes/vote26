# Photo Upload System Documentation

## Overview

The Art Battle Vote app now includes a comprehensive photo upload system that allows authorized users (photo admins and higher) to upload artwork photos. The system uses Cloudflare Images for storage and delivery, with automatic image optimization and variant generation.

## Architecture

### Components

1. **Frontend Components**
   - `LazyAdminUpload.jsx` - Lazy-loaded wrapper that checks permissions
   - `AdminImageUpload.jsx` - Main upload component with resize and progress
   - `AdminPanel.jsx` - Contains the Photos tab for admin users

2. **Cloudflare Worker**
   - `cloudflare-worker/image-upload-worker.js` - Handles CORS and authentication
   - Proxies uploads to Cloudflare Images API
   - Returns image URLs with variants

3. **Database**
   - `art_media` table stores image metadata and URLs
   - Supports multiple images per artwork
   - Tracks primary image designation

## Setup Instructions

### 1. Deploy Cloudflare Worker

```bash
cd cloudflare-worker
npm install -g wrangler
wrangler login

# Set secrets
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY

# Deploy
wrangler deploy --env production
```

### 2. Configure Environment Variables

Add to your `.env` file:
```
VITE_CLOUDFLARE_WORKER_URL=https://art-battle-image-upload.your-domain.workers.dev
```

### 3. Run Database Migration

```bash
PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -f migrations/20250805_art_media_table.sql
```

### 4. Grant Photo Permissions

Users need 'photo', 'producer', or 'super' admin level to access the Photos tab:

```sql
-- Add photo permission to a user
INSERT INTO event_admins (event_id, person_id, admin_level)
VALUES ('event-uuid', 'person-uuid', 'photo');
```

## How It Works

### Upload Flow

1. **User Selection**
   - Admin navigates to Photos tab in AdminPanel
   - Selects an artwork from dropdown
   - LazyAdminUpload component loads

2. **Permission Check**
   - Component verifies user has photo/producer/super permissions
   - Uses `checkEventAdminPermission` from adminHelpers

3. **Image Processing**
   - User selects image file
   - Client-side resize to max 2048x2048
   - JPEG compression at 90% quality
   - Shows preview to user

4. **Upload Process**
   - Sends to Cloudflare Worker with auth token
   - Worker validates Supabase JWT
   - Worker uploads to Cloudflare Images
   - Returns image ID and variant URLs

5. **Database Storage**
   - Saves to art_media table
   - Stores original, compressed, and thumbnail URLs
   - Links to artwork via art_id

### Image Variants

Cloudflare automatically generates these variants:
- `public` - Full resolution for display
- `thumbnail` - Small preview image
- Custom variants can be configured in Cloudflare dashboard

### Security

- **Authentication**: Requires valid Supabase JWT token
- **Authorization**: Only photo/producer/super admins can upload
- **CORS**: Worker handles proper CORS headers
- **API Keys**: Never exposed to frontend, stored in Worker

## Usage

### For Admins

1. Navigate to event admin panel
2. Click on "Photos" tab (only visible with proper permissions)
3. Select artwork from dropdown
4. Click to select image or drag & drop
5. Wait for upload to complete
6. Image is now attached to artwork

### For Developers

```javascript
// The component handles everything automatically
<LazyAdminUpload
  isAdmin={true}
  eventId={eventId}
  artworkId={artworkId}
  user={user}
  onUploadComplete={(result) => {
    console.log('Image uploaded:', result);
  }}
/>
```

## Troubleshooting

### CORS Errors
- Ensure Worker URL is correct in environment variables
- Check allowed origins in wrangler.toml
- Verify Worker is deployed and running

### Authentication Errors
- Ensure user is logged in
- Check Supabase session is valid
- Verify user has photo permissions

### Upload Failures
- Check file size (Cloudflare has limits)
- Ensure image format is supported (JPEG, PNG, GIF, WebP)
- Verify Cloudflare API token has correct permissions

## Future Enhancements

1. **Bulk Upload**: Allow multiple images at once
2. **Drag & Drop**: Add drag-drop zone for easier uploads
3. **Image Management**: Add ability to reorder, delete, set primary
4. **Automatic Watermarking**: Add Art Battle watermark via Worker
5. **Mobile Optimization**: Better mobile upload experience

## API Reference

### Cloudflare Worker Endpoint

```
POST https://your-worker.workers.dev
Headers:
  Authorization: Bearer <supabase-jwt>
  X-Event-ID: <event-uuid>
  X-Art-ID: <artwork-uuid>
Body:
  FormData with 'file' field

Response:
{
  "success": true,
  "id": "cloudflare-image-id",
  "filename": "original-filename.jpg",
  "variants": [
    "https://imagedelivery.net/.../public",
    "https://imagedelivery.net/.../thumbnail"
  ],
  "metadata": {
    "eventId": "...",
    "artId": "..."
  }
}
```

### Database Schema

```sql
art_media
├── id (UUID, primary key)
├── art_id (UUID, foreign key to art)
├── media_type (TEXT: 'image' or 'video')
├── media_files (JSONB)
│   ├── original_url
│   ├── compressed_url
│   ├── thumbnail_url
│   └── cloudflare_id
├── display_order (INT)
├── is_primary (BOOLEAN)
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
├── created_by (UUID)
└── metadata (JSONB)
```