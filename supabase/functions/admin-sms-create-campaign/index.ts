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
    // Initialize service role client first
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get auth header and verify user
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authorization required'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract token and verify with service role client
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid authorization'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check admin status using service role client
    const { data: adminCheck } = await supabase
      .from('abhq_admin_users')
      .select('email, level')
      .eq('email', user.email)
      .eq('active', true)
      .single();

    if (!adminCheck) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin access required'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`SMS Campaign creation by ${user.email} (level: ${adminCheck.level})`);

    // Now supabase client is ready with service role for operations

    // Parse request body
    const {
      campaign_name,
      message,
      person_ids = [],
      event_id = null,
      targeting_criteria = {},
      estimated_segments = 1,
      test_mode = false,
      scheduled_at = null,
      scheduled_timezone = null,
      scheduled_local_time = null,
      dry_run_mode = false,
      dry_run_phone = null,
      recent_message_hours = 72 // Anti-spam filter from UI
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

    // If dry run mode, replace all recipients with the test phone
    let validRecipients;
    let blockedCount = 0;

    if (dry_run_mode && dry_run_phone) {
      // Look up actual person data for dry run phone to get hash and name
      const { data: dryRunPerson } = await supabase
        .from('people')
        .select('id, phone, phone_number, first_name, last_name, hash, message_blocked')
        .or(`phone.eq.${dry_run_phone},phone_number.eq.${dry_run_phone}`)
        .single();

      validRecipients = [{
        id: dryRunPerson?.id || 'dry-run-test',
        phone: dry_run_phone,
        first_name: dryRunPerson?.first_name || 'Dry',
        last_name: dryRunPerson?.last_name || 'Run Test',
        hash: dryRunPerson?.hash || 'test-hash',
        blocked: false
      }];
      console.log('DRY RUN MODE: Sending only to', dry_run_phone, 'with data:', validRecipients[0]);
    } else {
      // Get people details and filter out blocked users using RPC
      // CRITICAL: Supabase client has HARD 1000-row limit on RPC responses
      // Even if SQL returns 5000 rows, client will cap at 1000
      // Solution: Keep chunks at 1000 or less to ensure we get all data
      const chunkSize = 900; // Process IDs in chunks (900 to stay safely under 1000 limit)
      let allPeople = [];

      console.log(`Fetching ${person_ids.length} people in chunks of ${chunkSize}`);

      for (let i = 0; i < person_ids.length; i += chunkSize) {
        const chunk = person_ids.slice(i, i + chunkSize);
        console.log(`Fetching chunk ${Math.floor(i/chunkSize) + 1}: IDs ${i} to ${i + chunk.length}`);

        const { data: chunkPeople, error: peopleError } = await supabase
          .rpc('get_people_for_campaign', { person_ids: chunk });

        if (peopleError) {
          console.error('Error fetching people chunk:', peopleError);
          const errorMsg = `Failed to fetch audience data: ${peopleError.message}. Person IDs count: ${person_ids.length}`;
          return new Response(JSON.stringify({
            error: errorMsg,
            details: peopleError.message,
            hint: peopleError.hint || 'Check if person_ids are valid',
            person_ids_count: person_ids.length,
            person_ids_sample: person_ids.slice(0, 5)
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (chunkPeople && chunkPeople.length > 0) {
          allPeople = allPeople.concat(chunkPeople);
          console.log(`Got ${chunkPeople.length} people in this chunk, total so far: ${allPeople.length}`);
        }
      }

      const people = allPeople;
      console.log(`Final total: ${people.length} people fetched from ${person_ids.length} IDs`);

      // Filter out blocked users and users without phone numbers
      validRecipients = people.filter(person => {
        const phoneNum = person.phone || person.phone_number;
        return person.message_blocked !== 1 &&
               phoneNum &&
               phoneNum.trim().length > 0;
      });

      if (validRecipients.length === 0) {
        return new Response(JSON.stringify({
          error: 'No valid recipients found (all blocked or missing phone numbers)'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      blockedCount = people.length - validRecipients.length;
    }

    // Determine campaign status
    // ALL campaigns are queued for background processing to avoid timeouts
    let campaignStatus;
    if (test_mode) {
      campaignStatus = 'test';
    } else if (dry_run_mode) {
      campaignStatus = 'queued'; // Process via cron
    } else if (scheduled_at) {
      campaignStatus = 'scheduled';
    } else {
      // Immediate sends are queued and processed by cron within seconds
      campaignStatus = 'queued';
    }

    // Prepare recipient data for storage
    const recipientData = validRecipients.map(person => ({
      id: person.id,
      phone: person.phone || person.phone_number,
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      hash: person.hash || ''
    }));

    // Create campaign record with all data needed for background processing
    const { data: campaign, error: campaignError } = await supabase
      .from('sms_marketing_campaigns')
      .insert({
        name: campaign_name,
        description: `Campaign: ${campaign_name}`,
        event_id: event_id,
        targeting_criteria: targeting_criteria,
        total_recipients: validRecipients.length,
        messages_sent: 0, // Will be updated as cron processes
        status: campaignStatus,
        scheduled_at: scheduled_at || (campaignStatus === 'queued' ? new Date().toISOString() : null),
        created_by: user.id,
        metadata: {
          message_template: message,
          dry_run_mode: dry_run_mode,
          dry_run_phone: dry_run_mode ? dry_run_phone : null,
          blocked_count: blockedCount,
          valid_recipients: validRecipients.length,
          scheduled_timezone: scheduled_timezone,
          scheduled_local_time: scheduled_local_time,
          recipient_data: recipientData, // Store recipient data for background processing
          estimated_segments: estimated_segments,
          recent_message_hours: recent_message_hours // Store for send-time deduplication
        }
      })
      .select('id')
      .single();

    if (campaignError) {
      console.error('Error creating campaign:', campaignError);
      return new Response(JSON.stringify({
        error: 'Failed to create campaign record',
        details: campaignError.message,
        hint: campaignError.hint,
        code: campaignError.code
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const campaignId = campaign.id;

    // Calculate estimated cost
    const estimatedCostCents = validRecipients.length * estimated_segments * 1;

    // Update campaign with cost estimate
    await supabase
      .from('sms_marketing_campaigns')
      .update({
        total_cost_cents: estimatedCostCents
      })
      .eq('id', campaignId);

    // Return immediately - cron will process the campaign
    const statusMessage = scheduled_at
      ? `Campaign scheduled for ${new Date(scheduled_at).toLocaleString()}`
      : test_mode
      ? 'Campaign created in test mode'
      : dry_run_mode
      ? `Dry run campaign queued - will send to ${dry_run_phone}`
      : 'Campaign queued for immediate processing';

    return new Response(JSON.stringify({
      success: true,
      campaign_id: campaignId,
      campaign_name: campaign_name,
      recipients_targeted: person_ids.length,
      recipients_valid: validRecipients.length,
      recipients_blocked: blockedCount,
      messages_queued: validRecipients.length,
      estimated_cost_cents: estimatedCostCents,
      estimated_segments: estimated_segments,
      test_mode: test_mode,
      dry_run_mode: dry_run_mode,
      status: campaignStatus,
      message: statusMessage,
      processing_info: 'Campaign will be processed by background worker within 30-60 seconds'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-sms-create-campaign:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: error.message === 'Not authenticated' ? 401 :
             error.message === 'Unauthorized: Admin access required' ? 403 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});