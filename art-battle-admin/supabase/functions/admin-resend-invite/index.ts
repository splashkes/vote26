import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ResendInviteRequest {
  expiredToken?: string
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

    const { expiredToken }: ResendInviteRequest = await req.json()

    if (!expiredToken) {
      return new Response(
        JSON.stringify({ error: 'Expired token is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Decode the expired JWT to extract email (server-side only)
    let email: string
    try {
      const payload = JSON.parse(atob(expiredToken.split('.')[1]))
      email = payload.email
      
      if (!email || !email.includes('@')) {
        throw new Error('Invalid email in token')
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Invalid or malformed token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if this email has an admin user record
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level, cities_access, notes')
      .eq('email', email)
      .single()

    if (adminError || !adminUser) {
      return new Response(
        JSON.stringify({ error: 'No admin invitation found for this email address' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if user already exists in auth.users
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email)
    
    if (existingUser?.user?.id) {
      // Resend invite to existing user
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: 'https://artb.art/admin/welcome',
          data: {
            admin_level: adminUser.level,
            cities_access: adminUser.cities_access || [],
            notes: adminUser.notes || '',
            resent: true
          }
        }
      )

      if (inviteError) {
        console.error('Error resending invite:', inviteError)
        return new Response(
          JSON.stringify({ error: 'Failed to resend invitation', details: inviteError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'New invitation sent successfully (valid for 24 hours)',
          user: inviteData.user
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        JSON.stringify({ error: 'User not found. Please contact an administrator.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

  } catch (error) {
    console.error('Error in admin-resend-invite:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})