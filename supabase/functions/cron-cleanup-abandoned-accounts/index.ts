// Scheduled Edge Function: Cleanup Abandoned Stripe Accounts
// Runs weekly to delete incomplete onboarding accounts
// Deletes from both Stripe API and database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AbandonedAccount {
  id: string;
  stripe_recipient_id: string;
  country: string;
  artist_name: string;
  artist_email: string;
  days_old: number;
}

interface DeleteResult {
  stripe_account_id: string;
  artist_name: string;
  country: string;
  stripe_deleted: boolean;
  db_deleted: boolean;
  error?: string;
}

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Verify cron secret or admin access
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET_CLEANUP_ABANDONED');

    // Check if request is from cron or admin
    const isCron = authHeader === `Bearer ${cronSecret}`;
    const isAdmin = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

    if (!isCron && !isAdmin) {
      throw new Error('Unauthorized - cron secret or admin access required');
    }

    console.log('🧹 Starting abandoned accounts cleanup...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize Stripe clients
    const stripeCanadaKey = Deno.env.get('stripe_canada_secret_key');
    const stripeIntlKey = Deno.env.get('stripe_intl_secret_key');

    if (!stripeCanadaKey || !stripeIntlKey) {
      throw new Error('Stripe API keys not configured');
    }

    const stripeCanada = new Stripe(stripeCanadaKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    const stripeIntl = new Stripe(stripeIntlKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    // Find abandoned accounts (7+ days old, incomplete onboarding)
    const { data: abandonedAccounts, error: fetchError } = await supabase
      .from('artist_global_payments')
      .select(`
        id,
        stripe_recipient_id,
        country,
        created_at,
        artist_profiles(name, email)
      `)
      .in('status', ['invited', 'blocked'])
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .or('metadata->>onboarding_completed.is.null,metadata->>onboarding_completed.eq.false');

    if (fetchError) {
      throw new Error(`Failed to fetch abandoned accounts: ${fetchError.message}`);
    }

    if (!abandonedAccounts || abandonedAccounts.length === 0) {
      console.log('✓ No abandoned accounts found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No abandoned accounts to clean up',
        deleted: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`Found ${abandonedAccounts.length} abandoned accounts to delete`);

    const results: DeleteResult[] = [];
    let stripeDeleted = 0;
    let stripeFailed = 0;
    let dbDeleted = 0;

    // Process each account
    for (const account of abandonedAccounts) {
      const result: DeleteResult = {
        stripe_account_id: account.stripe_recipient_id || '',
        artist_name: account.artist_profiles?.name || 'Unknown',
        country: account.country,
        stripe_deleted: false,
        db_deleted: false
      };

      try {
        // Delete from Stripe API if account ID exists
        if (account.stripe_recipient_id) {
          // Try both Stripe keys since we don't know which platform account owns this Connect account
          let deleted = false;
          let lastError = null;

          for (const stripe of [stripeCanada, stripeIntl]) {
            try {
              await stripe.accounts.del(account.stripe_recipient_id);
              result.stripe_deleted = true;
              stripeDeleted++;
              deleted = true;
              console.log(`✓ Deleted from Stripe: ${account.stripe_recipient_id} (${result.artist_name})`);
              break; // Success, no need to try other key
            } catch (stripeError: any) {
              // If already deleted, that's ok
              if (stripeError.code === 'resource_missing') {
                result.stripe_deleted = true;
                stripeDeleted++;
                deleted = true;
                console.log(`⚠ Already deleted from Stripe: ${account.stripe_recipient_id}`);
                break; // Account doesn't exist, no need to try other key
              }
              // If access denied, try the other key
              lastError = stripeError;
            }
          }

          if (!deleted && lastError) {
            stripeFailed++;
            result.error = `Stripe deletion failed: ${lastError.message}`;
            console.error(`✗ Stripe deletion failed: ${account.stripe_recipient_id}`, lastError);
          }
        } else {
          // No Stripe account to delete
          result.stripe_deleted = true;
        }

        // Delete from database (NO CASCADE)
        const { error: deleteError } = await supabase
          .from('artist_global_payments')
          .delete()
          .eq('id', account.id);

        if (deleteError) {
          result.error = (result.error || '') + ` DB deletion failed: ${deleteError.message}`;
          console.error(`✗ DB deletion failed: ${account.id}`, deleteError);
        } else {
          result.db_deleted = true;
          dbDeleted++;
          console.log(`✓ Deleted from database: ${account.id}`);
        }

      } catch (error: any) {
        result.error = error.message;
        console.error(`✗ Failed to process account ${account.id}:`, error);
      }

      results.push(result);
    }

    // Send Slack notification with results
    const summary = {
      total_found: abandonedAccounts.length,
      stripe_deleted: stripeDeleted,
      stripe_failed: stripeFailed,
      db_deleted: dbDeleted,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Cleanup Summary:', summary);

    // Queue Slack notification
    try {
      const slackBlocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🧹 Abandoned Accounts Cleanup Complete',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Total Found:* ${summary.total_found}\n*Deleted from Stripe:* ${summary.stripe_deleted}\n*Stripe Failures:* ${summary.stripe_failed}\n*Deleted from Database:* ${summary.db_deleted}`
          }
        }
      ];

      // Add failures section if any
      if (stripeFailed > 0) {
        const failures = results.filter(r => r.error && !r.stripe_deleted);
        if (failures.length > 0) {
          slackBlocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Failures:*\n${failures.slice(0, 10).map(f => `• ${f.artist_name}: ${f.error}`).join('\n')}`
            }
          });
        }
      }

      slackBlocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Completed at ${new Date().toISOString()} | Weekly automated cleanup`
          }
        ]
      });

      await supabase.rpc('queue_slack_notification', {
        p_channel_name: 'admin-notifications',
        p_message_type: 'abandoned_accounts_cleanup',
        p_text: `🧹 Cleaned up ${summary.db_deleted} abandoned accounts`,
        p_blocks: slackBlocks,
        p_event_id: null
      });

      console.log('✓ Slack notification queued');
    } catch (slackError) {
      console.error('Failed to queue Slack notification:', slackError);
      // Don't fail the whole process for Slack errors
    }

    return new Response(JSON.stringify({
      success: true,
      summary,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Error in abandoned accounts cleanup:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error occurred',
      success: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
