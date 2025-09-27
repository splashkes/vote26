import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface PendingPayment {
  id: string;
  artist_profile_id: string;
  amount: number;
  currency: string;
  stripe_recipient_id: string;
  artist_name: string;
  artist_email: string;
  description: string;
  created_at: string;
}

serve(async (req) => {
  // Always return CORS headers for all responses
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let limit = 10;
    let dry_run = false;

    try {
      const body = await req.json();
      limit = body.limit || 10;
      dry_run = body.dry_run || false;
    } catch (jsonError) {
      // Use defaults if JSON parsing fails (e.g., empty body)
      console.log('JSON parsing failed, using defaults');
    }

    console.log(`Processing pending payments (limit: ${limit}, dry_run: ${dry_run})`);

    // Get pending payments that need to be processed
    const { data: pendingPayments, error: fetchError } = await supabaseClient
      .from('artist_payments')
      .select(`
        id,
        artist_profile_id,
        gross_amount,
        currency,
        description,
        created_at,
        metadata,
        artist_profiles!inner (
          name,
          email
        )
      `)
      .eq('status', 'processing')
      .eq('payment_type', 'automated')
      .not('metadata->stripe_account_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch pending payments: ${fetchError.message}`);
    }

    // If no payments found with global accounts, check for payments without accounts for diagnostics
    if (!pendingPayments || pendingPayments.length === 0) {
      const { data: allPendingPayments } = await supabaseClient
        .from('artist_payments')
        .select(`
          id,
          artist_profile_id,
          gross_amount,
          currency,
          description,
          created_at,
          artist_profiles!inner (
            name,
            email
          )
        `)
        .eq('status', 'processing')
        .eq('payment_type', 'automated')
        .limit(limit);

      const diagnostics = allPendingPayments?.map(payment => ({
        payment_id: payment.id,
        artist_name: payment.artist_profiles.name,
        amount: payment.gross_amount,
        currency: payment.currency,
        issue: 'No payment account setup'
      })) || [];

      return new Response(
        JSON.stringify({
          success: true,
          message: allPendingPayments && allPendingPayments.length > 0
            ? `No payments ready to process. Found ${diagnostics.length} pending payments but artists need payment account setup.`
            : 'No pending payments to process',
          processed_count: 0,
          total_amount: 0,
          payments: [],
          blocked_payments: diagnostics
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingPayments.length} pending payments to process`);

    const results = [];
    let successful_count = 0;
    let failed_count = 0;
    let total_processed_amount = 0;

    for (const payment of pendingPayments) {
      const artistProfile = payment.artist_profiles;
      const stripeAccountId = payment.metadata?.stripe_account_id;

      if (!stripeAccountId) {
        console.log(`Skipping payment ${payment.id}: No Stripe account ID for artist ${artistProfile.name}`);
        failed_count++;
        results.push({
          payment_id: payment.id,
          artist_name: artistProfile.name,
          amount: payment.gross_amount,
          currency: payment.currency,
          status: 'failed',
          error: 'No Stripe account ID in metadata',
          dry_run: dry_run
        });
        continue;
      }

      const paymentData = {
        id: payment.id,
        artist_profile_id: payment.artist_profile_id,
        amount: payment.gross_amount,
        currency: payment.currency,
        stripe_recipient_id: stripeAccountId,
        artist_name: artistProfile.name,
        artist_email: artistProfile.email,
        description: payment.description,
        created_at: payment.created_at
      };

      console.log(`Processing payment ${payment.id} for ${artistProfile.name}: ${payment.currency} ${payment.gross_amount}`);

      let apiConversationLogged = false;
      try {
        let stripe_response = null;
        let payment_status = 'paid';

        if (!dry_run) {
          // Determine which Stripe key to use based on account type/region
          let stripeApiKey;
          let stripeAccountType;

          // Check if this is a Canadian account (account ID starts with acct_ and has CA characteristics)
          // For now, we'll use international by default and add logic to detect Canadian accounts
          const isCanadian = (paymentData.stripe_recipient_id && paymentData.stripe_recipient_id.includes('canada')) ||
              (paymentData.currency === 'CAD');

          if (isCanadian) {
            stripeApiKey = Deno.env.get('stripe_canada_secret_key');
            stripeAccountType = 'canada';
          } else {
            stripeApiKey = Deno.env.get('stripe_intl_secret_key');
            stripeAccountType = 'international';
          }

          // DEBUG: Log key selection for troubleshooting insufficient funds
          console.log(`🔑 Payment ${payment.id} (${artistProfile.name}):`, {
            stripe_recipient_id: paymentData.stripe_recipient_id,
            currency: paymentData.currency,
            detected_region: stripeAccountType,
            has_stripe_key: !!stripeApiKey,
            key_length: stripeApiKey ? stripeApiKey.length : 0
          });

          if (!stripeApiKey) {
            throw new Error(`Stripe API key not configured for ${paymentData.currency === 'CAD' ? 'Canada' : 'International'}`);
          }

          // Prepare request data
          const requestBody = new URLSearchParams({
            amount: Math.round(paymentData.amount * 100).toString(), // Convert to cents
            currency: paymentData.currency.toLowerCase(),
            destination: paymentData.stripe_recipient_id,
            description: paymentData.description || `Payment to ${paymentData.artist_name}`,
            'metadata[artist_profile_id]': paymentData.artist_profile_id,
            'metadata[payment_id]': paymentData.id,
            'metadata[artist_name]': paymentData.artist_name,
            'metadata[processed_by]': 'automated-cron'
          });

          const requestHeaders = {
            'Authorization': `Bearer ${stripeApiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          };

          // Track API call timing
          const apiCallStart = Date.now();

          // Create Stripe transfer
          const stripeTransferResponse = await fetch('https://api.stripe.com/v1/transfers', {
            method: 'POST',
            headers: requestHeaders,
            body: requestBody,
          });

          const apiCallDuration = Date.now() - apiCallStart;
          stripe_response = await stripeTransferResponse.json();

          // Log the complete API conversation to database
          await supabaseClient
            .from('stripe_api_conversations')
            .insert({
              payment_id: payment.id,
              artist_profile_id: paymentData.artist_profile_id,
              stripe_account_id: stripeAccountType,
              api_endpoint: 'https://api.stripe.com/v1/transfers',
              request_method: 'POST',
              request_headers: {
                'Content-Type': requestHeaders['Content-Type'],
                'stripe_account': stripeAccountType
              },
              request_body: {
                amount: Math.round(paymentData.amount * 100),
                currency: paymentData.currency.toLowerCase(),
                destination: paymentData.stripe_recipient_id,
                description: paymentData.description || `Payment to ${paymentData.artist_name}`,
                metadata: {
                  artist_profile_id: paymentData.artist_profile_id,
                  payment_id: paymentData.id,
                  artist_name: paymentData.artist_name,
                  processed_by: 'automated-cron'
                }
              },
              response_status: stripeTransferResponse.status,
              response_headers: {
                'content-type': stripeTransferResponse.headers.get('content-type'),
                'request-id': stripeTransferResponse.headers.get('request-id')
              },
              response_body: stripe_response,
              error_message: !stripeTransferResponse.ok ? (stripe_response.error?.message || 'API call failed') : null,
              processing_duration_ms: apiCallDuration,
              created_by: 'process-pending-payments'
            });

          // Mark that API conversation was successfully logged
          apiConversationLogged = true;

          if (!stripeTransferResponse.ok) {
            // Error response was already logged above, now throw the error
            throw new Error(`Stripe API error: ${stripe_response.error?.message || 'Unknown error'}`);
          }

          console.log(`Stripe transfer successful: ${stripe_response.id}`);
        } else {
          stripe_response = {
            id: `dry_run_${Date.now()}`,
            amount: Math.round(paymentData.amount * 100),
            currency: paymentData.currency.toLowerCase(),
            destination: paymentData.stripe_recipient_id,
            status: 'dry_run_success'
          };
          payment_status = 'pending'; // Keep as pending for dry run
          console.log(`DRY RUN: Would transfer ${paymentData.currency} ${paymentData.amount} to ${paymentData.stripe_recipient_id}`);
        }

        // Update payment status in database
        const { error: updateError } = await supabaseClient
          .from('artist_payments')
          .update({
            status: payment_status,
            stripe_transfer_id: stripe_response.id,
            metadata: {
              ...payment.metadata,
              stripe_response: stripe_response,
              processed_by: 'automated-cron',
              processed_at: new Date().toISOString()
            }
          })
          .eq('id', payment.id);

        if (updateError) {
          throw new Error(`Failed to update payment status: ${updateError.message}`);
        }

        successful_count++;
        total_processed_amount += paymentData.amount;

        results.push({
          payment_id: payment.id,
          artist_name: paymentData.artist_name,
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: 'success',
          stripe_transfer_id: stripe_response.id,
          dry_run: dry_run,
          // Include API conversation logged flag only if actually logged
          api_conversation_logged: apiConversationLogged
        });

      } catch (error) {
        console.error(`Failed to process payment ${payment.id}:`, error);
        failed_count++;

        // Update payment with error status
        await supabaseClient
          .from('artist_payments')
          .update({
            status: 'failed',
            metadata: {
              ...payment.metadata,
              error_message: error.message,
              failed_at: new Date().toISOString(),
              processed_by: 'automated-cron'
            }
          })
          .eq('id', payment.id);

        results.push({
          payment_id: payment.id,
          artist_name: paymentData.artist_name,
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: 'failed',
          error: error.message,
          dry_run: dry_run,
          // Include API conversation logged flag only if actually logged
          api_conversation_logged: apiConversationLogged
        });
      }
    }

    const summary = {
      success: true,
      message: `Processed ${pendingPayments.length} payments: ${successful_count} successful, ${failed_count} failed`,
      processed_count: pendingPayments.length,
      successful_count,
      failed_count,
      total_amount: total_processed_amount,
      dry_run: dry_run,
      payments: results,
      timestamp: new Date().toISOString()
    };

    console.log('Payment processing summary:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'process-pending-payments',
          error_type: error.constructor.name,
          error_message: error.message,
          error_stack: error.stack,
          received_parameters: req.method === 'POST' ? 'POST request' : 'Other request',
          supabase_url: Deno.env.get('SUPABASE_URL'),
          has_service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
          stripe_keys: {
            canada: !!Deno.env.get('stripe_canada_secret_key'),
            international: !!Deno.env.get('stripe_intl_secret_key')
          }
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});