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
    // Create a Supabase client with the service role key to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { profile_id, target_person_id } = await req.json()

    if (!profile_id || !target_person_id) {
      return new Response(
        JSON.stringify({ error: 'Missing profile_id or target_person_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if profile exists
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, name')
      .eq('id', profile_id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, message: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Clear set_primary_profile_at from any other profiles with the same person_id
    await supabaseAdmin
      .from('artist_profiles')
      .update({ set_primary_profile_at: null })
      .eq('person_id', target_person_id)
      .not('set_primary_profile_at', 'is', null)

    // Set this profile as primary by setting the timestamp and person_id
    const { error: updateError } = await supabaseAdmin
      .from('artist_profiles')
      .update({ 
        person_id: target_person_id,
        set_primary_profile_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', profile_id)

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to update profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Profile set as primary successfully',
        updated_profile_id: profile_id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})