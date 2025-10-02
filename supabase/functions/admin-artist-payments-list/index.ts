import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface Artist {
  artist_profiles: {
    id: string;
    name: string;
    email: string;
    phone: string;
    entry_id: number;
    country: string;
    person_id: string;
    created_at: string;
  };
  payment_account_status: 'ready' | 'pending' | 'invited' | 'needs_setup' | null;
  stripe_recipient_id: string | null;
  estimated_balance: number;
  current_balance: number;
  balance_currency: string;
  currency_symbol: string;
  latest_payment_status: string | null;
  payment_history_summary: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    manual_count: number;
  };
  recent_city: string | null;
  recent_contests: number;
  is_recent_contestant: boolean;
  currency_info: {
    primary_currency: string;
    has_mixed_currencies: boolean;
  };
  invitation_info: any;
}

interface PaymentStatusResponse {
  recent_contestants: Artist[];
  artists_owed_money: Artist[];
  artists_ready_to_pay: Artist[];
  payment_attempts: Artist[];
  completed_payments: Artist[];
  summary: {
    total_recent_contestants: number;
    artists_owed_count: number;
    artists_ready_count: number;
    payment_attempts_count: number;
    completed_payments_count: number;
    generated_at: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create client with anon key for RLS-aware operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? ''
          }
        }
      }
    );

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

    console.log(`Fetching artist payment status for last ${days_back} days`);

    // Verify the user is authenticated and is an ABHQ super admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the user is an ABHQ super admin
    const { data: adminCheck, error: adminError } = await supabaseClient
      .from('abhq_admin_users')
      .select('level, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .eq('level', 'super')
      .single();

    if (adminError || !adminCheck) {
      return new Response(
        JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Super admin access verified');

    // Remove this old query - we get all data from the database function now

    // Use simple database function that actually works
    const { data: artistPaymentData, error: dataError } = await serviceClient
      .rpc('get_simple_admin_payments_data', { days_back });

    if (dataError) throw dataError;

    console.log(`📊 Found ${artistPaymentData?.length} total artists from database function`);

    // Debug: Check how many have is_recent_contestant = true
    const recentCount = artistPaymentData?.filter(data => data.is_recent_contestant === true)?.length || 0;
    console.log(`🔍 Debug: ${recentCount} artists have is_recent_contestant = true in raw data`);

    // Process the data into the expected format
    const processedArtists: Artist[] = artistPaymentData?.map(data => ({
      artist_profiles: {
        id: data.artist_id,
        name: data.artist_name,
        email: data.artist_email,
        phone: data.artist_phone,
        entry_id: data.artist_entry_id,
        country: data.artist_country,
        person_id: data.artist_person_id,
        created_at: data.artist_created_at
      },
      payment_account_status: data.payment_account_status as 'ready' | 'pending' | 'invited' | 'needs_setup' | null,
      stripe_recipient_id: data.stripe_recipient_id,
      estimated_balance: Number(data.estimated_balance),
      current_balance: Number(data.estimated_balance),
      balance_currency: data.currency_code || 'USD',
      currency_symbol: data.currency_symbol || '$',
      latest_payment_status: data.latest_payment_status,
      payment_history_summary: {
        pending: Number(data.payment_pending_count),
        processing: Number(data.payment_processing_count),
        completed: Number(data.payment_completed_count),
        failed: Number(data.payment_failed_count),
        manual_count: Number(data.payment_manual_count)
      },
      recent_city: data.recent_city,
      recent_contests: Number(data.recent_contests),
      is_recent_contestant: data.is_recent_contestant,
      currency_info: {
        primary_currency: data.currency_code || 'USD',
        has_mixed_currencies: false
      },
      invitation_info: null
    })) || [];

    // Categorize artists into the 5 requested groups using database function results
    const recent_contestants = processedArtists.filter(artist =>
      artist.is_recent_contestant  // Use the boolean flag from database function
    );

    // Artists owed money - ALL artists with positive balances (not just recent contestants)
    const artists_owed_money = processedArtists.filter(artist =>
      artist.estimated_balance > 0.01
    );

    const artists_ready_to_pay = artists_owed_money.filter(artist =>
      artist.payment_account_status === 'ready' && artist.stripe_recipient_id
    );

    const payment_attempts = processedArtists.filter(artist =>
      artist.latest_payment_status !== null
    );

    const completed_payments = processedArtists.filter(artist =>
      artist.payment_history_summary.completed > 0 || artist.payment_history_summary.manual_count > 0
    );

    console.log(`📊 Categorized: ${recent_contestants.length} recent, ${artists_owed_money.length} owed, ${artists_ready_to_pay.length} ready, ${payment_attempts.length} attempts, ${completed_payments.length} completed`);

    const response: PaymentStatusResponse = {
      recent_contestants,
      artists_owed_money,
      artists_ready_to_pay,
      payment_attempts,
      completed_payments,
      summary: {
        total_recent_contestants: recent_contestants.length,
        artists_owed_count: artists_owed_money.length,
        artists_ready_count: artists_ready_to_pay.length,
        payment_attempts_count: payment_attempts.length,
        completed_payments_count: completed_payments.length,
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
    console.error('Error in admin-artist-payments-list:', error);
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