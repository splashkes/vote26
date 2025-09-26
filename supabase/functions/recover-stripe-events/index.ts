// Stripe Event Recovery Function
// Recovers and processes missed Stripe events from the last 24 hours
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface RecoveryEvent {
  event_id: string;
  type: string;
  created: number;
  data: any;
  matched_payment_id?: string;
  processed: boolean;
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request parameters
    let hours_back = 24;
    let dry_run = true;
    let event_types: string[] = ['transfer', 'account.updated', 'payout'];

    try {
      const body = await req.json();
      hours_back = body.hours_back || 24;
      dry_run = body.dry_run !== false; // Default to true
      event_types = body.event_types || event_types;
    } catch {
      // Use defaults if no body
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const debugInfo = {
      timestamp: new Date().toISOString(),
      function_name: 'recover-stripe-events',
      hours_back,
      dry_run,
      event_types,
      recovery_start: Date.now()
    };

    console.log(`🔄 Starting Stripe event recovery: ${hours_back}h back, dry_run: ${dry_run}`);

    // Initialize Stripe clients for both regions
    const stripeUS = new Stripe(Deno.env.get('stripe_intl_secret_key') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    const stripeCA = new Stripe(Deno.env.get('stripe_canada_secret_key') ?? '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    // Calculate time range
    const since = Math.floor((Date.now() - (hours_back * 60 * 60 * 1000)) / 1000);
    const recoveryEvents: RecoveryEvent[] = [];

    // Recover events from both Stripe accounts
    const stripeAccounts = [
      { stripe: stripeUS, region: 'US' },
      { stripe: stripeCA, region: 'CA' }
    ];

    for (const account of stripeAccounts) {
      console.log(`🔍 Fetching events from Stripe ${account.region}...`);

      try {
        // Fetch events in batches
        let hasMore = true;
        let startingAfter: string | undefined;

        while (hasMore) {
          const eventsPage = await account.stripe.events.list({
            created: { gte: since },
            limit: 100,
            starting_after: startingAfter
          });

          for (const event of eventsPage.data) {
            // Filter for relevant event types
            const isRelevant = event_types.some(type => event.type.startsWith(type));
            if (!isRelevant) continue;

            console.log(`📅 Found event: ${event.type} (${event.id}) from ${account.region}`);

            const recoveryEvent: RecoveryEvent = {
              event_id: event.id,
              type: event.type,
              created: event.created,
              data: event.data.object,
              processed: false
            };

            // Try to match event to existing payment records
            await matchEventToPayment(recoveryEvent, supabaseClient);

            recoveryEvents.push(recoveryEvent);
          }

          hasMore = eventsPage.has_more;
          if (hasMore && eventsPage.data.length > 0) {
            startingAfter = eventsPage.data[eventsPage.data.length - 1].id;
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching from Stripe ${account.region}:`, error);
        // Continue with other account
      }
    }

    console.log(`📊 Found ${recoveryEvents.length} relevant events to process`);

    // Process events through webhook simulation
    const processedEvents = [];
    let successCount = 0;
    let errorCount = 0;

    for (const recoveryEvent of recoveryEvents) {
      try {
        if (!dry_run) {
          await processEventThroughWebhook(recoveryEvent, supabaseClient);
          successCount++;
        }

        processedEvents.push({
          ...recoveryEvent,
          processed: !dry_run,
          processing_status: 'success'
        });

      } catch (error) {
        console.error(`❌ Error processing event ${recoveryEvent.event_id}:`, error);
        errorCount++;

        processedEvents.push({
          ...recoveryEvent,
          processed: false,
          processing_status: 'error',
          error_message: error.message
        });
      }
    }

    // Generate summary
    const summary = {
      success: true,
      recovery_summary: {
        total_events_found: recoveryEvents.length,
        transfer_events: recoveryEvents.filter(e => e.type.startsWith('transfer')).length,
        account_events: recoveryEvents.filter(e => e.type.startsWith('account')).length,
        payout_events: recoveryEvents.filter(e => e.type.startsWith('payout')).length,
        matched_to_payments: recoveryEvents.filter(e => e.matched_payment_id).length,
        processed_successfully: successCount,
        processing_errors: errorCount,
        dry_run: dry_run
      },
      events: processedEvents,
      debug: {
        ...debugInfo,
        processing_duration_ms: Date.now() - debugInfo.recovery_start
      }
    };

    // Log recovery completion
    await supabaseClient
      .from('system_logs')
      .insert({
        service: 'stripe_recovery',
        operation: 'event_recovery',
        level: 'info',
        message: `Stripe event recovery completed: ${recoveryEvents.length} events found, ${successCount} processed`,
        request_data: summary.recovery_summary
      });

    // Send Slack summary notification
    if (!dry_run && recoveryEvents.length > 0) {
      await supabaseClient.rpc('queue_slack_notification', {
        p_channel_name: 'stripe-flood',
        p_message_type: 'event_recovery',
        p_text: `🔄 Stripe Event Recovery Complete: ${recoveryEvents.length} events processed from last ${hours_back}h`,
        p_blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔄 *Stripe Event Recovery Complete*\n\n*Time Range:* Last ${hours_back} hours\n*Total Events:* ${recoveryEvents.length}\n*Transfers:* ${summary.recovery_summary.transfer_events}\n*Account Updates:* ${summary.recovery_summary.account_events}\n*Payouts:* ${summary.recovery_summary.payout_events}\n*Matched to Payments:* ${summary.recovery_summary.matched_to_payments}\n*Processed Successfully:* ${successCount}\n*Errors:* ${errorCount}`
          }
        }]
      });
    }

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Recovery function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'recover-stripe-events',
          error_type: error.constructor.name,
          stack: error.stack
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// Helper function to match events to existing payment records
async function matchEventToPayment(event: RecoveryEvent, supabase: any): Promise<void> {
  try {
    if (event.type.startsWith('transfer')) {
      // Match transfer events by transfer ID or metadata
      const transferId = event.data.id;
      const artistProfileId = event.data.metadata?.artist_profile_id;
      const paymentId = event.data.metadata?.payment_id;

      // Try to find matching payment
      let matchQuery = supabase
        .from('artist_payments')
        .select('id, status, artist_profile_id');

      if (paymentId) {
        matchQuery = matchQuery.eq('id', paymentId);
      } else if (transferId) {
        matchQuery = matchQuery.eq('stripe_transfer_id', transferId);
      } else if (artistProfileId) {
        matchQuery = matchQuery
          .eq('artist_profile_id', artistProfileId)
          .gte('created_at', new Date(event.created * 1000 - 60 * 60 * 1000).toISOString()) // Within 1 hour
          .lte('created_at', new Date(event.created * 1000 + 60 * 60 * 1000).toISOString());
      }

      const { data: payments } = await matchQuery;
      if (payments && payments.length > 0) {
        event.matched_payment_id = payments[0].id;
        event.reason = 'matched_to_existing_payment';
      } else {
        event.reason = 'no_matching_payment_found';
      }
    } else if (event.type.startsWith('account')) {
      // Match account events by account ID
      const accountId = event.data.id;
      const { data: globalPayments } = await supabase
        .from('artist_global_payments')
        .select('id, artist_profile_id')
        .eq('stripe_recipient_id', accountId);

      if (globalPayments && globalPayments.length > 0) {
        event.matched_payment_id = globalPayments[0].id;
        event.reason = 'matched_to_global_payment';
      } else {
        event.reason = 'no_matching_account_found';
      }
    }
  } catch (error) {
    console.error(`Error matching event ${event.event_id}:`, error);
    event.reason = `matching_error: ${error.message}`;
  }
}

// Helper function to process event through webhook simulation
async function processEventThroughWebhook(event: RecoveryEvent, supabase: any): Promise<void> {
  console.log(`🔄 Processing recovered event: ${event.type} (${event.event_id})`);

  if (event.type.startsWith('transfer')) {
    // Process transfer event
    const transfer = event.data;
    const artistProfileId = transfer.metadata?.artist_profile_id;

    if (artistProfileId && event.matched_payment_id) {
      // Update artist_global_payments to trigger webhook processing
      await supabase
        .from('artist_global_payments')
        .update({
          metadata: {
            stripe_transfer_response: transfer,
            last_webhook_update: new Date().toISOString(),
            webhook_event_type: event.type,
            recovered_event: true,
            original_event_id: event.event_id
          },
          updated_at: new Date().toISOString()
        })
        .eq('artist_profile_id', artistProfileId);

      console.log(`✅ Processed transfer event for artist ${artistProfileId}`);
    }
  } else if (event.type.startsWith('account')) {
    // Process account event
    const account = event.data;

    await supabase
      .from('artist_global_payments')
      .update({
        metadata: {
          stripe_account_data: account,
          last_webhook_update: new Date().toISOString(),
          webhook_event_type: event.type,
          recovered_event: true,
          original_event_id: event.event_id
        },
        updated_at: new Date().toISOString()
      })
      .eq('stripe_recipient_id', account.id);

    console.log(`✅ Processed account event for ${account.id}`);
  }

  // Queue recovery notification
  await supabase.rpc('queue_slack_notification', {
    p_channel_name: 'stripe-flood',
    p_message_type: `recovered_${event.type}`,
    p_text: `[RECOVERED] ${event.type}: ${event.event_id} from ${new Date(event.created * 1000).toLocaleString()}`,
    p_blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔄 *Recovered Event*\n*Type:* ${event.type}\n*ID:* ${event.event_id}\n*Created:* ${new Date(event.created * 1000).toLocaleString()}\n*Matched Payment:* ${event.matched_payment_id || 'None'}`
      }
    }]
  });
}