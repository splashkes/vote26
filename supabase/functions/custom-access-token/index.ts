// Custom Access Token Hook - MINIMAL TEST VERSION
// Just adds auth_version to test webhook integration
// Date: 2025-01-08

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

Deno.serve(async (req) => {
  try {
    const payload = await req.text()
    const base64_secret = Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET')?.replace('v1,whsec_', '')
    
    if (!base64_secret) {
      return new Response(
        JSON.stringify({
          error: 'Webhook secret not configured',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }
    
    const headers = Object.fromEntries(req.headers)
    const wh = new Webhook(base64_secret)
    
    // Verify webhook signature and extract payload
    const { user_id, claims, authentication_method } = wh.verify(payload, headers)
    
    // Just add auth_version for now - no database queries
    const updatedClaims = {
      ...claims,
      auth_version: 'v2-http',
      person_pending: true,
    }

    return new Response(
      JSON.stringify({
        claims: updatedClaims,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: `Failed to process the request: ${error.message}`,
        debug_info: {
          error_name: error.constructor.name,
          error_message: error.message,
          has_secret: !!Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET'),
          secret_format: Deno.env.get('CUSTOM_ACCESS_TOKEN_SECRET')?.substring(0, 10) + '...',
        }
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
})