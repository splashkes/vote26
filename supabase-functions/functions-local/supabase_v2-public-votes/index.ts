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

    const votesData = await generatePublicVotesData(eventId)
    
    return new Response(JSON.stringify(votesData), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('V2 public votes function error:', error)
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

const generatePublicVotesData = async (eventId: string) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  
  const { data: voteSummary, error } = await supabase.rpc('get_voting_summary', { 
    p_event_id: eventId 
  })
  
  if (error) {
    throw new Error(`Vote summary query failed: ${error.message}`)
  }
  
  return {
    vote_summary: voteSummary || [],
    generated_at: new Date().toISOString()
  }
}