import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      artist_profile_id,
      artist_name,
      artist_email,
      artist_phone,
      entry_id,
      reminder_type = 'email',
      recent_events = 'recent events'
    } = await req.json();

    if (!artist_profile_id || !artist_name) {
      return new Response(
        JSON.stringify({ error: 'artist_profile_id and artist_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (reminder_type === 'email' && !artist_email) {
      return new Response(
        JSON.stringify({ error: 'artist_email is required for email reminders' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (reminder_type === 'sms' && !artist_phone) {
      return new Response(
        JSON.stringify({ error: 'artist_phone is required for SMS reminders' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const setupUrl = `https://artb.art/profile`;

    if (reminder_type === 'email') {
      // Use existing email system via message_queue
      const emailSubject = `Payment Setup Required - Art Battle`;
      const emailBody = `
Hi ${artist_name},

Thank you for participating in ${recent_events}!

To receive payments for your artwork sales, please complete your payment account setup:

🔗 Complete Setup: ${setupUrl}

This secure process takes just a few minutes and allows us to send payments directly to your bank account.

Questions? Reply to this email or contact support.

Best regards,
Art Battle Team
      `.trim();

      const { error: emailError } = await supabaseClient
        .from('message_queue')
        .insert({
          channel: 'email',
          destination: artist_email,
          message_body: emailBody,
          metadata: {
            type: 'payment_setup_reminder',
            artist_profile_id: artist_profile_id,
            entry_id: entry_id,
            reminder_method: 'email',
            subject: emailSubject // Store subject in metadata
          },
          status: 'pending',
          priority: 2,
          send_after: new Date().toISOString()
        });

      if (emailError) {
        return new Response(
          JSON.stringify({
            error: 'Failed to queue email',
            success: false,
            debug: {
              timestamp: new Date().toISOString(),
              function_name: 'send-payment-setup-reminder',
              operation: 'email_queue_insert',
              email_error: emailError,
              email_data: {
                destination: artist_email,
                subject: emailSubject,
                body_length: emailBody.length
              },
              database_operation: 'message_queue INSERT'
            }
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Email reminder queued successfully',
          method: 'email',
          destination: artist_email
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (reminder_type === 'sms') {
      // Use existing SMS system via message_queue
      const smsMessage = `Hi ${artist_name}! Complete your Art Battle payment setup to receive payments for your artwork sales: ${setupUrl}`;

      const { error: smsError } = await supabaseClient
        .from('message_queue')
        .insert({
          channel: 'sms',
          destination: artist_phone,
          message_body: smsMessage,
          metadata: {
            type: 'payment_setup_reminder',
            artist_profile_id: artist_profile_id,
            entry_id: entry_id,
            reminder_method: 'sms'
          },
          status: 'pending',
          priority: 2,
          send_after: new Date().toISOString(),
          from_phone: '+18887111857' // Art Battle main number
        });

      if (smsError) {
        throw new Error(`Failed to queue SMS: ${smsError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'SMS reminder queued successfully',
          method: 'sms',
          destination: artist_phone
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid reminder_type. Must be "email" or "sms"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to send reminder',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'send-payment-setup-reminder',
          error_type: error.constructor.name,
          error_message: error.message,
          error_stack: error.stack,
          received_data: {
            artist_profile_id,
            artist_name,
            artist_email,
            artist_phone,
            entry_id,
            reminder_type,
            recent_events
          },
          validation_checks: {
            has_artist_id: !!artist_profile_id,
            has_artist_name: !!artist_name,
            has_email: !!artist_email,
            has_phone: !!artist_phone,
            reminder_type_value: reminder_type
          }
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});