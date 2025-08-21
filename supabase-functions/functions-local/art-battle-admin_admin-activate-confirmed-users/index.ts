import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// This function is called by a database webhook when a user confirms their email
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Admin activate confirmed users function triggered')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const { record } = body
    
    console.log('Processing user confirmation:', record?.id, record?.email)

    if (!record?.id || !record?.email || !record?.email_confirmed_at) {
      console.log('Skipping - user not confirmed or missing data')
      return new Response(JSON.stringify({ success: true, message: 'No action needed' }))
    }

    // Find and activate the corresponding admin user
    const { data: adminUser, error: findError } = await supabase
      .from('abhq_admin_users')
      .select('id, active, email')
      .eq('user_id', record.id)
      .eq('email', record.email)
      .maybeSingle()

    if (findError) {
      console.error('Error finding admin user:', findError)
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 })
    }

    if (!adminUser) {
      console.log('No admin user found for confirmed user:', record.email)
      return new Response(JSON.stringify({ success: true, message: 'No admin user to activate' }))
    }

    if (adminUser.active) {
      console.log('Admin user already active:', record.email)
      return new Response(JSON.stringify({ success: true, message: 'Admin user already active' }))
    }

    // Activate the admin user
    const { error: updateError } = await supabase
      .from('abhq_admin_users')
      .update({ 
        active: true, 
        updated_at: new Date().toISOString(),
        notes: (adminUser.notes || '') + ` | Activated on email confirmation at ${new Date().toISOString()}`
      })
      .eq('id', adminUser.id)

    if (updateError) {
      console.error('Error activating admin user:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to activate admin user' }), { status: 500 })
    }

    console.log('Successfully activated admin user:', record.email)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Admin user ${record.email} activated successfully`,
        userId: record.id,
        adminUserId: adminUser.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-activate-confirmed-users:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})