# Art Battle Promo Materials - Implementation Summary

**Date:** September 11, 2025  
**Project:** Art Battle Promotional Materials Generator SPA  
**Location:** `/root/vote_app/vote26/art-battle-promo-materials/`  
**Live URL:** https://artb.art/promo/e/{eventId}

## Overview

Successfully implemented a React Vite SPA that allows artists to browse and download ready-made promotional materials (PNG/WebM video) for Art Battle events. The system supports both event-wide and per-artist promotional materials using client-side HTML/CSS composition and export.

## Data Sources and Mappings

### Primary Data Source: Unified Sample Works
- **Function:** `get_unified_sample_works(profile_id)` 
- **Priority Mapping:** 
  1. `image_url` (primary)
  2. `compressed_url` (fallback)
  3. `original_url` (final fallback)
- **Domains:** Includes Cloudflare imagedelivery.net and artbattle.com URLs
- **CORS Handling:** Intelligent domain detection for cross-origin image access

### Edge Function: `/supabase/functions/promo-materials-data/index.ts`
**Endpoints:**
- `GET /` - List all enabled events
- `GET /{eventId}` - Get specific event with artists and sample works
- `GET /templates` - Get published promotional templates

**Data Flow:**
```
Events Table → Cities Table (JOIN)
↓
Event Artists → Artist Profiles (JOIN)
↓
get_unified_sample_works(artist_id) → Image URLs
```

**Artist Data Transformation:**
```typescript
{
  id: artist_profiles.id,
  display_name: artist_profiles.name,
  email: artist_profiles.email,
  city: artist_profiles.city_text,
  instagram: artist_profiles.instagram,
  website: artist_profiles.website,
  bio: artist_profiles.abhq_bio,
  sample_asset_url: primarySampleWork?.image_url || compressed_url || original_url,
  event_status: event_artists.status
}
```

### Template System Database Schema
**Tables:**
- `tmpl_templates` - Template definitions with JSON specs
- `tmpl_assets` - Associated template assets
- `tmpl_outputs` - Generated output tracking

## HTML/CSS to Image/Video Techniques

### 1. Template Specification Format
Templates use JSON specification with layered composition:

```javascript
{
  "name": "Template Name",
  "variants": [
    {
      "id": "instagram-story",
      "w": 1080,
      "h": 1920,
      "pixelRatio": 2
    }
  ],
  "layers": {
    "underlay": {
      "fit": "cover"  // Background image sizing
    },
    "textHtml": "<div class='title'>{event.title}</div>"
  },
  "css": ".title { color: white; font-size: 48px; }",
  "assets": {
    "fonts": [
      {
        "family": "CustomFont",
        "src": "url(...)",
        "weight": "bold"
      }
    ]
  }
}
```

### 2. Dynamic Data Substitution
**Event Placeholders:**
- `{event.title}` / `{event\.title}`
- `{event.city}` / `{event\.city}`
- `{event.venue}` / `{event\.venue}`
- `{event.date}` / `{event\.date}` (formatted)

**Artist Placeholders:**
- `{artist.display_name}` / `{artist\.display_name}`
- `{artist.sample_asset_url}` / `{artist\.sample_asset_url}`

### 3. CSS Scoping System
**Problem Solved:** CSS isolation between multiple templates
**Solution:** Dynamic CSS scoping with unique container IDs

```javascript
// Generate unique render ID
const renderId = `render-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Scope CSS selectors to container
scopedCSS = scopedCSS.replace(/(^|[,}]\s*)(\.[\w-]+)/g, `$1#${renderId} $2`);
```

**Critical Fix:** Precise regex prevents corruption of decimal numbers like `0.8`

### 4. PNG Export Technique
**Library:** `html-to-image` (toPng)
**Key Challenge:** CSS `!important` positioning conflicts
**Solution:** Temporary CSS override during capture

```javascript
// Disable existing CSS positioning
if (container._styleElement) {
  container._styleElement.disabled = true;
}

// Apply capture-friendly positioning
container.style.cssText = `
  position: absolute !important;
  top: 0px !important;
  left: 0px !important;
  width: ${variantSpec.w}px !important;
  height: ${variantSpec.h}px !important;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%) !important;
  overflow: hidden !important;
  font-family: system-ui, -apple-system, sans-serif !important;
  z-index: 9999 !important;
`;

// Force reflow before capture
container.offsetHeight;

