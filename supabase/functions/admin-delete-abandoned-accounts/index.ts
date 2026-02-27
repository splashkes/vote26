// Admin Edge Function: Delete Abandoned Stripe Accounts
// Deletes accounts from Stripe API and database
// ADMIN ONLY - requires service role key

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface DeleteRequest {
  account_ids: string[]; // artist_global_payments IDs
  dry_run?: boolean;
}

interface DeleteResult {
  account_id: string;
  stripe_account_id: string;
  artist_name: string;
  success: boolean;
  error?: string;
  stripe_deleted: boolean;
  db_deleted: boolean;
}

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access (service role key required)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.includes(supabaseServiceKey)) {
      throw new Error('Admin access required');
    }

    // Get request body
    const requestBody: DeleteRequest = await req.json();
    const { account_ids, dry_run = false } = requestBody;

    if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
      throw new Error('account_ids array is required');
    }

    console.log(`Processing ${account_ids.length} accounts (dry_run: ${dry_run})`);

    // Initialize Stripe clients
    const stripeCanadaKey = Deno.env.get('stripe_canada_secret_key');
    const stripeIntlKey = Deno.env.get('stripe_intl_secret_key');

    const stripeCanada = new Stripe(stripeCanadaKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    const stripeIntl = new Stripe(stripeIntlKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    const results: DeleteResult[] = [];

    // Process each account
    for (const accountId of account_ids) {
      const result: DeleteResult = {
        account_id: accountId,
        stripe_account_id: '',
        artist_name: '',
        success: false,
        stripe_deleted: false,
        db_deleted: false
      };

      try {
        // Get account info from database
        const { data: account, error: fetchError } = await supabase
          .from('artist_global_payments')
          .select(`
            id,
            stripe_recipient_id,
            country,
            status,
            artist_profiles(name, email)
          `)
          .eq('id', accountId)
          .single();

        if (fetchError || !account) {
          result.error = `Account not found in database: ${fetchError?.message}`;
          results.push(result);
          continue;
        }

        result.stripe_account_id = account.stripe_recipient_id;
        result.artist_name = account.artist_profiles?.name || 'Unknown';

        console.log(`Processing: ${result.artist_name} (${result.stripe_account_id})`);

        if (dry_run) {
          result.success = true;
          result.error = 'DRY RUN - no changes made';
          results.push(result);
          continue;
        }

        // Determine which Stripe account to use
        const useCanada = (account.country === 'CA');
        const stripe = useCanada ? stripeCanada : stripeIntl;

        // Delete from Stripe
        if (account.stripe_recipient_id) {
          try {
            await stripe.accounts.del(account.stripe_recipient_id);
            result.stripe_deleted = true;
            console.log(`✓ Deleted from Stripe: ${account.stripe_recipient_id}`);
          } catch (stripeError: any) {
            // If account already deleted, that's ok
            if (stripeError.code === 'resource_missing') {
              result.stripe_deleted = true;
              console.log(`⚠ Stripe account already deleted: ${account.stripe_recipient_id}`);
            } else {
              throw stripeError;
            }
          }
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from('artist_global_payments')
          .delete()
          .eq('id', accountId);

        if (deleteError) {
          throw new Error(`Database deletion failed: ${deleteError.message}`);
        }

        result.db_deleted = true;
        result.success = true;
        console.log(`✓ Deleted from database: ${accountId}`);

      } catch (error: any) {
        result.error = error.message || 'Unknown error';
        console.error(`✗ Failed to delete ${accountId}:`, error);
      }

      results.push(result);
    }

    // Summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      stripe_deleted: results.filter(r => r.stripe_deleted).length,
      db_deleted: results.filter(r => r.db_deleted).length,
      dry_run
    };

    return new Response(JSON.stringify({
      success: true,
      summary,
      results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });

  } catch (error: any) {
    console.error('Error in admin-delete-abandoned-accounts:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error occurred',
      success: false
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
