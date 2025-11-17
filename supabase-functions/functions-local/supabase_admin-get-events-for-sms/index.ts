// Edge function to get events for SMS marketing
// Replaces slow RPC calls with direct queries

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check auth
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

    // Parse request
    const { city_id, min_registrations = 10 } = await req.json();

    let result;

    if (city_id === 'GET_ALL_CITIES') {
      // Get all cities with their event counts (events that have people)
      const { data, error } = await supabase
        .rpc('get_cities_with_event_people_counts', { p_min_people: min_registrations });

      if (error) throw error;

      result = {
        success: true,
        cities: data || []
      };
    } else if (city_id === 'NO_CITY') {
      // Get events without city (with registration counts)
      // Use the existing database function
      const { data, error } = await supabase
        .rpc('get_events_without_city_with_registrations', { min_registrations });

      if (error) throw error;

      result = {
        success: true,
        count: data?.length || 0,
        events: data || []
      };
    } else if (city_id === 'COUNT_NO_CITY') {
      // Just count events without city
      const { data, error } = await supabase
        .rpc('count_events_without_city_with_registrations', { min_registrations });

      if (error) throw error;

      result = {
        success: true,
        count: data || 0
      };
    } else {
      // Get events for specific city WITH people counts
      // Query combines registrations + QR scans
      const { data, error } = await supabase
        .rpc('get_events_with_people_counts_by_city', {
          p_city_id: city_id,
          p_min_people: min_registrations
        });

      if (error) throw error;

      result = {
        success: true,
        count: data?.length || 0,
        events: data || []
      };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
