import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { hash, interactionType, packageId, metadata } = await req.json()

    if (!hash || !interactionType) {
      return new Response(
        JSON.stringify({ error: 'Hash and interactionType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get IP and user agent from request
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
    const userAgent = req.headers.get('user-agent') || null

    const { data, error } = await supabaseClient.rpc('track_sponsorship_interaction', {
      p_invite_hash: hash,
      p_interaction_type: interactionType,
      p_package_id: packageId || null,
      p_metadata: metadata || {},
      p_ip_address: ipAddress,
      p_user_agent: userAgent
    })

    if (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'sponsorship-track-interaction',
            error_type: error.constructor?.name || 'Error',
            error_message: error.message,
            error_details: error.details || null,
            error_hint: error.hint || null,
            error_code: error.code || null,
            input: {
              hash,
              interactionType,
              packageId,
              hasMetadata: !!metadata
            }
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, interactionId: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'sponsorship-track-interaction',
          error_type: error.constructor?.name || 'Error',
          error_message: error.message,
          stack: error.stack
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
