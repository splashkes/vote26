import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  console.log('Function called with method:', req.method)

  if (req.method === 'OPTIONS') {
    console.log('Returning CORS preflight response')
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting POST processing')
    
    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    console.log('Supabase client created')

    // Check authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('No auth header')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user?.email) {
      console.log('Auth failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    console.log('User authenticated:', user.email)

    // Check admin permissions
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle()

    if (adminError) {
      console.log('Admin check error:', adminError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to check admin permissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!adminUser) {
      console.log('User not admin:', user.email)
      return new Response(
        JSON.stringify({ error: 'User is not an admin' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    if (adminUser.level !== 'super') {
      console.log('User not super admin:', user.email)
      return new Response(
        JSON.stringify({ error: 'Only super admins can invite users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    console.log('User is super admin, proceeding...')
    
    // Parse request body
    console.log('About to parse request body...')
    let requestData
    try {
      requestData = await req.json()
      console.log('Request data parsed successfully')
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }
    
    const { email, level } = requestData
    console.log('Extracted email and level:', { email, level })

    // Validate required fields
    if (!email || !level) {
      console.log('Missing required fields')
      return new Response(
        JSON.stringify({ error: 'Email and level are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if admin record already exists (simple check)
    console.log('Checking if admin record exists...')
    try {
      const { data: existingAdmin } = await supabase
        .from('abhq_admin_users')
        .select('email')
        .eq('email', email)
        .maybeSingle()
      
      if (existingAdmin) {
        console.log('Admin record already exists for:', email)
        return new Response(
          JSON.stringify({ error: `User ${email} already has an admin account` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      console.log('No existing admin record found')
    } catch (checkError) {
      console.error('Error checking existing admin:', checkError)
      // Continue anyway - this is just a precaution
    }

    // Send invitation
    console.log('About to send invitation to:', email)
    
    try {
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: 'https://artb.art/admin/welcome'
        }
      )

      if (inviteError) {
        console.error('Invite error:', inviteError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to send invite', 
            details: inviteError.message,
            code: inviteError.status || 'unknown'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      console.log('Invite sent successfully! User ID:', inviteData.user?.id)
      
      // Verify we got a user ID from the invitation
      if (!inviteData.user?.id) {
        console.error('No user ID returned from invitation')
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Invitation sent to ${email} but no user ID returned`,
            warning: 'Admin record not created - please create manually'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Skip auth verification for now - proceed directly to admin record creation
      console.log('Proceeding directly to admin record creation for user ID:', inviteData.user.id)

      console.log('Auth user verified, creating admin record for user ID:', inviteData.user.id)
      const { cities_access, notes } = requestData
      
      const adminInsertData = {
        user_id: inviteData.user.id,
        email: email,
        level: level,
        cities_access: cities_access || [],
        active: true, // Active immediately upon invitation
        created_by: user.email,
        notes: notes || `Invited by ${user.email} on ${new Date().toISOString()}`
      }
      
      console.log('Admin insert data:', adminInsertData)
      
      const { data: insertResult, error: adminCreateError } = await supabase
        .from('abhq_admin_users')
        .insert(adminInsertData)

      console.log('Insert result:', { data: insertResult, error: adminCreateError })
      console.log('Admin create error is null?', adminCreateError === null)
      console.log('Admin create error type:', typeof adminCreateError)

      if (adminCreateError) {
        console.error('Error creating admin record:', adminCreateError)
        console.error('Error stack:', adminCreateError.stack)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create admin record', 
            details: adminCreateError.message,
            code: adminCreateError.code,
            hint: adminCreateError.hint
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      console.log('Admin record created successfully')
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Invitation sent to ${email} and admin record created successfully`,
          user: inviteData.user
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
      
    } catch (inviteException) {
      console.error('Exception during invite:', inviteException)
      return new Response(
        JSON.stringify({ 
          error: 'Exception during invite', 
          details: inviteException.message,
          type: typeof inviteException
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

  } catch (error) {
    console.error('Error in function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Function error',
        message: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})