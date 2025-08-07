// Stripe Webhook Handler Edge Function
// Processes Stripe webhook events for payment confirmation
// Updates payment status and artwork status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno'

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  
  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    // Get raw body for signature verification
    const body = await req.text()
    
    // Determine which Stripe account based on webhook endpoint
    // You might want to use different endpoints for Canada vs International
    // For now, we'll check both
    let event: Stripe.Event | null = null
    let stripeAccountRegion = 'international'
    
    // Try Canada webhook secret first
    const canadaWebhookSecret = Deno.env.get('stripe_webhook_secret_canada')
    if (canadaWebhookSecret) {
      const canadaStripeKey = Deno.env.get('stripe_canada_secret_key')!
      const stripeCanada = new Stripe(canadaStripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      })
      
      try {
        event = await stripeCanada.webhooks.constructEventAsync(
          body,
          signature,
          canadaWebhookSecret
        )
        stripeAccountRegion = 'canada'
      } catch (err) {
        // Not from Canada account, try international
      }
    }
    
    // Try international webhook secret if Canada didn't work
    if (!event) {
      const intlWebhookSecret = Deno.env.get('stripe_webhook_secret_intl')
      if (intlWebhookSecret) {
        const intlStripeKey = Deno.env.get('stripe_intl_secret_key')!
        const stripeIntl = new Stripe(intlStripeKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient(),
        })
        
        event = await stripeIntl.webhooks.constructEventAsync(
          body,
          signature,
          intlWebhookSecret
        )
        stripeAccountRegion = 'international'
      }
    }
    
    if (!event) {
      console.error('Failed to verify webhook signature')
      return new Response('Invalid signature', { status: 400 })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        console.log('Processing checkout.session.completed:', session.id)
        console.log('Payment status:', session.payment_status)
        console.log('Session status:', session.status)
        console.log('Amount total:', session.amount_total)
        
        // If payment is completed, mark as completed immediately
        if (session.payment_status === 'paid' && session.status === 'complete') {
          console.log('Payment is complete, updating to completed status')
          
          // Complete the payment directly using RPC
          const { data: result, error: completeError } = await supabase
            .rpc('complete_stripe_payment', {
              p_session_id: session.id,
              p_payment_intent_id: session.payment_intent as string,
              p_payment_method: 'stripe',
            })

          if (completeError) {
            console.error('Error completing payment:', completeError)
            throw completeError
          }

          console.log('Payment completed successfully:', result)
        } else {
          // Fallback: just update to processing if not fully paid yet
          console.log('Payment not yet complete, updating to processing status')
          
          const { data: payment, error: paymentError } = await supabase
            .from('payment_processing')
            .update({
              status: 'processing',
              stripe_payment_intent_id: session.payment_intent as string,
              payment_method: 'stripe',
              metadata: {
                webhook_event: 'checkout.session.completed',
                webhook_received_at: new Date().toISOString(),
                stripe_account_region: stripeAccountRegion,
                payment_status: session.payment_status,
                session_status: session.status,
              },
            })
            .eq('stripe_checkout_session_id', session.id)
            .select()
            .single()

          if (paymentError) {
            console.error('Error updating payment:', paymentError)
            throw new Error('Payment record not found')
          }

          console.log('Payment updated to processing:', payment.id)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        console.log('Processing payment_intent.succeeded:', paymentIntent.id)
        
        // Find payment by payment intent ID
        const { data: payment, error: findError } = await supabase
          .from('payment_processing')
          .select('*')
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .single()

        if (findError || !payment) {
          console.error('Payment not found for intent:', paymentIntent.id)
          // Don't throw - this might be a duplicate webhook
          return new Response('Payment not found', { status: 200 })
        }

        // Complete the payment
        const { data: result, error: completeError } = await supabase
          .rpc('complete_stripe_payment', {
            p_session_id: payment.stripe_checkout_session_id,
            p_payment_intent_id: paymentIntent.id,
            p_payment_method: 'stripe',
          })

        if (completeError) {
          console.error('Error completing payment:', completeError)
          throw completeError
        }

        console.log('Payment completed:', result)
        
        // Send confirmation notification (optional)
        // You could trigger an SMS or email here
        
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        console.log('Processing payment_intent.payment_failed:', paymentIntent.id)
        
        // Update payment status to failed
        const { error: updateError } = await supabase
          .from('payment_processing')
          .update({
            status: 'failed',
            error_message: paymentIntent.last_payment_error?.message || 'Payment failed',
            metadata: {
              webhook_event: 'payment_intent.payment_failed',
              webhook_received_at: new Date().toISOString(),
              error_details: paymentIntent.last_payment_error,
            },
          })
          .eq('stripe_payment_intent_id', paymentIntent.id)

        if (updateError) {
          console.error('Error updating failed payment:', updateError)
        }
        
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        
        console.log('Processing checkout.session.expired:', session.id)
        
        // Update payment status to cancelled
        const { error: updateError } = await supabase
          .from('payment_processing')
          .update({
            status: 'cancelled',
            metadata: {
              webhook_event: 'checkout.session.expired',
              webhook_received_at: new Date().toISOString(),
            },
          })
          .eq('stripe_checkout_session_id', session.id)
          .eq('status', 'pending') // Only cancel if still pending

        if (updateError) {
          console.error('Error updating expired session:', updateError)
        }
        
        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})