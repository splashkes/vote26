# Sponsorship SPA Optimization Recommendations
**Date:** 2025-10-10
**Status:** ✅ Functional - Optimization Deferred
**Current Performance:** Acceptable but could be improved

---

## Executive Summary

The Art Battle sponsorship SPA is **fully functional and performs adequately** for current usage. The following optimizations are **recommended but not critical** for implementation at a later date when performance becomes a higher priority.

**Current Bundle Sizes:**
- HTML: 0.60 KB (0.35 KB gzipped) ✅ Optimal
- CSS: 689.70 KB (80.98 KB gzipped) ⚠️ Large (Radix UI)
- JS: 459.91 KB (135.86 KB gzipped) ⚠️ Large
- **Total: 217 KB gzipped**

**Target Bundle Sizes:**
- Total: < 150 KB gzipped (current: 217 KB)

---

## Attempted Optimizations (Deferred)

### ❌ Code Splitting with React.lazy()
**Status:** Rolled back due to interaction issues

**What Was Attempted:**
```javascript
// Lazy load components
const PackageGrid = lazy(() => import('./components/PackageGrid'));
const AddonsModal = lazy(() => import('./components/AddonsModal'));
const MultiEventOffer = lazy(() => import('./components/MultiEventOffer'));
const SponsorshipCustomization = lazy(() => import('./components/SponsorshipCustomization'));

// Wrap with Suspense
<Suspense fallback={<Spinner />}>
  <PackageGrid {...props} />
</Suspense>
```

**Results:**
- ✅ Reduced initial JS bundle: 459KB → 404KB (120KB gzipped)
- ✅ Created separate chunks for flow components
- ❌ Caused interaction issues with tier selection buttons
- ❌ First click on "View Premium Packages" not working reliably

**Why It Failed:**
- Potential race condition between lazy loading and state updates
- Button event handlers may have been blocked by async component loading
- Radix UI Button + Card onClick interaction complexity

**Recommendation:**
- Revisit after identifying root cause of button interaction issue
- Consider preloading chunks on page load to avoid lazy load delay
- May need to refactor SelfSelectionCTA component structure

---

## High Priority Optimizations (When Time Permits)

### 1. 🔴 CloudFlare Image Optimization
**Impact:** High (500KB-2MB savings per page load)
**Effort:** Low (2-3 hours)
**Status:** Not Implemented

**Current State:**
- Images use CloudFlare Images CDN
- No format optimization (WebP/AVIF)
- No responsive sizing
- No lazy loading below fold

**Implementation:**

#### A. Add CloudFlare Image URL Parameters
CloudFlare Images supports these transformations via URL params:

```javascript
// HeroSection.jsx
const heroBg = mediaMap.hero_bg_desktop || 'https://picsum.photos/1920/1080?random=1';

// Optimized version:
const getOptimizedImageUrl = (url, options = {}) => {
  if (!url || !url.includes('imagedelivery.net')) return url;

  const { width = 1920, quality = 85, format = 'webp' } = options;

  // CloudFlare Images URL structure:
  // https://imagedelivery.net/{account}/{id}/{variant}
  // Add format and resize via variants or URL params

  return `${url}?w=${width}&q=${quality}&format=${format}`;
};

const heroBgOptimized = getOptimizedImageUrl(heroBg, { width: 1920, quality: 85, format: 'webp' });
```

#### B. Responsive Image Sizes
```javascript
// For hero backgrounds
const heroSizes = {
  mobile: getOptimizedImageUrl(heroBg, { width: 800 }),
  tablet: getOptimizedImageUrl(heroBg, { width: 1200 }),
  desktop: getOptimizedImageUrl(heroBg, { width: 1920 })
};

// Use in CSS with media queries or srcset
<Box style={{
  backgroundImage: `
    image-set(
      url(${heroSizes.mobile}) 1x,
      url(${heroSizes.desktop}) 2x
    )
  `
}} />
```

#### C. Lazy Load Below-Fold Images
```javascript
// LocalRelevanceSection.jsx - Photo grid is below fold
<Box
  loading="lazy"
  style={{
    backgroundImage: `url(${photo.url}?w=400&format=webp)`
  }}
/>
```

#### D. Blur-Up Placeholder Technique
```javascript
const sectionBg = mediaMap.section_bg || 'https://picsum.photos/1920/1080?random=2';
const placeholderBg = `${sectionBg}?w=20&blur=10`;

<Box style={{
  backgroundImage: `
    url(${placeholderBg}),
    url(${sectionBg}?w=1920&format=webp)
  `,
  backgroundSize: 'cover',
  backgroundPosition: 'center'
}} />
```

**Expected Savings:**
- WebP format: 30-50% smaller than JPEG
- Responsive sizing: Load only needed resolution
- Lazy loading: Defer 4 event photos (400KB+)
- **Total: 500KB-2MB per page load**

