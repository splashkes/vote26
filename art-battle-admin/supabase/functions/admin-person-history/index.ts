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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify admin permissions
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract token and verify admin status
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user is admin
    const { data: adminData } = await supabaseClient
      .from('abhq_admin_users')
      .select('active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single()

    if (!adminData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get request data
    const { personId } = await req.json()
    
    if (!personId) {
      return new Response(
        JSON.stringify({ error: 'personId is required' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Fetch comprehensive history for this person using service role
    const [votesResult, bidsResult, interactionsResult, paymentsResult, qrScansResult] = await Promise.all([
      supabaseClient
        .from('votes')
        .select(`
          id,
          created_at,
          vote_factor,
          event_id,
          round,
          easel,
          art_id,
          events(name, eid, id)
        `)
        .eq('person_id', personId)
        .order('created_at', { ascending: false }),
      
      supabaseClient
        .from('bids')
        .select(`
          id,
          amount,
          created_at,
          art_id,
          art(
            id,
            art_code,
            round,
            easel,
            event_id,
            events(name, eid, id)
          )
        `)
        .eq('person_id', personId)
        .order('created_at', { ascending: false }),
      
      supabaseClient
        .from('people_interactions')
        .select('*')
        .eq('person_id', personId)
        .order('created_at', { ascending: false }),

      supabaseClient
        .from('stripe_charges')
        .select(`
          id,
          amount,
          currency,
          status,
          description,
          created_at,
          stripe_charge_id
        `)
        .eq('person_id', personId)
        .order('created_at', { ascending: false }),

      supabaseClient
        .from('people_qr_scans')
        .select(`
          id,
          created_at,
          qr_code,
          event_id,
          events(name, eid, id)
        `)
        .eq('person_id', personId)
        .order('created_at', { ascending: false })
    ])

    // Log results for debugging
    console.log('Votes query result:', votesResult)
    console.log('Bids query result:', bidsResult)

    const personHistory = {
      votes: votesResult.data || [],
      bids: bidsResult.data || [],
      interactions: interactionsResult.data || [],
      payments: paymentsResult.data || [],
      qrScans: qrScansResult.data || []
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: personHistory
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error fetching person history:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})