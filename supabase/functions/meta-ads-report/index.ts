import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

async function getEventByIdentifier(identifier: string) {
  // Try UUID first
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  
  let query = supabase
    .from('events')
    .select('id, eid, name, city_id, cities(name)');
  
  if (isUUID) {
    query = query.eq('id', identifier);
  } else {
    query = query.eq('eid', identifier);
  }
  
  const { data, error } = await query.single();
  
  if (error) {
    throw new Error(`Event not found: ${identifier}`);
  }
  
  return data;
}

async function getMetaAdsDataFromCache(eventEID: string) {
  // Check for cached Meta ads data (6-hour cache)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('ai_analysis_cache') // Repurposing this table or create meta_ads_cache
    .select('*')
    .eq('event_id', eventEID)
    .eq('analysis_type', 'meta_ads')
    .gte('created_at', sixHoursAgo)
    .single();
  
  if (error || !data) return null;
  
  return data.result;
}

async function fetchMetaAdsFromAPI(eventEID: string, debug = false) {
  const metaAccessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!metaAccessToken) {
    throw new Error('META_ACCESS_TOKEN environment variable not set');
  }

  // Art Battle account IDs
  const mainAccountID = 'act_374917895886929'; // Art Battle Main Main (CAD)
  const intlAccountID = 'act_10154340035865743'; // Art Battle International (USD)

  const accounts = [
    { id: mainAccountID, currency: 'CAD' },
    { id: intlAccountID, currency: 'USD' }
  ];

  let bestMatch = null;
  const debugInfo: any = {
    event_eid: eventEID,
    accounts_searched: [],
    token_present: !!metaAccessToken,
    token_length: metaAccessToken?.length || 0
  };

  for (const account of accounts) {
    try {
      const url = `https://graph.facebook.com/v23.0/${account.id}/adsets`;
      const params = new URLSearchParams({
        access_token: metaAccessToken,
        fields: [
          'id',
          'name',
          'status',
          'created_time',
          'start_time',
          'end_time',
          'daily_budget',
          'lifetime_budget',
          'budget_remaining',
          'campaign{id,name,created_time,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining}',
          'targeting{age_min,age_max,genders,geo_locations{cities,regions,countries},interests,custom_audiences}',
          'insights{spend,reach,clicks,actions,action_values,website_purchase_roas,purchase_roas}'
        ].join(','),
        filtering: JSON.stringify([{
          field: 'campaign.name',
          operator: 'CONTAIN',
          value: eventEID
        }]),
        limit: '100'
      });

      const accountDebug: any = {
        account_id: account.id,
        currency: account.currency,
        api_url: url,
        filter_value: eventEID
      };

      const response = await fetch(`${url}?${params}`);
      accountDebug.response_status = response.status;
      accountDebug.response_ok = response.ok;

      const data = await response.json();

      if (!response.ok) {
        accountDebug.error = `HTTP ${response.status}`;
        accountDebug.error_response = data; // Capture Meta's error message
        debugInfo.accounts_searched.push(accountDebug);
        continue;
      }
      accountDebug.has_data = !!data.data;
      accountDebug.data_count = data.data?.length || 0;
      accountDebug.has_error = !!data.error;

      if (data.error) {
        accountDebug.api_error = data.error;
      }

      if (debug && data.data && data.data.length > 0) {
        accountDebug.sample_campaigns = data.data.slice(0, 3).map((adset: any) => ({
          adset_name: adset.name,
          campaign_name: adset.campaign?.name || 'No campaign'
        }));
      }

      debugInfo.accounts_searched.push(accountDebug);

      if (!data.data || data.data.length === 0) continue;

      // Process the Meta API response
      const processedData = processMetaAPIResponse(data, eventEID, account.currency);

      if (processedData.campaigns.length > 0) {
        bestMatch = processedData;
        if (debug) {
          bestMatch.debug_info = debugInfo;
        }
        break;
      }
    } catch (error) {
      debugInfo.accounts_searched.push({
        account_id: account.id,
        error: error.message,
        error_type: error.constructor.name
      });
      continue;
    }
  }
  
  if (!bestMatch) {
    // Return empty data structure if no campaigns found
    const emptyResult: any = {
      event_eid: eventEID,
      total_spend: 0,
      total_budget: 0,
      budget_remaining: 0,
      budget_utilization: 0,
      total_reach: 0,
      total_clicks: 0,
      conversions: 0,
      conversion_value: 0,
      roas: 0,
      currency: 'USD',
      campaigns: [],
      adsets: [],
      last_updated: new Date().toISOString()
    };

    if (debug) {
      emptyResult.debug_info = debugInfo;
    }

    return emptyResult;
  }

  return bestMatch;
}

