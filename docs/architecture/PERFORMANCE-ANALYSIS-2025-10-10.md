# Sponsorship SPA Performance Analysis
**Date:** 2025-10-10
**URL:** https://artb.art/sponsor/djle8e12
**Status:** ✅ Functional, ⚠️ Optimization Opportunities

---

## Executive Summary

The Art Battle sponsorship single-page application is **functional and loads quickly** (HTML in ~109ms), but has significant opportunities for optimization. The main concerns are:

1. **Large CSS bundle** (689KB / 81KB gzipped) - Radix UI themes bringing in unused styles
2. **Large JS bundle** (460KB / 136KB gzipped) - React + Radix UI + Supabase
3. **No code splitting** - Everything loads upfront
4. **No image optimization** - Large hero/background images not optimized for web
5. **No caching strategy** - No service worker or aggressive cache headers

**Current Performance:**
- Time to First Byte: **109ms** ✅ Excellent
- HTML Size: **626 bytes** ✅ Excellent
- CSS Bundle: **689.7KB** (81KB gzipped) ⚠️ Large
- JS Bundle: **459.9KB** (136KB gzipped) ⚠️ Large
- **Total Initial Load**: ~217KB gzipped

---

## Detailed Metrics

### Current Bundle Sizes

| Asset | Uncompressed | Gzipped | Status |
|-------|-------------|---------|--------|
| `index.html` | 0.60 KB | 0.35 KB | ✅ Optimal |
| `index-Bz5HPDxq.css` | 689.70 KB | 80.98 KB | ⚠️ Large |
| `index-CGsBkcnI.js` | 459.91 KB | 135.86 KB | ⚠️ Large |
| **Total** | **1,150 KB** | **217 KB** | ⚠️ Above recommended |

**Industry Benchmarks:**
- **Good**: < 150KB gzipped total
- **Acceptable**: 150-300KB gzipped
- **Poor**: > 300KB gzipped

**Current Status**: At 217KB gzipped, we're in the "acceptable" range but should aim for "good" (<150KB).

### Network Performance

```
Time to First Byte (TTFB): 0.109s  ✅ Excellent (<200ms)
Total HTML Load Time: 0.109s       ✅ Excellent
Download Speed: 5,741 bytes/sec    ⚠️ Test network dependent
```

### Component Analysis

**Page Components Loaded:**
1. `App.jsx` - Main orchestrator
2. `HeroSection.jsx` - Hero with video placeholder
3. `LocalRelevanceSection.jsx` - Event details + photo grid
4. `SelfSelectionCTA.jsx` - Tier selection buttons
5. `PackageGrid.jsx` - Package cards (lazy loaded after selection)
6. `AddonsModal.jsx` - Add-ons selection (lazy loaded)
7. `MultiEventOffer.jsx` - Multi-event upsell (lazy loaded)
8. `SponsorshipCustomization.jsx` - Post-payment customization

**Dependencies:**
- React 18.3.1 (~130KB contribution)
- Radix UI Themes 3.1.6 (~400KB CSS, ~150KB JS)
- Radix UI Icons (~50KB)
- Supabase JS 2.47.10 (~180KB)

---

## Optimization Opportunities

### 🔴 High Priority (Significant Impact)

#### 1. **Code Splitting & Lazy Loading**
**Current:** All components load immediately, even if user never proceeds past landing page.

**Impact:** Could reduce initial JS by ~60% (275KB → 110KB)

**Solution:**
```javascript
// Lazy load flow components
const PackageGrid = lazy(() => import('./components/PackageGrid'));
const AddonsModal = lazy(() => import('./components/AddonsModal'));
const MultiEventOffer = lazy(() => import('./components/MultiEventOffer'));
const SponsorshipCustomization = lazy(() => import('./components/SponsorshipCustomization'));
```

**Estimated Savings:** ~165KB initial JS (60KB gzipped)

---

