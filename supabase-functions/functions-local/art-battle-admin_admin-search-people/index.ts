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
    // Get the authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Extract JWT token
    const jwt = authHeader.replace('Bearer ', '')
    
    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user is an admin by checking their JWT
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt)
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if user is in abhq_admin_users table
    const { data: adminCheck } = await supabaseAdmin
      .from('abhq_admin_users')
      .select('user_id, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single()

    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: 'User is not an active admin' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get request body
    const { searchTerm } = await req.json()

    if (!searchTerm || searchTerm.length < 4) {
      return new Response(
        JSON.stringify({ error: 'Search term must be at least 4 characters' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Perform the search using service role (bypasses RLS entirely)
    const { data: people, error: searchError } = await supabaseAdmin
      .from('people')
      .select('id, first_name, last_name, email, phone, created_at')
      .or(`email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (searchError) {
      throw searchError
    }

    return new Response(
      JSON.stringify({ people: people || [], count: people?.length || 0 }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error in admin-search-people:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})