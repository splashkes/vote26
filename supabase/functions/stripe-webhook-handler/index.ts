// Stripe Webhook Handler Edge Function
// Processes Stripe webhook events for payment confirmation
// Updates payment status and artwork status
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';
serve(async (req)=>{
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', {
      status: 400
    });
  }
  try {
    // Get raw body for signature verification
    const body = await req.text();
    // Determine which Stripe account based on webhook endpoint
    // You might want to use different endpoints for Canada vs International
    // For now, we'll check both
    let event = null;
    let stripeAccountRegion = 'international';
    // Try Canada webhook secret first
    const canadaWebhookSecret = Deno.env.get('stripe_webhook_secret_canada');
    if (canadaWebhookSecret) {
      const canadaStripeKey = Deno.env.get('stripe_canada_secret_key');
      const stripeCanada = new Stripe(canadaStripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient()
      });
      try {
        event = await stripeCanada.webhooks.constructEventAsync(body, signature, canadaWebhookSecret);
        stripeAccountRegion = 'canada';
      } catch (err) {
      // Not from Canada account, try canada backup
      }
    }

    // Try Canada backup webhook secret if primary didn't work
    if (!event) {
      const canadaBackupWebhookSecret = Deno.env.get('stripe_webhook_secret_canada_backup');
      if (canadaBackupWebhookSecret) {
        const canadaStripeKey = Deno.env.get('stripe_canada_secret_key');
        const stripeCanada = new Stripe(canadaStripeKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });
        try {
          event = await stripeCanada.webhooks.constructEventAsync(body, signature, canadaBackupWebhookSecret);
          stripeAccountRegion = 'canada';
        } catch (err) {
        // Not from Canada backup, try international
        }
      }
    }

    // Try international webhook secret if Canada didn't work
    if (!event) {
      const intlWebhookSecret = Deno.env.get('stripe_webhook_secret_intl');
      if (intlWebhookSecret) {
        const intlStripeKey = Deno.env.get('stripe_intl_secret_key');
        const stripeIntl = new Stripe(intlStripeKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });
        try {
          event = await stripeIntl.webhooks.constructEventAsync(body, signature, intlWebhookSecret);
          stripeAccountRegion = 'international';
        } catch (err) {
        // Not from international account, try international backup
        }
      }
    }

    // Try international backup webhook secret if primary didn't work
    if (!event) {
      const intlBackupWebhookSecret = Deno.env.get('stripe_webhook_secret_intl_backup');
      if (intlBackupWebhookSecret) {
        const intlStripeKey = Deno.env.get('stripe_intl_secret_key');
        const stripeIntl = new Stripe(intlStripeKey, {
          apiVersion: '2023-10-16',
          httpClient: Stripe.createFetchHttpClient()
        });
        try {
          event = await stripeIntl.webhooks.constructEventAsync(body, signature, intlBackupWebhookSecret);
          stripeAccountRegion = 'international';
        } catch (err) {
        // All webhook secrets failed
        }
      }
    }
    if (!event) {
      console.error('Failed to verify webhook signature');
      return new Response('Invalid signature', {
        status: 400
      });
    }
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Handle different event types
    switch(event.type){
      // Global Payments Events
      case 'recipient.created':
        {
          const recipient = event.data.object; // Global Payouts recipient
          console.log('Processing recipient.created:', recipient.id);
          // Update Global Payments record if it exists
          const { error: updateError } = await supabase.from('artist_global_payments').update({
            stripe_recipient_id: recipient.id,
            status: 'in_review',
            updated_at: new Date().toISOString(),
            metadata: {
              stripe_recipient_data: recipient,
              last_webhook_update: new Date().toISOString()
            }
          }).eq('stripe_recipient_id', recipient.id);
          if (updateError) {
            console.error('Error updating recipient record:', updateError);
          }
          break;
        }
      case 'recipient.updated':
        {
          const recipient = event.data.object; // Global Payouts recipient
          console.log('Processing recipient.updated:', recipient.id, 'status:', recipient.status);
          // Map Stripe recipient status to our status
          let ourStatus = 'in_review';
          switch(recipient.status){
            case 'ready':
              ourStatus = 'ready';
              break;
            case 'blocked':
              ourStatus = 'blocked';
              break;
            case 'rejected':
              ourStatus = 'rejected';
              break;
          }
          const { error: updateError } = await supabase.from('artist_global_payments').update({
            status: ourStatus,
            updated_at: new Date().toISOString(),
            metadata: {
              stripe_recipient_data: recipient,
              last_webhook_update: new Date().toISOString()
            }
          }).eq('stripe_recipient_id', recipient.id);
          if (updateError) {
            console.error('Error updating recipient status:', updateError);
          }
          break;
        }
      case 'payout.created':
        {
          const payout = event.data.object; // Global Payouts payout
          console.log('Processing payout.created:', payout.id);
          // Update our payout request record
          const { error: updateError } = await supabase.from('global_payment_requests').update({
            status: 'sent',
            sent_at: new Date(payout.created * 1000).toISOString(),
            metadata: {
              stripe_payout_data: payout,
              last_webhook_update: new Date().toISOString()
            }
          }).eq('stripe_payout_id', payout.id);
          if (updateError) {
            console.error('Error updating payout created status:', updateError);
          }
          break;
        }
      case 'payout.paid':
        {
          const payout = event.data.object; // Global Payouts payout
          console.log('Processing payout.paid:', payout.id);
          // Update our payout request to paid status
          const { error: updateError } = await supabase.from('global_payment_requests').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            metadata: {
              stripe_payout_data: payout,
              last_webhook_update: new Date().toISOString()
            }
          }).eq('stripe_payout_id', payout.id);
          if (updateError) {
            console.error('Error updating payout paid status:', updateError);
          }
          break;
        }
      case 'payout.failed':
        {
          const payout = event.data.object; // Global Payouts payout
          console.log('Processing payout.failed:', payout.id);
          // Update our payout request to failed status
          const { error: updateError } = await supabase.from('global_payment_requests').update({
            status: 'failed',
            error_code: payout.failure_code || 'unknown_failure',
            error_message: payout.failure_message || 'Payout failed',
            metadata: {
              stripe_payout_data: payout,
              failure_details: {
                code: payout.failure_code,
                message: payout.failure_message,
                balance_transaction: payout.failure_balance_transaction
              },
              last_webhook_update: new Date().toISOString()
            }
          }).eq('stripe_payout_id', payout.id);
          if (updateError) {
            console.error('Error updating payout failed status:', updateError);
          }
          break;
        }
      case 'payout.canceled':
        {
          const payout = event.data.object; // Global Payouts payout
          console.log('Processing payout.canceled:', payout.id);
          // Update our payout request to canceled status
          const { error: updateError } = await supabase.from('global_payment_requests').update({
            status: 'canceled',
            metadata: {
              stripe_payout_data: payout,
              last_webhook_update: new Date().toISOString()
            }
          }).eq('stripe_payout_id', payout.id);
          if (updateError) {
            console.error('Error updating payout canceled status:', updateError);
          }
          break;
        }
      // Global Payments Account Events
      case 'account.updated':
        {
          const account = event.data.object; // Custom Connect account
          console.log('Processing account.updated:', account.id, 'charges_enabled:', account.charges_enabled, 'payouts_enabled:', account.payouts_enabled, 'email:', account.email);

          // First try to find the Global Payments record by Stripe account ID (existing logic)
          let { data: globalPayment, error: findError } = await supabase.from('artist_global_payments').select('*, artist_profiles(name, email, entry_id)').eq('stripe_recipient_id', account.id).single();

          // If no direct match found, but account is enabled, try to find by artist email
          if ((findError || !globalPayment) && account.charges_enabled && account.payouts_enabled && account.email) {
            console.log('No direct account match found, searching by email for enabled account:', account.email);

            // Find artist profile by email
            const { data: artistProfile, error: profileError } = await supabase
              .from('artist_profiles')
              .select('id, name, email, entry_id')
              .eq('email', account.email)
              .single();

            if (artistProfile && !profileError) {
              console.log('Found artist profile by email:', artistProfile.name, 'profile_id:', artistProfile.id);

              // Check if they have an existing Global Payments record
              const { data: existingGlobalPayment, error: existingError } = await supabase
                .from('artist_global_payments')
                .select('*')
                .eq('artist_profile_id', artistProfile.id)
                .single();

              if (existingGlobalPayment && !existingError) {
                // Update existing record to use this enabled account
                console.log('Updating existing Global Payments record to use enabled account:', account.id);
                const { data: updatedRecord, error: updateError } = await supabase
                  .from('artist_global_payments')
                  .update({
                    stripe_recipient_id: account.id,
                    status: 'ready',
                    updated_at: new Date().toISOString(),
                    metadata: {
                      ...existingGlobalPayment.metadata,
                      account_auto_linked_at: new Date().toISOString(),
                      account_auto_linked_reason: 'webhook_found_enabled_account_by_email',
                      previous_account: existingGlobalPayment.stripe_recipient_id
                    }
                  })
                  .eq('artist_profile_id', artistProfile.id)
                  .select('*, artist_profiles(name, email, entry_id)')
                  .single();

                if (!updateError && updatedRecord) {
                  globalPayment = updatedRecord;
                  findError = null;
                  console.log('Successfully linked enabled account to existing record');
                } else {
                  console.error('Error updating existing Global Payments record:', updateError);
                }
              } else {
                // Create new Global Payments record for this enabled account
                console.log('Creating new Global Payments record for enabled account:', account.id);
                const { data: newRecord, error: createError } = await supabase
                  .from('artist_global_payments')
                  .insert({
                    artist_profile_id: artistProfile.id,
                    stripe_recipient_id: account.id,
                    status: 'ready',
                    country: account.country || 'US',
                    metadata: {
                      created_via: 'webhook_auto_link',
                      created_at: new Date().toISOString(),
                      account_auto_linked_at: new Date().toISOString(),
                      account_auto_linked_reason: 'webhook_found_enabled_account_by_email',
                      stripe_account_type: 'custom'
                    }
                  })
                  .select('*, artist_profiles(name, email, entry_id)')
                  .single();

                if (!createError && newRecord) {
                  globalPayment = newRecord;
                  findError = null;
                  console.log('Successfully created new Global Payments record for enabled account');
                } else {
                  console.error('Error creating new Global Payments record:', createError);
                }
              }
            } else {
              console.log('No artist profile found for email:', account.email);
            }
          }

          // If still no match found, exit
          if (findError || !globalPayment) {
            console.log('No Global Payments record found or created for account:', account.id);
            break;
          }
          // Determine the new status based on account capabilities
          let newStatus = 'in_review';
          if (account.charges_enabled && account.payouts_enabled) {
            newStatus = 'ready';
          } else if (account.requirements && account.requirements.disabled_reason) {
            newStatus = account.requirements.disabled_reason === 'rejected.fraud' ? 'rejected' : 'blocked';
          }
          // Update the Global Payments record
          const { error: updateError } = await supabase.from('artist_global_payments').update({
            status: newStatus,
            updated_at: new Date().toISOString(),
            metadata: {
              stripe_account_data: account,
              last_webhook_update: new Date().toISOString(),
              charges_enabled: account.charges_enabled,
              payouts_enabled: account.payouts_enabled,
              onboarding_completed: account.charges_enabled && account.payouts_enabled
            }
          }).eq('stripe_recipient_id', account.id);
          if (updateError) {
            console.error('Error updating account status:', updateError);
            break;
          }
          // Send Slack notification if onboarding completed
          if (account.charges_enabled && account.payouts_enabled && globalPayment.status !== 'ready') {
            try {
              const slackBlocks = [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: '✅ Global Payments Setup Completed',
                    emoji: true
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*Artist:* ${globalPayment.artist_profiles.name}\n*Email:* ${globalPayment.artist_profiles.email}\n*Entry ID:* ${globalPayment.artist_profiles.entry_id}\n*Stripe Account:* ${account.id}\n*Status:* Ready for payouts\n*Profile ID:* ${globalPayment.artist_profile_id}`
                  }
                },
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: `Completed at ${new Date().toISOString()} | Account is now active for payments`
                    }
                  ]
                }
              ];
              await supabase.rpc('queue_slack_notification', {
                p_channel_name: 'payments-artists',
                p_message_type: 'global_payments_completed',
                p_text: `✅ ${globalPayment.artist_profiles.name} completed Global Payments setup`,
                p_blocks: slackBlocks,
                p_event_id: null
              });
              console.log('Slack completion notification queued for account:', account.id);
            } catch (slackError) {
              console.error('Failed to queue completion Slack notification:', slackError);
            }
          }
          break;
        }
      // Existing Stripe Connect/Checkout Events
      case 'checkout.session.completed':
        {
          const session = event.data.object;
          console.log('Processing checkout.session.completed:', session.id);
          console.log('Payment status:', session.payment_status);
          console.log('Session status:', session.status);
          console.log('Amount total:', session.amount_total);
          console.log('Presentment details:', session.presentment_details);
          // If payment is completed, mark as completed immediately
          if (session.payment_status === 'paid' && session.status === 'complete') {
            console.log('Payment is complete, updating to completed status');
            // Complete the payment directly using RPC
            const { data: result, error: completeError } = await supabase.rpc('complete_stripe_payment', {
              p_session_id: session.id,
              p_payment_intent_id: session.payment_intent,
              p_payment_method: 'stripe'
            });
            if (completeError) {
              console.error('Error completing payment:', completeError);
              throw completeError;
            }
            console.log('Payment completed successfully:', result);
            // Update metadata with presentment details if Adaptive Pricing was used
            if (session.presentment_details) {
              const { error: metadataError } = await supabase.from('payment_processing').update({
                metadata: {
                  webhook_event: 'checkout.session.completed',
                  webhook_received_at: new Date().toISOString(),
                  stripe_account_region: stripeAccountRegion,
                  payment_status: session.payment_status,
                  session_status: session.status,
                  presentment_amount: session.presentment_details.presentment_amount,
                  presentment_currency: session.presentment_details.presentment_currency,
                  adaptive_pricing_used: true
                }
              }).eq('stripe_checkout_session_id', session.id);
              if (metadataError) {
                console.error('Error updating presentment metadata:', metadataError);
              } else {
                console.log('Updated payment with presentment details:', {
                  presentment_amount: session.presentment_details.presentment_amount,
                  presentment_currency: session.presentment_details.presentment_currency
                });
              }
            }
          } else {
            // Fallback: just update to processing if not fully paid yet
            console.log('Payment not yet complete, updating to processing status');
            const { data: payment, error: paymentError } = await supabase.from('payment_processing').update({
              status: 'processing',
              stripe_payment_intent_id: session.payment_intent,
              payment_method: 'stripe',
              metadata: {
                webhook_event: 'checkout.session.completed',
                webhook_received_at: new Date().toISOString(),
                stripe_account_region: stripeAccountRegion,
                payment_status: session.payment_status,
                session_status: session.status,
                presentment_amount: session.presentment_details?.presentment_amount,
                presentment_currency: session.presentment_details?.presentment_currency,
                adaptive_pricing_used: !!session.presentment_details
              }
            }).eq('stripe_checkout_session_id', session.id).select().single();
            if (paymentError) {
              console.error('Error updating payment:', paymentError);
              throw new Error('Payment record not found');
            }
            console.log('Payment updated to processing:', payment.id);
          }
          break;
        }
      case 'payment_intent.succeeded':
        {
          const paymentIntent = event.data.object;
          console.log('Processing payment_intent.succeeded:', paymentIntent.id);
          // Find payment by payment intent ID
          const { data: payment, error: findError } = await supabase.from('payment_processing').select('*').eq('stripe_payment_intent_id', paymentIntent.id).single();
          if (findError || !payment) {
            console.error('Payment not found for intent:', paymentIntent.id);
            // Don't throw - this might be a duplicate webhook
            return new Response('Payment not found', {
              status: 200
            });
          }
          // Complete the payment
          const { data: result, error: completeError } = await supabase.rpc('complete_stripe_payment', {
            p_session_id: payment.stripe_checkout_session_id,
            p_payment_intent_id: paymentIntent.id,
            p_payment_method: 'stripe'
          });
          if (completeError) {
            console.error('Error completing payment:', completeError);
            throw completeError;
          }
          console.log('Payment completed:', result);
          break;
        }
      case 'payment_intent.payment_failed':
        {
          const paymentIntent = event.data.object;
          console.log('Processing payment_intent.payment_failed:', paymentIntent.id);
          // Update payment status to failed
          const { error: updateError } = await supabase.from('payment_processing').update({
            status: 'failed',
            error_message: paymentIntent.last_payment_error?.message || 'Payment failed',
            metadata: {
              webhook_event: 'payment_intent.payment_failed',
              webhook_received_at: new Date().toISOString(),
              error_details: paymentIntent.last_payment_error
            }
          }).eq('stripe_payment_intent_id', paymentIntent.id);
          if (updateError) {
            console.error('Error updating failed payment:', updateError);
          }
          break;
        }
      case 'checkout.session.expired':
        {
          const session = event.data.object;
          console.log('Processing checkout.session.expired:', session.id);
          // Update payment status to cancelled
          const { error: updateError } = await supabase.from('payment_processing').update({
            status: 'cancelled',
            metadata: {
              webhook_event: 'checkout.session.expired',
              webhook_received_at: new Date().toISOString()
            }
          }).eq('stripe_checkout_session_id', session.id).eq('status', 'pending') // Only cancel if still pending
          ;
          if (updateError) {
            console.error('Error updating expired session:', updateError);
          }
          break;
        }
      default:
        console.log('Unhandled event type:', event.type);
    }
    return new Response(JSON.stringify({
      received: true
    }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
