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

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header', success: false }),
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

    // Verify user is producer or super admin via abhq_admin_users table
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('email, level, active')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle();

    if (adminError || !adminUser || !['producer', 'super'].includes(adminUser.level)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - requires producer or super admin role', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get request body
    const body = await req.json();
    const { event_id, event_eid, specifics } = body;

    // Validate inputs
    if (!event_id && !event_eid) {
      return new Response(
        JSON.stringify({ error: 'event_id or event_eid is required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!Array.isArray(specifics)) {
      return new Response(
        JSON.stringify({ error: 'specifics must be an array', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get event ID if only EID is provided
    let eventId = event_id;
    if (!eventId && event_eid) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('eid', event_eid)
        .single();

      if (eventError || !event) {
        return new Response(
          JSON.stringify({ error: 'Event not found', success: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      eventId = event.id;
    }

    // Validate specifics array
    for (const spec of specifics) {
      if (!spec.competition_specific_id) {
        return new Response(
          JSON.stringify({ error: 'Each specific must have a competition_specific_id', success: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      if (typeof spec.display_order !== 'number') {
        return new Response(
          JSON.stringify({ error: 'Each specific must have a numeric display_order', success: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Delete existing event_competition_specifics for this event
    const { error: deleteError } = await supabase
      .from('event_competition_specifics')
      .delete()
      .eq('event_id', eventId);

    if (deleteError) {
      throw deleteError;
    }

    // Insert new event_competition_specifics
    if (specifics.length > 0) {
      // Check if user exists in people table
      const { data: person } = await supabase
        .from('people')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      const inserts = specifics.map(spec => {
        const record: any = {
          event_id: eventId,
          competition_specific_id: spec.competition_specific_id,
          display_order: spec.display_order
        };

        // Only add created_by if person exists
        if (person) {
          record.created_by = user.id;
        }

        return record;
      });

      const { error: insertError } = await supabase
        .from('event_competition_specifics')
        .insert(inserts);

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }
    }

    // Return updated specifics
    const { data: updatedSpecifics, error: fetchError } = await supabase
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

    if (fetchError) {
      throw fetchError;
    }

    // Transform the data
    const result = (updatedSpecifics || []).map((es: any) => ({
      ...es.competition_specifics,
      display_order: es.display_order
    }));

    return new Response(
      JSON.stringify({
        success: true,
        specifics: result
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in set-event-competition-specifics:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
