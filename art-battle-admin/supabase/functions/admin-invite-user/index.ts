import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InviteRequest {
  email: string
  level: 'super' | 'producer' | 'photo' | 'voting'
  cities_access?: string[]
  notes?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the requesting user and verify admin permissions
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user?.email) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check if requesting user is super admin
    const { data: adminUser } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .single()

    if (!adminUser || adminUser.level !== 'super') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can invite users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const { email, level, cities_access, notes }: InviteRequest = await req.json()

    if (!email || !level) {
      return new Response(
        JSON.stringify({ error: 'Email and level are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Send invite using Supabase Admin API
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: 'https://artb.art/admin/welcome',
        data: {
          invited_by: user.email,
          admin_level: level,
          cities_access: cities_access || [],
          notes: notes || ''
        }
      }
    )

    if (inviteError) {
      console.error('Error sending invite:', inviteError)
      return new Response(
        JSON.stringify({ error: 'Failed to send invite', details: inviteError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Pre-create the admin user record
    let adminRecordCreated = false
    let adminError = null
    
    if (inviteData.user?.id) {
      const { error } = await supabase
        .from('abhq_admin_users')
        .insert({
          user_id: inviteData.user.id,
          email: email,
          level: level,
          cities_access: cities_access || [],
          active: false, // Will be activated when they accept invite
          created_by: user.email,
          notes: notes || `Invited by ${user.email}`
        })

      if (error) {
        console.error('Error creating admin record:', error)
        adminError = error
      } else {
        adminRecordCreated = true
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Invite sent to ${email}`,
        user: inviteData.user,
        adminRecordCreated,
        adminError: adminError?.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-invite-user:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})