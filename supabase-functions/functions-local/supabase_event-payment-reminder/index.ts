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
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request parameters
    let requestBody = null;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const {
      event_id,
      art_id,
      action_type, // 'payment_reminder' | 'runner_up_offer'
      reminder_method = 'email', // 'email' | 'sms'
      custom_message
    } = requestBody;

    if (!event_id || !art_id || !action_type) {
      return new Response(JSON.stringify({
        error: 'event_id, art_id, and action_type are required',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Verify user has access to this event
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Authorization header required',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Invalid authentication',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Check event admin access
    const { data: eventAdminCheck, error: adminError } = await serviceClient
      .from('event_admins')
      .select('admin_level')
      .eq('event_id', event_id)
      .eq('phone', user.phone)
      .single();

    if (adminError || !eventAdminCheck) {
      return new Response(JSON.stringify({
        error: 'Access denied: Not an admin for this event',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      });
    }

    // Get art and artist details
    const { data: artDetails, error: artError } = await serviceClient
      .from('art')
      .select(`
        id,
        art_code,
        final_price,
        current_bid,
        status,
        buyer_pay_recent_date,
        buyer_pay_recent_person_id,
        event_id,
        artist_id,
        artist_profiles!art_artist_id_fkey (
          id,
          name,
          email,
          phone
        ),
        events!art_event_id_fkey (
          id,
          name,
          currency
        )
      `)
      .eq('id', art_id)
      .eq('event_id', event_id)
      .single();

    if (artError || !artDetails) {
      return new Response(JSON.stringify({
        error: 'Art piece not found or not in specified event',
        success: false,
        debug: { artError: artError?.message }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404
      });
    }

    console.log(`Processing ${action_type} for art ${artDetails.art_code} by ${artDetails.artist_profiles.name}`);

    let result = null;
    let notificationData = null;

    if (action_type === 'payment_reminder') {
      // Create payment reminder
      const reminderMessage = custom_message ||
        `Hi ${artDetails.artist_profiles.name}, this is a reminder that your artwork "${artDetails.art_code}" sold for ${artDetails.events.currency} $${(artDetails.final_price || artDetails.current_bid || 0).toFixed(2)} and payment is still pending. Please complete your payment to claim your artwork.`;

      notificationData = {
        type: 'payment_reminder',
        art_id: art_id,
        event_id: event_id,
        recipient_email: artDetails.artist_profiles.email,
        recipient_phone: artDetails.artist_profiles.phone,
        message: reminderMessage,
        reminder_method: reminder_method,
        sent_by: user.email || user.phone,
        art_code: artDetails.art_code,
        artist_name: artDetails.artist_profiles.name,
        amount: artDetails.final_price || artDetails.current_bid || 0,
        currency: artDetails.events.currency
      };

    } else if (action_type === 'runner_up_offer') {
      // Create runner-up offer
      const offerMessage = custom_message ||
        `Hi! The artwork "${artDetails.art_code}" from the ${artDetails.events.name} event is available again. The original buyer did not complete payment. Would you like to purchase it for ${artDetails.events.currency} $${(artDetails.final_price || artDetails.current_bid || 0).toFixed(2)}?`;

      notificationData = {
        type: 'runner_up_offer',
        art_id: art_id,
        event_id: event_id,
        message: offerMessage,
        reminder_method: reminder_method,
        sent_by: user.email || user.phone,
        art_code: artDetails.art_code,
        artist_name: artDetails.artist_profiles.name,
        amount: artDetails.final_price || artDetails.current_bid || 0,
        currency: artDetails.events.currency
      };
    }

    // First get the person_id for the buyer (for payment reminders) or we'll need to handle runner-up differently
    let targetPersonId = null;

    if (action_type === 'payment_reminder') {
      // For payment reminders, get the buyer's person_id from the art table
      if (artDetails.buyer_pay_recent_person_id) {
        targetPersonId = artDetails.buyer_pay_recent_person_id;
      } else {
        // Could try to look up person by phone/email, but for now we'll use a placeholder
        return new Response(JSON.stringify({
          error: 'Cannot send payment reminder: no buyer person_id found for this art piece',
          success: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }
    } else {
      // For runner-up offers, we'd need to implement logic to find runner-up bidders
      // For now, we'll return an error as this requires more complex implementation
      return new Response(JSON.stringify({
        error: 'Runner-up offers not yet implemented - requires bidding history lookup',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 501
      });
    }

    // Log the notification request using existing schema
    const { data: logEntry, error: logError } = await serviceClient
      .from('payment_reminders')
      .insert({
        art_id: art_id,
        sent_to_person_id: targetPersonId,
        sent_by_admin: user.id,
        message_content: notificationData.message,
        phone_number: artDetails.artist_profiles.phone || '',
        admin_note: `${action_type} sent via ${reminder_method}${custom_message ? ' (custom message)' : ''}`,
        metadata: {
          action_type: action_type,
          reminder_method: reminder_method,
          art_code: artDetails.art_code,
          artist_name: artDetails.artist_profiles.name,
          amount: notificationData.amount,
          currency: notificationData.currency,
          custom_message: !!custom_message,
          event_id: event_id
        }
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to log reminder:', logError);
      // Continue anyway, logging is not critical
    }

    // Here you would integrate with your existing notification system
    // For now, we'll just return the prepared notification data
    result = {
      success: true,
      action_type: action_type,
      art_code: artDetails.art_code,
      artist_name: artDetails.artist_profiles.name,
      notification_prepared: notificationData,
      log_entry_id: logEntry?.id,
      message: `${action_type === 'payment_reminder' ? 'Payment reminder' : 'Runner-up offer'} prepared for ${artDetails.art_code}`
    };

    // TODO: Integrate with actual notification sending
    // This could call your existing SMS/email functions:
    // - For SMS: call your existing SMS notification function
    // - For email: call your existing email notification function
    // Example:
    /*
    if (reminder_method === 'email' && notificationData.recipient_email) {
      // Call email notification function
      await serviceClient.functions.invoke('send-email-notification', {
        body: {
          to: notificationData.recipient_email,
          subject: `Art Battle - ${action_type === 'payment_reminder' ? 'Payment Reminder' : 'Artwork Available'}`,
          message: notificationData.message
        }
      });
    } else if (reminder_method === 'sms' && notificationData.recipient_phone) {
      // Call SMS notification function
      await serviceClient.functions.invoke('send-sms-notification', {
        body: {
          to: notificationData.recipient_phone,
          message: notificationData.message.substring(0, 160) // SMS length limit
        }
      });
    }
    */

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in event-payment-reminder:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'event-payment-reminder',
        error_type: error.constructor.name,
        stack: error.stack
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});