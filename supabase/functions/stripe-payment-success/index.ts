// Stripe Payment Success Handler Edge Function
// Handles Stripe success callbacks and ensures payment completion
// Then redirects to the React app

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get session_id from URL parameters
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id')
    
    if (!sessionId) {
      console.error('No session_id provided')
      // Redirect to main app even if no session ID
      return Response.redirect('https://artb.art/v25/app/?error=no_session', 302)
    }

    console.log('Processing payment success for session:', sessionId)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Find the payment record by session ID
    const { data: payment, error: findError } = await supabase
      .from('payment_processing')
      .select(`
        id,
        art_id,
        person_id,
        event_id,
        status,
        stripe_checkout_session_id,
        metadata
      `)
      .eq('stripe_checkout_session_id', sessionId)
      .single()

    if (findError || !payment) {
      console.error('Payment not found for session:', sessionId, findError)
      // Redirect to main app with error
      return Response.redirect('https://artb.art/v25/app/?error=payment_not_found', 302)
    }

    console.log('Found payment record:', payment.id, 'Status:', payment.status)

    // If payment is already completed, just redirect to success
    if (payment.status === 'completed') {
      console.log('Payment already completed, redirecting to event')
      return Response.redirect(`https://artb.art/v25/app/event/${payment.event_id}?payment=success&art_id=${payment.art_id}`, 302)
    }

    // If payment is still pending, try to complete it via RPC
    if (payment.status === 'pending' || payment.status === 'processing') {
      console.log('Attempting to complete payment via RPC')
      
      // Try to complete the payment (this will handle both processing and completion)
      const { data: result, error: completeError } = await supabase
        .rpc('complete_stripe_payment', {
          p_session_id: sessionId,
          p_payment_intent_id: 'success_callback', // Placeholder since we don't have the intent ID yet
          p_payment_method: 'stripe',
        })

      if (completeError) {
        console.error('Error completing payment:', completeError)
        // Still redirect to success - the webhook will handle completion
      } else {
        console.log('Payment completed via success callback:', result)
      }
    }

    // Redirect to the event page with success parameters
    const redirectUrl = `https://artb.art/v25/app/event/${payment.event_id}?payment=success&session_id=${sessionId}&art_id=${payment.art_id}`
    console.log('Redirecting to:', redirectUrl)
    
    return Response.redirect(redirectUrl, 302)

  } catch (error) {
    console.error('Payment success handler error:', error)
    // Always redirect to main app, even on error
    return Response.redirect('https://artb.art/v25/app/?error=processing_error', 302)
  }
})