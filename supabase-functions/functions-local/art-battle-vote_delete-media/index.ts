import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    // Create Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get request body
    const { media_id, event_eid, art_id, round, easel } = await req.json()

    if (!media_id) {
      return new Response(
        JSON.stringify({ error: 'Missing media_id' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    console.log('Deleting media:', { media_id, event_eid, art_id, round, easel })

    // Delete media from art_media table
    const { data: deleteData, error: deleteError } = await supabase
      .from('art_media')
      .delete()
      .eq('media_id', media_id)
      .select()

    if (deleteError) {
      console.error('Delete error:', deleteError)
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      )
    }

    console.log('Delete successful:', deleteData)

    // If we have event info, trigger broadcast
    if (event_eid && art_id) {
      try {
        const cacheVersion = Date.now()
        const payload = {
          type: 'media_updated',
          event_eid,
          endpoints: [`/live/event/${event_eid}/media`],
          art_id,
          round,
          easel,
          timestamp: Math.floor(Date.now() / 1000),
          cache_version: cacheVersion
        }

        console.log('Sending broadcast:', payload)

        // Send broadcast using realtime
        const { error: broadcastError } = await supabase
          .channel(`cache_invalidate_${event_eid}`)
          .send({
            type: 'broadcast',
            event: 'cache_invalidation',
            payload
          })

        if (broadcastError) {
          console.error('Broadcast error:', broadcastError)
        } else {
          console.log('Broadcast sent successfully')
        }
      } catch (broadcastErr) {
        console.error('Broadcast exception:', broadcastErr)
        // Don't fail the delete if broadcast fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted_count: deleteData?.length || 0,
        media_id
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})