import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      function_name: 'admin-reset-payment-status'
    };

    // Create clients
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    debugInfo.auth_header_present = !!authHeader;
    debugInfo.auth_header_starts_with = authHeader?.substring(0, 20);

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'No authorization header',
          success: false,
          debug: debugInfo
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create user client with the auth token
    const userClient = createClient(
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

    // Verify authentication
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    debugInfo.auth_check = {
      user_found: !!user,
      user_id: user?.id,
      user_email: user?.email,
      error_message: userError?.message,
      error_status: userError?.status
    };

    if (userError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized - could not verify user',
          success: false,
          debug: debugInfo
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user is an ABHQ admin using service role client for reliability
    const { data: adminCheck, error: adminError } = await serviceClient
      .from('abhq_admin_users')
      .select('active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    debugInfo.admin_check = {
      admin_found: !!adminCheck,
      admin_active: adminCheck?.active,
      error_message: adminError?.message,
      error_code: adminError?.code,
      error_details: adminError?.details,
      query_user_id: user.id
    };

    if (adminError || !adminCheck) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient permissions - not an active admin',
          success: false,
          debug: debugInfo
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse request body
    const { artist_profile_id, artist_name } = await req.json();
    debugInfo.request_data = {
      artist_profile_id,
      artist_name,
      has_profile_id: !!artist_profile_id
    };

    if (!artist_profile_id) {
      return new Response(
        JSON.stringify({
          error: 'artist_profile_id is required',
          success: false,
          debug: debugInfo
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Delete ALL payment records for this artist for a complete reset
    const { error: deletePaymentsError, count: deletedCount } = await serviceClient
      .from('artist_payments')
      .delete()
      .eq('artist_profile_id', artist_profile_id);

    debugInfo.delete_operation = {
      success: !deletePaymentsError,
      deleted_count: deletedCount,
      error_message: deletePaymentsError?.message,
      error_code: deletePaymentsError?.code
    };

    if (deletePaymentsError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to delete payment records',
          success: false,
          debug: debugInfo
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Reset their Stripe recipient ID in artist_global_payments
    const { error: updateGlobalError } = await serviceClient
      .from('artist_global_payments')
      .update({
        stripe_recipient_id: null,
        stripe_account_status: null,
        stripe_verification_status: null
      })
      .eq('artist_profile_id', artist_profile_id);

    if (updateGlobalError) {
      console.error('Warning: Could not reset artist global payment status:', updateGlobalError);
      // Don't throw - this is not critical for the reset
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment status reset for ${artist_name}. ${deletedCount || 0} payment records removed.`,
        deleted_count: deletedCount || 0
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-reset-payment-status',
          error_type: error.constructor.name,
          error_message: error.message,
          error_stack: error.stack
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});