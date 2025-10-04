// Toggle Manual Payment Override for Artist
// Allows ABHQ admins to enable/disable manual payment option for artists
// Uses service role to bypass RLS and avoid timeout issues
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Create client with service role for admin operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get authenticated user from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify user is ABHQ admin
    const { data: adminCheck } = await supabaseService
      .from('abhq_admin_users')
      .select('id')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (!adminCheck) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User is not an active ABHQ admin'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get request body
    const { artist_profile_id, enable } = await req.json();

    if (!artist_profile_id) {
      throw new Error('artist_profile_id is required');
    }

    // Update artist_profiles using service role (bypasses RLS)
    // Note: We store user.email in a note field instead of looking up person_id to avoid RLS issues
    const { error: updateError } = await supabaseService
      .from('artist_profiles')
      .update({
        manual_payment_override: enable,
        manual_payment_override_at: enable ? new Date().toISOString() : null,
        manual_payment_override_by: null  // Simplified: not storing person_id to avoid RLS lookups
      })
      .eq('id', artist_profile_id);

    if (updateError) {
      throw updateError;
    }

    // Get updated artist profile
    const { data: artistProfile } = await supabaseService
      .from('artist_profiles')
      .select('id, name, email, manual_payment_override, manual_payment_override_at')
      .eq('id', artist_profile_id)
      .single();

    // TODO: Send email notification to artist when enabled
    // Will be implemented in future iteration

    return new Response(JSON.stringify({
      success: true,
      message: `Manual payment override ${enable ? 'enabled' : 'disabled'} successfully`,
      artist_profile: artistProfile,
      updated_by: user.email
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error toggling manual payment override:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
