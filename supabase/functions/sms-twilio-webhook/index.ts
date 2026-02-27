// Twilio SMS Webhook Handler for Legacy Inbound Messages
// Purpose: Handle Twilio webhooks and store them in the same sms_inbound table as Telnyx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature'
};

serve(async (req) => {
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

  // Capture request details for debugging
  const method = req.method;
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let bodyRaw = '';
  let bodyParsed: any = null;

  try {
    // Read body
    bodyRaw = await req.text();

    // Twilio sends data as application/x-www-form-urlencoded
    const params = new URLSearchParams(bodyRaw);
    bodyParsed = Object.fromEntries(params.entries());

    // Log to debug table
    await supabase.from('sms_webhook_debug').insert({
      method: method,
      headers: headers,
      body_raw: bodyRaw,
      body_parsed: bodyParsed,
      processing_result: 'received - twilio',
      error_message: null
    });

    console.log('=== TWILIO WEBHOOK DEBUG ===');
    console.log('Method:', method);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Body Parsed:', JSON.stringify(bodyParsed, null, 2));

  } catch (debugError) {
    console.error('Error in debug logging:', debugError);
  }

  if (method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Twilio sends webhooks as POST with form-urlencoded data
    // Extract Twilio webhook data
    // https://www.twilio.com/docs/sms/twiml#twilios-request-to-your-application
    const messageSid = bodyParsed.MessageSid || bodyParsed.SmsSid;
    const fromPhone = bodyParsed.From;
    const toPhone = bodyParsed.To;
    const messageBody = bodyParsed.Body || '';
    const numMedia = parseInt(bodyParsed.NumMedia || '0');

    console.log(`Twilio Inbound SMS: ${fromPhone} -> ${toPhone}: "${messageBody}"`);

    if (!fromPhone || !toPhone) {
      throw new Error('Missing required fields: From or To');
    }

    // Check for opt-out keywords
    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'END'];
    const helpKeywords = ['HELP', 'INFO', 'SUPPORT'];

    const messageUpper = messageBody.toUpperCase().trim();
    const isStopRequest = optOutKeywords.some(keyword => messageUpper === keyword);
    const isHelpRequest = helpKeywords.some(keyword => messageUpper === keyword);

    // Insert inbound message into the same table as Telnyx messages
    const { data: inboundLog, error: inboundError } = await supabase
      .from('sms_inbound')
      .insert({
        telnyx_message_id: messageSid, // Use MessageSid here, field name is generic
        from_phone: fromPhone,
        to_phone: toPhone,
        message_body: messageBody,
        character_count: messageBody.length,
        direction: 'inbound',
        telnyx_data: {
          ...bodyParsed,
          source: 'twilio',
          num_media: numMedia
        }, // Store full Twilio payload for reference
        is_stop_request: isStopRequest,
        is_help_request: isHelpRequest
      })
      .select('id')
      .single();

    if (inboundError) {
      console.error('Error inserting inbound message:', inboundError);
      throw inboundError;
    }

    console.log('Twilio message logged successfully:', inboundLog?.id);

    // Handle STOP requests - update person record
    if (isStopRequest && fromPhone) {
      try {
        const { error: blockError } = await supabase
          .from('people')
          .update({ message_blocked: 1 })
          .or(`phone.eq.${fromPhone},phone_number.eq.${fromPhone}`);

        if (blockError) {
          console.error('Error blocking user:', blockError);
        } else {
          console.log(`User ${fromPhone} has been blocked from SMS`);
        }
      } catch (blockErr) {
        console.error('Error in STOP handling:', blockErr);
      }
    }

    // Log successful processing
    await supabase.from('sms_webhook_debug').insert({
      method: method,
      headers: headers,
      body_raw: bodyRaw,
      body_parsed: bodyParsed,
      processing_result: 'success - twilio inbound',
      error_message: null
    });

    // Return TwiML response (empty response to acknowledge receipt)
    // Twilio expects TwiML XML or will retry
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      }
    );

  } catch (error) {
    console.error('Error in sms-twilio-webhook function:', error);

    // Log error
    await supabase.from('sms_webhook_debug').insert({
      method: method,
      headers: headers,
      body_raw: bodyRaw,
      body_parsed: bodyParsed,
      processing_result: 'error',
      error_message: error.message
    });

    // Return TwiML error response
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200, // Return 200 to prevent Twilio retries
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
      }
    );
  }
});
