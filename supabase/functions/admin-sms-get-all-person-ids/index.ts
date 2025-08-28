// SMS Promotion System - Get All Person IDs for RFM Processing
// Date: August 27, 2025
// Purpose: Efficiently get all person IDs matching audience criteria for bulk RFM processing

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing Supabase configuration'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user is admin
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
    let city_ids = [], event_ids = [], recent_message_hours = 72;
    try {
      const body = await req.json();
      city_ids = body.city_ids || [];
      event_ids = body.event_ids || [];
      recent_message_hours = body.recent_message_hours || 72;
    } catch (parseError) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid JSON in request body'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all person IDs in efficient chunks (only IDs, not full records)
    let allPersonIds = [];
    let offset = 0;
    const pageSize = 1000; // Match what's actually being returned to ensure pagination works
    
    console.log(`Starting to fetch person IDs with filters: cities=${city_ids.length}, events=${event_ids.length}`);
    
    while (true) {
      console.log(`Fetching page at offset ${offset} with limit ${pageSize}`);
      
      // Try the IDs-only function first
      const { data: pageData, error: queryError } = await serviceClient
        .rpc('get_sms_audience_ids_only', {
          p_city_ids: city_ids.length > 0 ? city_ids : null,
          p_event_ids: event_ids.length > 0 ? event_ids : null,
          p_recent_message_hours: recent_message_hours,
          p_offset: offset,
          p_limit: pageSize
        });

      if (queryError) {
        console.log(`IDs-only function failed: ${queryError.message}, trying fallback`);
        
        // Fallback to the full function and extract IDs
        const { data: fullData, error: fallbackError } = await serviceClient
          .rpc('get_sms_audience_paginated', {
            p_city_ids: city_ids.length > 0 ? city_ids : null,
            p_event_ids: event_ids.length > 0 ? event_ids : null,
            p_recent_message_hours: recent_message_hours,
            p_offset: offset,
            p_limit: pageSize
          });

        if (fallbackError) {
          throw new Error(`Database query failed: ${fallbackError.message}`);
        }

        if (!fullData || fullData.length === 0) {
          console.log(`No more data from fallback at offset ${offset}`);
          break;
        }
        
        const pageIds = fullData.map(p => p.id);
        allPersonIds.push(...pageIds);
        console.log(`Got ${pageIds.length} IDs from fallback, total now: ${allPersonIds.length}`);
        
        if (fullData.length < pageSize) {
          console.log(`Less than pageSize returned (${fullData.length} < ${pageSize}), stopping`);
          break;
        }
      } else {
        if (!pageData || pageData.length === 0) {
          console.log(`No more data from IDs function at offset ${offset}`);
          break;
        }
        
        const pageIds = pageData.map(p => p.id);
        allPersonIds.push(...pageIds);
        console.log(`Got ${pageIds.length} IDs from optimized function, total now: ${allPersonIds.length}`);
        
        if (pageData.length < pageSize) {
          console.log(`Less than pageSize returned (${pageData.length} < ${pageSize}), stopping`);
          break;
        }
      }
      
      offset += pageSize;
      
      // Safety break
      if (allPersonIds.length > 1000000) {
        console.warn(`Very large dataset: ${allPersonIds.length} person IDs`);
        break;
      }
    }
    
    console.log(`Final result: ${allPersonIds.length} total person IDs`);
    console.log(`Request filters were: cities=${city_ids.length ? city_ids : 'ALL'}, events=${event_ids.length ? event_ids : 'ALL'}`);

    return new Response(JSON.stringify({
      success: true,
      person_ids: allPersonIds,
      total_count: allPersonIds.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-sms-get-all-person-ids:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});