import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get auth token - required for artists
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid auth token', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

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

    console.log('Artist function - received EID:', eid, 'User:', user.email);

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
        .select('id, eid, name')
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

    // Get competition specifics for event - artists can see both public AND artists_only
    console.log('Fetching specifics for event_id:', eventId);

    const { data: eventSpecifics, error: specificsError } = await supabase
      .from('event_competition_specifics')
      .select(`
        display_order,
        competition_specifics!inner (
          id,
          name,
          content,
          visibility,
          version,
          updated_at
        )
      `)
      .eq('event_id', eventId)
      .in('competition_specifics.visibility', ['public', 'artists_only']) // Artists can see both
      .order('display_order');

    if (specificsError) {
      console.error('Error fetching event specifics:', specificsError);
      throw specificsError;
    }

    console.log('Found specifics for artist:', eventSpecifics?.length || 0);

    // Get full event info for response
    const { data: eventInfo } = await supabase
      .from('events')
      .select('id, eid, name')
      .eq('id', eventId)
      .single();

    // Transform the data to a flatter structure - handle null competition_specifics
    const specifics = (eventSpecifics || [])
      .filter((es: any) => es.competition_specifics !== null)
      .map((es: any) => ({
        ...es.competition_specifics,
        display_order: es.display_order
      }));

    // Log the view for audit tracking (non-blocking - don't fail if logging fails)
    try {
      // Try to find the artist profile for this user
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('person_id', user.id)
        .eq('is_primary', true)
        .maybeSingle();

      // Get request metadata
      const userAgent = req.headers.get('user-agent') || null;
      const forwardedFor = req.headers.get('x-forwarded-for');
      const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : null;

      await supabase
        .from('competition_specifics_view_log')
        .insert({
          artist_profile_id: artistProfile?.id || null,
          event_id: eventId,
          user_id: user.id,
          user_email: user.email,
          event_eid: eventInfo?.eid || eid,
          event_name: eventInfo?.name || null,
          specifics_viewed: specifics.map((s: any) => ({
            id: s.id,
            name: s.name,
            visibility: s.visibility,
            version: s.version
          })),
          specifics_count: specifics.length,
          ip_address: ipAddress,
          user_agent: userAgent
        });

      console.log('Logged competition specifics view for user:', user.email, 'event:', eventInfo?.eid);
    } catch (logError) {
      // Don't fail the request if logging fails
      console.error('Failed to log competition specifics view:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        event: eventInfo || { id: eventId },
        specifics
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in artist-get-event-competition-specifics:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
