// Promo Offers Track View API
// Tracks when users view offers for analytics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create service client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const { offerId, userHash, viewType } = await req.json()

    if (!offerId || !userHash) {
      return new Response(
        JSON.stringify({ error: 'offerId and userHash are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up person by hash
    const { data: person, error: personError } = await supabaseClient
      .from('people')
      .select('id')
      .eq('hash', userHash)
      .single()

    if (personError || !person) {
      // Don't fail tracking if person not found - just log and return success
      console.log('Person not found for hash:', userHash)
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create view record
    await supabaseClient
      .from('offer_views')
      .insert({
        offer_id: offerId,
        user_id: person.id,
        metadata: {
          view_type: viewType || 'list',
          user_hash: userHash,
          viewed_at: new Date().toISOString()
        }
      })

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    // Don't fail the request if tracking fails - this should be fire-and-forget
    console.error('Error tracking view:', error)
    return new Response(
      JSON.stringify({ success: true }), // Return success anyway
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
