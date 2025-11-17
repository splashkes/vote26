import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify request is authorized with X-Cron-Secret header
    const cronSecret = req.headers.get('X-Cron-Secret');

    if (!cronSecret) {
      return new Response(
        JSON.stringify({ error: 'Missing X-Cron-Secret header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the cron secret
    const { data: secretData, error: secretError } = await supabase
      .from('cron_secrets')
      .select('secret_value')
      .eq('name', 'sms_scheduled_cron')
      .single();

    if (secretError || !secretData || cronSecret !== secretData.secret_value) {
      return new Response(
        JSON.stringify({ error: 'Invalid X-Cron-Secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('SMS Scheduled Campaigns Cron - Starting processing...');

    // Find all campaigns that should be sent now (queued + scheduled + in_progress)
    const { data: campaigns, error: campaignsError } = await supabase
      .from('sms_marketing_campaigns')
      .select('*')
      .or(`status.eq.queued,status.eq.in_progress,and(status.eq.scheduled,scheduled_at.lte.${new Date().toISOString()})`)
      .order('created_at', { ascending: true })
      .limit(10); // Process up to 10 campaigns per run

    if (campaignsError) {
      console.error('Error fetching scheduled campaigns:', campaignsError);
      throw new Error(`Failed to fetch campaigns: ${campaignsError.message}`);
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('No scheduled campaigns to process');
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        message: 'No scheduled campaigns to process'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${campaigns.length} scheduled campaigns to process`);

    const results = [];
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';

    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.name} (ID: ${campaign.id})`);

      try {
        // Mark campaign as in-progress
        await supabase
          .from('sms_marketing_campaigns')
          .update({
            status: 'in_progress',
            started_at: new Date().toISOString()
          })
          .eq('id', campaign.id);

        const message = campaign.metadata?.message_template;
        const recipientData = campaign.metadata?.recipient_data || [];

        if (!message || recipientData.length === 0) {
          throw new Error('Missing message template or recipient data');
        }

        // Process campaign in batches to avoid timeouts
        // Send messages directly instead of calling bulk function
        const BATCH_SIZE = 100; // Process 100 messages per cron run

        // Get list of already attempted recipient IDs (don't retry failures)
        const attemptedIds = new Set(campaign.metadata?.attempted_recipient_ids || []);

        // Filter to only recipients that haven't been attempted yet
        const remainingRecipients = recipientData.filter(person => !attemptedIds.has(person.id));
        const batchRecipients = remainingRecipients.slice(0, BATCH_SIZE);

        console.log(`Processing batch: ${batchRecipients.length} recipients (${remainingRecipients.length} remaining of ${recipientData.length} total)`);

        let sentCount = 0;
        let failedCount = 0;
        const newlyAttemptedIds = [];
        const failureDetails = campaign.metadata?.failure_details || [];

        // Send messages one by one (with rate limiting in send-marketing-sms)
        for (const person of batchRecipients) {
          newlyAttemptedIds.push(person.id);
          try {
            const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-marketing-sms`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                to: person.phone,
                message: message,
                campaign_id: campaign.id,
                metadata: {
                  campaign_name: campaign.name,
                  scheduled_campaign: true
                }
              })
            });

            const sendResult = await sendResponse.json();

            if (sendResponse.ok && sendResult.success) {
              sentCount++;
            } else {
              failedCount++;
              const errorMsg = sendResult.error || 'Unknown error';
              console.error(`Failed to send to ${person.phone}:`, errorMsg);
              failureDetails.push({
                person_id: person.id,
                phone: person.phone,
                name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                error: errorMsg,
                timestamp: new Date().toISOString()
              });
            }
          } catch (error) {
            failedCount++;
            console.error(`Error sending to ${person.phone}:`, error.message);
            failureDetails.push({
              person_id: person.id,
              phone: person.phone,
              name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        }

        // Update campaign progress
        // Add newly attempted IDs to the tracking list
        const allAttemptedIds = [...attemptedIds, ...newlyAttemptedIds];
        const totalSent = (campaign.messages_sent || 0) + sentCount;
        const totalFailed = (campaign.messages_failed || 0) + failedCount;
        const isComplete = allAttemptedIds.length >= recipientData.length;

        await supabase
          .from('sms_marketing_campaigns')
          .update({
            status: isComplete ? 'completed' : 'in_progress',
            messages_sent: totalSent,
            messages_failed: totalFailed,
            completed_at: isComplete ? new Date().toISOString() : null,
            metadata: {
              ...campaign.metadata,
              attempted_recipient_ids: allAttemptedIds,
              failure_details: failureDetails
            }
          })
          .eq('id', campaign.id);

        console.log(`Campaign ${campaign.name}: sent ${sentCount}, failed ${failedCount}, total progress: ${allAttemptedIds.length}/${recipientData.length} (${totalSent} sent, ${totalFailed} failed)`);

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          success: true,
          batch_sent: sentCount,
          batch_failed: failedCount,
          total_sent: totalSent,
          total_recipients: recipientData.length,
          status: isComplete ? 'completed' : 'in_progress'
        });

      } catch (campaignError) {
        console.error(`Error processing campaign ${campaign.id}:`, campaignError);

        // Mark campaign as failed
        await supabase
          .from('sms_marketing_campaigns')
          .update({
            status: 'failed',
            metadata: {
              ...campaign.metadata,
              error: campaignError.message,
              failed_at: new Date().toISOString()
            }
          })
          .eq('id', campaign.id);

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          success: false,
          error: campaignError.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: campaigns.length,
      results: results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
