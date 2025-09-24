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

    console.log('Testing simple owed money function via RPC...');

    // Call the simple owed money function
    const { data, error } = await supabase
      .rpc('get_artists_owed_money');

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    if (!data) {
      throw new Error('No data returned from owed money function');
    }

    console.log(`Got ${data.length} artists owed money from RPC call`);

    // Simple response showing raw data
    const response = {
      total_artists_owed: data.length,
      sample_data: data.slice(0, 5),
      all_balances: data.map(row => Number(row.estimated_balance)),
      summary: {
        artists_owed_money: data.length,
        total_owed: data.reduce((sum, row) => sum + Number(row.estimated_balance), 0),
        highest_balance: Math.max(...data.map(row => Number(row.estimated_balance))),
        generated_at: new Date().toISOString()
      }
    };

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Test owed money function error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});