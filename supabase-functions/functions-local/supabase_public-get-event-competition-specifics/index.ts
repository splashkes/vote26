import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
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

    // Parse request - handle both GET and POST
    let eid: string | null = null;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      eid = url.searchParams.get('eid');
    } else if (req.method === 'POST') {
      try {
        const body = await req.json();
        // Support multiple parameter names for compatibility
        eid = body.eid || body.event_eid || body.eventEid || body.eventId || body.event_id;
      } catch (e) {
        console.error('Failed to parse JSON body:', e);
      }
    }

    console.log('Public function - received EID:', eid);

    if (!eid) {
      return new Response(
        JSON.stringify({
          error: 'Event ID (eid) is required',
          success: false,
          usage: 'Pass eid as query param (?eid=AB3032) or in JSON body'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Get event by EID
    console.log('Looking up event by EID:', eid);

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, eid, name')
      .eq('eid', eid)
      .single();

    if (eventError || !event) {
      console.error('Event lookup failed:', eventError);
      return new Response(
        JSON.stringify({
          error: `Event not found: ${eid}`,
          success: false
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    console.log('Found event:', event.id);

    // Get PUBLIC competition specifics for event with ordering
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
      .eq('event_id', event.id)
      .eq('competition_specifics.visibility', 'public') // Only public specifics
      .order('display_order');

    if (specificsError) {
      console.error('Error fetching event specifics:', specificsError);
      throw specificsError;
    }

    console.log('Found public specifics:', eventSpecifics?.length || 0);

    // Transform the data to a flatter structure
    const specifics = (eventSpecifics || [])
      .filter((es: any) => es.competition_specifics !== null)
      .map((es: any) => ({
        ...es.competition_specifics,
        display_order: es.display_order
      }));

    return new Response(
      JSON.stringify({
        success: true,
        event: {
          id: event.id,
          eid: event.eid,
          name: event.name
        },
        specifics
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in public-get-event-competition-specifics:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        success: false
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache' // Don't cache errors
        },
        status: 500
      }
    );
  }
});