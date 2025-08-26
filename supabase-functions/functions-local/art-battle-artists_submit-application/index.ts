import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create admin client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { 
      artist_profile_id,
      event_id,
      application_message
    } = await req.json()

    console.log('Submit application request:', {
      artist_profile_id,
      event_id,
      message_length: application_message?.length
    })

    // Validate required fields
    if (!artist_profile_id || !event_id) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: artist_profile_id, event_id'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get artist profile entry_id
    const { data: profileData, error: profileError } = await supabase
      .from('artist_profiles')
      .select('entry_id')
      .eq('id', artist_profile_id)
      .single()

    if (profileError) {
      console.error('Profile error:', profileError)
      return new Response(JSON.stringify({
        error: 'Failed to get artist profile: ' + profileError.message
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get event eid
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('eid')
      .eq('id', event_id)
      .single()

    if (eventError) {
      console.error('Event error:', eventError)
      return new Response(JSON.stringify({
        error: 'Failed to get event: ' + eventError.message
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Insert application - this should fire the trigger
    const { data: applicationData, error: applicationError } = await supabase
      .from('artist_applications')
      .insert({
        artist_profile_id,
        event_id,
        application_status: 'pending',
        artist_number: profileData.entry_id?.toString(),
        event_eid: eventData.eid,
        message_to_producer: application_message || null,
        metadata: {
          applied_via: 'artist_portal_edge_function',
          applied_at: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (applicationError) {
      console.error('Application insert error:', applicationError)
      return new Response(JSON.stringify({
        error: 'Failed to submit application: ' + applicationError.message,
        code: applicationError.code
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Application submitted successfully:', applicationData.id)

    return new Response(JSON.stringify({
      success: true,
      application_id: applicationData.id,
      message: 'Application submitted successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Submit application error:', error)
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})