import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const eid = pathParts[pathParts.length - 1];
    if (!eid) {
      return new Response(JSON.stringify({
        error: 'Event ID (EID) required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Connect directly to PostgreSQL to call the security definer function
    const dbUrl = 'postgresql://postgres:6kEtvU9n0KhTVr5@db.xsqdkubgyqwpyvfltnrf.supabase.co:5432/postgres';
    const { Client } = await import('https://deno.land/x/postgres@v0.17.0/mod.ts');
    const client = new Client(dbUrl);
    try {
      await client.connect();
      const result = await client.queryObject(`
        SELECT get_timer_data($1) as data
      `, [
        eid
      ]);
      await client.end();
      if (!result.rows || result.rows.length === 0) {
        return new Response(JSON.stringify({
          error: 'No data returned'
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const data = result.rows[0].data;
      // Check if the function returned an error
      if (data && data.error) {
        return new Response(JSON.stringify({
          error: data.error
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Find the active round from the returned data
      const activeRound = data.rounds?.find((round)=>{
        const closingTime = new Date(round.closing_time).getTime();
        const now = Date.now();
        return closingTime > now && closingTime <= now + 30 * 60 * 1000;
      }) || null;
      const response = {
        ...data,
        active_round: activeRound
      };
      return new Response(JSON.stringify(response), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } catch (dbError) {
      console.error('Database connection error:', dbError);
      return new Response(JSON.stringify({
        error: 'Database connection failed',
        details: dbError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
