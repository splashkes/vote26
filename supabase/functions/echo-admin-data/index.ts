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

    console.log(`Echo function: Getting data for ${days_back} days`);

    // Call the database function that we KNOW works
    // Try with explicit count parameter to avoid any limits
    const { data, error, count } = await supabase
      .rpc('get_simple_admin_payments_data', { days_back })
      .limit(50000);  // Set a high limit to avoid PostgREST default limits

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from database function');
    }

    console.log(`Echo function: Got ${data.length} total rows from database`);

    // Count recent contestants with NO FILTERING - just echo what the DB says
    const recentCount = data.filter(row => row.is_recent_contestant === true).length;
    console.log(`Echo function: ${recentCount} rows have is_recent_contestant = true`);

    // JUST ECHO THE RAW DATA - no processing, no filtering, no transformation
    const response = {
      raw_data_sample: data.slice(0, 5), // First 5 rows for inspection
      total_rows: data.length,
      recent_contestants_count: recentCount,
      raw_counts: {
        is_recent_contestant_true: data.filter(row => row.is_recent_contestant === true).length,
        is_recent_contestant_false: data.filter(row => row.is_recent_contestant === false).length,
        estimated_balance_gt_zero: data.filter(row => Number(row.estimated_balance) > 0).length,
        has_latest_payment_status: data.filter(row => row.latest_payment_status !== null).length,
        has_completed_payments: data.filter(row => Number(row.payment_completed_count) > 0).length
      },
      summary: {
        total_recent_contestants: recentCount,
        generated_at: new Date().toISOString()
      }
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Echo function error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});