# Meta/Facebook Ads API Integration Guide

**Date:** October 2, 2025
**Status:** Production Ready ✅
**Author:** Claude Code

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Getting Meta API Access (The Hard Part)](#getting-meta-api-access)
4. [Implementation Details](#implementation-details)
5. [Testing & Debugging](#testing--debugging)
6. [Security](#security)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## Overview

This integration fetches Facebook/Meta ad campaign data for Art Battle events and displays it in the admin post-event summary.

### What It Does

- Queries Meta Ads API for campaigns matching event EIDs (e.g., "AB3065")
- Retrieves spend, reach, clicks, and campaign performance metrics
- Caches results for 6 hours to reduce API calls
- Displays data in admin UI for completed events only
- Requires authentication (JWT) for security

### Key Features

- **Dual Account Support:** Searches both CAD and USD ad accounts
- **Smart Caching:** 6-hour cache via `ai_analysis_cache` table
- **Debug Mode:** `?debug=true` shows detailed API responses
- **Campaign Matching:** Finds campaigns by EID in campaign name
- **Secure:** JWT authentication required

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin UI (React)                          │
│              art-battle-admin/EventDetail.jsx                │
│  - Fetches data when event is completed                     │
│  - Displays Meta Advertising card                           │
│  - Shows spend, reach, clicks, campaigns                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ supabase.functions.invoke('meta-ads-report/AB3065')
                   │ (includes JWT token automatically)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          Supabase Edge Function                              │
│      /supabase/functions/meta-ads-report/index.ts           │
│  - Validates JWT authentication                             │
│  - Checks cache (ai_analysis_cache table)                   │
│  - Calls Meta Graph API if cache miss                       │
│  - Returns aggregated metrics                               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Uses META_ACCESS_TOKEN from secrets
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Meta Graph API v23.0                            │
│  - Account: act_374917895886929 (CAD - Art Battle Main)     │
│  - Account: act_10154340035865743 (USD - International)     │
│  - Endpoint: /{account_id}/adsets                           │
│  - Filter: campaign.name CONTAINS eventEID                  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Trigger:** User opens completed event in admin panel
2. **UI Call:** `fetchMetaAdsData()` called automatically
3. **Auth Check:** Edge function validates JWT token
4. **Cache Check:** Looks for data < 6 hours old in `ai_analysis_cache`
5. **API Call:** If cache miss, queries both Meta ad accounts
6. **Filter:** Finds campaigns where name contains event EID (e.g., "AB3065")
7. **Process:** Aggregates spend, reach, clicks from all matching ad sets
8. **Cache:** Stores result with 6-hour expiry
9. **Response:** Returns JSON with campaign metrics
10. **Display:** UI renders Meta Advertising card with data

---

## Getting Meta API Access (The Hard Part)

### The Challenge

Meta's API access requires navigating their Byzantine bureaucracy. You need:
1. A Meta Business Account
2. A Meta Developer App (even though you're not building an app)
3. A System User with permissions
4. A never-expiring access token

### Token Types Explained

| Token Type | Lifespan | Use Case | How to Get |
|------------|----------|----------|------------|
| **Short-lived User Token** | 1 hour | Testing only | Graph API Explorer |
| **Long-lived User Token** | 60 days | Development | Token exchange endpoint |
| **System User Token** | **Never expires** ⭐ | **Production** | Business Settings |

**ALWAYS use System User Token for production.**

---

### Step-by-Step: Getting System User Token

#### Prerequisites

- Access to Meta Business Suite (business.facebook.com)
- Admin role in your Meta Business Account
- Ad Accounts already added to Business Account

---

#### Step 1: Create a Meta Developer App

Even though you're not building an app, Meta requires one as a "credential container."

1. Go to: **https://developers.facebook.com/apps/**
2. Click **"Create App"**
3. Select **"Business"** as the app type
4. Fill in:
   - **App Name:** "Art Battle Marketing API" (or your choice)
   - **App Contact Email:** your email
   - **Business Account:** Select your Art Battle business account
5. Click **"Create App"**
6. **Save the App ID** - you'll need it

---

#### Step 2: Create or Use System User

1. Go to: **https://business.facebook.com/settings/system-users**
2. Click **"Add"** to create new System User (or use existing)
3. Fill in:
   - **Name:** "Art Battle API Access" (or your choice)
   - **Role:** **"Admin"** (required for API access)
4. Click **"Create System User"**

---

#### Step 3: Assign Ad Accounts to System User

1. Still in System Users settings
2. Click on your newly created System User
3. Click **"Assign Assets"**
4. Select **"Ad Accounts"**
5. Check both:
   - `act_374917895886929` (Art Battle Main - CAD)
   - `act_10154340035865743` (Art Battle International - USD)
6. Set permissions: **"Manage Ad Account"**
7. Click **"Save Changes"**

---

#### Step 4: Assign System User to App

This is the step that trips everyone up!

1. Go back to your app: **https://developers.facebook.com/apps/**
2. Click on your app ("Art Battle Marketing API")
3. In left sidebar, click **"App Roles"** (or **"Roles"**)
4. Click **"Add People"** or **"System Users"** button
5. Find your System User in the dropdown
6. Assign role: **"Administrator"** (or at least "Developer")
7. Click **"Add"**

**Why this matters:** The System User must be a "member" of the app before it can request permissions on behalf of that app. Classic Meta circular dependency.

---

#### Step 5: Generate the Token

Now the System User can finally generate a token for your app!

1. Return to: **https://business.facebook.com/settings/system-users**
2. Click on your System User
3. Click **"Generate New Token"**
4. In the dropdown: Select your app ("Art Battle Marketing API")
5. **Important:** You should now see available permissions
   - If you see "No permissions available", go back to Step 4
6. Select permissions:
   - ✅ **`ads_read`** (minimum required)
   - ✅ **`ads_management`** (recommended for full access)
7. **Expiration:** Select **"Never"** ⭐
8. Click **"Generate Token"**
9. **COPY THE TOKEN IMMEDIATELY** - you can't see it again!

The token will look like: `EAAxxxxxxxxxxxx...` (very long string)

---

#### Step 6: Store Token in Supabase Secrets

1. Open terminal and navigate to your project:
```bash
cd /root/vote_app/vote26/supabase
```

2. Set the secret:
```bash
supabase secrets set META_ACCESS_TOKEN="<paste_your_token_here>"
```

3. Verify it's stored:
```bash
supabase secrets list | grep META
```

You should see:
```
META_ACCESS_TOKEN | <hash>
```

---

### Testing Your Token

Test the token is working:

```bash
curl "https://graph.facebook.com/v23.0/act_374917895886929" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d "fields=id,name,currency,account_status"
```

Should return account details if working.

---

### Common Issues During Setup

| Error | Cause | Solution |
|-------|-------|----------|
| "No permissions available" | System User not added to app | Go to App → Roles → Add System User |
| "Invalid OAuth access token" | Token expired or wrong | Generate new token |
| "Permissions error" | System User lacks ad account access | Assign ad accounts to System User |
| "App not found" | Wrong app selected | Verify app ID matches |
| "(#100) Invalid parameter" | Wrong endpoint or fields | Check Graph API documentation |

---

## Implementation Details

### Database Schema

#### Cache Table: `ai_analysis_cache`

```sql
-- Stores Meta ads data with 6-hour TTL
CREATE TABLE ai_analysis_cache (
  event_id TEXT,              -- Event EID (e.g., 'AB3065')
  analysis_type TEXT,         -- Always 'meta_ads' for this integration
  result JSONB,               -- Full API response
  created_at TIMESTAMPTZ,     -- When cached
  expires_at TIMESTAMPTZ,     -- Cache expiry (created_at + 6 hours)
  event_name TEXT,
  served_count INTEGER,       -- How many times served from cache
  last_served_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, analysis_type)
);
```

---

### Edge Function: `meta-ads-report`

**Location:** `/root/vote_app/vote26/supabase/functions/meta-ads-report/index.ts`

#### Key Functions

##### 1. Authentication Check
```typescript
const authHeader = req.headers.get('Authorization');
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);

if (authError || !user) {
  return 401 Unauthorized
}
```

##### 2. Cache Lookup
```typescript
const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

const { data } = await supabase
  .from('ai_analysis_cache')
  .select('*')
  .eq('event_id', eventEID)
  .eq('analysis_type', 'meta_ads')
  .gte('created_at', sixHoursAgo)
  .single();
```

##### 3. Meta API Query
```typescript
const url = `https://graph.facebook.com/v23.0/${accountId}/adsets`;
const params = {
  access_token: metaAccessToken,
  fields: 'id,name,status,campaign{id,name},insights{spend,reach,clicks}',
  filtering: JSON.stringify([{
    field: 'campaign.name',
    operator: 'CONTAIN',
    value: eventEID  // e.g., "AB3065"
  }]),
  limit: '100'
};
```

##### 4. Response Processing
```typescript
// Aggregates data from all matching ad sets
{
  event_eid: "AB3065",
  total_spend: 5.86,
  total_budget: 400,
  total_reach: 1537,
  total_clicks: 84,
  currency: "USD",
  campaigns: [
    {
      id: "120233758505880552",
      name: "AB3065 – Bangkok - Purchases - Copia",
      spend: 5.86,
      reach: 1537,
      clicks: 84
    }
  ],
  adsets: [...]
}
```

---

### Admin UI Integration

**Location:** `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx`

#### State Management
```javascript
const [metaAdsData, setMetaAdsData] = useState(null);
const [metaAdsLoading, setMetaAdsLoading] = useState(false);
```

#### Data Fetching
```javascript
const fetchMetaAdsData = async () => {
  if (!event?.eid) return;

  setMetaAdsLoading(true);
  try {
    const { data, error } = await supabase.functions.invoke(
      `meta-ads-report/${event.eid}`
    );

    if (error) {
      console.error('Error fetching Meta ads data:', error);
      setMetaAdsData(null);
      return;
    }

    setMetaAdsData(data);
  } catch (err) {
    console.error('Error fetching Meta ads data:', err);
    setMetaAdsData(null);
  } finally {
    setMetaAdsLoading(false);
  }
};
```

#### Auto-fetch for Completed Events
```javascript
useEffect(() => {
  if (!event) return;

  const fetchPostEventDataIfNeeded = async () => {
    if (event.event_end_datetime) {
      const now = new Date();
      const endTime = new Date(event.event_end_datetime);
      const isCompleted = now > endTime;

      if (isCompleted) {
        promises.push(fetchPostEventData());
        promises.push(fetchMetaAdsData()); // 👈 Auto-fetch for completed events
      }
    }
  };

  fetchPostEventDataIfNeeded();
}, [event]);
```

#### UI Display
```jsx
{/* Meta Advertising Card */}
<Card mt="3">
  <Box p="3">
    <Flex justify="between" align="center" mb="3">
      <Text size="2" weight="medium">Meta Advertising</Text>
      {metaAdsLoading && <Spinner size="1" />}
      {metaAdsData && (
        <Badge size="1" color="blue">
          {metaAdsData.campaigns?.length || 0} campaigns
        </Badge>
      )}
    </Flex>

    {metaAdsData && metaAdsData.total_spend > 0 ? (
      <Grid columns="4" gap="3">
        <Box>
          <Text size="1" color="gray">Total Spend</Text>
          <Text size="4" weight="bold" color="orange">
            {metaAdsData.currency} ${metaAdsData.total_spend?.toFixed(2)}
          </Text>
        </Box>
        {/* ... reach, clicks, CPC ... */}
      </Grid>
    ) : (
      <Text size="2" color="gray">
        No ad campaigns found for {event?.eid}
      </Text>
    )}
  </Box>
</Card>
```

---

### Campaign Naming Convention

**CRITICAL:** The integration finds campaigns by searching for the Event ID in the campaign name.

#### Requirements

✅ **Works:**
- "AB3065 – Bangkok - Purchases"
- "Bangkok AB3065 Targeting"
- "AB3065"

❌ **Won't Work:**
- "Bangkok Event" (no EID)
- "AB-3065" (dash instead of no separator)
- "Art Battle Bangkok October" (no EID)

#### Best Practice

Always include the exact Event ID (e.g., `AB3065`) somewhere in the campaign name when creating Facebook ads.

---

## Testing & Debugging

### Debug Mode

Enable detailed debugging:

```bash
curl "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3065?debug=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"
```

Debug response includes:
```json
{
  "...normal data...",
  "debug_info": {
    "event_eid": "AB3065",
    "accounts_searched": [
      {
        "account_id": "act_374917895886929",
        "currency": "CAD",
        "response_status": 200,
        "response_ok": true,
        "data_count": 0,
        "api_error": null
      },
      {
        "account_id": "act_10154340035865743",
        "currency": "USD",
        "response_status": 200,
        "data_count": 4,
        "sample_campaigns": [
          {
            "adset_name": "Broad Audience [EN]",
            "campaign_name": "AB3065 – Bangkok - Purchases"
          }
        ]
      }
    ],
    "token_present": true,
    "token_length": 205
  }
}
```

---

### Test Authentication

**Test 1: Without Auth (should fail)**
```bash
curl "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3065" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"

# Response:
{"error": "Missing authorization header"}
```

**Test 2: With Auth (should work)**
```bash
curl "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3065" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"

# Response: Full ad data
```

---

### Check Cache Status

```sql
-- View all Meta ads cache entries
SELECT
  event_id,
  created_at,
  expires_at,
  served_count,
  result->>'total_spend' as spend,
  result->>'currency' as currency
FROM ai_analysis_cache
WHERE analysis_type = 'meta_ads'
ORDER BY created_at DESC;
```

---

### Manual Cache Clear

```sql
-- Clear cache for specific event
DELETE FROM ai_analysis_cache
WHERE event_id = 'AB3065' AND analysis_type = 'meta_ads';

-- Clear all Meta ads cache
DELETE FROM ai_analysis_cache
WHERE analysis_type = 'meta_ads';
```

---

## Security

### Authentication Flow

1. **User logs into admin panel** → Gets JWT token from Supabase Auth
2. **Admin UI calls edge function** → Supabase client automatically includes JWT
3. **Edge function validates token** → `supabase.auth.getUser(token)`
4. **If valid** → Proceed with API call
5. **If invalid/missing** → Return 401 Unauthorized

### JWT Validation Code

```typescript
// Edge function security check
const authHeader = req.headers.get('Authorization');
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: 'Missing authorization header' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);

if (authError || !user) {
  return new Response(
    JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### Secret Management

| Secret | Location | Purpose | How to Update |
|--------|----------|---------|---------------|
| `META_ACCESS_TOKEN` | Supabase Secrets | Meta API authentication | `supabase secrets set META_ACCESS_TOKEN=<token>` |
| JWT Tokens | User sessions | Admin authentication | Handled by Supabase Auth |

**Never:**
- Commit tokens to git
- Log tokens to console
- Expose tokens in client-side code
- Use `--no-verify-jwt` flag in production

---

## Troubleshooting

### "Session has expired" Error

**Symptom:**
```json
{
  "error": {
    "message": "Error validating access token: Session has expired on Monday, 01-Sep-25",
    "type": "OAuthException",
    "code": 190
  }
}
```

**Cause:** Meta access token expired (60-day user token instead of System User token)

**Solution:**
1. Generate new System User token (see [Getting Meta API Access](#getting-meta-api-access))
2. Update Supabase secret:
```bash
cd /root/vote_app/vote26/supabase
supabase secrets set META_ACCESS_TOKEN="<new_token>"
```

---

### "No campaigns found" (but campaigns exist)

**Symptom:** Returns `total_spend: 0`, empty campaigns array

**Possible Causes:**

1. **Campaign name doesn't include Event ID**
   - Check Meta Ads Manager
   - Campaign name must contain exact EID (e.g., "AB3065")
   - Case-sensitive search

2. **Wrong ad account**
   - CAD events should have ads in `act_374917895886929`
   - USD/International events in `act_10154340035865743`

3. **Token lacks permissions**
   - Token needs `ads_read` permission
   - System User must have ad account access

**Debug:**
```bash
# Enable debug mode to see what's being searched
curl "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3065?debug=true" \
  -H "Authorization: Bearer YOUR_JWT" -H "apikey: YOUR_KEY" | jq '.debug_info'
```

---

### "Missing authorization header"

**Symptom:** 401 error with `"Missing authorization header"`

**Cause:** Request doesn't include JWT token

**Solution:** Ensure you're calling from authenticated admin session:
```javascript
// ✅ Correct - uses session token automatically
const { data } = await supabase.functions.invoke('meta-ads-report/AB3065');

// ❌ Wrong - doesn't include auth
fetch('https://.../meta-ads-report/AB3065')
```

---

### Cache Shows Stale Data

**Symptom:** Recent ad changes not showing up

**Cause:** 6-hour cache still valid

**Solutions:**

1. **Wait for cache to expire** (6 hours)

2. **Manual cache clear:**
```sql
DELETE FROM ai_analysis_cache
WHERE event_id = 'AB3065' AND analysis_type = 'meta_ads';
```

3. **Use debug mode** (bypasses cache):
```bash
curl "...?debug=true" ...
```

---

### Graph API Version Errors

**Symptom:** `"Unknown field"` or deprecated field errors

**Cause:** Using outdated Graph API version

**Solution:** Update API version in edge function:
```typescript
// Current version
const url = `https://graph.facebook.com/v23.0/${account.id}/adsets`;

// Update as needed (check Meta changelog)
const url = `https://graph.facebook.com/v24.0/${account.id}/adsets`;
```

Check latest version: https://developers.facebook.com/docs/graph-api/changelog/

---

## Maintenance

### Token Renewal

**System User tokens with "Never Expire" setting don't require renewal.**

However, Meta may revoke tokens if:
- Business account changes ownership
- Security issues detected
- App is deleted

**Monthly Check:**
```bash
# Test token is still valid
curl "https://graph.facebook.com/v23.0/debug_token" \
  -G \
  -d "input_token=YOUR_META_TOKEN" \
  -d "access_token=YOUR_META_TOKEN"

# Look for:
# "is_valid": true
# "expires_at": 0 (never expires)
```

---

### Adding New Ad Accounts

If Art Battle creates a new ad account:

1. **Update edge function:**
```typescript
const accounts = [
  { id: 'act_374917895886929', currency: 'CAD' },
  { id: 'act_10154340035865743', currency: 'USD' },
  { id: 'act_NEW_ACCOUNT_ID', currency: 'EUR' }  // 👈 Add here
];
```

2. **Grant System User access:**
   - Go to Business Settings → System Users
   - Click your System User
   - Assign Assets → Ad Accounts
   - Add new account with "Manage" permission

3. **Redeploy:**
```bash
cd /root/vote_app/vote26/supabase
supabase functions deploy meta-ads-report
```

---

### Monitoring & Alerts

**Key Metrics to Monitor:**

1. **Token Expiry:**
   - Check token status monthly
   - Set calendar reminder

2. **API Errors:**
   - Monitor edge function logs
   - Track 400/401 error rates

3. **Cache Performance:**
   - Check `served_count` in `ai_analysis_cache`
   - Low count = campaigns not being found

4. **Data Quality:**
   - Compare UI totals with Meta Ads Manager
   - Spot check spend amounts match

**Useful Queries:**

```sql
-- Cache hit rate
SELECT
  event_id,
  served_count,
  AGE(NOW(), created_at) as age
FROM ai_analysis_cache
WHERE analysis_type = 'meta_ads'
ORDER BY served_count DESC;

-- Events with ads vs no ads
SELECT
  e.eid,
  e.name,
  CASE WHEN c.event_id IS NOT NULL THEN 'Has Ads' ELSE 'No Ads' END as status
FROM events e
LEFT JOIN ai_analysis_cache c ON e.eid = c.event_id AND c.analysis_type = 'meta_ads'
WHERE e.event_end_datetime < NOW()
ORDER BY e.event_end_datetime DESC
LIMIT 20;
```

---

### Deployment

**Deploy Edge Function:**
```bash
cd /root/vote_app/vote26/supabase
supabase functions deploy meta-ads-report
```

**Deploy Admin UI:**
```bash
cd /root/vote_app/vote26/art-battle-admin
./deploy.sh
```

**Verify Deployment:**
1. Navigate to completed event in admin
2. Check "Post-Event Summary" section
3. Verify "Meta Advertising" card appears
4. Confirm data loads (or shows "No campaigns found")

---

### API Rate Limits

Meta enforces rate limits on the Marketing API:

- **Standard Access:** 200 calls per hour per user
- **Business Access:** Higher limits (variable)

**Protection Mechanisms:**

1. **6-hour cache** reduces API calls
2. **Single request per event** (not per page load)
3. **Parallel account search** (stops on first match)

**If rate limited:**
- Error code 17 or 613
- Wait 1 hour or cache expires
- Consider increasing cache TTL to 12-24 hours

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `/root/vote_app/vote26/supabase/functions/meta-ads-report/index.ts` | Edge function - API integration |
| `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx` | Admin UI - displays data |
| `/root/vote_app/vote26/supabase/functions/_shared/cors.ts` | CORS headers for edge functions |
| `/root/vote_app/vote26/META_ADS_INTEGRATION_GUIDE.md` | This documentation |

---

## Git Commits

- **`8fde950`** - Initial Meta Ads integration
- **`75bb241`** - Security: Add JWT authentication

---

## Support Resources

### Meta Documentation
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Marketing API Docs: https://developers.facebook.com/docs/marketing-api/
- System Users Guide: https://www.facebook.com/business/help/503306463479099
- API Changelog: https://developers.facebook.com/docs/graph-api/changelog/

### Internal Resources
- Supabase Dashboard: https://supabase.com/dashboard/project/xsqdkubgyqwpyvfltnrf
- Admin Panel: https://artb.tor1.cdn.digitaloceanspaces.com/admin/
- Debug Function: https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3065?debug=true

---

## Quick Reference

### Environment Variables

```bash
# Supabase Secrets (production)
META_ACCESS_TOKEN=EAAxxxxxxxxxxxx...  # System User token (never expires)

# Ad Account IDs
CAD_ACCOUNT=act_374917895886929      # Art Battle Main
USD_ACCOUNT=act_10154340035865743    # Art Battle International
```

### Common Commands

```bash
# Check secrets
supabase secrets list | grep META

# Update token
supabase secrets set META_ACCESS_TOKEN="new_token_here"

# Deploy function
supabase functions deploy meta-ads-report

# Test with debug
curl "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3065?debug=true" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "apikey: ANON_KEY"

# Clear cache
DELETE FROM ai_analysis_cache WHERE analysis_type = 'meta_ads';
```

---

## Future Enhancements

### Potential Improvements

1. **Extended Metrics:**
   - Cost per conversion
   - ROAS (Return on Ad Spend)
   - Audience demographics
   - Ad creative performance

2. **Historical Tracking:**
   - Store daily snapshots
   - Show spend trends over time
   - Compare event to event

3. **Alerting:**
   - Notify if spend exceeds budget
   - Alert on low CTR campaigns
   - Warning if no ads found for upcoming event

4. **Multi-Event View:**
   - Dashboard showing all event ad performance
   - Aggregate spend by city/country
   - Compare ROI across venues

5. **Campaign Recommendations:**
   - AI suggestions based on past performance
   - Budget allocation optimization
   - Audience targeting insights

---

**Last Updated:** October 2, 2025
**Maintained By:** Art Battle Development Team
**Questions?** Check troubleshooting section or contact tech team

---

🎨 **Art Battle - Live Painting Competitions**
