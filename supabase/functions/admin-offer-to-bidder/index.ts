// Admin Offer to Bidder Edge Function
// Allows event admins to offer artworks to specific bidders at their bid price
// Creates payment races between current winner and offered bidders

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
    // Initialize Supabase client using service role key for full access (no JWT required)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

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
            function_name: 'admin-offer-to-bidder',
            error_details: jsonError.message
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { art_id, bid_id, admin_note } = requestBody;

    // Validate required fields
    if (!art_id || !bid_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'art_id and bid_id are required',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-offer-to-bidder',
            received: { art_id, bid_id, admin_note }
          }
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get artwork details
    const { data: artwork, error: artError } = await supabase
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
        )
      `)
      .eq('id', art_id)
      .single()

    if (artError || !artwork) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Artwork not found',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-offer-to-bidder',
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

    // Get bid details and verify it exists
    const { data: bid, error: bidError } = await supabase
      .from('bids')
      .select(`
        id,
        art_id,
        person_id,
        amount,
        people (
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
      `)
      .eq('id', bid_id)
      .eq('art_id', art_id)
      .single()

    if (bidError || !bid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Bid not found for this artwork',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-offer-to-bidder',
            operation: 'SELECT bids',
            error_details: bidError,
            bid_id: bid_id,
            art_id: art_id
          }
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if bidder already has an active offer
    const { data: existingOffer, error: offerCheckError } = await supabase
      .from('artwork_offers')
      .select('id, status, expires_at')
      .eq('art_id', art_id)
      .eq('offered_to_person_id', bid.person_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (existingOffer) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This bidder already has an active offer for this artwork',
          existing_offer: {
            id: existingOffer.id,
            expires_at: existingOffer.expires_at
          }
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if bidder is already the current winner
    if (artwork.winner_id === bid.person_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This bidder is already the current winner'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create the artwork offer
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now

    const { data: newOffer, error: createError } = await supabase
      .from('artwork_offers')
      .insert({
        art_id: art_id,
        offered_to_person_id: bid.person_id,
        bid_id: bid_id,
        offered_amount: bid.amount,
        offered_by_admin: 'admin-function-no-auth',
        expires_at: expiresAt.toISOString(),
        admin_note: admin_note || null,
        metadata: {
          created_via: 'admin_function',
          artwork_code: artwork.art_code,
          current_winning_bid: artwork.current_bid,
          offered_bid_amount: bid.amount,
          event_eid: artwork.events.eid
        }
      })
      .select(`
        *,
        people (
          first_name,
          last_name,
          name,
          phone,
          phone_number,
          auth_phone,
          email,
          nickname
        )
      `)
      .single()

    if (createError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to create artwork offer in database',
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-offer-to-bidder',
            operation: 'INSERT artwork_offers',
            error_details: {
              message: createError.message,
              code: createError.code,
              details: createError.details,
              hint: createError.hint
            },
            insert_data: {
              art_id: art_id,
              offered_to_person_id: bid.person_id,
              bid_id: bid_id,
              offered_amount: bid.amount,
              expires_at: expiresAt.toISOString()
            }
          }
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get offer summary for response
    const bidderName = bid.people.first_name && bid.people.last_name
      ? `${bid.people.first_name} ${bid.people.last_name}`
      : bid.people.name || bid.people.nickname || 'Unknown Bidder'

    const bidderPhone = bid.people.phone || bid.people.phone_number || bid.people.auth_phone

    // Return success response with expected format
    return new Response(
      JSON.stringify({
        success: true,
        message: `Artwork offered to ${bidderName} for $${bid.amount}`,
        offer: {
          id: newOffer.id,
          art_id: art_id,
          art_code: artwork.art_code,
          offered_to_person_id: bid.person_id,
          bidder_name: bidderName,
          bidder_phone: bidderPhone,
          offered_amount: bid.amount,
          current_winning_bid: artwork.current_bid,
          expires_at: expiresAt.toISOString(),
          minutes_until_expiry: 15,
          admin_note: admin_note
        },
        race_info: {
          current_winner_can_pay: true,
          offered_bidder_can_pay: true,
          first_payment_wins: true,
          race_expires_at: expiresAt.toISOString()
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    // Return comprehensive debug information in response body
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error occurred in admin-offer-to-bidder function',
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-offer-to-bidder',
          error_type: error.constructor.name,
          error_message: error.message,
          error_stack: error.stack,
          error_name: error.name,
          request_info: {
            method: req.method,
            url: req.url,
            content_type: req.headers.get('content-type'),
            has_auth_header: !!req.headers.get('authorization')
          }
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})