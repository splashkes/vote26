import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Custom invitation validity: 24 hours instead of 1 hour
const INVITATION_VALIDITY_HOURS = 24

interface ImprovedInviteRequest {
  email: string
  level: 'super' | 'producer' | 'photo'
  cities_access?: string[]
  notes?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check authentication
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
        JSON.stringify({ error: 'Authentication failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin permissions
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle()

    if (adminError) {
      return new Response(
        JSON.stringify({ error: 'Failed to check admin permissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!adminUser || adminUser.level !== 'super') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can invite users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const requestData: ImprovedInviteRequest = await req.json()
    const { email, level, cities_access, notes } = requestData

    // Validate required fields
    if (!email || !level) {
      return new Response(
        JSON.stringify({ error: 'Email and level are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if admin record already exists
    const { data: existingAdmin } = await supabase
      .from('abhq_admin_users')
      .select('email, active, created_at')
      .eq('email', email)
      .maybeSingle()

    let isResendingInvite = false
    
    if (existingAdmin) {
      if (existingAdmin.active) {
        return new Response(
          JSON.stringify({ error: `User ${email} already has an active admin account` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      } else {
        // This is a resend of an inactive invitation
        isResendingInvite = true
        console.log(`Resending invitation to existing inactive user: ${email}`)
      }
    }

    // Check if user exists in auth.users
    let authUser = null
    try {
      const { data: existingAuthUser } = await supabase.auth.admin.getUserByEmail(email)
      authUser = existingAuthUser?.user
    } catch (err) {
      console.log('User not found in auth, will create:', err.message)
    }

    let invitationResult
    
    if (authUser?.id) {
      // User exists, resend invitation
      console.log(`Resending invitation to existing auth user: ${email}`)
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: 'https://artb.art/admin/welcome',
          data: {
            admin_level: level,
            cities_access: cities_access || [],
            notes: notes || `Invited by ${user.email} on ${new Date().toISOString()}`,
            invitation_expires_at: new Date(Date.now() + (INVITATION_VALIDITY_HOURS * 60 * 60 * 1000)).toISOString()
          }
        }
      )

      if (inviteError) {
        console.error('Invite error:', inviteError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to send invite', 
            details: inviteError.message 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      invitationResult = inviteData
    } else {
      // Create new user and send invitation
      console.log(`Creating new invitation for: ${email}`)
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: 'https://artb.art/admin/welcome',
          data: {
            admin_level: level,
            cities_access: cities_access || [],
            notes: notes || `Invited by ${user.email} on ${new Date().toISOString()}`,
            invitation_expires_at: new Date(Date.now() + (INVITATION_VALIDITY_HOURS * 60 * 60 * 1000)).toISOString()
          }
        }
      )

      if (inviteError) {
        console.error('Invite error:', inviteError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to send invite', 
            details: inviteError.message 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      invitationResult = inviteData
    }

    if (!invitationResult?.user?.id) {
      console.error('No user ID returned from invitation')
      return new Response(
        JSON.stringify({ 
          error: 'Invitation sent but no user ID returned',
          warning: 'Admin record not created - please contact support'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Create or update admin record
    const adminRecordData = {
      user_id: invitationResult.user.id,
      email: email,
      level: level,
      cities_access: cities_access || [],
      active: false, // Will be activated when user completes setup
      created_by: user.email,
      notes: notes || `Invited by ${user.email} on ${new Date().toISOString()}`,
      invitation_sent_at: new Date().toISOString(),
      invitation_expires_at: new Date(Date.now() + (INVITATION_VALIDITY_HOURS * 60 * 60 * 1000)).toISOString()
    }

    let adminResult
    if (isResendingInvite) {
      // Update existing admin record
      const { data: updateResult, error: updateError } = await supabase
        .from('abhq_admin_users')
        .update({
          ...adminRecordData,
          updated_at: new Date().toISOString()
        })
        .eq('email', email)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating admin record:', updateError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to update admin record', 
            details: updateError.message 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
      
      adminResult = updateResult
    } else {
      // Create new admin record
      const { data: insertResult, error: insertError } = await supabase
        .from('abhq_admin_users')
        .insert(adminRecordData)
        .select()
        .single()

      if (insertError) {
        console.error('Error creating admin record:', insertError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create admin record', 
            details: insertError.message 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }
      
      adminResult = insertResult
    }

    const action = isResendingInvite ? 'resent' : 'sent'
    const expiresAt = new Date(Date.now() + (INVITATION_VALIDITY_HOURS * 60 * 60 * 1000))
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Invitation ${action} to ${email} successfully`,
        invitation: {
          email: email,
          level: level,
          expires_at: expiresAt.toISOString(),
          expires_in_hours: INVITATION_VALIDITY_HOURS,
          user_id: invitationResult.user.id,
          admin_record: adminResult
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-improved-invite:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Function error',
        message: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})