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
    // Create service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authorization header for user identification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing authorization header'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await req.json();
    const { artist_profile_id, reveal_details = false } = body;

    if (!artist_profile_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'artist_profile_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch manual payment request
    const { data: request, error: requestError } = await serviceClient
      .from('artist_manual_payment_requests')
      .select(`
        id,
        artist_profile_id,
        person_id,
        payment_method,
        payment_details,
        country_code,
        preferred_currency,
        status,
        admin_notes,
        processed_by,
        processed_at,
        requested_amount,
        events_referenced,
        created_at,
        updated_at
      `)
      .eq('artist_profile_id', artist_profile_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (requestError) {
      if (requestError.code === 'PGRST116') {
        // No request found
        return new Response(JSON.stringify({
          success: true,
          has_request: false,
          request: null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw requestError;
    }

    // Prepare metadata response (safe to show always)
    const metadata = {
      id: request.id,
      status: request.status,
      payment_method: request.payment_method,
      country_code: request.country_code,
      preferred_currency: request.preferred_currency,
      requested_amount: request.requested_amount,
      events_referenced: request.events_referenced,
      created_at: request.created_at,
      updated_at: request.updated_at,
      processed_at: request.processed_at,
      has_sensitive_data: !!request.payment_details
    };

    // If revealing details, audit log it
    if (reveal_details) {
      // Log the audit trail
      await serviceClient
        .from('admin_audit_logs')
        .insert({
          admin_user_id: user.id,
          admin_email: user.email,
          action: 'view_manual_payment_request_details',
          resource_type: 'artist_manual_payment_requests',
          resource_id: request.id,
          metadata: {
            artist_profile_id: artist_profile_id,
            payment_method: request.payment_method,
            status: request.status
          }
        });

      // Return full details
      return new Response(JSON.stringify({
        success: true,
        has_request: true,
        metadata: metadata,
        sensitive_details: {
          payment_details: request.payment_details,
          admin_notes: request.admin_notes
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Return only metadata
    return new Response(JSON.stringify({
      success: true,
      has_request: true,
      metadata: metadata,
      sensitive_details: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-get-manual-payment-request:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      debug: {
        stack: error.stack,
        name: error.name
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
