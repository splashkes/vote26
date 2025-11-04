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
    // Fetch in chunks of 5000 until we have all data
    const chunkSize = 5000;
    const maxRecords = ids_only ? 100000 : 10000; // For IDs only, allow up to 100k; for UI display cap at 10k
    let allPeople = [];
    let offset = 0;
    let totalCount = 0;

    while (allPeople.length < maxRecords) {
      const { data: pageData, error: queryError } = await serviceClient
        .rpc('get_sms_audience_paginated', {
          p_city_ids: city_ids.length > 0 ? city_ids : null,
          p_event_ids: event_ids.length > 0 ? event_ids : null,
          p_recent_message_hours: recent_message_hours,
          p_offset: offset,
          p_limit: chunkSize
        });

      if (queryError) {
        throw new Error(`Database query failed: ${queryError.message}`);
      }

      if (!pageData || pageData.length === 0) {
        break; // No more data
      }

      // Get total count from first record
      if (totalCount === 0 && pageData.length > 0) {
        totalCount = pageData[0].total_count;
      }

      allPeople = allPeople.concat(pageData);
      offset += chunkSize;

      // Stop if we got fewer records than requested (means we're done)
      if (pageData.length < chunkSize) {
        break;
      }

      // Stop if we've reached our max
      if (allPeople.length >= maxRecords) {
        allPeople = allPeople.slice(0, maxRecords);
        break;
      }
    }

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
    const availableCount = totalCount - blockedCount;
    
    // Note: recent_message_count is not directly available since the DB function already filtered them out
    // We'll estimate it as the difference between what we would have gotten vs what we got
    const recentMessageCount = 0; // DB function already excluded these

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

    // If ids_only=true, return minimal data for campaign creation (all records, just IDs)
    if (ids_only) {
      return new Response(JSON.stringify({
        success: true,
        total_count: totalCount,
        filtered_count: estimatedFilteredCount,
        people: people.map(p => ({
          id: p.id,
          blocked: p.message_blocked > 0
        }))
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
      needs_rfm_generation: rfm_filters && (rfmReadyCount < availableCount),
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