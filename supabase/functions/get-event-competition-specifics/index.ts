import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Log request details
  console.log('Request method:', req.method);
  console.log('Request headers:', Object.fromEntries(req.headers.entries()));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check if admin is authenticated
    const authHeader = req.headers.get('Authorization');
    let isAdmin = false;
    let supabase;

    if (authHeader) {
      // Try to verify if this is an admin user
      const tempSupabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await tempSupabase.auth.getUser(token);

      if (!authError && user) {
        // Check if user is an admin
        const { data: adminData } = await tempSupabase
          .from('abhq_admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .eq('active', true)
          .maybeSingle();

        if (adminData) {
          isAdmin = true;
          console.log('Admin user detected:', user.email);
        }
      }
    }

    // Use SERVICE_ROLE_KEY for admins (to see artists_only content)
    // Use ANON_KEY for public users (only see public content)
    supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      isAdmin ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' : Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    console.log('Using', isAdmin ? 'SERVICE_ROLE_KEY (admin)' : 'ANON_KEY (public)');

    // Parse request body safely
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error('Failed to parse JSON body:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { event_id, event_eid, eventId: passedEventId, eventEid } = body || {};

    // Support multiple parameter names for compatibility
    const eid = event_eid || eventEid || passedEventId || event_id; // passedEventId might be an EID from broadcast app

    console.log('Received parameters:', { event_id, event_eid, eventId: passedEventId, eventEid, resolved_eid: eid });

    if (!eid) {
      return new Response(
        JSON.stringify({ error: 'event_eid is required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get event UUID by EID
    let eventId;

    // Check if eid looks like a UUID (has dashes) or an EID (starts with AB)
    const isUUID = eid.includes('-');

    if (isUUID) {
      // If it's a UUID, use it directly
      eventId = eid;
      console.log('Using UUID directly:', eventId);
    } else {
      // Otherwise, look it up by EID
      console.log('Looking up event by EID:', eid);

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('eid', eid)
        .single();

      if (eventError || !event) {
        console.error('Event lookup failed:', eventError);
        return new Response(
          JSON.stringify({ error: `Event not found with EID: ${eid}`, success: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      eventId = event.id;
      console.log('Found event UUID:', eventId);
    }

    // Get competition specifics for event with ordering
    console.log('Fetching specifics for event_id:', eventId);

    const { data: eventSpecifics, error: specificsError } = await supabase
      .from('event_competition_specifics')
      .select(`
        display_order,
        competition_specifics (
          id,
          name,
          content,
          visibility,
          version,
          updated_at
        )
      `)
      .eq('event_id', eventId)
      .order('display_order');

    if (specificsError) {
      console.error('Error fetching event specifics:', specificsError);
      throw specificsError;
    }

    console.log('Found specifics:', eventSpecifics?.length || 0);

    // Transform the data to a flatter structure - handle null competition_specifics
    const specifics = (eventSpecifics || [])
      .filter((es: any) => es.competition_specifics !== null)
      .map((es: any) => ({
        ...es.competition_specifics,
        display_order: es.display_order
      }));

    console.log('Returning specifics:', specifics.length);

    return new Response(
      JSON.stringify({
        success: true,
        specifics
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in get-event-competition-specifics:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      details: error.details
    });

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        success: false,
        details: error.details || null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
