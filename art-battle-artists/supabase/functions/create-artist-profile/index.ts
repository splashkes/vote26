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

    const { person_id, form_17_entry_id } = await req.json()

    if (!person_id || !form_17_entry_id) {
      throw new Error('Missing required parameters: person_id and form_17_entry_id')
    }

    // Get Form 17 data from artist_profile_aliases
    const { data: aliasData, error: aliasError } = await supabase
      .from('artist_profile_aliases')
      .select('form_17_metadata')
      .eq('form_17_entry_id', form_17_entry_id)
      .single()

    if (aliasError || !aliasData) {
      throw new Error(`Failed to find Form 17 data: ${aliasError?.message}`)
    }

    const form17Data = aliasData.form_17_metadata?.extracted_data || {}
    const form17Fields = aliasData.form_17_metadata?.form_17_fields || {}

    // Generate custom artist ID
    const firstName = form17Data.first_name || form17Fields['1'] || 'Artist'
    const { data: customIdResult, error: idError } = await supabase
      .rpc('generate_artist_id', { first_name: firstName })

    if (idError || !customIdResult) {
      throw new Error(`Failed to generate artist ID: ${idError?.message}`)
    }

    const customId = customIdResult

    // Prepare profile data
    const profileData = {
      mongo_id: customId, // Use our custom ID in mongo_id field
      person_id: person_id,
      primary_for: person_id,
      form_17_entry_id: form_17_entry_id,
      name: form17Fields['1'] || firstName,
      email: form17Fields['14'],
      phone: form17Fields['3'],
      bio: form17Fields['5'],
      city: form17Fields['93.3'],
      website: form17Fields['4'] || '',
      instagram: form17Fields['16'],
      facebook: form17Fields['17'],
      aliases: [form_17_entry_id.toString()], // Track Form 17 ID as alias
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // First check if a profile for this Form 17 entry already exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('form_17_entry_id', form_17_entry_id)
      .single()

    let finalProfile;

    if (existingProfile && !checkError) {
      // Profile already exists, clear other primaries and set this one
      console.log(`Profile already exists for Form 17 entry ${form_17_entry_id}, updating primary_for`)
      
      // First clear primary_for from any other profiles for this person
      await supabase
        .from('artist_profiles')
        .update({ primary_for: null })
        .eq('primary_for', person_id)

      // Then set this profile as the new primary
      const { data: updatedProfile, error: updateError } = await supabase
        .from('artist_profiles')
        .update({ 
          primary_for: person_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingProfile.id)
        .select()
        .single()

      if (updateError) {
        throw new Error(`Failed to update existing profile: ${updateError.message}`)
      }

      finalProfile = updatedProfile
      
      // Check if this profile already has sample works, if so, skip creating new ones
      const { data: existingSampleWorks, error: sampleWorksError } = await supabase
        .from('artist_sample_works')
        .select('id')
        .eq('artist_profile_id', finalProfile.id)
        .limit(1)
      
      if (existingSampleWorks && existingSampleWorks.length > 0) {
        console.log(`Profile already has sample works, skipping Form 17 sample work creation`)
        return new Response(
          JSON.stringify({ 
            success: true, 
            profile: finalProfile,
            sample_works_created: 0,
            existing_sample_works: true,
            custom_id: finalProfile.mongo_id || customId
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      }
    } else {
      // Create new profile, first clear any existing primaries
      console.log(`Creating new profile for Form 17 entry ${form_17_entry_id}`)
      
      // Clear primary_for from any other profiles for this person
      await supabase
        .from('artist_profiles')
        .update({ primary_for: null })
        .eq('primary_for', person_id)

      const { data: newProfile, error: createError } = await supabase
        .from('artist_profiles')
        .insert(profileData)
        .select()
        .single()

      if (createError) {
        throw new Error(`Failed to create profile: ${createError.message}`)
      }

      finalProfile = newProfile
    }

    // Process sample works from Form 17 fields (28, 29, 30)
    const sampleWorkUrls = [
      form17Fields['28'],
      form17Fields['29'], 
      form17Fields['30']
    ].filter(url => url && url.trim())
     .map(url => url.split('|:||:||:|')[0]) // Clean URLs
     .map(url => url.replace(/^https?:\/\/artbattle\.ca\//, 'https://artbattle.com/')) // Fix domain

    // Create sample works records
    const sampleWorksPromises = sampleWorkUrls.map(async (imageUrl, index) => {
      // Create media_files entry with URL in the expected field for image helpers
      const { data: mediaFile, error: mediaError } = await supabase
        .from('media_files')
        .insert({
          file_name: `form17_sample_${index + 1}.jpg`,
          file_path: imageUrl, // Keep for reference
          original_url: imageUrl, // Store in field expected by getArtworkImageUrls()
          compressed_url: imageUrl, // Use same URL for all variants for external images
          thumbnail_url: imageUrl, // Use same URL for thumbnail
          file_type: 'image/jpeg',
          file_size: null,
          upload_date: new Date().toISOString(),
          metadata: {
            source: 'form_17',
            form_17_field: `field_${28 + index}`
          }
        })
        .select()
        .single()

      if (mediaError) {
        console.error(`Failed to create media file for ${imageUrl}:`, mediaError)
        return null
      }

      // Create artist_sample_works entry
      const { data: sampleWork, error: workError } = await supabase
        .from('artist_sample_works')
        .insert({
          artist_profile_id: finalProfile.id,
          media_file_id: mediaFile.id,
          title: `Form 17 Sample Work ${index + 1}`,
          description: `Sample work from original Form 17 submission`,
          display_order: index,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (workError) {
        console.error(`Failed to create sample work for ${imageUrl}:`, workError)
        return null
      }

      return sampleWork
    })

    const sampleWorks = await Promise.all(sampleWorksPromises)
    const successfulWorks = sampleWorks.filter(work => work !== null)

    console.log(`Created profile ${customId} with ${successfulWorks.length} sample works`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        profile: finalProfile,
        sample_works_created: successfulWorks.length,
        custom_id: finalProfile.mongo_id || customId
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