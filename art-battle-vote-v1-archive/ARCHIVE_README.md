# Art Battle Vote v1 Archive

**Archived on:** August 23, 2025  
**Reason:** Replaced with art-battle-broadcast (v2) due to loading loop issues

## Restoration Instructions

To restore this version as the main voting app:

1. **Remove current art-battle-vote:**
   ```bash
   rm -rf art-battle-vote/
   ```

2. **Restore from archive:**
   ```bash
   mv art-battle-vote-v1-archive art-battle-vote
   ```

3. **Deploy:**
   ```bash
   cd art-battle-vote
   ./deploy.sh
   ```

## What was archived
- Complete v1 voting application
- Original AuthContext with metadata sync logic
- UpgradeHandler for QR code processing
- All original components and utilities
- Deploy script for root URL deployment

## Known Issues (why it was archived)
- Loading loops in certain browsers (Safari, DuckDuckGo)
- QR code re-validation causing timeouts
- Complex auth metadata sync creating circular dependencies
- Browser storage conflicts requiring incognito mode

## Key Files Preserved
- `src/contexts/AuthContext.jsx` - Original auth logic
- `src/components/UpgradeHandler.jsx` - QR code handling
- `deploy.sh` - Deployment script
- Package configuration and all dependencies