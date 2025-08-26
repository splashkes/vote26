import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { event_eid } = await req.json()

    if (!event_eid) {
      throw new Error('event_eid is required')
    }

    // Get event details with proper joins
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select(`
        id,
        eid,
        name,
        event_start_datetime,
        event_end_datetime,
        venue,
        cities!city_id(name)
      `)
      .eq('eid', event_eid)
      .single()

    if (eventError) {
      console.error('Event query error:', eventError)
      throw new Error(`Failed to get event details: ${eventError.message}`)
    }

    if (!eventData) {
      throw new Error('Event not found')
    }

    // Format the response properly
    const response = {
      id: eventData.id,
      eid: eventData.eid,
      name: eventData.name,
      event_start_datetime: eventData.event_start_datetime,
      event_end_datetime: eventData.event_end_datetime,
      venue: eventData.venue,
      city: eventData.cities?.name || null
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        event: response
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in get-event-details-for-artist-profile:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})