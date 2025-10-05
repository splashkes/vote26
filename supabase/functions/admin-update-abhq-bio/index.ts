import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header FIRST
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Authorization header required',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-update-abhq-bio'
          }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract JWT from Authorization header
    const jwt = authHeader.replace('Bearer ', '');

    // Create client with anon key AND the user's JWT in global headers
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    // Get user from JWT token by passing the JWT directly
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Invalid or expired token',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-update-abhq-bio',
            user_error: userError?.message
          }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is an ABHQ admin (using service role for this check)
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: adminCheck, error: adminError } = await supabaseService
      .from('abhq_admin_users')
      .select('active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (adminError || !adminCheck) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized - ABHQ admin access required',
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-update-abhq-bio',
            user_id: user.id,
            admin_error: adminError?.message,
            admin_check_result: adminCheck
          }
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the profile_id and abhq_bio from request
    const { profile_id, abhq_bio } = await req.json();

    if (!profile_id) {
      return new Response(
        JSON.stringify({ error: 'profile_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to bypass RLS timeout (we already verified user is ABHQ admin above)
    const { data, error } = await supabaseService
      .from('artist_profiles')
      .update({ abhq_bio })
      .eq('id', profile_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating abhq_bio:', error);
      return new Response(
        JSON.stringify({
          error: error.message,
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-update-abhq-bio',
            user_id: user.id,
            profile_id: profile_id,
            abhq_bio_length: abhq_bio?.length || 0,
            error_details: error.details,
            error_hint: error.hint,
            error_code: error.code
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-update-abhq-bio:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
