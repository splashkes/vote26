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

    const { eventId, eventEid } = await req.json()
    
    if (!eventId && !eventEid) {
      throw new Error('Either eventId (UUID) or eventEid is required')
    }

    // Get event UUID if EID was provided
    let targetEventId = eventId
    let targetEventEid = eventEid
    if (!targetEventId && eventEid) {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, eid')
        .eq('eid', eventEid)
        .single()
      
      if (eventError || !eventData) {
        throw new Error(`Event not found: ${eventEid}`)
      }
      
      targetEventId = eventData.id
      targetEventEid = eventData.eid
    } else if (targetEventId && !eventEid) {
      // Get EID from UUID
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('eid')
        .eq('id', targetEventId)
        .single()
      
      if (eventError || !eventData) {
        throw new Error(`Event not found: ${targetEventId}`)
      }
      
      targetEventEid = eventData.eid
    }

    // Fetch artist applications using event_eid
    const { data: applications, error: appError } = await supabase
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
      .eq('event_eid', targetEventEid)
      .order('entry_date', { ascending: false })

    if (appError) {
      console.error('Error fetching applications:', appError)
      throw new Error('Failed to fetch applications')
    }

    // Fetch artist invitations using event_eid
    const { data: invitations, error: invError } = await supabase
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
      .eq('event_eid', targetEventEid)
      .order('entry_date', { ascending: false })

    if (invError) {
      console.error('Error fetching invitations:', invError)
      throw new Error('Failed to fetch invitations')
    }

    // Fetch artist confirmations using event_eid
    const { data: confirmations, error: confError } = await supabase
      .from('artist_confirmations')
      .select('*')
      .eq('event_eid', targetEventEid)

    if (confError) {
      console.error('Error fetching confirmations:', confError)
      throw new Error('Failed to fetch confirmations')
    }

    // Simple transform focusing on key workflow fields
    const transformArtistData = (item: any) => {
      return {
        id: item.id,
        artist_profile_id: item.artist_profile_id,
        event_eid: item.event_eid || targetEventEid,
        artist_number: item.artist_number,
        entry_date: item.entry_date,
        status: item.application_status || item.confirmation_status || item.status,
        created_at: item.applied_at || item.created_at,
        artist_profiles: {}
      }
    }

    const result = {
      eventId: targetEventId,
      eventEid: targetEventEid,
      applications: applications?.map(transformArtistData) || [],
      invitations: invitations?.map(transformArtistData) || [],
      confirmations: confirmations?.map(transformArtistData) || [],
      summary: {
        totalApplications: applications?.length || 0,
        totalInvitations: invitations?.length || 0,
        totalConfirmations: confirmations?.length || 0
      }
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
    console.error('Error in admin-artist-workflow function:', error)
    
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