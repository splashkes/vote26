import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const eid = pathParts[pathParts.length - 1]

    if (!eid) {
      return new Response(
        JSON.stringify({ error: 'Event ID (EID) required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get event details with city lookup
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        id, 
        eid, 
        name, 
        venue, 
        current_round, 
        event_start_datetime,
        cities (
          name
        )
      `)
      .eq('eid', eid)
      .single()

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get city from database lookup
    const eventName = event.name || ''
    const city = event.cities?.name || 'Unknown'

    // Get rounds with closing times within 30 minutes
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000)
    
    const { data: rounds, error: roundsError } = await supabase
      .from('rounds')
      .select(`
        id,
        round_number,
        closing_time,
        round_contestants (
          id,
          artist_id,
          easel_number
        )
      `)
      .eq('event_id', event.id)
      .not('closing_time', 'is', null)
      .lt('closing_time', thirtyMinutesFromNow.toISOString())
      .order('closing_time', { ascending: true })

    if (roundsError) {
      console.error('Rounds query error:', roundsError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch rounds',
          details: roundsError.message,
          code: roundsError.code,
          event_id: event.id
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Process rounds data
    const processedRounds = rounds?.map(round => ({
      round: round.round_number,
      closing_time: round.closing_time,
      artists: round.round_contestants?.length || 0,
      contestants: round.round_contestants?.map(contestant => ({
        easel: contestant.easel_number,
        artist_name: 'Artist ' + (contestant.easel_number || 'TBD')
      })) || []
    })) || []

    // Find the active round (earliest closing time within 30 minutes)
    const now = Date.now()
    const activeRound = processedRounds.find(round => {
      const closingTime = new Date(round.closing_time).getTime()
      return closingTime > now && closingTime <= now + (30 * 60 * 1000)
    })

    // Get auction closing times for active artworks
    const { data: auctions, error: auctionError } = await supabase
      .from('art')
      .select('closing_time, current_bid, status')
      .eq('event_id', event.id)
      .eq('status', 'active')
      .not('closing_time', 'is', null)
      .order('closing_time', { ascending: true })

    let auctionTimes = null
    if (auctions && auctions.length > 0) {
      const closingTimes = auctions.map(a => new Date(a.closing_time).getTime())
      const earliest = Math.min(...closingTimes)
      const latest = Math.max(...closingTimes)
      
      auctionTimes = {
        earliest: new Date(earliest).toISOString(),
        latest: new Date(latest).toISOString(),
        count: auctions.length,
        same_time: earliest === latest
      }
    }

    const response = {
      event: {
        eid: event.eid,
        name: eventName,
        city: city,
        venue: event.venue || 'Unknown Venue',
        current_round: event.current_round,
        event_start: event.event_start_datetime
      },
      rounds: processedRounds,
      active_round: activeRound || null,
      auction_times: auctionTimes,
      timestamp: new Date().toISOString(),
      has_active_timers: processedRounds.length > 0
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})