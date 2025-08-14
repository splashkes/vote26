import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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

    const { person_id, name, email, bio, city, website, instagram, facebook } = await req.json()

    if (!person_id || !name) {
      throw new Error('Missing required parameters: person_id and name')
    }

    // Get phone from authenticated user
    const userPhone = user.phone

    // Generate custom artist ID using provided name
    const firstName = name.split(' ')[0] || 'Artist'
    const { data: customIdResult, error: idError } = await supabase
      .rpc('generate_artist_id', { first_name: firstName })

    if (idError || !customIdResult) {
      throw new Error(`Failed to generate artist ID: ${idError?.message}`)
    }

    const customId = customIdResult

    // Format phone number with + prefix if provided and doesn't already have it
    let formattedPhone = null
    if (userPhone && userPhone.trim()) {
      formattedPhone = userPhone.trim().startsWith('+') ? userPhone.trim() : `+${userPhone.trim()}`
    }

    // Prepare profile data
    const profileData = {
      mongo_id: customId, // Use our custom ID in mongo_id field
      person_id: person_id,
      primary_for: person_id,
      name: name,
      email: email || null,
      phone: formattedPhone,
      bio: bio || null,
      city: city || null,
      website: website || null,
      instagram: instagram || null,
      facebook: facebook || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Clear primary_for from any other profiles for this person
    await supabase
      .from('artist_profiles')
      .update({ primary_for: null })
      .eq('primary_for', person_id)

    // Create new profile
    console.log(`Creating new profile for ${name} (person ${person_id})`)
    
    const { data: newProfile, error: createError } = await supabase
      .from('artist_profiles')
      .insert(profileData)
      .select()
      .single()

    if (createError) {
      throw new Error(`Failed to create profile: ${createError.message}`)
    }

    console.log(`Created profile ${customId} for ${name}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        profile: newProfile,
        custom_id: customId
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in create-artist-profile:', error)
    
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