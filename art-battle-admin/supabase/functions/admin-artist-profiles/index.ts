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

    // Lookup artist profiles by entry_id (which matches artist_number) - get all profile data
    const { data: artistProfiles, error: profileError } = await supabase
      .from('artist_profiles')
      .select(`
        id,
        entry_id,
        name,
        email,
        phone,
        bio,
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
      .in('entry_id', artistNumbers)

    if (profileError) {
      console.error('Error fetching artist profiles:', profileError)
      throw new Error('Failed to fetch artist profiles')
    }

    // Transform data to create a lookup map
    const profileMap = new Map()
    artistProfiles?.forEach(profile => {
      profileMap.set(profile.entry_id.toString(), {
        id: profile.id,
        entry_id: profile.entry_id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        bio: profile.bio,
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
          : 'unknown'
      })
    })

    // Return the profile map and array for easy usage
    const result = {
      profiles: Object.fromEntries(profileMap),
      found: artistProfiles?.length || 0,
      requested: artistNumbers.length,
      missing: artistNumbers.filter(num => !profileMap.has(num.toString()))
    }

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