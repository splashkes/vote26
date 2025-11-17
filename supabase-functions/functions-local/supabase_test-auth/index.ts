import { serve } from 'https://deno.land/std@0.131.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get all headers for debugging
    const headers = Object.fromEntries(req.headers.entries());
    const authHeader = req.headers.get('Authorization');

    const debugInfo = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers_count: Object.keys(headers).length,
      has_auth: !!authHeader,
      auth_prefix: authHeader ? authHeader.substring(0, 30) : null,
      all_headers: headers
    };

    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No auth header',
        debug: debugInfo
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Return 200 to see the response
      });
    }

    // Try to authenticate
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    return new Response(JSON.stringify({
      success: !authError,
      user: user ? { id: user.id, email: user.email } : null,
      error: authError ? authError.message : null,
      debug: {
        ...debugInfo,
        auth_check_performed: true,
        user_found: !!user,
        error_details: authError
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Always 200 so we can see the response
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  }
});