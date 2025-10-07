# Meta Ads API Integration - Technical Overview

## System Architecture

### Overview
The system integrates with Meta Marketing API (Graph API v23.0) to track advertising campaign performance for Art Battle events. Data is cached in Supabase and refreshed automatically via cron job.

## Data Flow

```
Meta Marketing API (Facebook/Instagram Ads)
    ↓
meta-ads-report Edge Function (Supabase)
    ↓
ai_analysis_cache Table (Supabase)
    ↓
art-battle-admin UI (React)
```

## Meta API Integration

### Authentication
- **Token Type**: System User Token (never expires)
- **Storage**: Supabase Secrets as `META_ACCESS_TOKEN`
- **Token Generation**: Via Meta Business Manager → System Users → Generate Token
- **Permissions Required**:
  - ads_read
  - ads_management
  - business_management

### API Version
- **Version**: v23.0
- **Base URL**: `https://graph.facebook.com/v23.0/`

### Ad Accounts
Two Meta Ad Accounts are monitored:
1. **act_374917895886929** - Art Battle Main (CAD currency)
2. **act_10154340035865743** - Art Battle International (USD currency)

### Campaign Matching Logic
Campaigns are matched to events by checking if the campaign name contains the Event ID (EID):
```javascript
// Example: Campaign "AB3023 - San Francisco" matches event "AB3023"
const campaignName = campaign.name.toUpperCase();
const eventEID = "AB3023";
if (campaignName.includes(eventEID)) {
  // Match found
}
```

### API Request Structure

**Endpoint**: `/{ad_account_id}/adsets`

**Query Parameters**:
```javascript
{
  access_token: META_ACCESS_TOKEN,
  fields: [
    'id',
    'name',
    'status',
    'campaign{id,name,status,lifetime_budget,budget_remaining}',
    'insights{
      spend,
      reach,
      clicks,
      actions,
      action_values,
      website_purchase_roas,
      purchase_roas
    }'
  ]
}
```

### Key Fields Explanation

#### Campaign Level
- `lifetime_budget` - Total budget allocated (in cents, divide by 100)
- `budget_remaining` - Remaining budget (in cents, divide by 100)
- `name` - Campaign name (must contain Event ID for matching)
- `status` - ACTIVE, PAUSED, DELETED, ARCHIVED

#### Adset Level (Insights)
- `spend` - Amount spent so far (float)
- `reach` - Number of unique people reached (integer)
- `clicks` - Total clicks on ads (integer)
- `actions` - Array of action objects with types like 'purchase', 'omni_purchase'
- `action_values` - Array of monetary values for actions (revenue)
- `purchase_roas` - Meta's pre-calculated Return on Ad Spend (array)
- `website_purchase_roas` - Alternative ROAS metric (array)

#### Actions Array Structure
```json
{
  "actions": [
    {
      "action_type": "purchase",
      "value": "45"  // Number of purchases
    },
    {
      "action_type": "omni_purchase",
      "value": "45"
    }
  ]
}
```

**Note**: Use `action_type: "purchase"` as canonical - it covers all purchase platforms.

#### Action Values Array Structure
```json
{
  "action_values": [
    {
      "action_type": "purchase",
      "value": "606.33"  // Total revenue from purchases
    }
  ]
}
```

#### ROAS Array Structure
```json
{
  "purchase_roas": [
    {
      "value": "1.777278"  // Meta's calculated ROAS
    }
  ]
}
```

## Supabase Storage

### Cache Table: `ai_analysis_cache`

**Purpose**: General-purpose cache table repurposed for Meta Ads data

**Schema**:
```sql
CREATE TABLE ai_analysis_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,           -- Event EID (e.g., "AB3023")
  analysis_type text NOT NULL,      -- Always "meta_ads" for this use case
  result jsonb NOT NULL,            -- Full Meta Ads response (see structure below)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_cache_event_type
  ON ai_analysis_cache(event_id, analysis_type);
```

