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

    // Parse request body
    const body = await req.json();
    const {
      artist_id,
      invite_type = 'email',
      custom_message,
      admin_note
    } = body;

    if (!artist_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'artist_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Sending ${invite_type} payment setup invitation to artist ${artist_id}`);

    // Call the database function to create invitation
    const { data: inviteResult, error: inviteError } = await serviceClient
      .rpc('send_payment_setup_invitation', {
        artist_id,
        invite_type,
        custom_message,
        admin_note
      });

    if (inviteError) {
      console.error('Database error:', inviteError);
      throw inviteError;
    }

    console.log('Invite result:', inviteResult);

    // If successful, send the email immediately
    let invitationHistory = [];
    if (inviteResult.success && invite_type === 'email' && inviteResult.artist_email) {
      try {
        // Send email via send-custom-email edge function
        const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-custom-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: inviteResult.artist_email,
            subject: inviteResult.email_subject,
            text: inviteResult.email_content,
            from: 'Art Battle Payments <payments@artbattle.com>',
            cc: 'payments@artbattle.com'
          })
        });

        const emailResult = await emailResponse.json();
        console.log('Email send result:', emailResult);

        if (!emailResult.success) {
          console.error('Failed to send email:', emailResult);
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
      }

      // Get invitation history
      const { data: historyData, error: historyError } = await serviceClient
        .rpc('get_artist_invitation_history', { p_artist_profile_id: artist_id });

      if (historyError) {
        console.error('Error fetching invitation history:', historyError);
      } else {
        invitationHistory = historyData || [];
      }
    } else if (inviteResult.success) {
      // For SMS or if no email, just get history
      const { data: historyData, error: historyError } = await serviceClient
        .rpc('get_artist_invitation_history', { p_artist_profile_id: artist_id });

      if (historyError) {
        console.error('Error fetching invitation history:', historyError);
      } else {
        invitationHistory = historyData || [];
      }
    }

    const response = {
      ...inviteResult,
      invitation_history: invitationHistory,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-send-payment-invite:', error);
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