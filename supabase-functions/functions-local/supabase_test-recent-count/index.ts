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

    console.log(`Testing with ${days_back} days back`);

    // Test 1: Get count
    const { data: countData, error: countError } = await serviceClient
      .rpc('get_recent_contestants_count', { days_back });

    if (countError) throw countError;

    console.log(`Count function returned: ${countData}`);

    // Test 2: Get list
    const { data: listData, error: listError } = await serviceClient
      .rpc('get_recent_contestants_list', { days_back });

    if (listError) throw listError;

    console.log(`List function returned ${listData?.length} artists`);

    const response = {
      days_back,
      count_from_function: countData,
      list_length: listData?.length || 0,
      first_5_artists: listData?.slice(0, 5) || [],
      success: true
    };

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in test-recent-count:', error);
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