**Cache Duration**: 6 hours
- Data older than 6 hours is ignored
- Fresh fetch occurs if cache is stale

### Cached Data Structure (result JSONB)

```json
{
  "event_eid": "AB3023",
  "total_spend": 374.16,
  "total_budget": 400.00,
  "budget_remaining": 0.08,
  "budget_utilization": 93.54,
  "total_reach": 45230,
  "total_clicks": 1250,
  "conversions": 45,
  "conversion_value": 606.33,
  "roas": 1.777278,
  "currency": "USD",
  "campaigns": [
    {
      "id": "120212345678901234",
      "name": "AB3023 - San Francisco Championship",
      "status": "ACTIVE",
      "spend": 374.16,
      "reach": 45230,
      "clicks": 1250,
      "budget": 400.00,
      "budget_remaining": 0.08
    }
  ],
  "adsets": [
    {
      "id": "120212345678901235",
      "name": "SF Bay Area 25-45",
      "status": "ACTIVE",
      "spend": 187.08,
      "reach": 22615,
      "clicks": 625,
      "conversions": 23,
      "conversion_value": 303.17,
      "roas": 1.62,
      "campaign_id": "120212345678901234",
      "campaign_name": "AB3023 - San Francisco Championship"
    }
  ],
  "last_updated": "2025-10-07T13:22:59.166407Z"
}
```

### Budget Deduplication
Campaigns can have multiple adsets. To avoid double-counting budgets:
```javascript
const budgetTracked = new Set();
for (const adset of adsets) {
  if (adset.campaign && !budgetTracked.has(adset.campaign.id)) {
    budgetTracked.add(adset.campaign.id);
    totalBudget += parseFloat(adset.campaign.lifetime_budget) / 100;
    totalBudgetRemaining += parseFloat(adset.campaign.budget_remaining) / 100;
  }
}
```

## Edge Function: meta-ads-report

**Location**: `/root/vote_app/vote26/supabase/functions/meta-ads-report/index.ts`

**Endpoint**: `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/{event_eid}`

**Authentication**: Dual mode
1. **JWT Token** (for admin UI requests)
   - Header: `Authorization: Bearer <user_jwt>`
   - Validates user is authenticated
2. **Cron Secret** (for automated cron jobs)
   - Header: `X-Cron-Secret: <secret>`
   - Stored in Supabase Secrets as `CRON_SECRET_META_ADS`

**Request Method**: GET

**Query Parameters**:
- `event_eid` - Event identifier (e.g., "AB3023") - passed in URL path
- `debug` - Optional, set to "true" for detailed debug info

**Response Structure**: See "Cached Data Structure" above

### Processing Logic

1. **Check Cache First**
   - Query `ai_analysis_cache` for event_id + analysis_type='meta_ads'
   - Check if created_at is within 6 hours
   - Return cached data if valid

2. **Fetch from Meta API** (if cache miss or stale)
   - Query both ad accounts (CAD and USD)
   - For each account, get all adsets with campaign and insights
   - Filter adsets by campaign name containing Event ID

3. **Aggregate Data**
   - Sum spend, reach, clicks across all matching adsets
   - Sum conversions and conversion values
   - Calculate or extract ROAS
   - Track budget per campaign (deduplicated)
   - Calculate budget utilization percentage

4. **Calculate ROAS**
   ```javascript
   // Prefer Meta's pre-calculated ROAS
   if (insights.purchase_roas && insights.purchase_roas.length > 0) {
     roas = parseFloat(insights.purchase_roas[0].value);
   }
   // Fallback to manual calculation
   else if (totalSpend > 0 && totalConversionValue > 0) {
     roas = totalConversionValue / totalSpend;
   }
   ```

5. **Cache Result**
   - Insert/update in `ai_analysis_cache` table
   - Set analysis_type = 'meta_ads'
   - Store full response in result JSONB

