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
    // Create service role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get days_back parameter
    let days_back = 90;
    try {
      const body = await req.json();
      days_back = body.days_back || 90;
    } catch {
      // Use default
    }

    console.log(`Getting data for ${days_back} days`);

    // Call our proven database function
    const { data, error } = await supabase
      .rpc('get_simple_admin_payments_data', { days_back });

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned');
    }

    console.log(`Raw data count: ${data.length}`);

    // Filter recent contestants
    const recent_contestants = data.filter(row => row.is_recent_contestant === true);
    console.log(`Recent contestants: ${recent_contestants.length}`);

    // Filter artists owed money
    const artists_owed_money = data.filter(row => Number(row.estimated_balance) > 0.01);
    console.log(`Artists owed money: ${artists_owed_money.length}`);

    // Filter ready to pay
    const artists_ready_to_pay = artists_owed_money.filter(row =>
      row.payment_account_status === 'ready' && row.stripe_recipient_id
    );
    console.log(`Ready to pay: ${artists_ready_to_pay.length}`);

    // Filter payment attempts
    const payment_attempts = data.filter(row => row.latest_payment_status !== null);
    console.log(`Payment attempts: ${payment_attempts.length}`);

    // Filter completed payments
    const completed_payments = data.filter(row =>
      Number(row.payment_completed_count) > 0 || Number(row.payment_manual_count) > 0
    );
    console.log(`Completed payments: ${completed_payments.length}`);

    // Simple response
    const response = {
      recent_contestants: recent_contestants.slice(0, 100),
      artists_owed_money: artists_owed_money.slice(0, 100),
      artists_ready_to_pay: artists_ready_to_pay.slice(0, 100),
      payment_attempts: payment_attempts.slice(0, 100),
      completed_payments: completed_payments.slice(0, 100),
      summary: {
        total_recent_contestants: recent_contestants.length,
        artists_owed_count: artists_owed_money.length,
        artists_ready_count: artists_ready_to_pay.length,
        payment_attempts_count: payment_attempts.length,
        completed_payments_count: completed_payments.length,
        generated_at: new Date().toISOString()
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});