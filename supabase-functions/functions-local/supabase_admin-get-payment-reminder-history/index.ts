// Admin Get Payment Reminder History Edge Function
// Returns payment reminder history for artwork

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client using service role key for full access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user is authenticated by parsing JWT directly
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let user, jwtPayload;
    try {
      const token = authHeader.replace('Bearer ', '');
      const payloadBase64 = token.split('.')[1];
      jwtPayload = JSON.parse(atob(payloadBase64));

      // Extract user info from JWT
      user = {
        id: jwtPayload.sub,
        phone: jwtPayload.phone
      };
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (jsonError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { art_id } = requestBody;

    // Validate required fields
    if (!art_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'art_id is required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get artwork details (search by art_code if not UUID)
    let artworkQuery = supabase
      .from('art')
      .select(`
        id,
        art_code,
        event_id,
        events (
          id,
          eid,
          name
        )
      `);

    // Check if art_id looks like a UUID or art_code
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(art_id)) {
      artworkQuery = artworkQuery.eq('id', art_id);
    } else {
      artworkQuery = artworkQuery.eq('art_code', art_id);
    }

    const { data: artwork, error: artError } = await artworkQuery.single()

    if (artError || !artwork) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Artwork not found'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if user is ABHQ super admin OR event admin with producer/super level
    let hasPermission = false;

    // Check ABHQ super admin
    const { data: abhqAdmin } = await supabase
      .from('abhq_admin_users')
      .select('level, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (abhqAdmin) {
      hasPermission = true;
    } else {
      // Check event admin permissions from JWT admin_events
      const adminEvents = jwtPayload.admin_events || {};

      // Get event EID from artwork
      const eventEid = artwork.events?.eid;
      if (eventEid && adminEvents[eventEid]) {
        const adminLevel = adminEvents[eventEid];
        if (adminLevel === 'producer' || adminLevel === 'super') {
          hasPermission = true;
        }
      }
    }

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payment reminder history
    const { data: reminders, error: reminderError } = await supabase
      .from('payment_reminders')
      .select(`
        id,
        message_content,
        phone_number,
        sms_sid,
        sms_status,
        admin_note,
        created_at,
        metadata,
        people!payment_reminders_sent_to_person_id_fkey (
          id,
          first_name,
          last_name,
          name,
          nickname
        )
      `)
      .eq('art_id', artwork.id)
      .order('created_at', { ascending: false });

    if (reminderError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to fetch reminder history'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        artwork: {
          id: artwork.id,
          art_code: artwork.art_code,
          event_eid: artwork.events.eid,
          event_name: artwork.events.name
        },
        reminders: reminders || [],
        total_reminders: (reminders || []).length,
        last_reminder_sent: reminders && reminders.length > 0 ? reminders[0].created_at : null
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    // Return comprehensive debug information
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error occurred in admin-get-payment-reminder-history function',
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-get-payment-reminder-history',
          error_type: error.constructor.name,
          error_message: error.message,
          error_stack: error.stack,
          error_name: error.name
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})