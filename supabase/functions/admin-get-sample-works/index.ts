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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Use service role to bypass RLS
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the user is an ABHQ admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is an ABHQ admin
    const { data: adminCheck, error: adminError } = await supabaseService
      .from('abhq_admin_users')
      .select('active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (adminError || !adminCheck) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - ABHQ admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the artist_number from request
    const { artist_number } = await req.json();

    if (!artist_number) {
      return new Response(
        JSON.stringify({ error: 'artist_number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the profile_id from artist_number (entry_id)
    const { data: profileData, error: profileError } = await supabaseService
      .from('artist_profiles')
      .select('id')
      .eq('entry_id', artist_number)
      .single();

    if (profileError || !profileData) {
      console.error('Error finding profile for artist_number:', artist_number, profileError);
      return new Response(
        JSON.stringify({
          success: true,
          sample_works: [],
          message: 'No profile found for this artist number'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get sample works using the RPC function
    const { data: sampleWorksData, error: worksError } = await supabaseService
      .rpc('get_unified_sample_works', { profile_id: profileData.id });

    if (worksError) {
      console.error('Error fetching sample works:', worksError);
      return new Response(
        JSON.stringify({
          success: true,
          sample_works: [],
          error: worksError.message
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sample_works: sampleWorksData || [],
        profile_id: profileData.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-get-sample-works:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
