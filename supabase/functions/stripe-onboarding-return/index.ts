// Stripe Onboarding Return Handler
// Handles users returning from Stripe onboarding
// Redirects to profile page with appropriate status message

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse URL parameters
    const url = new URL(req.url)
    const accountId = url.searchParams.get('account')
    const status = url.searchParams.get('status') || 'completed'
    
    console.log('Onboarding return:', { accountId, status })

    // Clean redirect back to profile payments page
    // Frontend will check database state and show appropriate status
    const redirectUrl = 'https://artb.art/profile/payments'

    // Direct redirect - no intermediate page, no URL params
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl,
      },
    })

  } catch (error) {
    console.error('Return handler error:', error)
    
    // Fallback redirect on error
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': 'https://artb.art/profile/payments',
      },
    })
  }
})