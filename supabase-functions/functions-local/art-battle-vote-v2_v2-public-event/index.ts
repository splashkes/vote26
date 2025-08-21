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

    const eventData = await generatePublicEventData(eventId)
    
    return new Response(JSON.stringify(eventData), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('V2 public event function error:', error)
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

const generatePublicEventData = async (eventId: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const [eventInfo, artworks, currentBids] = await Promise.all([
    supabase
      .from('events')
      .select('eid, name, description, event_date, status, location')
      .eq('eid', eventId)
      .single(),
    
    supabase
      .from('art')
      .select(`
        id,
        uuid,
        title,
        description,
        status,
        easel,
        created_at,
        artist_profiles!inner(
          id,
          display_name,
          bio,
          profile_image_url
        )
      `)
      .eq('event_id', eventId)
      .order('easel'),
    
    supabase
      .from('bids')
      .select('art_id, amount, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
  ])
  
  if (eventInfo.error) throw new Error(`Event query failed: ${eventInfo.error.message}`)
  if (artworks.error) throw new Error(`Artworks query failed: ${artworks.error.message}`)
  if (currentBids.error) throw new Error(`Bids query failed: ${currentBids.error.message}`)

  const processedBids = processBidsForPublic(currentBids.data || [])
  
  const { data: voteSummary } = await supabase.rpc('get_voting_summary', { 
    p_event_id: eventId 
  })
  
  return {
    event: eventInfo.data,
    artworks: artworks.data || [],
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