#### 2. **Radix UI Theme Optimization**
**Current:** Full Radix UI Themes package imported, includes all components and variants.

**Impact:** CSS bundle is 689KB (81KB gzipped) - majority is Radix UI

**Solution A - Tree-shake unused components:**
```javascript
// Instead of importing full theme
import { Theme } from '@radix-ui/themes';

// Import only what's needed
import { Button, Card, Flex, Box, Text, Heading } from '@radix-ui/themes';
```

**Solution B - Switch to Radix Primitives + custom CSS:**
- Replace `@radix-ui/themes` with `@radix-ui/primitives`
- Write minimal custom CSS for the specific components used
- **Potential savings:** 500KB CSS (60KB gzipped)

**Solution C - Use PurgeCSS:**
```javascript
// vite.config.js
import { PurgeCSS } from 'purgecss';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'purgecss',
      apply: 'build',
      async closeBundle() {
        const purgeCSSResults = await new PurgeCSS().purge({
          content: ['./dist/**/*.html', './dist/**/*.js'],
          css: ['./dist/assets/*.css']
        });
        // Write purged CSS back
      }
    }
  ]
})
```

**Estimated Savings:** 400-500KB CSS (40-60KB gzipped)

---

#### 3. **Image Optimization**
**Current:** Hero images and section backgrounds loaded as full-size URLs from picsum.photos and CloudFlare Images

**Issues:**
- No responsive image sources (`srcset`)
- No modern format support (WebP/AVIF)
- No lazy loading for below-fold images
- No blur-up placeholders

**Solution:**
```javascript
// HeroSection.jsx - Add responsive images
<Box style={{
  backgroundImage: `url(${heroBg})`,
  backgroundSize: 'cover',
  // Add low-quality placeholder
  backgroundImage: `
    url(${heroBg}?w=20&blur=10),
    url(${heroBg}?w=1920&format=webp)
  `
}}>
```

**CloudFlare Images already supports:**
- `?w=800` - resize to 800px width
- `?format=webp` - serve as WebP
- `?quality=80` - adjust quality

**Implement:**
1. Use CloudFlare Image Variants for responsive sizes
2. Add `loading="lazy"` to all images below fold
3. Use blur-up placeholder technique
4. Implement `<picture>` with `srcset` for responsive images

**Estimated Savings:** 500KB-2MB per page load (depending on images)

---

### 🟡 Medium Priority (Moderate Impact)

#### 4. **Supabase Client Tree-Shaking**
**Current:** Full Supabase JS client imported (~180KB)

**Reality Check:** Only using:
- Edge function calls (`supabase.functions.invoke()`)
- RPC calls (`supabase.rpc()`)

**Solution:**
Consider using `fetch()` directly for edge function calls instead of full Supabase client:

```javascript
// api.js - Replace Supabase client with direct fetch
export async function getSponsorshipInvite(hash) {
  const response = await fetch('https://db.artb.art/functions/v1/sponsorship-invite-details', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash })
  });
  return response.json();
}
```

**Estimated Savings:** ~180KB JS (50KB gzipped)

---

#### 5. **Bundle Compression at CDN Level**
**Current:** Files served with `?v=1760107179` cache busting, but no Brotli compression

**Check if DO Spaces supports Brotli:**
```bash
curl -H "Accept-Encoding: br" -I https://artb.art/sponsor/assets/index-CGsBkcnI.js
```

**Solution:**
1. Enable Brotli compression on DigitalOcean Spaces/CDN
2. Pre-compress assets during build:
   ```bash
   npm install --save-dev vite-plugin-compression
   ```
   ```javascript
   // vite.config.js
   import compression from 'vite-plugin-compression';

   plugins: [
     react(),
     compression({ algorithm: 'brotliCompress' })
   ]
   ```

**Estimated Savings:** Additional 15-20% reduction over gzip (135KB → 110KB JS)

---

#### 6. **Implement Route-Based Code Splitting**
**Current:** Single bundle serves both invite flow AND customization flow

