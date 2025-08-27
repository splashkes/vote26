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
    let city_ids = [], event_ids = [], rfm_filters = null, recent_message_hours = 72;
    try {
      const body = await req.json();
      city_ids = body.city_ids || [];
      event_ids = body.event_ids || [];
      rfm_filters = body.rfm_filters || null;
      recent_message_hours = body.recent_message_hours || 72;
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

    // Use efficient database function to get audience with proper JOINs
    // This avoids "414 Request-URI Too Large" errors from massive IN clauses
    const { data: people, error: queryError } = await serviceClient
      .rpc('get_sms_audience', {
        p_city_ids: city_ids.length > 0 ? city_ids : null,
        p_event_ids: event_ids.length > 0 ? event_ids : null,
        p_recent_message_hours: recent_message_hours
      });

    if (queryError) {
      throw new Error(`Database query failed: ${queryError.message}`);
    }

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

    // The database function already filtered out recent messages, so all people here are "available"
    // Now calculate counts and apply RFM filtering if needed
    const totalCount = people.length;
    const blockedCount = people.filter(p => p.message_blocked > 0).length;
    const availableCount = people.filter(p => p.message_blocked === 0).length;
    
    // Note: recent_message_count is not directly available since the DB function already filtered them out
    // We'll estimate it as the difference between what we would have gotten vs what we got
    const recentMessageCount = 0; // DB function already excluded these

    // Check RFM readiness if filters specified
    let rfmReadyCount = 0;
    let filteredPeople = people.filter(p => p.message_blocked === 0); // Start with available people

    if (rfm_filters) {
      const { 
        recency_min = 1, recency_max = 5,
        frequency_min = 1, frequency_max = 5, 
        monetary_min = 1, monetary_max = 5 
      } = rfm_filters;

      // Count people with current RFM scores (available people only)
      rfmReadyCount = filteredPeople.filter(p => {
        return p.has_rfm && 
               p.rfm_recency_score >= recency_min && p.rfm_recency_score <= recency_max &&
               p.rfm_frequency_score >= frequency_min && p.rfm_frequency_score <= frequency_max &&
               p.rfm_monetary_score >= monetary_min && p.rfm_monetary_score <= monetary_max;
      }).length;

      // Filter people based on RFM criteria
      filteredPeople = filteredPeople.filter(p => {
        if (!p.has_rfm) return false;
        
        return p.rfm_recency_score >= recency_min && p.rfm_recency_score <= recency_max &&
               p.rfm_frequency_score >= frequency_min && p.rfm_frequency_score <= frequency_max &&
               p.rfm_monetary_score >= monetary_min && p.rfm_monetary_score <= monetary_max;
      });
    }

    return new Response(JSON.stringify({
      success: true,
      total_count: totalCount,
      blocked_count: blockedCount,
      recent_message_count: recentMessageCount,
      recent_message_hours: recent_message_hours,
      available_count: availableCount,
      rfm_ready_count: rfmReadyCount,
      filtered_count: filteredPeople.length,
      needs_rfm_generation: rfm_filters && (rfmReadyCount < availableCount),
      people: filteredPeople.map(p => ({
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