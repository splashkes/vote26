import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request parameters
    let days_back = 365;
    try {
      const body = await req.json();
      days_back = body.days_back || 365;
    } catch {
      // Use defaults if no body
    }

    console.log(`Fetching admin payment data for last ${days_back} days`);

    // Get all artist payment data using our proven simple function
    const { data: artistData, error: dataError } = await serviceClient
      .rpc('get_simple_admin_payments_data', { days_back });

    if (dataError) throw dataError;

    console.log(`📊 Found ${artistData?.length} total artists from database function`);

    if (!artistData) {
      throw new Error('No data returned from database function');
    }

    // Count recent contestants
    const recentContestants = artistData.filter(artist => artist.is_recent_contestant);
    console.log(`🎯 Found ${recentContestants.length} recent contestants`);

    // Artists owed money
    const artistsOwedMoney = artistData.filter(artist => artist.estimated_balance > 0.01);
    console.log(`💰 Found ${artistsOwedMoney.length} artists owed money`);

    // Artists ready to pay
    const artistsReadyToPay = artistsOwedMoney.filter(artist =>
      artist.payment_account_status === 'ready' && artist.stripe_recipient_id
    );
    console.log(`✅ Found ${artistsReadyToPay.length} artists ready to pay`);

    // Payment attempts
    const paymentAttempts = artistData.filter(artist => artist.latest_payment_status !== null);
    console.log(`🔄 Found ${paymentAttempts.length} artists with payment attempts`);

    // Completed payments
    const completedPayments = artistData.filter(artist =>
      artist.payment_completed_count > 0 || artist.payment_manual_count > 0
    );
    console.log(`✅ Found ${completedPayments.length} artists with completed payments`);

    // Format response in expected structure
    const response = {
      recent_contestants: recentContestants.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: artist.artist_person_id,
          created_at: artist.artist_created_at
        },
        payment_account_status: artist.payment_account_status,
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: artist.latest_payment_status,
        payment_history_summary: {
          pending: Number(artist.payment_pending_count),
          processing: Number(artist.payment_processing_count),
          completed: Number(artist.payment_completed_count),
          failed: Number(artist.payment_failed_count),
          manual_count: Number(artist.payment_manual_count)
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests),
        is_recent_contestant: artist.is_recent_contestant,
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })),
      artists_owed_money: artistsOwedMoney.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: artist.artist_person_id,
          created_at: artist.artist_created_at
        },
        payment_account_status: artist.payment_account_status,
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: artist.latest_payment_status,
        payment_history_summary: {
          pending: Number(artist.payment_pending_count),
          processing: Number(artist.payment_processing_count),
          completed: Number(artist.payment_completed_count),
          failed: Number(artist.payment_failed_count),
          manual_count: Number(artist.payment_manual_count)
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests),
        is_recent_contestant: artist.is_recent_contestant,
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })),
      artists_ready_to_pay: artistsReadyToPay.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: artist.artist_person_id,
          created_at: artist.artist_created_at
        },
        payment_account_status: artist.payment_account_status,
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: artist.latest_payment_status,
        payment_history_summary: {
          pending: Number(artist.payment_pending_count),
          processing: Number(artist.payment_processing_count),
          completed: Number(artist.payment_completed_count),
          failed: Number(artist.payment_failed_count),
          manual_count: Number(artist.payment_manual_count)
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests),
        is_recent_contestant: artist.is_recent_contestant,
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })),
      payment_attempts: paymentAttempts.slice(0, 100), // Limit for performance
      completed_payments: completedPayments.slice(0, 100), // Limit for performance
      summary: {
        total_recent_contestants: recentContestants.length,
        artists_owed_count: artistsOwedMoney.length,
        artists_ready_count: artistsReadyToPay.length,
        payment_attempts_count: paymentAttempts.length,
        completed_payments_count: completedPayments.length,
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
    console.error('Error in simple-admin-payments:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        debug: {
          stack: error.stack,
          name: error.name
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});