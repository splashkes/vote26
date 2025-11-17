// Telnyx SMS Marketing - Send Individual SMS
// Date: August 26, 2025
// Purpose: Send individual marketing SMS via Telnyx API

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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get request body
    const {
      to,
      message,
      from,
      template_id,
      campaign_id,
      metadata = {}
    } = await req.json();

    // Validate required fields
    if (!to || !message) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: to and message are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get Telnyx credentials from secrets
    const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
    const TELNYX_FROM_NUMBER = Deno.env.get('TELNYX_FROM_NUMBER');

    if (!TELNYX_API_KEY) {
      throw new Error('Telnyx API key not configured in secrets');
    }

    // Format phone numbers to E.164
    const formatPhoneNumber = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, '');
      
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
      } else if (phone.startsWith('+')) {
        return phone;
      }
      
      return `+${cleaned}`;
    };

    const toFormatted = formatPhoneNumber(to);
    const fromFormatted = from ? formatPhoneNumber(from) : (TELNYX_FROM_NUMBER || '+18887111857');

    // Check if phone number is opted out
    const { data: optOutCheck } = await supabase
      .rpc('is_phone_opted_out', { phone_number: toFormatted });

    if (optOutCheck) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Phone number has opted out of marketing messages',
        phone: toFormatted
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Look up person data for variable substitution
    const { data: personData } = await supabase
      .from('people')
      .select('id, first_name, last_name, name, hash, phone, phone_number')
      .or(`phone.eq.${toFormatted},phone_number.eq.${toFormatted}`)
      .single();

    // Apply variable substitution to message
    let processedMessage = message;
    if (personData) {
      // Build full name from first_name and last_name, fallback to name field
      const fullName = personData.first_name && personData.last_name
        ? `${personData.first_name} ${personData.last_name}`.trim()
        : (personData.name || '');

      // Replace variables (case-insensitive)
      processedMessage = processedMessage
        .replace(/%%HASH%%/gi, personData.hash || '')
        .replace(/%%NAME%%/gi, fullName)
        .replace(/%%FIRST_NAME%%/gi, personData.first_name || '')
        .replace(/%%LAST_NAME%%/gi, personData.last_name || '');
    }

    // Calculate message stats (using processed message)
    const characterCount = processedMessage.length;
    const messageParts = Math.ceil(characterCount / 160); // GSM-7 single part limit

    // Validate message length (max 10 parts per Telnyx)
    if (messageParts > 10) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Message too long. Maximum 10 message parts (1600 characters) allowed.',
        character_count: characterCount,
        message_parts: messageParts
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create outbound log entry
    const { data: outboundLog, error: logError } = await supabase
      .from('sms_outbound')
      .insert({
        campaign_id: campaign_id || null,
        template_id: template_id || null,
        to_phone: toFormatted,
        from_phone: fromFormatted,
        message_body: processedMessage, // Use processed message with variables substituted
        character_count: characterCount,
        message_parts: messageParts,
        status: 'pending',
        metadata: metadata
      })
      .select('id')
      .single();

    if (logError) {
      console.error('Error creating outbound log:', logError);
    }

    const outboundId = outboundLog?.id;

    // Send SMS via Telnyx API
    const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromFormatted,
        to: toFormatted,
        text: processedMessage // Use processed message with variables substituted
      })
    });

    const telnyxData = await telnyxResponse.json();

    if (!telnyxResponse.ok) {
      // Update outbound log with failure
      if (outboundId) {
        await supabase
          .from('sms_outbound')
          .update({
            status: 'failed',
            error_message: telnyxData.errors?.[0]?.detail || 'Unknown Telnyx error',
            failed_at: new Date().toISOString()
          })
          .eq('id', outboundId);

        // Log the failure
        await supabase.rpc('log_sms_activity', {
          p_message_type: 'outbound',
          p_related_id: outboundId,
          p_phone_number: toFormatted,
          p_action: 'failed',
          p_status: 'failed',
          p_message: processedMessage,
          p_error_details: telnyxData.errors?.[0]?.detail || 'Unknown error'
        });
      }

      console.error('Telnyx API error:', telnyxData);
      throw new Error(telnyxData.errors?.[0]?.detail || 'Failed to send SMS via Telnyx');
    }

    // Update outbound log with success
    const telnyxMessageId = telnyxData.data?.id;
    if (outboundId) {
      await supabase
        .from('sms_outbound')
        .update({
          telnyx_message_id: telnyxMessageId,
          status: 'sent',
          telnyx_status: telnyxData.data?.messaging_profile_id ? 'queued' : 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', outboundId);

      // Log the success
      await supabase.rpc('log_sms_activity', {
        p_message_type: 'outbound',
        p_related_id: outboundId,
        p_phone_number: toFormatted,
        p_action: 'sent',
        p_status: 'sent',
        p_message: processedMessage,
        p_metadata: { telnyx_message_id: telnyxMessageId }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'SMS sent successfully via Telnyx',
      details: {
        outbound_id: outboundId,
        telnyx_message_id: telnyxMessageId,
        from: fromFormatted,
        to: toFormatted,
        character_count: characterCount,
        message_parts: messageParts,
        status: 'sent',
        timestamp: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in send-marketing-sms function:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to send marketing SMS via Telnyx'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});