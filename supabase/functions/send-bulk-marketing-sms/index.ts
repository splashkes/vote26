// Telnyx SMS Marketing - Send Bulk SMS Campaign
// Date: August 26, 2025
// Purpose: Send bulk marketing SMS campaigns via Telnyx API with rate limiting

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
      campaign_id,
      template_id,
      recipients, // Array of phone numbers or objects with phone and variables
      message, // Message text (required if no template_id)
      from,
      rate_limit = 6, // Messages per minute (Telnyx long code limit)
      test_mode = false, // If true, don't actually send
      metadata = {}
    } = await req.json();

    // Validate required fields
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Recipients array is required and must not be empty'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!message && !template_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Either message or template_id is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get template if template_id provided
    let messageTemplate = message;
    let templateVariables = [];
    
    if (template_id) {
      const { data: template, error: templateError } = await supabase
        .from('sms_marketing_templates')
        .select('message_template, variables, is_active')
        .eq('id', template_id)
        .single();

      if (templateError || !template) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Template not found or inactive'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!template.is_active) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Template is not active'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      messageTemplate = template.message_template;
      templateVariables = template.variables || [];
    }

    // Get Telnyx credentials
    const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
    const TELNYX_FROM_NUMBER = Deno.env.get('TELNYX_FROM_NUMBER');

    if (!TELNYX_API_KEY && !test_mode) {
      throw new Error('Telnyx API key not configured in secrets');
    }

    // Format phone number helper
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

    const fromFormatted = from ? formatPhoneNumber(from) : (TELNYX_FROM_NUMBER || '+18887111857');

    // Process recipients and prepare messages
    const processedRecipients = [];
    const skippedRecipients = [];

    for (const recipient of recipients) {
      let phoneNumber: string;
      let variables: Record<string, string> = {};

      // Handle different recipient formats
      if (typeof recipient === 'string') {
        phoneNumber = formatPhoneNumber(recipient);
      } else if (typeof recipient === 'object' && recipient.phone) {
        phoneNumber = formatPhoneNumber(recipient.phone);
        variables = recipient.variables || {};
      } else {
        skippedRecipients.push({ recipient, reason: 'Invalid format' });
        continue;
      }

      // Check if phone number is opted out
      const { data: optOutCheck } = await supabase
        .rpc('is_phone_opted_out', { phone_number: phoneNumber });

      if (optOutCheck) {
        skippedRecipients.push({ phone: phoneNumber, reason: 'Opted out' });
        continue;
      }

      // Process message template with variables
      let finalMessage = messageTemplate;
      if (templateVariables.length > 0) {
        for (const variable of templateVariables) {
          const value = variables[variable] || `{{${variable}}}`;
          finalMessage = finalMessage.replace(new RegExp(`{{${variable}}}`, 'g'), value);
        }
      }

      // Calculate message stats
      const characterCount = finalMessage.length;
      const messageParts = Math.ceil(characterCount / 160);

      if (messageParts > 10) {
        skippedRecipients.push({ 
          phone: phoneNumber, 
          reason: `Message too long (${characterCount} chars, ${messageParts} parts)` 
        });
        continue;
      }

      processedRecipients.push({
        phone: phoneNumber,
        message: finalMessage,
        variables,
        characterCount,
        messageParts
      });
    }

    // Update campaign status if provided
    if (campaign_id) {
      await supabase
        .from('sms_marketing_campaigns')
        .update({
          status: test_mode ? 'testing' : 'sending',
          total_recipients: processedRecipients.length,
          started_at: new Date().toISOString()
        })
        .eq('id', campaign_id);
    }

    // Send messages with rate limiting
    const results = {
      total_processed: processedRecipients.length,
      total_skipped: skippedRecipients.length,
      sent: 0,
      failed: 0,
      test_mode,
      messages: [],
      skipped: skippedRecipients,
      campaign_id
    };

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const rateDelayMs = Math.ceil(60000 / rate_limit); // Convert rate limit to delay

    for (let i = 0; i < processedRecipients.length; i++) {
      const recipient = processedRecipients[i];
      
      try {
        let outboundId = null;
        let telnyxMessageId = null;
        let sendSuccess = false;

        if (!test_mode) {
          // Call send-marketing-sms function for consistent variable substitution and sending
          const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-marketing-sms`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              to: recipient.phone,
              from: fromFormatted,
              message: recipient.message,
              campaign_id: campaign_id,
              template_id: template_id,
              metadata: { ...metadata, variables: recipient.variables, batch_index: i }
            })
          });

          const sendData = await sendResponse.json();

          if (sendResponse.ok && sendData.success) {
            outboundId = sendData.details?.outbound_id;
            telnyxMessageId = sendData.details?.telnyx_message_id;
            sendSuccess = true;
            results.sent++;
          } else {
            // Failed to send
            console.error(`Failed to send to ${recipient.phone}:`, sendData.error);
            results.failed++;
          }
        } else {
          // Test mode - create log but don't send
          const { data: outboundLog } = await supabase
            .from('sms_outbound')
            .insert({
              campaign_id: campaign_id || null,
              template_id: template_id || null,
              to_phone: recipient.phone,
              from_phone: fromFormatted,
              message_body: recipient.message,
              character_count: recipient.characterCount,
              message_parts: recipient.messageParts,
              status: 'test',
              metadata: { ...metadata, variables: recipient.variables, batch_index: i }
            })
            .select('id')
            .single();

          outboundId = outboundLog?.id;
          results.sent++;
        }

        results.messages.push({
          phone: recipient.phone,
          status: test_mode ? 'test' : (sendSuccess ? 'sent' : 'failed'),
          outbound_id: outboundId,
          telnyx_message_id: telnyxMessageId,
          character_count: recipient.characterCount,
          message_parts: recipient.messageParts
        });

        // Rate limiting delay (except for last message)
        if (i < processedRecipients.length - 1) {
          await delay(rateDelayMs);
        }

      } catch (error) {
        console.error(`Error sending to ${recipient.phone}:`, error);
        results.failed++;
        
        results.messages.push({
          phone: recipient.phone,
          status: 'failed',
          error: error.message,
          character_count: recipient.characterCount,
          message_parts: recipient.messageParts
        });
      }
    }

    // Update campaign completion
    if (campaign_id) {
      await supabase
        .from('sms_marketing_campaigns')
        .update({
          status: 'completed',
          messages_sent: results.sent,
          messages_failed: results.failed,
          completed_at: new Date().toISOString()
        })
        .eq('id', campaign_id);
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Bulk SMS campaign ${test_mode ? 'tested' : 'completed'}`,
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in send-bulk-marketing-sms function:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to send bulk marketing SMS campaign'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});