import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // ALWAYS set CORS headers for ANY response
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Wrap EVERYTHING in try-catch to ensure CORS headers are always returned
  try {
    // Create service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request parameters
    let days_back = 90;
    let requestBody = null;
    try {
      requestBody = await req.json();
      days_back = requestBody.days_back || 90;
    } catch {
      // Use defaults if no body
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      function_name: 'working-admin-payments',
      request_method: req.method,
      days_back,
      has_request_body: !!requestBody,
      supabase_url: Deno.env.get('SUPABASE_URL') ?? 'missing',
      service_key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'present' : 'missing'
    };

    console.log(`Working admin payments: Getting data for ${days_back} days`);

    // Use enhanced functions with real Stripe verification and invitation tracking

    // 1. Get enhanced artists owed money data with payment status and invitations
    const { data: artistsOwedMoney, error: owedError } = await serviceClient
      .rpc('get_enhanced_admin_artists_owed');

    if (owedError) {
      return new Response(JSON.stringify({
        error: 'Failed to get artists owed money',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_enhanced_admin_artists_owed',
          database_error: {
            message: owedError.message,
            code: owedError.code,
            details: owedError.details,
            hint: owedError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.artists_owed_count = artistsOwedMoney?.length || 0;
    console.log(`✅ Found ${artistsOwedMoney?.length} artists owed money`);

    // Calculate currency totals for summary display
    const currencyTotals = (artistsOwedMoney || []).reduce((totals, artist) => {
      const currency = artist.balance_currency || 'USD';
      const amount = Number(artist.estimated_balance) || 0;

      if (!totals[currency]) {
        totals[currency] = { count: 0, total: 0 };
      }

      totals[currency].count += 1;
      totals[currency].total += amount;

      return totals;
    }, {});

    debugInfo.currency_totals = currencyTotals;
    console.log(`💰 Currency breakdown:`, currencyTotals);

    // 2. Get ready to pay artists (only those with verified Stripe accounts)
    const { data: readyToPayArtists, error: readyError } = await serviceClient
      .rpc('get_ready_to_pay_artists');

    if (readyError) {
      return new Response(JSON.stringify({
        error: 'Failed to get ready to pay artists',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_ready_to_pay_artists',
          database_error: {
            message: readyError.message,
            code: readyError.code,
            details: readyError.details,
            hint: readyError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.ready_to_pay_count = readyToPayArtists?.length || 0;
    console.log(`✅ Found ${readyToPayArtists?.length} ready to pay artists`);

    // 3. Get payment attempts using the enhanced function
    const { data: paymentAttempts, error: attemptsError } = await serviceClient
      .rpc('get_payment_attempts', { days_back });

    if (attemptsError) {
      return new Response(JSON.stringify({
        error: 'Failed to get payment attempts',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_payment_attempts',
          database_error: {
            message: attemptsError.message,
            code: attemptsError.code,
            details: attemptsError.details,
            hint: attemptsError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.payment_attempts_count = paymentAttempts?.length || 0;
    console.log(`✅ Found ${paymentAttempts?.length} payment attempts`);

    // 4. Get completed payments using the enhanced function
    const { data: completedPayments, error: completedError } = await serviceClient
      .rpc('get_completed_payments', { days_back });

    if (completedError) {
      return new Response(JSON.stringify({
        error: 'Failed to get completed payments',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_completed_payments',
          database_error: {
            message: completedError.message,
            code: completedError.code,
            details: completedError.details,
            hint: completedError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.completed_payments_count = completedPayments?.length || 0;
    console.log(`✅ Found ${completedPayments?.length} completed payments`);

    console.log(`✅ Processing enhanced payment data`);

    // Add processing debug info
    debugInfo.data_processing = {
      artists_owed_sample: artistsOwedMoney?.slice(0, 1) || [],
      ready_to_pay_sample: readyToPayArtists?.slice(0, 1) || [],
      payment_attempts_sample: paymentAttempts?.slice(0, 1) || [],
      completed_payments_sample: completedPayments?.slice(0, 1) || []
    };

    // Format response in expected structure for frontend UI
    const response = {
      // No recent contestants tab anymore - removed as requested
      recent_contestants: [],

      // Artists owed money with enhanced payment status and invitation tracking
      artists_owing: artistsOwedMoney?.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: artist.payment_account_status,
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        balance_currency: artist.balance_currency || 'USD',
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: null,
        payment_history_summary: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          manual_count: 0
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests) || 0,
        is_recent_contestant: artist.recent_contests > 0,
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: artist.invitation_count > 0 ? {
          invitation_count: artist.invitation_count,
          latest_invitation_method: artist.latest_invitation_method,
          latest_invitation_date: artist.latest_invitation_date,
          time_since_latest: artist.time_since_latest
        } : null
      })) || [],

      // Ready to pay artists with verified Stripe accounts only
      artists_ready_to_pay: readyToPayArtists?.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: 'ready',
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        balance_currency: artist.balance_currency || 'USD',
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: null,
        payment_history_summary: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          manual_count: 0
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests) || 0,
        is_recent_contestant: artist.recent_contests > 0,
        currency_info: {
          primary_currency: artist.default_currency || 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      payment_attempts: paymentAttempts?.map(attempt => ({
        artist_profiles: {
          id: attempt.artist_id,
          name: attempt.artist_name,
          email: attempt.artist_email,
          phone: attempt.artist_phone,
          entry_id: attempt.artist_entry_id,
          country: attempt.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: 'processing',
        stripe_recipient_id: attempt.stripe_recipient_id,
        estimated_balance: 0,
        current_balance: 0,
        latest_payment_status: attempt.payment_status,
        payment_id: attempt.payment_id,
        payment_amount: Number(attempt.payment_amount) || 0,
        payment_currency: attempt.payment_currency || 'USD',
        payment_method: attempt.payment_method,
        payment_type: attempt.payment_type,
        payment_date: attempt.payment_date,
        stripe_transfer_id: attempt.stripe_transfer_id,
        error_message: attempt.error_message,
        payment_history_summary: {
          pending: 0,
          processing: 1,
          completed: 0,
          failed: 0,
          manual_count: 0
        },
        recent_city: attempt.recent_city,
        recent_contests: 0,
        is_recent_contestant: false,
        currency_info: {
          primary_currency: attempt.payment_currency || 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      completed_payments: completedPayments?.map(completed => ({
        artist_profiles: {
          id: completed.artist_id,
          name: completed.artist_name,
          email: completed.artist_email,
          phone: completed.artist_phone,
          entry_id: completed.artist_entry_id,
          country: completed.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: 'completed',
        stripe_recipient_id: completed.stripe_recipient_id,
        estimated_balance: 0,
        current_balance: 0,
        latest_payment_status: completed.payment_status,
        payment_id: completed.payment_id,
        payment_amount: Number(completed.payment_amount) || 0,
        payment_currency: completed.payment_currency || 'USD',
        payment_method: completed.payment_method,
        payment_type: completed.payment_type,
        payment_date: completed.payment_date,
        completion_date: completed.completion_date,
        stripe_transfer_id: completed.stripe_transfer_id,
        payment_history_summary: {
          pending: 0,
          processing: 0,
          completed: 1,
          failed: 0,
          manual_count: 0
        },
        recent_city: completed.recent_city,
        recent_contests: 0,
        is_recent_contestant: false,
        currency_info: {
          primary_currency: completed.payment_currency || 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      summary: {
        total_recent_contestants: 0, // Removed tab
        artists_owing_count: artistsOwedMoney?.length || 0,
        artists_ready_count: readyToPayArtists?.length || 0,
        payment_attempts_count: paymentAttempts?.length || 0,
        completed_payments_count: completedPayments?.length || 0,
        currency_totals: currencyTotals,
        generated_at: new Date().toISOString()
      }
    };

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in working-admin-payments:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'working-admin-payments',
          error_type: error.constructor.name,
          error_message: error.message,
          stack: error.stack,
          name: error.name,
          // Include any debug info we collected
          ...debugInfo
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});