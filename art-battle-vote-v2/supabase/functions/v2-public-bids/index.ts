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

  try {
    const url = new URL(req.url)
    const eventId = url.pathname.split('/').pop()
    
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'Event ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const bidsData = await generatePublicBidsData(eventId)
    
    return new Response(JSON.stringify(bidsData), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('V2 public bids function error:', error)
    return new Response(JSON.stringify({ 
      error: 'Internal server error'
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
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { data: bids, error } = await supabase
    .from('bids')
    .select('art_id, amount, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new Error(`Bids query failed: ${error.message}`)
  }
  
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