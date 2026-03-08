# Art Battle Sponsorship Platform - Designer Asset Specifications

**Project:** Art Battle Sponsorship SPA (B2B)
**Platform:** Web (Responsive)
**Date:** October 10, 2025
**Version:** 1.0

---

## Table of Contents
1. [Overview](#overview)
2. [Hero Section Assets](#hero-section-assets)
3. [Sponsor Logo Banner](#sponsor-logo-banner)
4. [Local Relevance Section](#local-relevance-section)
5. [Video Assets](#video-assets)
6. [Background Images](#background-images)
7. [Technical Specifications](#technical-specifications)
8. [Delivery Format](#delivery-format)

---

## Overview

This document specifies all image and media assets needed for the Art Battle Sponsorship platform. The platform is designed to convert B2B prospects into event sponsors through a personalized, high-conversion experience.

**Target Audience:** Business owners, marketing directors, brand managers
**Device Support:** Desktop, tablet, mobile (responsive)
**CDN:** DigitalOcean Spaces (https://artb.tor1.cdn.digitaloceanspaces.com/)

---

## 1. Hero Section Assets

### 1.1 Hero Background Image
**Purpose:** Main background for hero section (top of page)
**Current Status:** Using placeholder (https://picsum.photos/1920/1080)
**Location in code:** `HeroSection.jsx` line 55

**Specifications:**
- **Dimensions:** 1920px × 1080px (minimum)
- **Format:** WebP (primary), JPG (fallback)
- **File Size:** <300KB optimized
- **Color Space:** sRGB
- **Content:**
  - High-energy Art Battle event scene
  - Packed venue with audience engaged
  - Artists painting live on stage
  - Colorful, vibrant, energetic atmosphere
  - Should show sponsor branding opportunities (banners, logos visible)
  - Professional photography quality
- **Composition:**
  - Safe area in center for overlaid text (avoid busy areas in center)
  - Slightly darker overall (will be dimmed further to 40% brightness)
  - Wide angle showing full venue/crowd
- **Mood:** Exciting, professional, culturally relevant, high-value
- **DO NOT include:** Specific sponsor logos that aren't real (unless generic/placeholder style)

**File naming:**
```
sponsorship-hero-bg-primary.webp
sponsorship-hero-bg-primary.jpg
```

**Alternative versions needed:**
- **Mobile optimized:** 1200px × 900px (portrait-friendly crop)
  - `sponsorship-hero-bg-mobile.webp`
  - `sponsorship-hero-bg-mobile.jpg`

---

### 1.2 Video Poster Image
**Purpose:** Placeholder thumbnail before video loads
**Current Status:** Using placeholder (https://placehold.co/800x450)
**Location in code:** `HeroSection.jsx` line 147

**Specifications:**
- **Dimensions:** 1600px × 900px (16:9 aspect ratio)
- **Format:** WebP (primary), JPG (fallback)
- **File Size:** <200KB
- **Content:**
  - Freeze frame from Art Battle highlight reel
  - Should feature painting action + audience
  - Include subtle play button overlay graphic (optional - can be CSS)
  - Professional color grading
  - Should entice click/engagement
- **Composition:**
  - Centered focal point
  - Clear, sharp, well-lit
  - Representative of video content

**File naming:**
```
sponsorship-video-poster.webp
sponsorship-video-poster.jpg
```

---

## 2. Sponsor Logo Banner

### 2.1 Past Sponsor Logos
**Purpose:** Social proof - show trusted brand partners
**Current Status:** Text placeholders only
**Location in code:** `HeroSection.jsx` lines 6-9, 199-212

**Specifications:**
- **Quantity:** 8-12 real sponsor logos
- **Format:** SVG (preferred) or PNG with transparency
- **Dimensions per logo:** Variable, but max 300px width × 100px height
- **File Size:** <50KB each
- **Background:** Transparent
- **Color:** Full color (will be displayed on light gray background)
- **Content:** Real Art Battle sponsor logos including:
  - Molson Canadian
  - Bacardi
  - Red Bull
  - Bombay Sapphire
  - Corona
  - Grey Goose
  - Jameson
  - Stella Artois
  - **Plus any other real sponsors from past events**

**Requirements:**
- High resolution (vector preferred)
- Proper branding guidelines followed
- Centered/balanced composition
- Professional appearance
- Consistent visual weight across all logos

**File naming:**
```
sponsor-logo-molson-canadian.svg
sponsor-logo-bacardi.svg
sponsor-logo-red-bull.svg
... etc
```

**Note:** If actual sponsor logos are not available for use, create professional placeholder badges with company names in elegant typography.

---

## 3. Local Relevance Section

### 3.1 Background Image (Section)
**Purpose:** Background for local relevance content area
**Current Status:** Using placeholder (https://picsum.photos/1920/1080)
**Location in code:** `LocalRelevanceSection.jsx` line 31

**Specifications:**
- **Dimensions:** 1920px × 1080px (minimum)
- **Format:** WebP (primary), JPG (fallback)
- **File Size:** <300KB
- **Content:**
  - Art Battle event atmosphere
  - Can be darker/moodier than hero
  - Shows venue, crowd, energy
  - Different from hero background (variety)
- **Composition:**
  - Will be heavily darkened (30% brightness)
  - Pattern/texture acceptable
  - Less specific than hero image

**File naming:**
```
sponsorship-section-bg.webp
sponsorship-section-bg.jpg
```

---

### 3.2 Event Photo Grid (4 images)
**Purpose:** Showcase different aspects of Art Battle events
**Current Status:** Using placeholders (https://picsum.photos/400/300)
**Location in code:** `LocalRelevanceSection.jsx` lines 15-20

**Specifications (per image):**
- **Dimensions:** 800px × 600px (4:3 aspect ratio)
- **Format:** WebP (primary), JPG (fallback)
- **File Size:** <150KB each
- **Color Space:** sRGB
- **Quality:** Professional event photography

**Required Images:**

#### Image 1: "Packed Venue"
- Wide shot of full venue
- Audience engaged, watching
- Stage visible with artist
- Crowd density visible
- Energy and attendance clear

#### Image 2: "Live Painting"
- Close-up of artist(s) painting
- Action shot mid-creation
- Paint, canvas, brushes visible
- Dynamic, in-motion feel
- Colorful, vibrant artwork visible

#### Image 3: "Audience Engagement"
- Crowd interacting/reacting
- Voting, cheering, or watching intently
- Multiple people visible
- Genuine emotion/engagement
- Social atmosphere

#### Image 4: "Sponsor Visibility"
- Clear sponsor branding in frame
- Banners, logos, signage visible
- Professional placement examples
- Shows ROI of sponsorship
- High-quality brand integration

**File naming:**
```
event-photo-packed-venue.webp
event-photo-packed-venue.jpg
event-photo-live-painting.webp
event-photo-live-painting.jpg
event-photo-audience-engagement.webp
event-photo-audience-engagement.jpg
event-photo-sponsor-visibility.webp
event-photo-sponsor-visibility.jpg
```

---

## 4. Video Assets

### 4.1 Hero Section Video
**Purpose:** Highlight reel to showcase Art Battle energy
**Current Status:** Not implemented (placeholder only)
**Location in code:** `HeroSection.jsx` lines 145-152

**Specifications:**
- **Duration:** 60-90 seconds
- **Resolution:** 1920×1080 (Full HD minimum)
- **Format:** MP4 (H.264), WebM (VP9)
- **Frame Rate:** 24fps or 30fps
- **Aspect Ratio:** 16:9
- **File Size:** <25MB (optimized for web)
- **Audio:** Optional background music (licensed), OR no audio
- **Delivery:** CloudFlare Stream URL (once upload function is created)

**Content:**
- Fast-paced montage of Art Battle events
- Show multiple cities/venues
- Include:
  - Artists painting (action shots)
  - Finished artwork reveals
  - Crowd reactions/voting
  - Winners being announced
  - Sponsor branding visible (banners, logos)
  - Social media moments
  - Diversity of artists and attendees
- Professional color grading
- Dynamic cuts (3-5 second clips)
- Opening and closing with Art Battle logo

**Mood:** Exciting, professional, aspirational, community-focused

**File naming:**
```
art-battle-highlight-reel-2025.mp4
art-battle-highlight-reel-2025.webm
```

---

## 5. Background Images

### 5.1 General Requirements for All Backgrounds

**Current placeholders:**
- Hero section: Line 55 `HeroSection.jsx`
- Local relevance: Line 31 `LocalRelevanceSection.jsx`

**Shared Specifications:**
- High resolution (1920×1080 minimum, 2560×1440 preferred)
- Professional photography or high-quality composite
- Consistent color palette (vibrant but not oversaturated)
- Art Battle branding visible where appropriate
- Optimized file sizes (<300KB)
- Multiple format support (WebP + JPG fallback)

**Color Palette Guidance:**
- Primary: Purples, blues, vibrant accent colors
- Energy: Warm accent lights (yellows, oranges in moderation)
- Professional: Not overly saturated, suitable for B2B
- Consistency: Should work together as a cohesive visual system

---

## 6. Technical Specifications

### 6.1 File Formats

| Asset Type | Primary Format | Fallback | Notes |
|------------|----------------|----------|-------|
| Photos | WebP | JPG | Modern browsers support WebP |
| Logos | SVG | PNG | Vector preferred for scaling |
| Video | MP4 (H.264) | WebM (VP9) | CloudFlare Stream compatible |
| Icons | SVG | N/A | Radix UI provides most icons |

### 6.2 Optimization Requirements

**Images:**
- WebP compression: 80-85% quality
- JPG compression: 85-90% quality
- Progressive encoding (JPG)
- Stripped metadata
- Color profile: sRGB embedded

**Video:**
- H.264 codec with AAC audio (if audio used)
- Bitrate: 2-4 Mbps (1080p)
- Keyframe every 2 seconds
- Optimized for streaming (fast start)

### 6.3 Responsive Considerations

All images should work at:
- **Desktop:** 1920×1080 and above
- **Tablet:** 1024×768 to 1366×1024
- **Mobile:** 375×667 to 428×926

**Mobile-specific crops:**
- Hero background: Portrait-friendly crop (1200×900)
- Event photos: May be displayed 2-up on mobile (maintain 4:3 ratio)

### 6.4 Accessibility

- **Alt text will be provided in code** (not in images)
- Ensure sufficient contrast when text overlays are applied
- Avoid relying solely on color to convey information
- Images should support dark theme interface

---

## 7. Delivery Format

### 7.1 File Structure

Please deliver all assets in the following structure:

```
art-battle-sponsorship-assets/
├── hero/
│   ├── desktop/
│   │   ├── sponsorship-hero-bg-primary.webp
│   │   └── sponsorship-hero-bg-primary.jpg
│   └── mobile/
│       ├── sponsorship-hero-bg-mobile.webp
│       └── sponsorship-hero-bg-mobile.jpg
├── video/
│   ├── sponsorship-video-poster.webp
│   ├── sponsorship-video-poster.jpg
│   ├── art-battle-highlight-reel-2025.mp4
│   └── art-battle-highlight-reel-2025.webm
├── sponsors/
│   ├── sponsor-logo-molson-canadian.svg
│   ├── sponsor-logo-bacardi.svg
│   ├── sponsor-logo-red-bull.svg
│   ├── sponsor-logo-bombay-sapphire.svg
│   ├── sponsor-logo-corona.svg
│   ├── sponsor-logo-grey-goose.svg
│   ├── sponsor-logo-jameson.svg
│   └── sponsor-logo-stella-artois.svg
├── backgrounds/
│   ├── sponsorship-section-bg.webp
│   └── sponsorship-section-bg.jpg
└── event-photos/
    ├── event-photo-packed-venue.webp
    ├── event-photo-packed-venue.jpg
    ├── event-photo-live-painting.webp
    ├── event-photo-live-painting.jpg
    ├── event-photo-audience-engagement.webp
    ├── event-photo-audience-engagement.jpg
    ├── event-photo-sponsor-visibility.webp
    └── event-photo-sponsor-visibility.jpg
```

### 7.2 Delivery Method

**Preferred:**
- Cloud storage link (Google Drive, Dropbox, WeTransfer)
- Organized in folder structure above
- Include this spec document with checkmarks for completed items

**Alternative:**
- Direct CDN upload (if credentials provided)
- Upload to: `https://artb.tor1.cdn.digitaloceanspaces.com/sponsorship/`

### 7.3 Asset Checklist

- [ ] Hero background image (desktop) - WebP + JPG
- [ ] Hero background image (mobile) - WebP + JPG
- [ ] Video poster image - WebP + JPG
- [ ] Sponsor logos (8-12) - SVG or PNG
- [ ] Section background image - WebP + JPG
- [ ] Event photo: Packed Venue - WebP + JPG
- [ ] Event photo: Live Painting - WebP + JPG
- [ ] Event photo: Audience Engagement - WebP + JPG
- [ ] Event photo: Sponsor Visibility - WebP + JPG
- [ ] Highlight reel video - MP4 + WebM

**Total files:** Approximately 30-35 files

---

## 8. Brand Guidelines

### 8.1 Art Battle Visual Identity

**Logo Usage:**
- Current logo in use: `https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png`
- Circular logo: `https://artb.tor1.cdn.digitaloceanspaces.com/images/ABWoTCirc1.png`

**Color Palette:**
- Primary: Purples and blues (exact hex values TBD - match existing branding)
- Accent: Vibrant colors from artwork
- Background: Dark theme (grays #1a1a1a to #2a2a2a)
- Text: White and light grays for contrast

**Photography Style:**
- Professional but energetic
- Vibrant color, good lighting
- Shows diversity and inclusion
- Captures authentic moments
- High production value

### 8.2 Reference Materials

**For inspiration and style matching:**
- Existing Art Battle website and social media
- Current event photography archives
- Competitor sponsorship platforms (for quality benchmarking)

---

## 9. Priority Order

If assets need to be delivered in phases:

**Phase 1 (Critical - needed immediately):**
1. Hero background image (desktop + mobile)
2. Event photos (all 4)
3. Video poster image

**Phase 2 (High priority):**
4. Sponsor logos
5. Section background image

**Phase 3 (Can be added later):**
6. Highlight reel video

---

## 10. Questions or Clarifications

**Contact:**
- Developer/Project Manager: [Your contact info]
- Creative Director: [Contact info]

**Review Process:**
1. Designer delivers assets per checklist
2. Developer reviews technical specs
3. Stakeholder reviews content/branding
4. Revisions requested if needed (max 2 rounds)
5. Final approval and CDN upload

---

## Appendix A: Current Placeholder References

**Hero Background:**
- Current: `url('https://picsum.photos/1920/1080?random=1')`
- File: `HeroSection.jsx` line 55

**Video Poster:**
- Current: `poster="https://placehold.co/800x450/1a1a1a/white?text=Art+Battle+Highlight+Reel"`
- File: `HeroSection.jsx` line 147

**Section Background:**
- Current: `url('https://picsum.photos/1920/1080?random=2')`
- File: `LocalRelevanceSection.jsx` line 31

**Event Photos (4 images):**
- Current: `https://picsum.photos/400/300?random=10` through `random=13`
- File: `LocalRelevanceSection.jsx` lines 16-19

**Sponsor Logos:**
- Current: Text placeholders only (no images)
- File: `HeroSection.jsx` lines 6-9

---

## Appendix B: Implementation Notes for Developer

Once assets are received:

1. Upload to DigitalOcean Spaces CDN
2. Update image URLs in:
   - `HeroSection.jsx`
   - `LocalRelevanceSection.jsx`
3. Implement responsive image loading (srcset for retina)
4. Add CloudFlare video stream integration
5. Test on multiple devices and browsers
6. Monitor CDN performance and caching

---

**Document Version:** 1.0
**Last Updated:** October 10, 2025
**Status:** Ready for designer review
