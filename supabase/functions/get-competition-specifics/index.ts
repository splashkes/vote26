import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({
          error: 'Invalid auth token',
          success: false,
          details: { authError: authError?.message }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    console.log('Authenticated user:', { id: user.id, email: user.email });

    // Verify user is producer or super admin via abhq_admin_users table
    // Use case-insensitive email comparison
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('email, level, active')
      .ilike('email', user.email || '')
      .eq('active', true)
      .maybeSingle();

    console.log('Admin user lookup:', {
      found: !!adminUser,
      email: adminUser?.email,
      level: adminUser?.level,
      active: adminUser?.active,
      searchedEmail: user.email,
      error: adminError?.message
    });

    if (adminError || !adminUser || !['producer', 'super'].includes(adminUser.level)) {
      console.error('Authorization failed:', {
        hasError: !!adminError,
        errorMsg: adminError?.message,
        foundUser: !!adminUser,
        level: adminUser?.level,
        userEmail: user.email
      });
      return new Response(
        JSON.stringify({
          error: 'Unauthorized - requires producer or super admin role',
          success: false,
          debug: {
            userEmail: user.email,
            foundInAdminTable: !!adminUser,
            adminLevel: adminUser?.level,
            adminActive: adminUser?.active,
            hasError: !!adminError,
            errorMessage: adminError?.message,
            allowedLevels: ['producer', 'super']
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get all competition specifics (not deleted)
    const { data: specifics, error: specificsError } = await supabase
      .from('competition_specifics')
      .select('*')
      .eq('is_deleted', false)
      .order('name');

    if (specificsError) {
      throw specificsError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        specifics: specifics || []
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in get-competition-specifics:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
