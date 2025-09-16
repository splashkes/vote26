// Edge Function: admin-auction-data
// Provides admin auction details for broadcast version admin functionality
// Accepts EID format and returns auction timer status and admin auction details

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's JWT to verify their session
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    // Get user from JWT
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      console.error('[admin-auction-data] Invalid user token:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get EID from URL parameters
    const url = new URL(req.url)
    const eid = url.searchParams.get('eid')

    if (!eid) {
      return new Response(
        JSON.stringify({ error: 'EID parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse JWT to get admin_events claim
    const token = authHeader.replace('Bearer ', '')
    let adminEvents = {}
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      adminEvents = payload.admin_events || {}
    } catch (e) {
      console.error('[admin-auction-data] Failed to parse JWT:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JWT token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has admin permissions for this event
    if (!adminEvents[eid]) {
      console.error(`[admin-auction-data] User ${user.id} lacks admin permissions for event ${eid}`)
      return new Response(
        JSON.stringify({ error: 'Insufficient admin permissions for this event' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-auction-data] Fetching auction data for EID: ${eid}`)

    // Get event UUID from EID first
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, eid, name')
      .eq('eid', eid)
      .single()

    if (eventError || !eventData) {
      console.error(`[admin-auction-data] Event not found for EID ${eid}:`, eventError)
      return new Response(
        JSON.stringify({ error: 'Event not found', details: eventError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call the existing RPC functions with the UUID
    const [timerResult, auctionResult] = await Promise.allSettled([
      supabase.rpc('get_auction_timer_status', { event_id_param: eventData.id }),
      supabase.rpc('get_admin_auction_details', { event_id_param: eventData.id })
    ])

    let timerData = null
    let auctionData = null

    if (timerResult.status === 'fulfilled' && !timerResult.value.error) {
      timerData = timerResult.value.data
    } else {
      console.error('[admin-auction-data] Timer status error:', timerResult)
    }

    if (auctionResult.status === 'fulfilled' && !auctionResult.value.error) {
      auctionData = auctionResult.value.data
    } else {
      console.error('[admin-auction-data] Auction details error:', auctionResult)
    }

    const result = {
      event: {
        eid: eventData.eid,
        name: eventData.name,
        uuid: eventData.id
      },
      timer_status: timerData,
      auction_details: auctionData,
      timestamp: new Date().toISOString()
    }

    console.log(`[admin-auction-data] Successfully retrieved auction data for ${eid}`)

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('[admin-auction-data] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})