// Capture with html-to-image
const dataUrl = await toPng(container, {
  width: variantSpec.w,
  height: variantSpec.h,
  pixelRatio: variantSpec.pixelRatio || 2,
  backgroundColor: '#1a1a1a',
  quality: 0.9
});
```

### 5. WebM Video Export Technique
**Innovation:** Client-side animated video generation using Canvas + MediaRecorder
**No Server Required:** 100% browser-based video encoding

#### Step 1: Separate Layer Capture
```javascript
// Capture text-only layer with transparent background
const textOnlyContainer = document.createElement('div');
// ... setup with transparent background ...

// Hide background elements
scopedCSS = `
  #${tempId} .underlay {
    display: none !important;
  }
  ${scopedCSS}
`;

// Capture text layer
const textDataUrl = await toPng(textOnlyContainer, {
  backgroundColor: 'transparent'
});
```

#### Step 2: Canvas Animation Loop
```javascript
// Create canvas for video recording
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const stream = canvas.captureStream(30); // 30 FPS

// MediaRecorder setup
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9'
});

// Animation parameters
const duration = 3000; // 3 seconds
const totalFrames = (duration / 1000) * 30;
let rotation = 0;

const animate = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw rotating background
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotation);
  
  if (backgroundImage) {
    // Scale image to fill with rotation buffer
    const scale = Math.max(
      (canvas.width * 1.5) / backgroundImage.width,
      (canvas.height * 1.5) / backgroundImage.height
    );
    ctx.drawImage(backgroundImage, -scaledWidth/2, -scaledHeight/2);
  } else {
    // Rotating gradient fallback
    const gradient = ctx.createLinearGradient(...);
    ctx.fillStyle = gradient;
    ctx.fillRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
  }
  
  ctx.restore();
  
  // Draw static text layer on top
  if (textCanvas) {
    ctx.drawImage(textCanvas, 0, 0);
  }
  
  // Update rotation (one full rotation over duration)
  rotation += (2 * Math.PI) / totalFrames;
  
  if (frame < totalFrames) {
    requestAnimationFrame(animate);
  } else {
    mediaRecorder.stop(); // Triggers download
  }
};
```

#### Step 3: Video Download
```javascript
mediaRecorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${templateName}_${variant}_${artistName}.webm`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};
```

## CORS Image Handling

### Domain Detection Strategy
```javascript
const corsCompatible = [
  'imagedelivery.net',
  'artbattle.com'
].some(domain => imageHost.includes(domain));

if (corsCompatible) {
  // Use direct URL with light overlay
  background = `linear-gradient(rgba(220, 38, 127, 0.3), rgba(255, 107, 157, 0.3)), url(${imageUrl})`;
} else {
  // Use heavier overlay for potential CORS issues
  background = `linear-gradient(rgba(220, 38, 127, 0.6), rgba(255, 107, 157, 0.6)), url(${imageUrl})`;
}
```

### Canvas CORS Conversion (for problematic domains)
```javascript
const imageToDataUrl = async (url) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  
  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};
```

## Key Technical Achievements

1. **Zero Server-Side Processing:** All image/video generation happens in browser
2. **Real Artist Images:** Successfully integrated unified sample works with CORS handling
3. **Animated Video Export:** True WebM video with rotating backgrounds and static text overlays
4. **CSS Scoping Solution:** Prevented decimal number corruption in dynamic CSS
5. **Template System:** JSON-based template specification with dynamic data substitution
6. **Anonymous Access:** EID-based routing without authentication requirements

## File Structure

```
/src/
├── lib/
│   └── templateRenderer.js (Core rendering and export engine)
├── components/
│   ├── ArtistGallery.jsx (Gallery with live previews)
│   └── TemplatePreview.jsx (Inline template rendering)
└── App.jsx (Router and main application)

/supabase/
├── functions/promo-materials-data/ (Custom edge function)
└── migrations/20250910190000_add_template_system.sql
```

## Performance Optimizations

- **Live Previews:** Real-time template rendering in gallery cards
- **Intelligent Caching:** Browser-based image and font caching
- **Efficient Scoping:** Minimal CSS processing overhead
- **Parallel Processing:** Concurrent image loading and template preparation

## Production Deployment

- **CDN:** DigitalOcean Spaces with cache-busting
- **Anonymous Access:** https://artb.art/promo/e/{eventId}
- **Build Process:** Vite production build with asset optimization
- **CORS Headers:** Proper cross-origin configuration in edge function

This implementation demonstrates advanced client-side rendering techniques, combining HTML/CSS composition with modern Canvas and MediaRecorder APIs to create a powerful promotional materials generator without server-side processing requirements.