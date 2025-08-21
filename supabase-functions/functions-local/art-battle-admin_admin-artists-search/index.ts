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

    // Verify authentication - only allow admin users
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header required')
    }

    // Get search parameters from request body
    const { searchTerm, limit = 100 } = await req.json().catch(() => ({}))

    let profilesQuery = supabase.from('artist_profiles').select('*')

    // Apply search filters if search term is provided
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.trim()
      // Search by name, email, phone, or entry_id
      profilesQuery = profilesQuery.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,entry_id.eq.${parseInt(term) || 0}`)
    }

    // Apply limit and order
    profilesQuery = profilesQuery.order('created_at', { ascending: false }).limit(limit)

    const { data: profilesData, error: profilesError } = await profilesQuery

    if (profilesError) {
      console.error('Error fetching artist profiles:', profilesError)
      throw new Error('Failed to fetch artist profiles')
    }

    // Get artist numbers from found profiles
    const foundArtistNumbers = profilesData?.map(p => p.entry_id).filter(Boolean) || []
    
    // If we have a search term, also search workflow data by artist number
    let additionalArtistNumbers: number[] = []
    if (searchTerm && searchTerm.trim() && !isNaN(parseInt(searchTerm))) {
      additionalArtistNumbers = [parseInt(searchTerm)]
    }
    
    const allArtistNumbers = [...new Set([...foundArtistNumbers, ...additionalArtistNumbers])]
    
    // Get workflow data for the found artist numbers (plus any direct artist number searches)
    const [applicationsResult, invitationsResult, confirmationsResult] = await Promise.all([
      allArtistNumbers.length > 0 
        ? supabase
            .from('artist_applications')
            .select(`
              id,
              artist_profile_id,
              event_eid,
              artist_number,
              entry_date,
              application_status,
              applied_at
            `)
            .in('artist_number', allArtistNumbers)
            .order('applied_at', { ascending: false })
            .limit(limit)
        : Promise.resolve({ data: [], error: null }),
      
      allArtistNumbers.length > 0 
        ? supabase
            .from('artist_invitations')
            .select(`
              id,
              artist_profile_id,
              event_eid,
              artist_number,
              entry_date,
              status,
              created_at
            `)
            .in('artist_number', allArtistNumbers)
            .order('created_at', { ascending: false })
            .limit(limit)
        : Promise.resolve({ data: [], error: null }),
      
      allArtistNumbers.length > 0 
        ? supabase
            .from('artist_confirmations')
            .select('*')
            .in('artist_number', allArtistNumbers)
            .order('created_at', { ascending: false })
            .limit(limit)
        : Promise.resolve({ data: [], error: null })
    ])

    if (applicationsResult.error) {
      console.error('Error fetching applications:', applicationsResult.error)
      throw new Error('Failed to fetch applications')
    }
    if (invitationsResult.error) {
      console.error('Error fetching invitations:', invitationsResult.error)
      throw new Error('Failed to fetch invitations')
    }
    if (confirmationsResult.error) {
      console.error('Error fetching confirmations:', confirmationsResult.error)
      throw new Error('Failed to fetch confirmations')
    }

    // Create artist number (entry_id) to profile mapping for efficient lookups
    const profilesByArtistNumber = new Map()
    
    profilesData?.forEach(profile => {
      if (profile.entry_id) {
        profilesByArtistNumber.set(profile.entry_id.toString(), profile)
      }
    })

    // Transform workflow data with profile information
    const transformWorkflowData = (items: any[], type: string) => {
      return items?.map(item => {
        const profile = profilesByArtistNumber.get(item.artist_number?.toString()) || {}
        return {
          id: item.id,
          artist_profile_id: item.artist_profile_id,
          event_eid: item.event_eid,
          artist_number: item.artist_number,
          entry_date: item.entry_date,
          status: item.application_status || item.confirmation_status || item.status,
          created_at: item.applied_at || item.created_at,
          confirmed_at: item.created_at, // Use created_at for confirmations
          workflow_type: type,
          artist_profiles: profile
        }
      }) || []
    }

    // Transform standalone profiles (those not in any workflow)
    const usedArtistNumbers = new Set()
    
    // Collect all artist numbers from workflow data
    ;[...applicationsResult.data || [], ...invitationsResult.data || [], ...confirmationsResult.data || []]
      .forEach(item => {
        if (item.artist_number) {
          usedArtistNumbers.add(item.artist_number.toString())
        }
      })

    // Get standalone profiles (not in any workflow)
    const standaloneProfiles = profilesData?.filter(profile => 
      profile.entry_id && !usedArtistNumbers.has(profile.entry_id.toString())
    ).map(profile => ({
      id: `profile-${profile.id}`,
      artist_profile_id: profile.id,
      event_eid: null,
      artist_number: profile.entry_id,
      entry_date: null,
      status: 'profile_only',
      created_at: profile.created_at,
      confirmed_at: null,
      workflow_type: 'profile',
      artist_profiles: profile
    })) || []

    const result = {
      applications: transformWorkflowData(applicationsResult.data, 'application'),
      invitations: transformWorkflowData(invitationsResult.data, 'invitation'),
      confirmations: transformWorkflowData(confirmationsResult.data, 'confirmation'),
      profiles: standaloneProfiles,
      summary: {
        totalApplications: applicationsResult.data?.length || 0,
        totalInvitations: invitationsResult.data?.length || 0,
        totalConfirmations: confirmationsResult.data?.length || 0,
        totalProfiles: profilesData?.length || 0,
        totalStandaloneProfiles: standaloneProfiles.length
      }
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in admin-artists-search function:', error)
    
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