import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting admin-get-users function...')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the user from auth header
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)
    
    if (!authHeader) {
      console.log('No authorization header found')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('Token length:', token.length)
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    console.log('Auth result:', { user: user ? { id: user.id, email: user.email } : null, authError })
    
    if (authError || !user?.email) {
      console.log('Auth failed:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', details: authError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin permissions - only super admins can view all admin users
    console.log('Checking admin permissions for user:', user.email)
    
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle()

    console.log('Admin user query result:', { adminUser, adminError })

    if (adminError) {
      console.error('Error checking admin permissions:', adminError)
      return new Response(
        JSON.stringify({ error: 'Failed to check admin permissions', details: adminError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: `User ${user.email} is not found in admin users table.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    if (adminUser.level !== 'super') {
      return new Response(
        JSON.stringify({ error: `User has level '${adminUser.level}' but needs 'super' to view admin users.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Fetch all admin users with login info using service role (bypasses RLS)
    console.log('Fetching all admin users with login data...')
    
    // First get admin users, then fetch auth data separately since we can't directly join across schemas
    const { data: adminUsers, error: fetchError } = await supabase
      .from('abhq_admin_users')
      .select(`
        id,
        user_id,
        email,
        level,
        cities_access,
        active,
        created_at,
        created_by,
        notes,
        invitation_sent_at,
        invitation_expires_at,
        invitation_accepted_at
      `)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Error fetching admin users:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch admin users', details: fetchError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Fetched admin users:', adminUsers?.length || 0, 'users')

    // Enrich with auth.users login data
    const enrichedUsers = await Promise.all(
      (adminUsers || []).map(async (adminUser) => {
        if (!adminUser.user_id) {
          return { ...adminUser, last_sign_in_at: null, email_confirmed_at: null }
        }

        try {
          // Use admin.getUserById to get auth data
          const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(adminUser.user_id)
          
          if (authError || !authUser.user) {
            console.log(`No auth data for user ${adminUser.email}:`, authError?.message)
            return { ...adminUser, last_sign_in_at: null, email_confirmed_at: null }
          }

          return {
            ...adminUser,
            last_sign_in_at: authUser.user.last_sign_in_at,
            email_confirmed_at: authUser.user.email_confirmed_at,
            confirmed_at: authUser.user.confirmed_at
          }
        } catch (err) {
          console.error(`Error fetching auth data for ${adminUser.email}:`, err)
          return { ...adminUser, last_sign_in_at: null, email_confirmed_at: null }
        }
      })
    )

    console.log('Enriched users with login data')

    return new Response(
      JSON.stringify({ 
        success: true, 
        users: enrichedUsers,
        count: enrichedUsers?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-get-users function:', error)
    console.error('Error stack:', error.stack)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})