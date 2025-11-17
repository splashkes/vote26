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
      return new Response(
        JSON.stringify({ error: 'Invalid auth token', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Verify user is producer or super admin via abhq_admin_users table
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('email, level, active')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle();

    if (adminError || !adminUser || !['producer', 'super'].includes(adminUser.level)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - requires producer or super admin role', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get request body
    const body = await req.json();
    const { name, content, visibility = 'public' } = body;

    // Validate inputs
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Name is required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!content || !content.trim()) {
      return new Response(
        JSON.stringify({ error: 'Content is required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!['public', 'artists_only'].includes(visibility)) {
      return new Response(
        JSON.stringify({ error: 'Invalid visibility value', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if user exists in people table first
    const { data: person } = await supabase
      .from('people')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    // Build insert data
    const insertData: any = {
      name: name.trim(),
      content: content.trim(),
      visibility
    };

    // Only add created_by if person exists
    if (person) {
      insertData.created_by = user.id;
    }

    // Create competition specific
    const { data: specific, error: createError } = await supabase
      .from('competition_specifics')
      .insert(insertData)
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        specific
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in create-competition-specific:', error);
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
