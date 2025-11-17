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
    // Get Supabase client
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the request body
    const { eventEid } = await req.json();

    if (!eventEid) {
      throw new Error('Event EID is required');
    }

    // Fetch applications - add created_at as alias for compatibility
    const { data: applicationsRaw, error: appError } = await supabaseClient
      .from('artist_applications')
      .select('id, artist_number, event_eid, updated_at')
      .eq('event_eid', eventEid)
      .order('updated_at', { ascending: false });

    // Add created_at field for compatibility with EventDetail
    const applications = applicationsRaw?.map(app => ({
      ...app,
      created_at: app.updated_at // Use updated_at as created_at for compatibility
    }));

    if (appError) throw appError;

    // Fetch invitations
    const { data: invitations, error: invError } = await supabaseClient
      .from('artist_invitations')
      .select('id, artist_number, event_eid, created_at, accepted_at')
      .eq('event_eid', eventEid)
      .order('created_at', { ascending: false });

    if (invError) throw invError;

    // Fetch confirmations - IMPORTANT: Filter out withdrawn confirmations
    const { data: confirmations, error: confError } = await supabaseClient
      .from('artist_confirmations')
      .select('id, artist_number, event_eid, created_at, confirmation_status, withdrawn_at')
      .eq('event_eid', eventEid)
      .eq('confirmation_status', 'confirmed') // This filters out withdrawn artists
      .order('created_at', { ascending: false });

    if (confError) throw confError;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          applications: applications || [],
          invitations: invitations || [],
          confirmations: confirmations || []
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});