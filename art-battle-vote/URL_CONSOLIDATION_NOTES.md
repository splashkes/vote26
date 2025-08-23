# URL Consolidation - App Migration Notes

**Date:** August 23, 2025  
**Migration:** art-battle-broadcast (/v2) → art-battle-vote (main app)

## What Changed

### 1. App Architecture
- **BEFORE:** art-battle-vote (v1) at root, art-battle-broadcast at /v2
- **AFTER:** art-battle-broadcast promoted to main app at root
- **ARCHIVED:** art-battle-vote-v1-archive (restorable if needed)

### 2. URL Structure
- **BEFORE:** 
  - `artb.art/` → v1 voting app (had loading loops)
  - `artb.art/v2/` → broadcast app (more stable)
  - `artb.art/qr/` → QR display app

- **AFTER:**
  - `artb.art/` → promoted broadcast app (now main voting app)
  - `artb.art/qr/` → QR display app (unchanged)
  - `artb.art/upgrade/[code]` → QR validation (now in main app)

### 3. Deployment Changes
- Deploy script now targets `vote26` path (was `vote26-v2`)
- Removed `basename="/v2"` from React Router
- All URLs now work from root instead of /v2 prefix

## Expected Benefits
- **Eliminated URL confusion** between /upgrade and /v2
- **Better stability** using the broadcast version's improved auth handling
- **Simplified architecture** with single main voting interface
- **Preserved rollback option** via archived v1

## Key Improvements in New Main App
- **Reduced session refresh frequency** (AuthContext improvements)
- **Better error handling** with PublicDataManager caching
- **Eliminated excessive auth checks** on visibility/focus events
- **More resilient loading** with proper timeout management

## Rollback Instructions
If issues arise, restore v1 by:
```bash
rm -rf art-battle-vote/
mv art-battle-vote-v1-archive art-battle-vote
cd art-battle-vote && ./deploy.sh
```

## Files Modified
- `art-battle-vote/src/App.jsx` - Removed `/v2` basename
- `art-battle-vote/deploy.sh` - Updated CDN_PATH to `vote26`
- Archive created at `art-battle-vote-v1-archive/`