// SMS Promotion System - Audience Calculation
// Date: August 27, 2025  
// Purpose: Calculate promotion audience scope with city/event filtering (before RFM)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

serve(async (req) => {
  try {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing Supabase configuration',
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-sms-promotion-audience',
          supabaseUrl: !!supabaseUrl,
          supabaseServiceKey: !!supabaseServiceKey
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user is super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check admin status using service role client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: adminCheck, error: adminError } = await serviceClient
      .from('abhq_admin_users')
      .select('level')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (adminError || !adminCheck) {
      return new Response(JSON.stringify({ 
        error: 'Admin access required',
        details: adminError?.message 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    let city_ids = [], event_ids = [], rfm_filters = null, recent_message_hours = 72, ids_only = false;
    try {
      const body = await req.json();
      city_ids = body.city_ids || [];
      event_ids = body.event_ids || [];
      rfm_filters = body.rfm_filters || null;
      recent_message_hours = body.recent_message_hours || 72;
      ids_only = body.ids_only || false; // For campaign creation - return all IDs without details
    } catch (parseError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid JSON in request body',
        debug: {
          timestamp: new Date().toISOString(),
          error_type: parseError.constructor.name,
          error_message: parseError.message,
          function_name: 'admin-sms-promotion-audience'
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use pagination to fetch all results (Supabase JS client has internal limits)
    // Fetch in chunks of 1000 to avoid timeouts
    const chunkSize = 1000;
    const maxRecords = ids_only ? 100000 : 10000; // For IDs only, allow up to 100k; for UI display cap at 10k
    let allPeople = [];
    let offset = 0;
    let totalCount = 0;
    let hasMoreData = true;

    console.log(`Fetching audience with ids_only=${ids_only}, maxRecords=${maxRecords}`);

    while (hasMoreData && allPeople.length < maxRecords) {
      console.log(`=== Pagination Loop: offset=${offset}, allPeople.length=${allPeople.length}, maxRecords=${maxRecords}`);

      const requestedLimit = Math.min(chunkSize, maxRecords - allPeople.length);
      console.log(`Requesting ${requestedLimit} records from offset ${offset}`);

      const { data: pageData, error: queryError } = await serviceClient
        .rpc('get_sms_audience_paginated', {
          p_city_ids: city_ids.length > 0 ? city_ids : null,
          p_event_ids: event_ids.length > 0 ? event_ids : null,
          p_recent_message_hours: recent_message_hours,
          p_offset: offset,
          p_limit: requestedLimit
        });

      if (queryError) {
        console.error(`Database query failed at offset ${offset}:`, queryError);
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      console.log(`RPC returned: ${pageData ? pageData.length : 'null'} records`);

      if (!pageData || pageData.length === 0) {
        console.log(`No more data at offset ${offset} - stopping pagination`);
        hasMoreData = false;
        break;
      }

      // Get total count from first record (all records have this) - for display only
      if (totalCount === 0 && pageData.length > 0 && pageData[0].total_count) {
        totalCount = pageData[0].total_count;
        console.log(`Total count from DB: ${totalCount}`);
      }

      allPeople = allPeople.concat(pageData);
      console.log(`✓ Concatenated ${pageData.length} records, total so far: ${allPeople.length}`);

      // Update offset for next iteration
      offset += pageData.length;
      console.log(`✓ Updated offset to ${offset} for next iteration`);

      // Check if we should continue - ONLY stop if we got less than requested
      // Do NOT rely on total_count as it may be incorrect with complex filters
      if (pageData.length < chunkSize) {
        console.log(`! Got ${pageData.length} records which is less than chunk size ${chunkSize} - stopping pagination (no more data)`);
        hasMoreData = false;
      } else {
        console.log(`✓ Got full chunk of ${pageData.length} records - will continue to next page`);
      }

      // Stop if we've reached our max
      if (allPeople.length >= maxRecords) {
        console.log(`! Reached max records limit of ${maxRecords} - stopping pagination`);
        allPeople = allPeople.slice(0, maxRecords);
        hasMoreData = false;
      }
    }

    console.log(`=== PAGINATION COMPLETE: ${allPeople.length} total records retrieved ===`);

    const people = allPeople;

    if (!people || people.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        total_count: 0,
        blocked_count: 0,
        recent_message_count: 0,
        recent_message_hours: recent_message_hours,
        available_count: 0,
        rfm_ready_count: 0,
        filtered_count: 0,
        needs_rfm_generation: false,
        people: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use actual total count from database, but calculate other stats from sample
    const sampleCount = people.length;
    const blockedCountInSample = people.filter(p => p.message_blocked > 0).length;
    const availableCountInSample = people.filter(p => p.message_blocked === 0).length;
    
    // Estimate proportions from sample, but use actual total count
    const blockedCount = sampleCount > 0 ? Math.round((blockedCountInSample / sampleCount) * totalCount) : 0;

    // Calculate how many people were excluded due to recent messages
    // Query again WITHOUT the recent message filter to get the difference
    let recentMessageCount = 0;
    if (recent_message_hours > 0) {
      const { data: withoutRecent, error: withoutRecentError } = await serviceClient
        .rpc('get_sms_audience_paginated', {
          p_city_ids: city_ids.length > 0 ? city_ids : null,
          p_event_ids: event_ids.length > 0 ? event_ids : null,
          p_recent_message_hours: 0, // Disable the recent message filter
          p_offset: 0,
          p_limit: 1
        });

      if (!withoutRecentError && withoutRecent && withoutRecent.length > 0) {
        const totalWithoutFilter = withoutRecent[0].total_count;
        recentMessageCount = Math.max(0, totalWithoutFilter - totalCount);
      }
    }

    const availableCount = totalCount - blockedCount;

    // Check RFM readiness if filters specified
    let rfmReadyCount = 0;
    const availablePeople = people.filter(p => p.message_blocked === 0);
    let filteredPeople = availablePeople; // For count, only available people
    let estimatedFilteredCount = availableCount; // Start with all available people

    if (rfm_filters) {
      const {
        recency_min = 1, recency_max = 5,
        frequency_min = 1, frequency_max = 5,
        monetary_min = 1, monetary_max = 5
      } = rfm_filters;

      // Count people with current RFM scores (available people only)
      rfmReadyCount = availablePeople.filter(p => {
        return p.has_rfm &&
               p.rfm_recency_score >= recency_min && p.rfm_recency_score <= recency_max &&
               p.rfm_frequency_score >= frequency_min && p.rfm_frequency_score <= frequency_max &&
               p.rfm_monetary_score >= monetary_min && p.rfm_monetary_score <= monetary_max;
      }).length;

      // Filter people based on RFM criteria (available only)
      filteredPeople = availablePeople.filter(p => {
        if (!p.has_rfm) return false;

        return p.rfm_recency_score >= recency_min && p.rfm_recency_score <= recency_max &&
               p.rfm_frequency_score >= frequency_min && p.rfm_frequency_score <= frequency_max &&
               p.rfm_monetary_score >= monetary_min && p.rfm_monetary_score <= monetary_max;
      });

      // Estimate actual filtered count from sample proportion
      if (availableCountInSample > 0) {
        const rfmFilteredProportion = filteredPeople.length / availableCountInSample;
        estimatedFilteredCount = Math.round(availableCount * rfmFilteredProportion);
      } else {
        estimatedFilteredCount = 0;
      }
    }

    // Return ALL people (both blocked and available) for display in modal
    // But filtered_count only includes available people who match criteria

    // If ids_only=true, return ONLY filtered people (not all people!)
    // This is for campaign creation - should match the filtered_count
    if (ids_only) {
      console.log(`=== IDS_ONLY MODE RESPONSE ===`);
      console.log(`Total records fetched: ${people.length}`);
      console.log(`After filtering (non-blocked): ${filteredPeople.length}`);

      return new Response(JSON.stringify({
        success: true,
        total_count: totalCount,
        filtered_count: filteredPeople.length, // Use actual filtered count, not estimated
        people: filteredPeople.map(p => ({
          id: p.id,
          blocked: p.message_blocked > 0
        })),
        debug: { // Debug info visible in browser console
          records_fetched: people.length,
          records_after_filter: filteredPeople.length,
          pagination_worked: people.length > 1000 ? 'YES' : (people.length === 1000 ? 'MAYBE - hit 1000 limit' : 'N/A')
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Full response for UI display
    return new Response(JSON.stringify({
      success: true,
      total_count: totalCount,
      blocked_count: blockedCount,
      recent_message_count: recentMessageCount,
      recent_message_hours: recent_message_hours,
      available_count: availableCount,
      rfm_ready_count: rfmReadyCount,
      filtered_count: estimatedFilteredCount,
      needs_rfm_generation: availableCount > 0 && (rfmReadyCount < availableCount),
      people: people.map(p => ({  // Return ALL people, not just filtered
        id: p.id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
        phone: p.phone,
        blocked: p.message_blocked > 0,
        has_rfm: p.has_rfm
      }))
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Catch all errors and ensure CORS headers are always sent
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
      debug: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name,
        stack: error.stack,
        function_name: 'admin-sms-promotion-audience'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});