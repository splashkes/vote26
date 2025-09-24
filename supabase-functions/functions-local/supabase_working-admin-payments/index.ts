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
    let days_back = 90;
    try {
      const body = await req.json();
      days_back = body.days_back || 90;
    } catch {
      // Use defaults if no body
    }

    console.log(`Working admin payments: Getting data for ${days_back} days`);

    // Use the PROVEN simple functions that work correctly

    // 1. Get recent contestants using the working simple function
    const { data: recentContestants, error: recentError } = await serviceClient
      .rpc('get_recent_contestants_list', { days_back });

    if (recentError) throw recentError;

    console.log(`✅ Found ${recentContestants?.length} recent contestants`);

    // 2. Get artists owed money using the working simple function
    const { data: artistsOwedMoney, error: owedError } = await serviceClient
      .rpc('get_artists_owed_money');

    if (owedError) throw owedError;

    console.log(`✅ Found ${artistsOwedMoney?.length} artists owed money`);

    // 3. Get payment activity using the working simple function
    const { data: paymentActivity, error: activityError } = await serviceClient
      .rpc('get_payment_activity', { days_back });

    if (activityError) throw activityError;

    console.log(`✅ Found ${paymentActivity?.length} artists with payment activity`);

    // Filter recent contestants who are also owed money (ready to pay candidates)
    const recentContestantIds = new Set(recentContestants?.map(rc => rc.artist_id) || []);
    const artistsReadyToPay = artistsOwedMoney?.filter(artist =>
      recentContestantIds.has(artist.artist_id)
    ) || [];

    console.log(`✅ Found ${artistsReadyToPay.length} artists ready to pay (recent + owed)`);

    // Format response in expected structure for frontend UI
    const response = {
      // Keep the individual category arrays for API completeness
      recent_contestants: recentContestants?.map(artist => ({
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
        payment_account_status: 'pending', // Placeholder
        stripe_recipient_id: null,
        estimated_balance: 0,
        current_balance: 0,
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
        is_recent_contestant: true,
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      artists_owed_money: artistsOwedMoney?.map(artist => ({
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
        payment_account_status: 'pending', // Placeholder
        stripe_recipient_id: null,
        estimated_balance: Number(artist.estimated_balance),
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
        recent_contests: 0,
        is_recent_contestant: recentContestantIds.has(artist.artist_id),
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      artists_ready_to_pay: artistsReadyToPay.map(artist => ({
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
        payment_account_status: 'ready', // These are ready candidates
        stripe_recipient_id: null,
        estimated_balance: Number(artist.estimated_balance),
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
        recent_contests: 0,
        is_recent_contestant: true,
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })),

      payment_attempts: paymentActivity?.map(artist => ({
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
        payment_account_status: 'active',
        stripe_recipient_id: null,
        estimated_balance: 0, // Would need to join with owed money data
        current_balance: 0,
        latest_payment_status: artist.latest_payment_status,
        payment_history_summary: {
          pending: Number(artist.pending_payments),
          processing: 0,
          completed: Number(artist.completed_payments),
          failed: Number(artist.failed_payments),
          manual_count: 0
        },
        recent_city: artist.recent_city,
        recent_contests: 0,
        is_recent_contestant: recentContestantIds.has(artist.artist_id),
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null,
        latest_payment_date: artist.latest_payment_date
      })) || [],

      completed_payments: paymentActivity?.filter(artist =>
        Number(artist.completed_payments) > 0
      ).map(artist => ({
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
        payment_account_status: 'completed',
        stripe_recipient_id: null,
        estimated_balance: 0,
        current_balance: 0,
        latest_payment_status: artist.latest_payment_status,
        payment_history_summary: {
          pending: Number(artist.pending_payments),
          processing: 0,
          completed: Number(artist.completed_payments),
          failed: Number(artist.failed_payments),
          manual_count: 0
        },
        recent_city: artist.recent_city,
        recent_contests: 0,
        is_recent_contestant: recentContestantIds.has(artist.artist_id),
        currency_info: {
          primary_currency: 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null,
        latest_payment_date: artist.latest_payment_date
      })) || [],

      summary: {
        total_recent_contestants: recentContestants?.length || 0,
        artists_owed_count: artistsOwedMoney?.length || 0,
        artists_ready_count: artistsReadyToPay.length,
        payment_attempts_count: paymentActivity?.length || 0,
        completed_payments_count: paymentActivity?.filter(artist => Number(artist.completed_payments) > 0).length || 0,
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