## Automated Caching (Cron Job)

### Database Function: `cache_meta_ads_data()`

**Location**: `/root/vote_app/vote26/supabase/migrations/20251007_setup_meta_ads_cache_cron.sql`

**Purpose**: Queries events and triggers cache refresh for upcoming events

**Logic**:
```sql
-- Calculate date range: 2 days ago to 33 days in future
start_date := now() - interval '2 days';
end_date := now() + interval '33 days';

-- Get events in range
SELECT id, eid, name, event_start_datetime
FROM events
WHERE event_start_datetime >= start_date
  AND event_start_datetime <= end_date
  AND eid IS NOT NULL
ORDER BY event_start_datetime;

-- For each event, call meta-ads-report via HTTP
PERFORM net.http_get(
  url := 'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/' || event_eid,
  headers := jsonb_build_object(
    'X-Cron-Secret', (SELECT secret_value FROM cron_secrets WHERE name = 'meta_ads_cron')
  )
);
```

**Return Value**: JSONB with summary
```json
{
  "success": true,
  "date_range": {
    "start": "2025-10-05T13:18:42Z",
    "end": "2025-11-09T13:18:42Z"
  },
  "total_events": 18,
  "cached_events": 18,
  "completed_at": "2025-10-07T13:18:42Z"
}
```

### Cron Schedule

**Extension**: `pg_cron`

**Schedule**: Daily at 8:00 AM UTC
```sql
SELECT cron.schedule(
  'meta-ads-cache-daily',
  '0 8 * * *',
  $$SELECT cache_meta_ads_data()$$
);
```

**Cron Job ID**: 20 (current deployment)

**Monitoring Queries**:
```sql
-- View cron job
SELECT * FROM cron.job WHERE jobname = 'meta-ads-cache-daily';

-- View execution history
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'meta-ads-cache-daily')
ORDER BY start_time DESC
LIMIT 10;
```

### Cron Security

**Secrets Table**: `cron_secrets`
```sql
CREATE TABLE cron_secrets (
  name text PRIMARY KEY,
  secret_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS enabled, no policies = API inaccessible
ALTER TABLE cron_secrets ENABLE ROW LEVEL SECURITY;
```

**Secret Storage**:
1. **Database**: `cron_secrets` table with RLS (no API access)
   - Name: `meta_ads_cron`
   - Value: Random 64-char hex string
2. **Edge Function**: Supabase Secrets
   - Key: `CRON_SECRET_META_ADS`
   - Value: Same as database

**Security Model**:
- Cron function reads from `cron_secrets` table (SECURITY DEFINER)
- Edge function reads from Supabase Secrets (environment variable)
- Both must match for authentication
- No exposure via Supabase client API

## Frontend Integration (art-battle-admin)

**Component**: `/root/vote_app/vote26/art-battle-admin/src/components/EventDetail.jsx`

### State Variables
```javascript
const [metaAdsData, setMetaAdsData] = useState(null);
const [metaAdsLoading, setMetaAdsLoading] = useState(false);
const [advertisingCollapsed, setAdvertisingCollapsed] = useState(false);
```

### Data Fetching
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

### Fetch Timing
- Called in parallel with `fetchPostEventData()` (Eventbrite data)
- Triggered for **all events** (not just completed)
- Runs when event is loaded or changes

### Auto-Expand Logic
```javascript
useEffect(() => {
  // Expand Advertising if there's Meta Ads data with spend
  if (metaAdsData && metaAdsData.total_spend > 0) {
    setAdvertisingCollapsed(false);
  }
}, [metaAdsData]);
```

### UI Display
The "Advertising" section shows:
- **Budget & Spend**: Total spend, budget allocated, remaining, utilization %
- **Performance**: Reach, clicks, conversions, ROAS
- **Cost Metrics**: CPC, cost per conversion, conversion rate, avg order value
- **Campaign List**: Individual campaign performance

