// Edge Function: admin-rounds-data
// Provides rounds data for broadcast version admin functionality
// Accepts EID format and returns rounds with contestants and artist profiles

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
      console.error('[admin-rounds-data] Invalid user token:', userError)
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
      console.error('[admin-rounds-data] Failed to parse JWT:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JWT token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has admin permissions for this event
    if (!adminEvents[eid]) {
      console.error(`[admin-rounds-data] User ${user.id} lacks admin permissions for event ${eid}`)
      return new Response(
        JSON.stringify({ error: 'Insufficient admin permissions for this event' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-rounds-data] Fetching rounds data for EID: ${eid}`)

    // Get event UUID from EID first
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, eid, name')
      .eq('eid', eid)
      .single()

    if (eventError || !eventData) {
      console.error(`[admin-rounds-data] Event not found for EID ${eid}:`, eventError)
      return new Response(
        JSON.stringify({ error: 'Event not found', details: eventError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get rounds data with contestants and artist profiles
    const { data: roundsData, error: roundsError } = await supabase
      .from('rounds')
      .select(`
        id,
        round_number,
        closing_time,
        round_contestants (
          id,
          easel_number,
          is_winner,
          artist_id,
          artist_profiles (
            id,
            name,
            city_text,
            instagram,
            entry_id
          )
        )
      `)
      .eq('event_id', eventData.id)
      .order('round_number', { ascending: true })

    if (roundsError) {
      console.error(`[admin-rounds-data] Error fetching rounds:`, roundsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rounds data', details: roundsError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = {
      event: {
        eid: eventData.eid,
        name: eventData.name,
        uuid: eventData.id
      },
      rounds: roundsData || [],
      timestamp: new Date().toISOString()
    }

    console.log(`[admin-rounds-data] Successfully retrieved ${roundsData?.length || 0} rounds for ${eid}`)

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('[admin-rounds-data] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})