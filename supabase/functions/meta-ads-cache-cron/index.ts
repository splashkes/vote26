import { createClient } from 'jsr:@supabase/supabase-js@2';

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

    // Create Supabase client to verify the secret
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey
    );

    // Verify the cron secret
    const { data: secretData, error: secretError } = await supabase
      .from('cron_secrets')
      .select('secret_value')
      .eq('name', 'meta_ads_cron')
      .single();

    if (secretError || !secretData || cronSecret !== secretData.secret_value) {
      return new Response(
        JSON.stringify({ error: 'Invalid X-Cron-Secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query events from 2 days ago to 60 days in the future
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 2);

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 60);

    console.log(`Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, eid, name, event_start_datetime')
      .gte('event_start_datetime', startDate.toISOString())
      .lte('event_start_datetime', endDate.toISOString())
      .not('eid', 'is', null)
      .order('event_start_datetime', { ascending: true });

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      throw eventsError;
    }

    console.log(`Found ${events?.length || 0} events to process`);

    const results = {
      total_events: events?.length || 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      events_processed: [] as any[],
      errors: [] as any[]
    };

    // Process each event
    for (const event of events || []) {
      console.log(`Processing event ${event.eid} - ${event.name}`);

      try {
        // Call the meta-ads-report function to cache data
        const metaAdsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-ads-report?event_eid=${event.eid}`;

        const response = await fetch(metaAdsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch Meta ads data for ${event.eid}: ${response.status} - ${errorText}`);

          results.failed++;
          results.errors.push({
            eid: event.eid,
            name: event.name,
            error: `HTTP ${response.status}: ${errorText}`,
            timestamp: new Date().toISOString()
          });
          continue;
        }

        const metaData = await response.json();

        // Check if we got valid data
        if (metaData.total_spend !== undefined) {
          results.successful++;
          results.events_processed.push({
            eid: event.eid,
            name: event.name,
            event_date: event.event_start_datetime,
            total_spend: metaData.total_spend,
            currency: metaData.currency,
            campaigns: metaData.campaigns?.length || 0,
            cached_at: new Date().toISOString()
          });
          console.log(`✓ Cached Meta ads data for ${event.eid}: ${metaData.currency} $${metaData.total_spend}`);
        } else if (metaData.message === 'No Meta campaigns found') {
          results.skipped++;
          results.events_processed.push({
            eid: event.eid,
            name: event.name,
            event_date: event.event_start_datetime,
            status: 'no_campaigns',
            cached_at: new Date().toISOString()
          });
          console.log(`- No campaigns found for ${event.eid}`);
        } else {
          results.failed++;
          results.errors.push({
            eid: event.eid,
            name: event.name,
            error: 'Unexpected response format',
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        console.error(`Error processing event ${event.eid}:`, error);
        results.failed++;
        results.errors.push({
          eid: event.eid,
          name: event.name,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log('Cache cron job completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        date_range: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        summary: {
          total_events: results.total_events,
          successful: results.successful,
          failed: results.failed,
          skipped: results.skipped
        },
        events_processed: results.events_processed,
        errors: results.errors.length > 0 ? results.errors : undefined,
        completed_at: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Fatal error in cron job:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
