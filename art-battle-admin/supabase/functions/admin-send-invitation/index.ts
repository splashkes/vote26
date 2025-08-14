import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InvitationRequest {
  artist_number: string
  event_eid: string
  message_from_producer: string
  artist_profile_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('=== ADMIN SEND INVITATION FUNCTION ===')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the user from auth header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('No authorization header found')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    console.log('Auth result:', { user: user ? { id: user.id, email: user.email } : null, authError })
    
    if (authError || !user?.email) {
      console.log('Auth failed:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin permissions
    console.log('Checking admin permissions for user:', user.email)
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle()

    if (adminError) {
      console.error('Error checking admin permissions:', adminError)
      return new Response(
        JSON.stringify({ error: 'Failed to check admin permissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!adminUser || !['super', 'producer', 'photo'].includes(adminUser.level)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Only super admins, producers, and photo admins can send invitations.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    let invitationData: InvitationRequest
    try {
      invitationData = await req.json()
      console.log('Received invitation data:', invitationData)
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validate required fields
    if (!invitationData.artist_number || !invitationData.event_eid || !invitationData.message_from_producer) {
      const missing = []
      if (!invitationData.artist_number) missing.push('artist_number')
      if (!invitationData.event_eid) missing.push('event_eid')
      if (!invitationData.message_from_producer) missing.push('message_from_producer')
      
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if invitation already exists
    const { data: existingInvitation } = await supabase
      .from('artist_invitations')
      .select('id')
      .eq('artist_number', invitationData.artist_number)
      .eq('event_eid', invitationData.event_eid)
      .maybeSingle()

    if (existingInvitation) {
      return new Response(
        JSON.stringify({ error: `Invitation already exists for artist ${invitationData.artist_number} to event ${invitationData.event_eid}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Create the invitation
    console.log('Creating invitation...')
    const { data: newInvitation, error: insertError } = await supabase
      .from('artist_invitations')
      .insert({
        artist_number: invitationData.artist_number,
        event_eid: invitationData.event_eid,
        message_from_producer: invitationData.message_from_producer,
        artist_profile_id: invitationData.artist_profile_id || null,
        status: 'pending',
        entry_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          sent_by: user.email,
          sent_at: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating invitation:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create invitation', details: insertError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Invitation created successfully:', newInvitation)

    return new Response(
      JSON.stringify({ 
        success: true,
        invitation: newInvitation,
        message: `Invitation sent to artist ${invitationData.artist_number} for event ${invitationData.event_eid}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-send-invitation function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})