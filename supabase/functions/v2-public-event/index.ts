import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const url = new URL(req.url)
  const eventId = url.pathname.split('/').pop()
  
  console.log(`[v2-public-event] Starting request for eventId: ${eventId}`)

  try {
    if (!eventId) {
      console.error('[v2-public-event] ERROR: No event ID provided in URL path')
      return new Response(JSON.stringify({ error: 'Event ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`[v2-public-event] Calling generatePublicEventData for: ${eventId}`)
    const eventData = await generatePublicEventData(eventId)
    
    console.log(`[v2-public-event] SUCCESS: Generated data for ${eventId}`)
    return new Response(JSON.stringify(eventData), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('[v2-public-event] CRITICAL ERROR:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      eventId: eventId,
      url: req.url,
      timestamp: new Date().toISOString()
    })
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      debug: {
        message: error.message,
        eventId: eventId,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})

const generatePublicEventData = async (eventId: string) => {
  console.log(`[generatePublicEventData] Starting for eventId: ${eventId}`)
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  console.log(`[generatePublicEventData] Supabase client created, querying events table`)
  
  // First get the event to get its UUID
  const { data: eventInfo, error: eventError } = await supabase
    .from('events')
    .select('id, eid, name, description, event_start_datetime, venue')
    .eq('eid', eventId)
    .single()
  
  console.log(`[generatePublicEventData] Event query result:`, {
    eventInfo: eventInfo,
    error: eventError
  })
  
  if (eventError) {
    console.error(`[generatePublicEventData] Event query error:`, eventError)
    throw new Error(`Event query failed: ${eventError.message}`)
  }
  
  if (!eventInfo) {
    console.error(`[generatePublicEventData] No event found for: ${eventId}`)
    throw new Error(`Event ${eventId} not found`)
  }
  
  console.log(`[generatePublicEventData] Found event UUID: ${eventInfo.id}`)
  
  console.log(`[generatePublicEventData] Querying artworks for event UUID: ${eventInfo.id}`)
  
  // Get artworks with artist profiles using correct join
  const { data: artworks, error: artworksError } = await supabase
    .from('art')
    .select(`
      id,
      art_code,
      description,
      status,
      easel,
      created_at,
      artist_profiles (
        id,
        name,
        bio,
        instagram,
        website
      )
    `)
    .eq('event_id', eventInfo.id)
    .order('easel')
  
  console.log(`[generatePublicEventData] Artworks query result:`, {
    count: artworks?.length || 0,
    error: artworksError
  })
  
  if (artworksError) {
    console.error(`[generatePublicEventData] Artworks query error:`, artworksError)
    throw new Error(`Artworks query failed: ${artworksError.message}`)
  }
  
  console.log(`[generatePublicEventData] Querying bids for event UUID: ${eventInfo.id}`)
  
  // Get bids for this event by joining through art table
  const { data: currentBids, error: bidsError } = await supabase
    .from('bids')
    .select(`
      art_id, 
      amount, 
      created_at,
      art!inner(event_id)
    `)
    .eq('art.event_id', eventInfo.id)
    .order('created_at', { ascending: false })
  
  console.log(`[generatePublicEventData] Bids query result:`, {
    count: currentBids?.length || 0,
    error: bidsError
  })
  
  if (bidsError) {
    console.error(`[generatePublicEventData] Bids query error:`, bidsError)
    throw new Error(`Bids query failed: ${bidsError.message}`)
  }

  console.log(`[generatePublicEventData] Processing bids data`)
  const processedBids = processBidsForPublic(currentBids || [])
  
  console.log(`[generatePublicEventData] Calling get_voting_summary RPC for UUID: ${eventInfo.id}`)
  
  // Get vote summary using the correct UUID
  const { data: voteSummary, error: voteError } = await supabase.rpc('get_voting_summary', { 
    p_event_id: eventInfo.id 
  })
  
  console.log(`[generatePublicEventData] Vote summary result:`, {
    data: voteSummary,
    error: voteError
  })
  
  if (voteError) {
    console.warn(`[generatePublicEventData] Vote summary failed: ${voteError.message}`)
  }
  
  return {
    event: eventInfo,
    artworks: artworks || [],
    vote_summary: voteSummary || [],
    current_bids: processedBids,
    generated_at: new Date().toISOString()
  }
}

const processBidsForPublic = (bids: any[]) => {
  const bidMap = new Map()
  
  for (const bid of bids) {
    const artId = bid.art_id
    const existing = bidMap.get(artId)
    
    if (!existing || bid.amount > existing.amount) {
      bidMap.set(artId, {
        art_id: artId,
        current_bid: bid.amount,
        bid_time: bid.created_at,
        bid_count: bids.filter(b => b.art_id === artId).length
      })
    }
  }
  
  return Array.from(bidMap.values())
}