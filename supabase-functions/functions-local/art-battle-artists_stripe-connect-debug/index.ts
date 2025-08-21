// Simple debug function to test Stripe Connect setup
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requestBody = await req.json()
    console.log('Request received:', requestBody)

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Auth failed: ' + (authError?.message || 'No user'))
    }

    console.log('User authenticated:', user.id)

    // Get person
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, first_name, last_name, email')
      .eq('auth_user_id', user.id)
      .single()

    if (personError || !person) {
      throw new Error('Person lookup failed: ' + (personError?.message || 'No person'))
    }

    console.log('Person found:', person)

    // Get artist profile  
    const { data: artistProfile, error: profileError } = await supabase
      .from('artist_profiles')
      .select('id, name, email')
      .eq('person_id', person.id)
      .single()

    if (profileError || !artistProfile) {
      throw new Error('Artist profile lookup failed: ' + (profileError?.message || 'No profile'))
    }

    console.log('Artist profile found:', artistProfile)

    // Check Stripe key
    const stripeKey = Deno.env.get('stripe_intl_secret_key')
    if (!stripeKey) {
      throw new Error('Stripe key not found')
    }

    console.log('Stripe key available:', stripeKey.substring(0, 10) + '...')

    return new Response(
      JSON.stringify({
        success: true,
        user_id: user.id,
        person: person,
        artist_profile: artistProfile,
        has_stripe_key: !!stripeKey
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Debug function error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})