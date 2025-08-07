// Minimal Stripe Webhook Handler - bypasses Supabase auth requirements
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, stripe-signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    })
  }
  
  // Simple test - just return success for now
  console.log('Webhook received!')
  console.log('Headers:', Object.fromEntries(req.headers.entries()))
  
  return new Response(JSON.stringify({ 
    received: true,
    timestamp: new Date().toISOString(),
    message: "Webhook processed successfully"
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    status: 200,
  })
})