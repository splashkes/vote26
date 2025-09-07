import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Getting profile for user:', user.id)

    // Get person_id from auth metadata - AUTH-FIRST APPROACH
    const metadata = user.user_metadata || {}
    const personId = metadata.person_id
    
    if (!personId) {
      console.log('No person_id found in metadata for user:', user.id)
      return new Response(
        JSON.stringify({ 
          error: 'User profile not fully initialized',
          profile: null,
          needsSetup: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Found person_id in metadata:', personId)

    // First try to get the authoritative artist profile linked to this person_id
    const { data: linkedProfile, error: linkedProfileError } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('person_id', personId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (linkedProfileError && linkedProfileError.code !== 'PGRST116') {
      console.error('Database error getting linked artist profile:', linkedProfileError)
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve linked artist profile' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (linkedProfile) {
      // Found the authoritative profile - return it directly
      console.log('Found linked profile for person_id:', personId, '- Profile:', linkedProfile.name, 'ID:', linkedProfile.id)
      
      // Get sample works and artwork count
      const { data: sampleWorks } = await supabase
        .rpc('get_unified_sample_works', { profile_id: linkedProfile.id })

      const { count: artworkCount } = await supabase
        .from('art')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', linkedProfile.id)

      return new Response(
        JSON.stringify({
          profile: {
            ...linkedProfile,
            sampleWorks: sampleWorks || [],
            artworkCount: artworkCount || 0
          },
          needsSetup: false
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // No linked profile found - check if there are candidate profiles by phone/email
    console.log('No linked profile found for person_id:', personId, '- checking for candidate profiles')
    
    const { data: candidateProfiles, error: lookupError } = await supabase
      .rpc('lookup_profiles_by_contact', { 
        target_phone: user.phone,
        target_email: user.email || null
      })

    if (lookupError) {
      console.error('Error looking up candidate profiles:', lookupError)
      return new Response(
        JSON.stringify({ error: 'Failed to lookup candidate profiles' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (candidateProfiles && candidateProfiles.length > 0) {
      // Found candidate profiles - need user to choose
      console.log('Found', candidateProfiles.length, 'candidate profiles - need user selection')
      
      // Load sample works and artwork count for each candidate
      const detailedCandidates = await Promise.all(
        candidateProfiles.map(async (candidate) => {
          const { data: sampleWorks } = await supabase
            .rpc('get_unified_sample_works', { profile_id: candidate.id })
          
          const { count: artworkCount } = await supabase
            .from('art')
            .select('*', { count: 'exact', head: true })
            .eq('artist_id', candidate.id)

          return {
            ...candidate,
            sampleWorks: sampleWorks || [],
            artworkCount: artworkCount || 0,
          }
        })
      )

      return new Response(
        JSON.stringify({
          profile: null,
          candidateProfiles: detailedCandidates,
          needsSelection: true,
          personId: personId
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // No profiles found at all - need to create new one
    console.log('No candidate profiles found - user needs to create new profile')
    return new Response(
      JSON.stringify({ 
        profile: null,
        candidateProfiles: [],
        needsSetup: true,
        personId: personId
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error in artist-get-my-profile:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})