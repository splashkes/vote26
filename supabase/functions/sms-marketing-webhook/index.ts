// Telnyx SMS Marketing - Webhook Handler for Inbound Messages
// Date: August 26, 2025
// Purpose: Handle Telnyx webhooks for inbound SMS, delivery receipts, and status updates

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telnyx-signature'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client - using service key for webhook (no user auth required)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { 
        autoRefreshToken: false, 
        persistSession: false,
        detectSessionInUrl: false 
      },
      global: {
        headers: { 
          Authorization: `Bearer ${supabaseServiceKey}` 
        }
      }
    });

    // Get webhook signature for validation (optional but recommended)
    const telnyxSignature = req.headers.get('x-telnyx-signature');
    const webhookSecret = Deno.env.get('TELNYX_WEBHOOK_SECRET');

    // Parse webhook payload
    const payload = await req.json();
    console.log('Received Telnyx webhook:', JSON.stringify(payload, null, 2));

    // Validate webhook signature if secret is configured
    if (webhookSecret && telnyxSignature) {
      // TODO: Implement webhook signature validation
      // This would involve HMAC SHA-256 verification using the webhook secret
      console.log('Webhook signature validation would go here');
    }

    // Extract webhook data
    const eventType = payload.event_type || payload.data?.event_type;
    const webhookData = payload.data || payload;

    // Handle Telnyx inbound SMS format (doesn't have event_type, uses direction field)
    if (!eventType && payload.direction === 'inbound') {
      console.log('Processing inbound SMS in simple format');
      await handleInboundMessage(supabase, payload);
      return new Response(JSON.stringify({
        received: true,
        event_type: 'inbound_sms',
        processed: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!eventType) {
      console.log('No event_type found in webhook payload:', JSON.stringify(payload));
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Processing webhook event: ${eventType}`);

    // Handle different webhook event types
    switch (eventType) {
      case 'message.received':
        await handleInboundMessage(supabase, webhookData);
        break;
      
      case 'message.sent':
        await handleMessageSent(supabase, webhookData);
        break;
      
      case 'message.delivered':
        await handleMessageDelivered(supabase, webhookData);
        break;
      
      case 'message.delivery_failed':
        await handleMessageFailed(supabase, webhookData);
        break;
      
      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
        // Log unknown events for debugging
        await supabase.rpc('log_sms_activity', {
          p_message_type: 'webhook',
          p_related_id: null,
          p_phone_number: webhookData.to || webhookData.from || null,
          p_action: 'webhook_received',
          p_status: eventType,
          p_message: `Unhandled webhook event: ${eventType}`,
          p_metadata: payload
        });
        break;
    }

    return new Response(JSON.stringify({ 
      received: true, 
      event_type: eventType,
      processed: true 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in sms-marketing-webhook function:', error);
    
    return new Response(JSON.stringify({
      received: true, // Still acknowledge receipt to Telnyx
      error: error.message,
      processed: false
    }), {
      status: 200, // Return 200 to prevent Telnyx retries
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Handle inbound SMS messages
async function handleInboundMessage(supabase: any, data: any) {
  try {
    // Handle both Telnyx formats:
    // 1. Event format: data.id, data.from.phone_number, data.to[0].phone_number, data.text
    // 2. Simple format: data.sms_id, data.from, data.to, data.body
    const messageId = data.id || data.sms_id;
    const fromPhone = data.from?.phone_number || data.from;
    const toPhone = data.to?.[0]?.phone_number || data.to;
    const messageBody = data.text || data.body || '';

    console.log(`Inbound SMS: ${fromPhone} -> ${toPhone}: "${messageBody}"`);

    // Check for opt-out keywords
    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'END'];
    const helpKeywords = ['HELP', 'INFO', 'SUPPORT'];
    
    const messageUpper = messageBody.toUpperCase().trim();
    const isStopRequest = optOutKeywords.some(keyword => messageUpper === keyword);
    const isHelpRequest = helpKeywords.some(keyword => messageUpper === keyword);

    // Insert inbound message log
    const { data: inboundLog, error: inboundError } = await supabase
      .from('sms_inbound')
      .insert({
        telnyx_message_id: messageId,
        from_phone: fromPhone,
        to_phone: toPhone,
        message_body: messageBody,
        character_count: messageBody.length,
        direction: 'inbound',
        telnyx_data: data,
        is_stop_request: isStopRequest,
        is_help_request: isHelpRequest
      })
      .select('id')
      .single();

    if (inboundError) {
      console.error('Error inserting inbound message:', inboundError);
    }

    // Handle opt-out request
    if (isStopRequest) {
      await handleOptOut(supabase, fromPhone, messageBody, inboundLog?.id);
    }

    // Handle help request  
    if (isHelpRequest) {
      await handleHelpRequest(supabase, fromPhone, toPhone, messageBody, inboundLog?.id);
    }

    // Log the activity
    await supabase.rpc('log_sms_activity', {
      p_message_type: 'inbound',
      p_related_id: inboundLog?.id,
      p_phone_number: fromPhone,
      p_action: 'received',
      p_status: 'received',
      p_message: messageBody,
      p_metadata: { 
        telnyx_message_id: messageId,
        is_stop_request: isStopRequest,
        is_help_request: isHelpRequest
      }
    });

  } catch (error) {
    console.error('Error handling inbound message:', error);
  }
}

// Handle message sent confirmation
async function handleMessageSent(supabase: any, data: any) {
  try {
    const telnyxMessageId = data.id;
    console.log(`Message sent confirmation: ${telnyxMessageId}`);

    // Update outbound message status
    const { error: updateError } = await supabase
      .from('sms_outbound')
      .update({
        status: 'sent',
        telnyx_status: data.messaging_profile_id ? 'queued' : 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('telnyx_message_id', telnyxMessageId);

    if (updateError) {
      console.error('Error updating message sent status:', updateError);
    }

  } catch (error) {
    console.error('Error handling message sent:', error);
  }
}

// Handle message delivery confirmation
async function handleMessageDelivered(supabase: any, data: any) {
  try {
    const telnyxMessageId = data.id;
    console.log(`Message delivered: ${telnyxMessageId}`);

    // Update outbound message status
    const { error: updateError } = await supabase
      .from('sms_outbound')
      .update({
        status: 'delivered',
        telnyx_status: 'delivered',
        delivered_at: new Date().toISOString()
      })
      .eq('telnyx_message_id', telnyxMessageId);

    if (updateError) {
      console.error('Error updating message delivered status:', updateError);
    }

    // Update campaign stats if applicable
    const { data: outboundMsg } = await supabase
      .from('sms_outbound')
      .select('campaign_id')
      .eq('telnyx_message_id', telnyxMessageId)
      .single();

    if (outboundMsg?.campaign_id) {
      await supabase.rpc('sql', {
        query: `
          UPDATE sms_marketing_campaigns 
          SET messages_delivered = messages_delivered + 1
          WHERE id = $1
        `,
        params: [outboundMsg.campaign_id]
      });
    }

  } catch (error) {
    console.error('Error handling message delivered:', error);
  }
}

// Handle message delivery failure
async function handleMessageFailed(supabase: any, data: any) {
  try {
    const telnyxMessageId = data.id;
    const errorMessage = data.error_message || data.failure_reason || 'Delivery failed';
    console.log(`Message delivery failed: ${telnyxMessageId} - ${errorMessage}`);

    // Update outbound message status
    const { error: updateError } = await supabase
      .from('sms_outbound')
      .update({
        status: 'failed',
        telnyx_status: 'failed',
        error_message: errorMessage,
        failed_at: new Date().toISOString()
      })
      .eq('telnyx_message_id', telnyxMessageId);

    if (updateError) {
      console.error('Error updating message failed status:', updateError);
    }

  } catch (error) {
    console.error('Error handling message failed:', error);
  }
}

// Handle opt-out requests
async function handleOptOut(supabase: any, phoneNumber: string, message: string, inboundId: string | null) {
  try {
    console.log(`Processing opt-out request from ${phoneNumber}`);

    // Add to opt-out list
    const { error: optOutError } = await supabase
      .from('sms_marketing_optouts')
      .upsert({
        phone_number: phoneNumber,
        opted_out_at: new Date().toISOString(),
        opt_out_message: message,
        source: 'sms_reply'
      }, {
        onConflict: 'phone_number'
      });

    if (optOutError) {
      console.error('Error adding to opt-out list:', optOutError);
    }

    // Send confirmation (optional - depends on compliance requirements)
    const confirmationMessage = "You have been unsubscribed from SMS marketing messages. Reply HELP for more info.";
    
    // Note: You might want to send this confirmation via the marketing SMS function
    console.log(`Would send opt-out confirmation to ${phoneNumber}: "${confirmationMessage}"`);

    // Log the opt-out
    await supabase.rpc('log_sms_activity', {
      p_message_type: 'inbound',
      p_related_id: inboundId,
      p_phone_number: phoneNumber,
      p_action: 'opt_out',
      p_status: 'processed',
      p_message: message,
      p_metadata: { action: 'opt_out_processed' }
    });

  } catch (error) {
    console.error('Error handling opt-out:', error);
  }
}

// Handle help requests
async function handleHelpRequest(supabase: any, fromPhone: string, toPhone: string, message: string, inboundId: string | null) {
  try {
    console.log(`Processing help request from ${fromPhone}`);

    const helpMessage = "Art Battle SMS Marketing. Reply STOP to unsubscribe. For support: hello@artbattle.com";
    
    // Note: You might want to send this help message via the marketing SMS function
    console.log(`Would send help response to ${fromPhone}: "${helpMessage}"`);

    // Log the help request
    await supabase.rpc('log_sms_activity', {
      p_message_type: 'inbound',
      p_related_id: inboundId,
      p_phone_number: fromPhone,
      p_action: 'help_request',
      p_status: 'processed',
      p_message: message,
      p_metadata: { action: 'help_response_needed' }
    });

  } catch (error) {
    console.error('Error handling help request:', error);
  }
}