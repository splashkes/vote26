// Admin Send Payment Reminder Edge Function
// Sends SMS reminders to winning bidders with unpaid auction items

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
          error: 'Invalid JSON in request body',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            error_details: jsonError.message
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { art_id, admin_note } = requestBody;

    // Validate required fields
    if (!art_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'art_id is required',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            received: { art_id, admin_note }
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get artwork details and current winner (search by art_code if not UUID)
    let artworkQuery = supabase
      .from('art')
      .select(`
        id,
        art_code,
        status,
        current_bid,
        winner_id,
        event_id,
        round,
        easel,
        events (
          id,
          eid,
          name
        ),
        people!art_winner_id_fkey (
          id,
          first_name,
          last_name,
          name,
          phone,
          phone_number,
          auth_phone,
          email,
          nickname
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
          error: 'Artwork not found',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            operation: 'SELECT art',
            error_details: artError,
            art_id: art_id
          }
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

    // Check if artwork has a winner
    if (!artwork.winner_id || !artwork.people) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No winner found for this artwork',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            artwork_status: artwork.status,
            winner_id: artwork.winner_id
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if already paid
    if (artwork.status === 'paid') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This artwork is already paid for',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            artwork_status: artwork.status
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get bidder's phone number
    const bidder = artwork.people;
    const bidderPhone = bidder.phone || bidder.phone_number || bidder.auth_phone;

    if (!bidderPhone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No phone number found for the winning bidder',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            bidder_id: bidder.id,
            bidder_name: bidder.first_name || bidder.name || bidder.nickname
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Format event date
    const eventDate = artwork.events.start_date
      ? new Date(artwork.events.start_date).toLocaleDateString()
      : 'TBD';

    // Construct SMS message with buyer's first name at front
    const buyerFirstName = bidder.first_name || bidder.name?.split(' ')[0] || 'Bidder';
    const message = `${buyerFirstName}, you currently have unpaid auction items for ${artwork.events.eid} (${artwork.events.name}) on ${eventDate} - please log in via https://artb.art/event/${artwork.events.eid} and locate your work to pay. If you are unable to pay promptly please see the event host to make arrangements to secure your work.`;

    // Send SMS using existing send-sms function
    const smsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        to: bidderPhone,
        body: message
      })
    });

    const smsResult = await smsResponse.json();

    if (!smsResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send SMS reminder',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-send-payment-reminder',
            sms_error: smsResult,
            phone: bidderPhone,
            message_length: message.length
          }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Log the successful reminder to the database
    try {
      const { error: logError } = await supabase
        .from('payment_reminders')
        .insert({
          art_id: artwork.id,
          sent_to_person_id: bidder.id,
          sent_by_admin: user.id,
          message_content: message,
          phone_number: bidderPhone,
          sms_sid: smsResult.sid,
          sms_status: smsResult.status || 'sent',
          admin_note: admin_note,
          metadata: {
            event_eid: artwork.events.eid,
            art_code: artwork.art_code,
            message_length: message.length,
            function_call_time: new Date().toISOString()
          }
        });

      if (logError) {
        console.error('Failed to log payment reminder:', logError);
        // Don't fail the whole function if logging fails
      }
    } catch (logErr) {
      console.error('Error logging payment reminder:', logErr);
      // Don't fail the whole function if logging fails
    }

    // Get bidder name for response
    const bidderName = bidder.first_name && bidder.last_name
      ? `${bidder.first_name} ${bidder.last_name}`
      : bidder.name || bidder.nickname || 'Unknown Bidder';

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment reminder sent to ${bidderName} at ${bidderPhone}`,
        details: {
          art_id: art_id,
          art_code: artwork.art_code,
          event_eid: artwork.events.eid,
          bidder_name: bidderName,
          bidder_phone: bidderPhone,
          message_sent: message,
          sms_response: smsResult
        }
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
        error: 'Internal server error occurred in admin-send-payment-reminder function',
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-send-payment-reminder',
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