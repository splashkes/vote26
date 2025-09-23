import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Create supabase client for reading public event data
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? ''
          }
        }
      }
    )

    // Light authentication - just verify a valid auth header exists
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authentication required');
    }

    // Optional: verify the token is valid (but don't fail if user extraction fails)
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      console.log('Authenticated user requesting event details:', user?.id || 'unknown');
    } catch (authError) {
      console.log('Auth verification failed, but continuing since this is public data:', authError);
    }
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Request body received:', requestBody);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      throw new Error('Invalid JSON in request body');
    }

    const { event_eid, filter_future_only = false } = requestBody;
    if (!event_eid) {
      console.error('Missing event_eid in request:', requestBody);
      throw new Error('event_eid is required');
    }
    // Get event details with proper joins (handle NULL city_id)
    let query = supabase.from('events').select(`
        id,
        eid,
        name,
        event_start_datetime,
        event_end_datetime,
        venue,
        city_id,
        applications_open,
        cities(name)
      `).eq('eid', event_eid);

    // If filtering for future events only, add date filter
    if (filter_future_only) {
      query = query.gte('event_start_datetime', new Date().toISOString());
    }

    const { data: eventData, error: eventError } = await query.single();
    if (eventError) {
      console.error('Event query error:', eventError);
      if (eventError.code === 'PGRST116') {
        // No rows found - event doesn't exist
        console.log(`Event ${event_eid} not found, returning null event data`);
        return new Response(JSON.stringify({
          success: true,
          event: null,
          message: `Event ${event_eid} not found`
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 200
        });
      }
      throw new Error(`Failed to get event details: ${eventError.message}`);
    }
    if (!eventData) {
      console.log(`Event ${event_eid} not found, returning null event data`);
      return new Response(JSON.stringify({
        success: true,
        event: null,
        message: `Event ${event_eid} not found`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    // Format the response properly
    const response = {
      id: eventData.id,
      eid: eventData.eid,
      name: eventData.name,
      event_start_datetime: eventData.event_start_datetime,
      event_end_datetime: eventData.event_end_datetime,
      venue: eventData.venue,
      applications_open: eventData.applications_open,
      city: eventData.cities?.name || null
    };
    return new Response(JSON.stringify({
      success: true,
      event: response
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in get-event-details-for-artist-profile:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