---

### 2. 🟡 Optimize Radix UI CSS Bundle
**Impact:** High (40-60KB gzipped savings)
**Effort:** Medium (4-6 hours)
**Status:** Not Implemented

**Current State:**
- Full Radix UI Themes CSS: 689.70 KB (80.98 KB gzipped)
- Includes all components and variants (only using ~20%)

**Option A: PurgeCSS (Recommended)**

Install and configure:
```bash
npm install --save-dev @fullhuman/postcss-purgecss
```

```javascript
// vite.config.js
import purgecss from '@fullhuman/postcss-purgecss';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        purgecss({
          content: ['./src/**/*.{js,jsx,ts,tsx}', './index.html'],
          safelist: [
            /^rt-/,  // Radix UI theme classes
            /^radix-/
          ]
        })
      ]
    }
  }
});
```

**Expected Savings:** 400-500KB uncompressed (40-60KB gzipped)

**Option B: Switch to Radix Primitives**

Replace `@radix-ui/themes` with `@radix-ui/primitives` + custom CSS:
- More work but smaller bundle
- Only import primitives you use
- Write minimal custom styles

**Expected Savings:** 500-600KB uncompressed (60-70KB gzipped)

---

### 3. 🟡 Replace Supabase Client with Direct Fetch
**Impact:** Medium (50KB gzipped savings)
**Effort:** Low (2-3 hours)
**Status:** Not Implemented

**Current State:**
- Full `@supabase/supabase-js` imported: ~180KB
- Only used for edge function calls (could use fetch)

**Implementation:**

```javascript
// lib/api.js - Current
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSponsorshipInvite(hash) {
  const response = await supabase.functions.invoke('sponsorship-invite-details', {
    body: { hash }
  });
  return response;
}

// lib/api.js - Optimized
const EDGE_FUNCTION_URL = 'https://db.artb.art/functions/v1';

export async function getSponsorshipInvite(hash) {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/sponsorship-invite-details`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}` // If needed
      },
      body: JSON.stringify({ hash })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}
```

**Expected Savings:** ~180KB uncompressed (50KB gzipped)

---

## Medium Priority Optimizations

### 4. 🟢 Add Resource Hints to HTML
**Impact:** Low (50-100ms faster resource discovery)
**Effort:** Very Low (15 minutes)

```html
<!-- dist/index.html -->
<head>
  <!-- DNS prefetch -->
  <link rel="dns-prefetch" href="https://db.artb.art" />
  <link rel="dns-prefetch" href="https://imagedelivery.net" />

  <!-- Preconnect to critical origins -->
  <link rel="preconnect" href="https://db.artb.art" crossorigin />
  <link rel="preconnect" href="https://imagedelivery.net" crossorigin />

  <!-- Preload critical resources -->
  <link rel="preload" href="/sponsor/assets/index-CGsBkcnI.js" as="script" />
  <link rel="preload" href="/sponsor/assets/index-Bz5HPDxq.css" as="style" />
</head>
```

---

### 5. 🟢 Enable Brotli Compression
**Impact:** Low (15-20% better compression than gzip)
**Effort:** Low (1-2 hours)

**Current:** Only gzip compression (135.86 KB for JS)
**Target:** Brotli compression (~110-115 KB for JS)

**Option A: Pre-compress during build**
```bash
npm install --save-dev vite-plugin-compression
```

```javascript
// vite.config.js
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' })
  ]
});
```

**Option B: Enable at DigitalOcean Spaces/CDN level**
- Check if DO Spaces CDN supports Brotli
- Enable in CDN settings if available
- Test with: `curl -H "Accept-Encoding: br" -I https://artb.art/sponsor/assets/index-CGsBkcnI.js`

**Expected Savings:** 20-25KB additional compression

---

### 6. 🟢 Manual Chunk Splitting (Alternative to React.lazy)
**Impact:** Medium (Better caching, parallel loading)
**Effort:** Medium (3-4 hours)

Instead of lazy loading (which caused issues), use manual chunk splitting:

```javascript
// vite.config.js
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom'],
          'radix-vendor': ['@radix-ui/themes', '@radix-ui/react-icons'],
          'supabase-vendor': ['@supabase/supabase-js'],

          // Feature chunks (loaded together, not lazy)
          'landing-page': [
            './src/components/HeroSection.jsx',
            './src/components/LocalRelevanceSection.jsx',
            './src/components/SelfSelectionCTA.jsx'
          ],
          'package-selection': [
            './src/components/PackageGrid.jsx',
            './src/components/AddonsModal.jsx',
            './src/components/MultiEventOffer.jsx'
          ],
          'customization': [
            './src/components/SponsorshipCustomization.jsx'
          ]
        }
      }
    }
  }
});
```