**Issue:** Customization flow (`/sponsor/customize/{hash}`) loads all invite flow code

**Solution:**
```javascript
// App.jsx
const InviteFlow = lazy(() => import('./flows/InviteFlow'));
const CustomizationFlow = lazy(() => import('./flows/CustomizationFlow'));

function App() {
  if (pageType === 'customize') {
    return <Suspense fallback={<LoadingSpinner />}>
      <CustomizationFlow fulfillmentHash={hash} />
    </Suspense>
  }

  return <Suspense fallback={<LoadingSpinner />}>
    <InviteFlow hash={hash} />
  </Suspense>
}
```

**Estimated Savings:** ~100KB per route (30KB gzipped)

---

### 🟢 Low Priority (Minor Impact / Nice-to-Have)

#### 7. **Prefetch Critical Resources**
Add resource hints to `index.html`:

```html
<head>
  <!-- Preconnect to API -->
  <link rel="preconnect" href="https://db.artb.art" />
  <link rel="dns-prefetch" href="https://db.artb.art" />

  <!-- Preload critical CSS/JS -->
  <link rel="preload" href="/sponsor/assets/index-Bz5HPDxq.css" as="style" />
  <link rel="preload" href="/sponsor/assets/index-CGsBkcnI.js" as="script" />

  <!-- Prefetch likely navigation targets -->
  <link rel="prefetch" href="/sponsor/assets/PackageGrid-chunk.js" />
</head>
```

**Estimated Improvement:** 50-100ms faster resource discovery

---

#### 8. **Add Service Worker for Offline Support**
Implement a service worker to cache static assets:

```javascript
// sw.js
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('sponsor-v1').then((cache) => {
      return cache.addAll([
        '/sponsor/',
        '/sponsor/assets/index.css',
        '/sponsor/assets/index.js',
        'https://artb.tor1.cdn.digitaloceanspaces.com/images/ABWoTCirc1.png'
      ]);
    })
  );
});
```

**Benefit:** Instant repeat visits, offline support

---

#### 9. **Reduce React Bundle Size**
Consider Preact as drop-in replacement:

```bash
npm install --save-dev @preact/preset-vite
```

```javascript
// vite.config.js
import preact from '@preact/preset-vite';

plugins: [preact()]
```

**Estimated Savings:** ~40KB JS (12KB gzipped)

---

#### 10. **Optimize Font Loading**
**Current:** Using system fonts (no custom fonts) ✅ Already optimal

If custom fonts are added:
- Use `font-display: swap`
- Preload critical font files
- Subset fonts to required characters

---

## Performance Budget Recommendation

**Target Bundle Sizes:**

| Asset | Current | Target | Strategy |
|-------|---------|--------|----------|
| HTML | 0.35 KB gzipped | 0.35 KB | ✅ Optimal |
| CSS | 81 KB gzipped | **40 KB** | PurgeCSS + tree-shake Radix |
| JS (initial) | 136 KB gzipped | **60 KB** | Code splitting + remove Supabase client |
| JS (lazy chunks) | 0 KB | 50 KB | Split PackageGrid, Addons, Multi-event |
| Images (critical) | Variable | 200 KB | WebP, responsive, lazy load |
| **Total Initial** | **217 KB** | **100 KB** | 54% reduction |

---

## Implementation Priority Matrix

