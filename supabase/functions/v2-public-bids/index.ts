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
  
  console.log(`[v2-public-bids] Starting request for eventId: ${eventId}`)

  try {
    if (!eventId) {
      console.error('[v2-public-bids] ERROR: No event ID provided in URL path')
      return new Response(JSON.stringify({ error: 'Event ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`[v2-public-bids] Calling generatePublicBidsData for: ${eventId}`)
    const bidsData = await generatePublicBidsData(eventId)
    
    console.log(`[v2-public-bids] SUCCESS: Generated data for ${eventId}`)
    return new Response(JSON.stringify(bidsData), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('[v2-public-bids] CRITICAL ERROR:', {
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

const generatePublicBidsData = async (eventId: string) => {
  console.log(`[generatePublicBidsData] Starting for eventId: ${eventId}`)
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  console.log(`[generatePublicBidsData] Getting event UUID for: ${eventId}`)
  
  // First get the event to get its UUID
  const { data: eventInfo, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('eid', eventId)
    .single()
  
  console.log(`[generatePublicBidsData] Event query result:`, {
    eventInfo: eventInfo,
    error: eventError
  })
  
  if (eventError || !eventInfo) {
    console.error(`[generatePublicBidsData] Event not found: ${eventId}`)
    throw new Error(`Event ${eventId} not found`)
  }
  
  console.log(`[generatePublicBidsData] Querying bids for event UUID: ${eventInfo.id}`)
  
  // Get bids by joining through art table
  const { data: bids, error } = await supabase
    .from('bids')
    .select(`
      art_id, 
      amount, 
      created_at,
      art!inner(event_id)
    `)
    .eq('art.event_id', eventInfo.id)
    .order('created_at', { ascending: false })
  
  console.log(`[generatePublicBidsData] Bids query result:`, {
    count: bids?.length || 0,
    error: error
  })
  
  if (error) {
    console.error(`[generatePublicBidsData] Bids query error:`, error)
    throw new Error(`Bids query failed: ${error.message}`)
  }
  
  console.log(`[generatePublicBidsData] Processing bids data`)
  const processedBids = processBidsForPublic(bids || [])
  
  return {
    bids: processedBids,
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