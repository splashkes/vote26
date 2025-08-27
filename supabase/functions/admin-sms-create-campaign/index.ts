// SMS Promotion System - Campaign Creation
// Date: August 27, 2025
// Purpose: Create SMS campaigns and queue messages via existing bulk SMS system

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
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user is super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check super admin status
    const { data: adminCheck, error: adminError } = await supabase.rpc('is_super_admin');
    if (adminError || !adminCheck) {
      return new Response(JSON.stringify({ error: 'Super admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const {
      campaign_name,
      message,
      person_ids = [],
      targeting_criteria = {},
      estimated_segments = 1,
      test_mode = false
    } = await req.json();

    // Validate required fields
    if (!campaign_name || !message) {
      return new Response(JSON.stringify({
        error: 'campaign_name and message are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!Array.isArray(person_ids) || person_ids.length === 0) {
      return new Response(JSON.stringify({
        error: 'person_ids array is required and must not be empty'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get people details and filter out blocked users
    const { data: people, error: peopleError } = await supabase
      .from('people')
      .select('id, phone, first_name, last_name, blocked')
      .in('id', person_ids);

    if (peopleError) {
      console.error('Error fetching people:', peopleError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch audience data'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Filter out blocked users and users without phone numbers
    const validRecipients = people.filter(person => 
      !person.blocked && 
      person.phone && 
      person.phone.trim().length > 0
    );

    if (validRecipients.length === 0) {
      return new Response(JSON.stringify({
        error: 'No valid recipients found (all blocked or missing phone numbers)'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const blockedCount = people.length - validRecipients.length;

    // Create campaign record
    const { data: campaign, error: campaignError } = await supabase
      .from('sms_marketing_campaigns')
      .insert({
        name: campaign_name,
        message_template: message,
        targeting_criteria: targeting_criteria,
        messages_sent: validRecipients.length,
        messages_blocked: blockedCount,
        status: test_mode ? 'test' : 'queued',
        created_by: user.id
      })
      .select('id')
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      return new Response(JSON.stringify({
        error: 'Failed to create campaign record'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const campaignId = campaign.id;

    // Prepare recipients for bulk SMS function
    const recipients = validRecipients.map(person => ({
      phone: person.phone,
      variables: {
        first_name: person.first_name || '',
        last_name: person.last_name || '',
        full_name: `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'Friend'
      }
    }));

    try {
      // Call existing send-bulk-marketing-sms function
      const bulkSmsResponse = await fetch(`${supabaseUrl}/functions/v1/send-bulk-marketing-sms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaign_id: campaignId,
          recipients: recipients,
          message: message,
          rate_limit: 500, // Toll-free number rate limit
          test_mode: test_mode,
          metadata: {
            campaign_name: campaign_name,
            targeting_criteria: targeting_criteria,
            created_by: user.id
          }
        })
      });

      const bulkSmsResult = await bulkSmsResponse.json();

      if (!bulkSmsResponse.ok || !bulkSmsResult.success) {
        // Update campaign status to failed
        await supabase
          .from('sms_marketing_campaigns')
          .update({ 
            status: 'failed',
            failure_reason: bulkSmsResult.error || 'Bulk SMS processing failed'
          })
          .eq('id', campaignId);

        return new Response(JSON.stringify({
          error: `Failed to queue messages: ${bulkSmsResult.error || 'Unknown error'}`,
          campaign_id: campaignId
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Calculate estimated cost
      const estimatedCostCents = validRecipients.length * estimated_segments * 1; // Assume 1 cent per segment

      // Update campaign with processing details
      await supabase
        .from('sms_marketing_campaigns')
        .update({
          status: test_mode ? 'test_completed' : 'processing',
          total_cost_cents: estimatedCostCents,
          messages_queued: bulkSmsResult.queued_count || validRecipients.length,
          started_at: new Date().toISOString()
        })
        .eq('id', campaignId);

      return new Response(JSON.stringify({
        success: true,
        campaign_id: campaignId,
        campaign_name: campaign_name,
        recipients_targeted: person_ids.length,
        recipients_valid: validRecipients.length,
        recipients_blocked: blockedCount,
        messages_queued: bulkSmsResult.queued_count || validRecipients.length,
        estimated_cost_cents: estimatedCostCents,
        estimated_segments: estimated_segments,
        test_mode: test_mode,
        rate_limit: '500 messages/minute (toll-free)',
        message: test_mode ? 'Campaign created in test mode - no messages sent' : 'Campaign created and messages queued for sending'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (bulkSmsError) {
      console.error('Error calling bulk SMS function:', bulkSmsError);
      
      // Update campaign status to failed
      await supabase
        .from('sms_marketing_campaigns')
        .update({ 
          status: 'failed',
          failure_reason: `Bulk SMS service error: ${bulkSmsError.message}`
        })
        .eq('id', campaignId);

      return new Response(JSON.stringify({
        error: 'Failed to process bulk SMS request',
        campaign_id: campaignId,
        details: bulkSmsError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error in admin-sms-create-campaign:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});