```
High Impact, Easy to Implement:
├─ 1. Code Splitting (lazy components)        [Impact: ●●●●● | Effort: ●●○○○]
├─ 3. Image Lazy Loading                      [Impact: ●●●●○ | Effort: ●○○○○]
└─ 5. Enable Brotli Compression               [Impact: ●●●○○ | Effort: ●○○○○]

High Impact, Moderate Effort:
├─ 2. Radix UI Optimization (PurgeCSS)        [Impact: ●●●●● | Effort: ●●●○○]
├─ 4. Replace Supabase with fetch()           [Impact: ●●●○○ | Effort: ●●●○○]
└─ 6. Route-Based Code Splitting              [Impact: ●●●○○ | Effort: ●●●●○]

Nice to Have:
├─ 7. Resource Hints (preconnect/prefetch)    [Impact: ●●○○○ | Effort: ●○○○○]
├─ 8. Service Worker                          [Impact: ●●○○○ | Effort: ●●●●○]
├─ 9. Switch to Preact                        [Impact: ●●○○○ | Effort: ●●●○○]
└─ 10. Font Optimization                      [Impact: ●○○○○ | Effort: ●○○○○]
```

---

## Quick Wins (Implement First)

### Week 1: Low-Hanging Fruit (~4 hours)
1. ✅ Add lazy loading to components (1 hour)
2. ✅ Enable Brotli compression at CDN (30 min)
3. ✅ Add resource hints to HTML (15 min)
4. ✅ Implement image lazy loading (1 hour)
5. ✅ Add CloudFlare image optimization params (30 min)

**Expected Result:** 217KB → 150KB initial load (31% reduction)

### Week 2: Major Optimization (~8 hours)
1. ✅ Implement PurgeCSS for Radix UI (3 hours)
2. ✅ Replace Supabase client with fetch (2 hours)
3. ✅ Route-based code splitting (3 hours)

**Expected Result:** 150KB → 100KB initial load (54% total reduction)

### Week 3: Polish (~4 hours)
1. ✅ Service worker for offline support (2 hours)
2. ✅ Preact evaluation (1 hour)
3. ✅ Performance monitoring setup (1 hour)

---

## Testing & Monitoring

### Tools to Use
1. **Lighthouse** - Chrome DevTools (Performance, Best Practices)
2. **WebPageTest** - Real-world performance testing
3. **Bundle Analyzer** - Track bundle size over time
4. **Sentry/LogRocket** - Real user monitoring

### Key Metrics to Track
- **LCP (Largest Contentful Paint)**: Target < 2.5s
- **FID (First Input Delay)**: Target < 100ms
- **CLS (Cumulative Layout Shift)**: Target < 0.1
- **Time to Interactive**: Target < 3.5s
- **Bundle Size**: Target < 150KB gzipped

---

## Conclusion

The sponsorship SPA is **functional and has good server response times** (109ms TTFB), but the **bundle sizes are significantly larger than optimal**.

**Immediate Action Items:**
1. Implement component lazy loading
2. Optimize Radix UI CSS bundle with PurgeCSS
3. Replace Supabase client with direct fetch calls
4. Enable Brotli compression at CDN level

**Expected Outcome:**
- Initial load reduction from 217KB → 100KB gzipped (54% reduction)
- Faster Time to Interactive
- Better mobile performance
- Improved Core Web Vitals scores

**Estimated Total Implementation Time:** 16 hours across 3 weeks

---

## Appendix: Build Configuration

### Current `vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/sponsor/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined, // ⚠️ No code splitting
      }
    }
  }
})
```

### Recommended `vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    visualizer({ open: false, filename: 'dist/stats.html' })
  ],
  base: '/sponsor/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Disable in production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunking
          'react-vendor': ['react', 'react-dom'],
          'radix-vendor': ['@radix-ui/themes', '@radix-ui/react-icons'],
          // Route chunks
          'invite-flow': [
            './src/components/HeroSection.jsx',
            './src/components/LocalRelevanceSection.jsx',
            './src/components/SelfSelectionCTA.jsx'
          ],
          'selection-flow': [
            './src/components/PackageGrid.jsx',
            './src/components/AddonsModal.jsx',
            './src/components/MultiEventOffer.jsx'
          ],
          'customization-flow': [
            './src/components/SponsorshipCustomization.jsx'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 500 // Warn if chunks exceed 500KB
  }
})
```

---

**Report Generated:** 2025-10-10
**Next Review:** After Week 1 optimizations implemented
