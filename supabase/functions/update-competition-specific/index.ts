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
        JSON.stringify({
          error: 'Unauthorized - requires producer or super admin role',
          success: false,
          debug: {
            user_email: user.email,
            admin_lookup_error: adminError,
            admin_found: !!adminUser,
            admin_level: adminUser?.level,
            allowed_levels: ['producer', 'super']
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get request body
    const body = await req.json();
    const { id, name, content, visibility } = body;

    // Validate inputs
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID is required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (name !== undefined && (!name || !name.trim())) {
      return new Response(
        JSON.stringify({ error: 'Name cannot be empty', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (content !== undefined && (!content || !content.trim())) {
      return new Response(
        JSON.stringify({ error: 'Content cannot be empty', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (visibility !== undefined && !['public', 'artists_only'].includes(visibility)) {
      return new Response(
        JSON.stringify({ error: 'Invalid visibility value', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Build update object
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (visibility !== undefined) updateData.visibility = visibility;

    // Update competition specific (trigger will save history automatically)
    const { data: specific, error: updateError } = await supabase
      .from('competition_specifics')
      .update(updateData)
      .eq('id', id)
      .eq('is_deleted', false)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    if (!specific) {
      return new Response(
        JSON.stringify({ error: 'Competition specific not found', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
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
    console.error('Error in update-competition-specific:', error);
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