**Color Coding**:
- Budget Utilization: Green (<75%), Orange (75-90%), Red (>90%)
- ROAS: Green (≥1.0x), Red (<1.0x)

## Calculated Metrics

### Budget Utilization
```javascript
budget_utilization = (total_spend / total_budget) * 100
```

### ROAS (Return on Ad Spend)
```javascript
// Method 1: Use Meta's pre-calculated ROAS (preferred)
roas = insights.purchase_roas[0].value

// Method 2: Manual calculation (fallback)
roas = conversion_value / total_spend
```

### Cost Per Click (CPC)
```javascript
cpc = total_spend / total_clicks
```

### Cost Per Conversion
```javascript
cost_per_conversion = total_spend / conversions
```

### Conversion Rate
```javascript
conversion_rate = (conversions / total_clicks) * 100
```

### Average Order Value (AOV)
```javascript
aov = conversion_value / conversions
```

## Error Handling

### Common Errors

1. **Token Expired**
   - Error: "Session has expired on..."
   - Solution: Generate new System User token in Meta Business Manager

2. **No Campaigns Found**
   - Response: `{ message: "No Meta campaigns found" }`
   - Reason: Campaign name doesn't contain Event ID

3. **Invalid Event ID**
   - Error: "Event not found: {identifier}"
   - Solution: Verify event exists and has valid EID

4. **Rate Limiting**
   - Meta API has rate limits per app
   - Solution: Implement exponential backoff (not currently implemented)

## Testing

### Manual Cache Refresh
```bash
curl -X GET \
  'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3023' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Manual Cron Test
```sql
SELECT cache_meta_ads_data();
```

### Debug Mode
```bash
curl -X GET \
  'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/meta-ads-report/AB3023?debug=true' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Documentation Files

1. **`/root/vote_app/vote26/supabase/CRON_SETUP.md`**
   - Cron job setup instructions
   - Secret configuration steps
   - Monitoring queries

2. **`/root/vote_app/vote26/META_ADS_INTEGRATION_GUIDE.md`**
   - End-to-end setup guide
   - Token generation walkthrough
   - Troubleshooting tips

3. **`/root/vote_app/vote26/ai-context/facebook/.env`**
   - Local testing credentials (not committed to git)
   - Contains META_ACCESS_TOKEN for development

## Key Implementation Files

```
/root/vote_app/vote26/
├── supabase/
│   ├── functions/
│   │   └── meta-ads-report/
│   │       └── index.ts                    # Edge function
│   ├── migrations/
│   │   └── 20251007_setup_meta_ads_cache_cron.sql  # Cron setup
│   ├── CRON_SETUP.md                       # Cron documentation
│   └── META_ADS_INTEGRATION_GUIDE.md       # Setup guide
├── art-battle-admin/
│   └── src/
│       └── components/
│           └── EventDetail.jsx             # UI component (lines 3422-3598)
└── ai-context/
    └── facebook/
        ├── .env                             # Local dev secrets
        ├── explore-meta-api.js             # API testing script
        └── META_ADS_TECHNICAL_OVERVIEW.md  # This file
```

## Future Enhancements

1. **Rate Limit Handling**
   - Implement exponential backoff
   - Track API quota usage

2. **Multi-Event Campaigns**
   - Handle campaigns that span multiple events
   - Pro-rate spend across events

3. **Historical Tracking**
   - Store historical snapshots
   - Track performance over time

4. **Alert System**
   - Notify when budget is nearly depleted
   - Alert on poor ROAS performance

5. **Campaign Optimization**
   - Suggest budget reallocation
   - Identify underperforming adsets

## Support Contacts

- **Meta Business Manager**: https://business.facebook.com/
- **Meta Marketing API Docs**: https://developers.facebook.com/docs/marketing-api
- **Supabase Dashboard**: https://supabase.com/dashboard/project/xsqdkubgyqwpyvfltnrf