function processMetaAPIResponse(data: any, eventEID: string, currency: string) {
  const campaigns: any = {};
  const adsets: any[] = [];
  const budgetTracked = new Set(); // Track which campaign budgets we've counted
  let totalSpend = 0;
  let totalBudget = 0;
  let totalBudgetRemaining = 0;
  let totalReach = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;
  let totalRoas = 0;
  let roasCount = 0;

  for (const adset of data.data) {
    // Process campaign data
    if (adset.campaign && !campaigns[adset.campaign.id]) {
      campaigns[adset.campaign.id] = {
        id: adset.campaign.id,
        name: adset.campaign.name,
        spend: 0,
        reach: 0,
        clicks: 0,
        conversions: 0,
        conversion_value: 0
      };
    }

    // Process insights data
    const insights = adset.insights?.data?.[0];
    const spend = insights ? parseFloat(insights.spend || '0') : 0;
    const reach = insights ? parseInt(insights.reach || '0') : 0;
    const clicks = insights ? parseInt(insights.clicks || '0') : 0;

    // Process conversions (purchases) - use purchase action_type as canonical
    let conversions = 0;
    let conversionValue = 0;

    if (insights?.actions) {
      for (const action of insights.actions) {
        // Use 'purchase' as canonical purchase count (all platforms)
        if (action.action_type === 'purchase') {
          conversions = parseInt(action.value || '0');
          break; // Found canonical purchase, stop looking
        }
      }
    }

    if (insights?.action_values) {
      for (const actionValue of insights.action_values) {
        // Use 'purchase' as canonical purchase value (all platforms)
        if (actionValue.action_type === 'purchase') {
          conversionValue = parseFloat(actionValue.value || '0');
          break; // Found canonical purchase value, stop looking
        }
      }
    }

    // Extract ROAS from Meta's pre-calculated field (if available)
    let adsetRoas = 0;
    if (insights?.purchase_roas && insights.purchase_roas.length > 0) {
      adsetRoas = parseFloat(insights.purchase_roas[0].value || '0');
    } else if (insights?.website_purchase_roas && insights.website_purchase_roas.length > 0) {
      adsetRoas = parseFloat(insights.website_purchase_roas[0].value || '0');
    }

    if (adsetRoas > 0) {
      totalRoas += adsetRoas;
      roasCount++;
    }

    // Add to campaign totals
    if (adset.campaign && campaigns[adset.campaign.id]) {
      campaigns[adset.campaign.id].spend += spend;
      campaigns[adset.campaign.id].reach += reach;
      campaigns[adset.campaign.id].clicks += clicks;
      campaigns[adset.campaign.id].conversions += conversions;
      campaigns[adset.campaign.id].conversion_value += conversionValue;
    }

    // Process budget at campaign level (avoid double-counting)
    if (adset.campaign && !budgetTracked.has(adset.campaign.id)) {
      budgetTracked.add(adset.campaign.id);

      if (adset.campaign.lifetime_budget) {
        const budget = parseFloat(adset.campaign.lifetime_budget) / 100;
        totalBudget += budget;
      }

      if (adset.campaign.budget_remaining) {
        const remaining = parseFloat(adset.campaign.budget_remaining) / 100;
        totalBudgetRemaining += remaining;
      }
    }

    // Add adset data
    adsets.push({
      id: adset.id,
      name: adset.name,
      campaign_name: adset.campaign?.name || '',
      spend,
      reach,
      clicks,
      conversions,
      conversion_value: conversionValue,
      status: adset.status
    });

    // Add to totals
    totalSpend += spend;
    totalReach += reach;
    totalClicks += clicks;
    totalConversions += conversions;
    totalConversionValue += conversionValue;
  }
  
  // Calculate overall ROAS
  const calculatedRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0;
  const averageMetaRoas = roasCount > 0 ? totalRoas / roasCount : 0;

  // Use Meta's ROAS if available, otherwise calculate
  const roas = averageMetaRoas > 0 ? averageMetaRoas : calculatedRoas;

  // Calculate budget utilization
  const budgetUtilization = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

  return {
    event_eid: eventEID,
    total_spend: totalSpend,
    total_budget: totalBudget,
    budget_remaining: totalBudgetRemaining,
    budget_utilization: budgetUtilization,
    total_reach: totalReach,
    total_clicks: totalClicks,
    conversions: totalConversions,
    conversion_value: totalConversionValue,
    roas: roas,
    currency,
    campaigns: Object.values(campaigns),
    adsets,
    last_updated: new Date().toISOString()
  };
}

async function cacheMetaAdsData(data: any) {
  // Cache the data for 6 hours
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  
  await supabase
    .from('ai_analysis_cache')
    .upsert({
      event_id: data.event_eid,
      analysis_type: 'meta_ads',
      result: data,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      event_name: `Meta Ads Data for ${data.event_eid}`,
      served_count: 0
    }, {
      onConflict: 'event_id,analysis_type'
    });
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    const eventIdentifier = pathParts[pathParts.length - 1];

    // Check for debug flag in query params
    const debugMode = url.searchParams.get('debug') === 'true';

    if (!eventIdentifier) {
      return new Response(
        JSON.stringify({ error: 'Event identifier required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get event details
    const event = await getEventByIdentifier(eventIdentifier);

    // Check cache first (skip cache if debug mode)
    let metaAdsData = debugMode ? null : await getMetaAdsDataFromCache(event.eid);

    if (!metaAdsData) {
      // Fetch fresh data from Meta API
      metaAdsData = await fetchMetaAdsFromAPI(event.eid, debugMode);

      // Cache the result (unless in debug mode)
      if (!debugMode) {
        await cacheMetaAdsData(metaAdsData);
      }
    }
    
    // Update served count (increment by 1)
    const { data: cacheEntry } = await supabase
      .from('ai_analysis_cache')
      .select('served_count')
      .eq('event_id', event.eid)
      .eq('analysis_type', 'meta_ads')
      .single();

    if (cacheEntry) {
      await supabase
        .from('ai_analysis_cache')
        .update({
          served_count: (cacheEntry.served_count || 0) + 1,
          last_served_at: new Date().toISOString()
        })
        .eq('event_id', event.eid)
        .eq('analysis_type', 'meta_ads');
    }

    return new Response(JSON.stringify(metaAdsData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Cache-Hit': metaAdsData ? 'true' : 'false'
      }
    });

  } catch (error) {
    console.error('Meta Ads API Error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch Meta Ads data',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});// Force redeploy
