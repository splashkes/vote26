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

async function fetchMetaAdsFromAPI(eventEID: string) {
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
          'insights{spend,reach,clicks,actions,action_values}'
        ].join(','),
        filtering: JSON.stringify([{
          field: 'campaign.name',
          operator: 'CONTAIN',
          value: eventEID
        }]),
        limit: '100'
      });
      
      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) continue;
      
      const data = await response.json();
      
      if (!data.data || data.data.length === 0) continue;
      
      // Process the Meta API response
      const processedData = processMetaAPIResponse(data, eventEID, account.currency);
      
      if (processedData.campaigns.length > 0) {
        bestMatch = processedData;
        break;
      }
    } catch (error) {
      console.error(`Error fetching from account ${account.id}:`, error);
      continue;
    }
  }
  
  if (!bestMatch) {
    // Return empty data structure if no campaigns found
    return {
      event_eid: eventEID,
      total_spend: 0,
      total_budget: 0,
      total_reach: 0,
      total_clicks: 0,
      conversions: 0,
      conversion_value: 0,
      currency: 'USD',
      campaigns: [],
      adsets: [],
      last_updated: new Date().toISOString()
    };
  }
  
  return bestMatch;
}

function processMetaAPIResponse(data: any, eventEID: string, currency: string) {
  const campaigns: any = {};
  const adsets: any[] = [];
  let totalSpend = 0;
  let totalBudget = 0;
  let totalReach = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;
  
  for (const adset of data.data) {
    // Process campaign data
    if (adset.campaign && !campaigns[adset.campaign.id]) {
      campaigns[adset.campaign.id] = {
        id: adset.campaign.id,
        name: adset.campaign.name,
        spend: 0,
        reach: 0,
        clicks: 0
      };
    }
    
    // Process insights data
    const insights = adset.insights?.data?.[0];
    const spend = insights ? parseFloat(insights.spend || '0') : 0;
    const reach = insights ? parseInt(insights.reach || '0') : 0;
    const clicks = insights ? parseInt(insights.clicks || '0') : 0;
    
    // Process conversions (purchases)
    let conversions = 0;
    let conversionValue = 0;
    
    if (insights?.actions) {
      for (const action of insights.actions) {
        if (action.action_type === 'purchase' || action.action_type === 'offsite_conversion.fb_pixel_purchase') {
          conversions += parseInt(action.value || '0');
        }
      }
    }
    
    if (insights?.action_values) {
      for (const actionValue of insights.action_values) {
        if (actionValue.action_type === 'purchase' || actionValue.action_type === 'offsite_conversion.fb_pixel_purchase') {
          conversionValue += parseFloat(actionValue.value || '0');
        }
      }
    }
    
    // Add to campaign totals
    if (adset.campaign && campaigns[adset.campaign.id]) {
      campaigns[adset.campaign.id].spend += spend;
      campaigns[adset.campaign.id].reach += reach;
      campaigns[adset.campaign.id].clicks += clicks;
    }
    
    // Process budget
    let budget = 0;
    if (adset.lifetime_budget) {
      budget = parseFloat(adset.lifetime_budget) / 100; // Convert from cents
    } else if (adset.campaign?.lifetime_budget) {
      budget = parseFloat(adset.campaign.lifetime_budget) / 100;
    } else if (adset.daily_budget) {
      budget = parseFloat(adset.daily_budget) / 100 * 30; // Estimate monthly budget
    }
    
    // Add adset data
    adsets.push({
      id: adset.id,
      name: adset.name,
      campaign_name: adset.campaign?.name || '',
      spend,
      reach,
      clicks,
      status: adset.status
    });
    
    // Add to totals
    totalSpend += spend;
    totalBudget += budget;
    totalReach += reach;
    totalClicks += clicks;
    totalConversions += conversions;
    totalConversionValue += conversionValue;
  }
  
  return {
    event_eid: eventEID,
    total_spend: totalSpend,
    total_budget: totalBudget,
    total_reach: totalReach,
    total_clicks: totalClicks,
    conversions: totalConversions,
    conversion_value: totalConversionValue,
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
    const url = new URL(req.url);
    const eventIdentifier = url.pathname.split('/').pop();
    
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
    
    // Check cache first
    let metaAdsData = await getMetaAdsDataFromCache(event.eid);
    
    if (!metaAdsData) {
      // Fetch fresh data from Meta API
      metaAdsData = await fetchMetaAdsFromAPI(event.eid);
      
      // Cache the result
      await cacheMetaAdsData(metaAdsData);
    }
    
    // Update served count
    await supabase
      .from('ai_analysis_cache')
      .update({
        served_count: supabase.from('ai_analysis_cache').select('served_count').eq('event_id', event.eid).eq('analysis_type', 'meta_ads'),
        last_served_at: new Date().toISOString()
      })
      .eq('event_id', event.eid)
      .eq('analysis_type', 'meta_ads');

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
});