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

    const { 
      profile_id,
      person_id,
      name,
      bio,
      city,
      country,
      email,
      website,
      instagram,
      facebook,
      twitter
    } = await req.json()

    // Validate required fields with detailed error messages
    if (!profile_id) {
      throw new Error('profile_id is required but was missing or null')
    }
    if (!person_id) {
      throw new Error('person_id is required but was missing or null')
    }
    if (!name || !name.trim()) {
      throw new Error('name is required but was missing, null, or empty')
    }

    // Verify ownership - user must own this profile
    const { data: existingProfile, error: checkError } = await supabase
      .from('artist_profiles')
      .select('person_id')
      .eq('id', profile_id)
      .single()

    if (checkError || !existingProfile) {
      throw new Error('Profile not found')
    }

    if (existingProfile.person_id !== person_id) {
      throw new Error('Not authorized to update this profile')
    }

    // Clean and validate data
    const updateData = {
      name: name.trim(),
      bio: bio?.trim() || null,
      city: city?.trim() || null,
      country: country?.trim() || null,
      email: email?.trim() || null,
      website: website?.trim() || null,
      instagram: instagram?.trim() || null,
      facebook: facebook?.trim() || null,
      twitter: twitter?.trim() || null,
      updated_at: new Date().toISOString()
    }

    // Update the profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('artist_profiles')
      .update(updateData)
      .eq('id', profile_id)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`)
    }

    console.log(`Updated profile for ${updateData.name} (profile ${profile_id})`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        profile: updatedProfile
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in update-profile-clean:', error)
    
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