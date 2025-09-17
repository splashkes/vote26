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
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
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
    const { event_eid } = await req.json();
    if (!event_eid) {
      throw new Error('event_eid is required');
    }
    // Get event details with proper joins (handle NULL city_id)
    const { data: eventData, error: eventError } = await supabase.from('events').select(`
        id,
        eid,
        name,
        event_start_datetime,
        event_end_datetime,
        venue,
        city_id,
        applications_open,
        cities(name)
      `).eq('eid', event_eid).single();
    if (eventError) {
      console.error('Event query error:', eventError);
      throw new Error(`Failed to get event details: ${eventError.message}`);
    }
    if (!eventData) {
      throw new Error('Event not found');
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
