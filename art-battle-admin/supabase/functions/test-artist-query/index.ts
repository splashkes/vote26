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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const targetEventId = '6cdb02e0-5920-44b6-887d-7bf662fc129c' // AB2900

    // Test simple query first
    const { data: simpleApps, error: simpleError } = await supabase
      .from('artist_applications')
      .select('*')
      .eq('event_id', targetEventId)

    console.log('Simple query result:', simpleApps, simpleError)

    // Test with nested query
    const { data: nestedApps, error: nestedError } = await supabase
      .from('artist_applications')
      .select(`
        *,
        artist_profiles!artist_profile_id (
          id,
          name,
          city_text
        )
      `)
      .eq('event_id', targetEventId)

    console.log('Nested query result:', nestedApps, nestedError)

    return new Response(
      JSON.stringify({ 
        success: true,
        simpleApps,
        simpleError,
        nestedApps,
        nestedError
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})