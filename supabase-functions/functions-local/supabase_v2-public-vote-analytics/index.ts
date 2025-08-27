import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse URL to extract EID from path like /live/event/{eid}/vote-analytics
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const eid = pathParts[pathParts.indexOf('event') + 1]
    
    if (!eid) {
      return new Response(JSON.stringify({ error: 'Event ID (EID) required in path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate fresh data (nginx handles caching)
    const analyticsData = await generateVoteAnalyticsData(eid)
    
    return new Response(JSON.stringify(analyticsData), {
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error('Vote analytics function error:', error)
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

const generateVoteAnalyticsData = async (eid: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  // First get the UUID for this EID
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, eid, name, current_round')
    .eq('eid', eid)
    .single()
  
  if (eventError || !eventData) {
    throw new Error(`Event not found for EID: ${eid}`)
  }

  const eventId = eventData.id

  // Get weighted vote data using existing function
  const { data: voteWeights, error: weightsError } = await supabase
    .rpc('get_event_weighted_votes', { p_event_id: eventId })
  
  if (weightsError) {
    console.error('Error fetching vote weights:', weightsError)
    throw new Error(`Vote weights query failed: ${weightsError.message}`)
  }

  // Get vote range breakdown using existing function
  const { data: voteRanges, error: rangesError } = await supabase
    .rpc('get_event_vote_ranges', { p_event_id: eventId })
  
  if (rangesError) {
    console.error('Error fetching vote ranges:', rangesError)
    throw new Error(`Vote ranges query failed: ${rangesError.message}`)
  }

  // Get artwork details to enhance the data
  const { data: artworks, error: artError } = await supabase
    .from('art')
    .select(`
      id,
      art_code,
      round,
      easel,
      artist_profiles(name)
    `)
    .eq('event_id', eventId)
    .order('round', { ascending: true })
    .order('easel', { ascending: true })

  if (artError) {
    console.warn('Could not fetch artwork details:', artError)
  }

  // Create artwork lookup map
  const artworkMap = {}
  artworks?.forEach(artwork => {
    artworkMap[artwork.id] = {
      art_code: artwork.art_code,
      round: artwork.round,
      easel: artwork.easel,
      artist_name: artwork.artist_profiles?.[0]?.name || artwork.artist_profiles?.name || 'Unknown Artist'
    }
  })

  // Create artwork data compatible with existing artworksByRound format
  const artworksWithVoteData = {}
  
  voteWeights?.forEach(vote => {
    const ranges = voteRanges?.find(range => range.art_id === vote.art_id) || {}
    const artwork = artworkMap[vote.art_id] || {}
    
    if (artwork.round) {
      const roundKey = artwork.round.toString()
      if (!artworksWithVoteData[roundKey]) {
        artworksWithVoteData[roundKey] = []
      }
      
      artworksWithVoteData[roundKey].push({
        id: vote.art_id,
        art_code: artwork.art_code,
        round: artwork.round,
        easel: artwork.easel,
        // Data for existing UI - match the expected structure
        artist_profiles: { name: artwork.artist_name },
        totalVoteWeight: parseFloat(vote.weighted_vote_total) || 0,
        vote_count: parseInt(vote.raw_vote_count) || 0,
        voteRanges: {
          range_0_22: ranges.range_0_22 || 0,
          range_0_95: ranges.range_0_95 || 0,
          range_1_01: ranges.range_1_01 || 0,
          range_1_90: ranges.range_1_90 || 0,
          range_2_50: ranges.range_2_50 || 0,
          range_5_01: ranges.range_5_01 || 0,
          range_10_00: ranges.range_10_00 || 0,
          range_above_10: ranges.range_above_10 || 0
        }
      })
    }
  })

  // Sort artworks by vote weight within each round
  Object.keys(artworksWithVoteData).forEach(round => {
    artworksWithVoteData[round].sort((a, b) => 
      (b.totalVoteWeight || 0) - (a.totalVoteWeight || 0)
    )
  })

  return {
    artworksByRound: artworksWithVoteData,
    generated_at: new Date().toISOString(),
    server_time: Date.now()
  }
}