**Benefits:**
- Better browser caching (vendor code rarely changes)
- Parallel chunk loading
- No lazy loading race conditions
- Smaller initial bundle without interaction issues

---

## Low Priority / Nice-to-Have

### 7. Service Worker for Offline Support
**Impact:** Low (Repeat visit performance)
**Effort:** Medium (4 hours)

Cache static assets for offline support and instant repeat visits.

---

### 8. Switch to Preact
**Impact:** Low (12KB gzipped savings)
**Effort:** Medium (2-3 hours + testing)

Replace React with Preact (smaller, compatible alternative):
```bash
npm install --save-dev @preact/preset-vite
```

**Expected Savings:** ~40KB uncompressed (12KB gzipped)

---

## Recommended Implementation Order

**Phase 1: Quick Wins (4-6 hours total)**
1. ✅ CloudFlare image optimization (2-3 hours) - Biggest impact
2. ✅ Replace Supabase with fetch (2 hours) - Clean, simple
3. ✅ Add resource hints (15 min) - Zero risk

**Expected Result:** 217KB → 150KB gzipped (31% reduction)

---

**Phase 2: Deeper Optimization (8-10 hours total)**
4. ✅ Optimize Radix UI with PurgeCSS (4-6 hours) - Requires testing
5. ✅ Enable Brotli compression (1-2 hours) - Infrastructure
6. ✅ Manual chunk splitting (3-4 hours) - Better than lazy loading

**Expected Result:** 150KB → 100KB gzipped (54% total reduction)

---

**Phase 3: Polish (Optional)**
7. ⚪ Service worker (4 hours)
8. ⚪ Switch to Preact (3 hours)

---

## Performance Monitoring

**Tools to Use:**
- **Lighthouse** - Chrome DevTools audit
- **WebPageTest** - Real-world performance testing
- **Bundle Analyzer** - Track bundle size over time

**Key Metrics to Track:**
- LCP (Largest Contentful Paint): Target < 2.5s
- FID (First Input Delay): Target < 100ms
- CLS (Cumulative Layout Shift): Target < 0.1
- Total Bundle Size: Target < 150KB gzipped

---

## Notes on Code Splitting Issue

**What Happened:**
- Implemented React.lazy() for PackageGrid, AddonsModal, MultiEventOffer
- Added Suspense boundaries with spinner fallbacks
- First click on "View Premium Packages" button didn't work
- Second click worked fine

**Suspected Causes:**
1. **Race condition** - Lazy loading triggered before state update completed
2. **Event handler timing** - Button onClick + Card onClick conflict
3. **Async tracking call** - `handleTierSelect` was awaiting tracking API call
4. **Suspense boundary** - May have interfered with event propagation

**Attempted Fixes (All Failed):**
- Made handleTierSelect synchronous (fire-and-forget tracking)
- Added webpackPrefetch hint to PackageGrid
- Added explicit Button onClick handlers with stopPropagation

**Root Cause Unknown** - Rolled back to preserve functionality

**Recommendation for Future:**
- Debug in local dev environment with React DevTools
- Add console logging to track event sequence
- Consider manual chunk splitting instead of lazy loading
- Test with different browsers to isolate issue

---

## Current Production State

**URL:** https://artb.art/sponsor/djle8e12
**Bundle Files:**
- CSS: `/sponsor/assets/index-Bz5HPDxq.css?v=1760109037`
- JS: `/sponsor/assets/index-CGsBkcnI.js?v=1760109037`

**Status:** ✅ Fully functional, no optimizations applied

**Performance:**
- Time to First Byte: 109ms ✅ Excellent
- Initial Load: 217KB gzipped ⚠️ Acceptable but improvable
- Button interactions: ✅ Working correctly

---

## Conclusion

The sponsorship SPA is **production-ready and functional** as-is. Optimizations are **recommended but not urgent**. Implement when:

1. Performance becomes a user complaint
2. Mobile users report slow loading
3. Bundle size grows beyond 250KB gzipped
4. Development resources are available for testing

**Priority Order:**
1. CloudFlare image optimization (biggest impact, lowest risk)
2. Replace Supabase client with fetch (clean, simple)
3. Add resource hints (zero risk, quick win)
4. Everything else when time permits

---

**Document Created:** 2025-10-10
**Next Review:** When performance monitoring indicates need for optimization
**Related Files:**
- `/root/vote_app/vote26/PERFORMANCE-ANALYSIS-2025-10-10.md` - Detailed analysis
- `/root/vote_app/vote26/art-battle-sponsorship/src/App.jsx` - Main app component
- `/root/vote_app/vote26/art-battle-sponsorship/vite.config.js` - Build configuration
