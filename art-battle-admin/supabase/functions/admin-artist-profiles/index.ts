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
    // Initialize Supabase client with service role key for full database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Note: Using service role key for admin access, no user auth needed

    const { artistNumbers } = await req.json()
    
    if (!artistNumbers || !Array.isArray(artistNumbers) || artistNumbers.length === 0) {
      throw new Error('artistNumbers array is required')
    }

    // Convert artistNumbers to integers for database queries
    const entryIds = artistNumbers.map(num => parseInt(num)).filter(id => !isNaN(id))
    
    // Step 1: Direct lookup by entry_id (which matches artist_number)
    const { data: directProfiles, error: profileError } = await supabase
      .from('artist_profiles')
      .select(`
        id,
        entry_id,
        name,
        email,
        phone,
        bio,
        abhq_bio,
        city_text,
        city,
        country,
        instagram,
        facebook,
        twitter,
        website,
        years_experience,
        specialties,
        studio_location,
        followers_count,
        votes_count,
        score,
        aliases,
        sample_works_urls,
        created_at,
        updated_at
      `)
      .in('entry_id', entryIds)

    if (profileError) {
      console.error('Error fetching artist profiles:', profileError)
      throw new Error('Failed to fetch artist profiles')
    }

    // Helper function to transform profile data
    const transformProfile = (profile: any, foundByAlias = false) => ({
      id: profile.id,
      entry_id: profile.entry_id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      bio: profile.bio,
      abhq_bio: profile.abhq_bio,
      city_text: profile.city_text,
      city: profile.city,
      country: profile.country,
      instagram: profile.instagram,
      facebook: profile.facebook,
      twitter: profile.twitter,
      website: profile.website,
      years_experience: profile.years_experience,
      specialties: profile.specialties,
      studio_location: profile.studio_location,
      followers_count: profile.followers_count,
      votes_count: profile.votes_count,
      score: profile.score,
      aliases: profile.aliases,
      sample_works_urls: profile.sample_works_urls,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      display_name: profile.name,
      experience_level: profile.years_experience 
        ? (profile.years_experience < 2 ? 'beginner' : 
           profile.years_experience < 5 ? 'intermediate' : 'advanced')
        : 'unknown',
      foundByAlias: foundByAlias
    })

    // Build initial profile map from direct lookups
    const profileMap = new Map()
    directProfiles?.forEach(profile => {
      profileMap.set(profile.entry_id.toString(), transformProfile(profile, false))
    })

    // Step 2: Alias lookup for missing entry_ids
    const missingEntryIds = entryIds.filter(id => !profileMap.has(id.toString()))
    
    if (missingEntryIds.length > 0) {
      console.log(`Performing alias lookup for ${missingEntryIds.length} missing artist numbers`)
      
      // Use JSONB containment to find profiles with these entry_ids in aliases
      const aliasQueries = missingEntryIds.map(entryId => 
        `aliases @> '{"cluster_entry_ids": [${entryId}]}'`
      )
      
      // Split into smaller batches to avoid query length limits
      const batchSize = 10
      for (let i = 0; i < aliasQueries.length; i += batchSize) {
        const batch = aliasQueries.slice(i, i + batchSize)
        const orCondition = batch.join(' OR ')
        
        const { data: aliasProfiles, error: aliasError } = await supabase
          .from('artist_profiles')
          .select(`
            id,
            entry_id,
            name,
            email,
            phone,
            bio,
            abhq_bio,
            city_text,
            city,
            country,
            instagram,
            facebook,
            twitter,
            website,
            years_experience,
            specialties,
            studio_location,
            followers_count,
            votes_count,
            score,
            aliases,
            sample_works_urls,
            created_at,
            updated_at
          `)
          .or(orCondition)

        if (aliasError) {
          console.error('Error in alias lookup batch:', aliasError)
        } else if (aliasProfiles) {
          // Process alias matches and add to profile map
          aliasProfiles.forEach(profile => {
            if (profile.aliases && typeof profile.aliases === 'object') {
              // Handle both array and object formats of aliases
              let aliasData = profile.aliases
              
              // If aliases is an object with cluster info, extract entry_ids
              if (aliasData.cluster_entry_ids && Array.isArray(aliasData.cluster_entry_ids)) {
                aliasData.cluster_entry_ids.forEach((entryId: number) => {
                  if (missingEntryIds.includes(entryId) && !profileMap.has(entryId.toString())) {
                    profileMap.set(entryId.toString(), transformProfile(profile, true))
                    console.log(`Found profile for artist ${entryId} via alias lookup: ${profile.name}`)
                  }
                })
              }
              
              // If aliases is an array, process each item
              if (Array.isArray(aliasData)) {
                aliasData.forEach((alias: any) => {
                  if (alias.cluster_entry_ids && Array.isArray(alias.cluster_entry_ids)) {
                    alias.cluster_entry_ids.forEach((entryId: number) => {
                      if (missingEntryIds.includes(entryId) && !profileMap.has(entryId.toString())) {
                        profileMap.set(entryId.toString(), transformProfile(profile, true))
                        console.log(`Found profile for artist ${entryId} via alias lookup: ${profile.name}`)
                      }
                    })
                  }
                })
              }
            }
          })
        }
      }
    }

    // Calculate statistics
    const foundByAlias = Array.from(profileMap.values()).filter(profile => profile.foundByAlias)
    const directlyFound = Array.from(profileMap.values()).filter(profile => !profile.foundByAlias)
    
    // Return the profile map and statistics
    const result = {
      profiles: Object.fromEntries(profileMap),
      found: profileMap.size,
      requested: artistNumbers.length,
      missing: artistNumbers.filter(num => !profileMap.has(num.toString())),
      foundByAlias: foundByAlias.length,
      foundDirectly: directlyFound.length
    }

    console.log(`Profile lookup complete: ${result.foundDirectly} direct, ${result.foundByAlias} by alias, ${result.missing.length} missing`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: result 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in admin-artist-profiles function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})