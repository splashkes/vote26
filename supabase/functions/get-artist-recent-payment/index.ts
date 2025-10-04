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
    // Create service role client for payment queries (avoids RLS issues)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Also create authenticated client for user verification
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? '',
          },
        },
      }
    );

    // Get user from JWT to ensure they can only access their own data
    const { data: { user }, error: userError } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Authentication required',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Get artist profile for this user using person_id from JWT custom claims
    // The person_id is available as a custom claim in the JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    // Decode JWT to get custom claims (person_id)
    const base64Payload = token.split('.')[1];
    const decodedPayload = JSON.parse(atob(base64Payload));
    const personId = decodedPayload.person_id;

    if (!personId) {
      return new Response(JSON.stringify({
        error: 'No person_id found in JWT token',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Get primary artist profile using the authoritative selection function
    const { data: profileData, error: profileError } = await supabaseClient
      .rpc('get_primary_artist_profile', { p_person_id: personId });

    if (profileError) {
      console.error('Error getting primary artist profile:', profileError);
      return new Response(JSON.stringify({
        error: 'Failed to retrieve artist profile',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    const artistProfile = profileData?.[0];

    if (!artistProfile) {
      return new Response(JSON.stringify({
        error: 'Artist profile not found',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Get the most recent completed payment for this artist
    const { data: recentPayment, error: paymentError } = await supabaseClient
      .from('artist_payments')
      .select(`
        id,
        artist_profile_id,
        gross_amount,
        currency,
        status,
        created_at,
        metadata,
        stripe_transfer_id
      `)
      .eq('artist_profile_id', artistProfile.id)
      .in('status', ['completed', 'paid', 'verified'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch recent payment',
        success: false,
        debug: paymentError
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    // Return the payment data or null if none found
    const result = {
      success: true,
      artist_profile_id: artistProfile.id,
      artist_name: artistProfile.name,
      recent_payment: recentPayment ? {
        payment_id: recentPayment.id,
        amount: recentPayment.gross_amount,
        currency: recentPayment.currency,
        status: recentPayment.status,
        created_at: recentPayment.created_at,
        already_instant_processed: recentPayment.metadata?.instant_payout_processed || false,
        stripe_transfer_id: recentPayment.stripe_transfer_id
      } : null
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in get-artist-recent-payment:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      debug: {
        name: error.name,
        stack: error.stack
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});