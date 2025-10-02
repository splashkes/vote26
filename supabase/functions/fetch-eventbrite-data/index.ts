import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchRequest {
  eid?: string;              // Event ID like "AB3059"
  event_id?: string;         // UUID
  eventbrite_id?: string;    // Eventbrite ID
  force_refresh?: boolean;   // Bypass cache
  fetch_reason?: string;     // 'billing', 'refresh', 'manual'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Create Supabase client with service role for unrestricted access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const input: FetchRequest = await req.json();
    const fetchReason = input.fetch_reason || 'manual';

    // Get Eventbrite API credentials
    const eventbriteToken = Deno.env.get('EVENTBRITE_ACCESS_TOKEN');
    const eventbriteOrgId = Deno.env.get('EB_ORG_ID');

    if (!eventbriteToken) {
      throw new Error('EVENTBRITE_ACCESS_TOKEN not configured');
    }
    if (!eventbriteOrgId) {
      throw new Error('EB_ORG_ID not configured');
    }

    // 1. Get event details from database
    let event: any;

    if (input.eid) {
      const { data, error } = await supabaseClient
        .from('events')
        .select('id, eid, name, eventbrite_id')
        .eq('eid', input.eid)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Event ${input.eid} not found`, details: error }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      event = data;
    } else if (input.event_id) {
      const { data, error } = await supabaseClient
        .from('events')
        .select('id, eid, name, eventbrite_id')
        .eq('id', input.event_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Event ${input.event_id} not found`, details: error }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      event = data;
    } else if (input.eventbrite_id) {
      const { data, error } = await supabaseClient
        .from('events')
        .select('id, eid, name, eventbrite_id')
        .eq('eventbrite_id', input.eventbrite_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `Event with Eventbrite ID ${input.eventbrite_id} not found`, details: error }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      event = data;
    } else {
      return new Response(
        JSON.stringify({ error: 'Must provide eid, event_id, or eventbrite_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Event found: EID=${event.eid}, EventbriteID=${event.eventbrite_id}, OrgID=${eventbriteOrgId}`);

    if (!event.eventbrite_id) {
      return new Response(
        JSON.stringify({
          error: 'Event has no Eventbrite ID',
          event_eid: event.eid,
          event_name: event.name
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check cache (unless force_refresh)
    if (!input.force_refresh) {
      const { data: cachedData, error: cacheError } = await supabaseClient
        .from('eventbrite_api_cache')
        .select('*')
        .eq('eid', event.eid)
        .gt('expires_at', new Date().toISOString())
        .gte('data_quality_score', 70)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single();

      if (cachedData && !cacheError) {
        // Return cached data
        const ageHours = (Date.now() - new Date(cachedData.fetched_at).getTime()) / (1000 * 60 * 60);

        return new Response(
          JSON.stringify({
            success: true,
            source: 'cache',
            cache_age_hours: Number(ageHours.toFixed(2)),
            event_eid: event.eid,
            event_name: event.name,

            ticket_data: {
              total_sold: cachedData.total_tickets_sold,
              total_capacity: cachedData.total_capacity,
              percentage_sold: cachedData.total_capacity > 0
                ? Number(((cachedData.total_tickets_sold / cachedData.total_capacity) * 100).toFixed(1))
                : 0,

              gross_revenue: Number(cachedData.gross_revenue),
              ticket_revenue: Number(cachedData.ticket_revenue),
              taxes_collected: Number(cachedData.taxes_collected),
              eventbrite_fees: Number(cachedData.eventbrite_fees),
              payment_processing_fees: Number(cachedData.payment_processing_fees),
              total_fees: Number(cachedData.total_fees),
              net_deposit: Number(cachedData.net_deposit),

              currency_code: cachedData.currency_code,

              average_ticket_price: cachedData.total_tickets_sold > 0
                ? Number((cachedData.ticket_revenue / cachedData.total_tickets_sold).toFixed(2))
                : 0,
              average_net_per_ticket: cachedData.total_tickets_sold > 0
                ? Number((cachedData.net_deposit / cachedData.total_tickets_sold).toFixed(2))
                : 0,

              by_ticket_class: cachedData.ticket_classes || [],
            },

            quality: {
              score: cachedData.data_quality_score,
              flags: cachedData.data_quality_flags || [],
              confidence: cachedData.data_quality_score >= 90 ? 'high'
                        : cachedData.data_quality_score >= 70 ? 'medium'
                        : 'low',
              validated_at: cachedData.fetched_at
            },

            metadata: {
              fetched_at: cachedData.fetched_at,
              expires_at: cachedData.expires_at,
              api_call_duration_ms: cachedData.fetch_duration_ms
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Fetch from Eventbrite API
    console.log(`Fetching fresh data from Eventbrite for ${event.eid}...`);

    const apiCallStart = Date.now();

    // Declare variables early to avoid reference errors
    let apiResponseStatus = 'success';
    let apiErrorMessage: string | null = null;
    let salesReportData: any = null;
    let useSalesReport = false;

    // Organization ID already declared above (line 36)
    if (!eventbriteOrgId) {
      console.warn('⚠️  EB_ORG_ID not set, Sales Report API will likely fail');
    }

    // Fetch Sales Report (aggregated financial data - preferred for billing accuracy)
    // Use organization-level endpoint (user-level endpoint is deprecated)
    // Force redeploy to pick up updated secrets
    const salesReportResponse = await fetch(
      `https://www.eventbriteapi.com/v3/organizations/${eventbriteOrgId}/reports/sales/?event_ids=${event.eventbrite_id}`,
      {
        headers: {
          'Authorization': `Bearer ${eventbriteToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`📡 Calling: https://www.eventbriteapi.com/v3/organizations/${eventbriteOrgId}/reports/sales/?event_ids=${event.eventbrite_id}`);

    if (salesReportResponse.ok) {
      const reportJson = await salesReportResponse.json();
      console.log(`✅ Sales Report API response:`, JSON.stringify(reportJson).substring(0, 300));
      // Organization API returns: { totals: { gross, net, quantity, fees, currency }, data: [...] }
      if (reportJson.totals) {
        salesReportData = reportJson;
        useSalesReport = true;
        console.log(`✅ Using Sales Report API (aggregated totals): ${reportJson.totals.quantity || 0} tickets, gross: ${reportJson.totals.gross} ${reportJson.totals.currency}`);
      } else {
        throw new Error(`Sales Report API returned unexpected structure: ${JSON.stringify(reportJson).substring(0, 200)}`);
      }
    } else {
      const errorText = await salesReportResponse.text();
      console.error(`❌ Sales Report API failed (${salesReportResponse.status}): ${errorText}`);
      throw new Error(`Sales Report API failed (${salesReportResponse.status}): ${errorText}`);
    }

    // Fetch Ticket Classes (for capacity and breakdown)
    const ticketClassesResponse = await fetch(
      `https://www.eventbriteapi.com/v3/events/${event.eventbrite_id}/ticket_classes/`,
      {
        headers: {
          'Authorization': `Bearer ${eventbriteToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let ticketClassesData: any = { ticket_classes: [] };
    if (ticketClassesResponse.ok) {
      ticketClassesData = await ticketClassesResponse.json();
    }

    const apiCallDuration = Date.now() - apiCallStart;

    // 4. Process and validate data
    let processed: any = {
      total_tickets_sold: 0,
      gross_revenue: 0,
      ticket_revenue: 0,
      taxes_collected: 0,
      eventbrite_fees: 0,
      payment_processing_fees: 0,
      total_fees: 0,
      total_capacity: 0,
      currency_code: 'USD',
      ticket_classes: [],
      net_deposit: 0
    };

    // Process financial data from Sales Report (aggregated totals)
    if (useSalesReport && salesReportData?.totals) {
      const totals = salesReportData.totals;

      processed.total_tickets_sold = totals.quantity || 0;
      processed.gross_revenue = parseFloat(totals.gross || '0');
      processed.total_fees = parseFloat(totals.fees || '0');

      // Net is what organizer receives (from Eventbrite directly)
      processed.net_deposit = parseFloat(totals.net || '0');

      // Calculate ticket revenue (what was charged for tickets before fees were deducted)
      // gross = ticket_revenue, net = ticket_revenue - fees
      // So: ticket_revenue = net + fees
      processed.ticket_revenue = processed.net_deposit + processed.total_fees;

      // Organization Sales Report API doesn't break down fees and taxes separately
      // We only get total fees, so we'll attribute everything to Eventbrite fees
      processed.eventbrite_fees = processed.total_fees;
      processed.payment_processing_fees = 0;
      processed.taxes_collected = 0; // Taxes are included in gross but not separately reported

      processed.currency_code = totals.currency || 'USD';

      console.log(`✅ Sales Report totals: ${processed.total_tickets_sold} tickets, gross: ${processed.gross_revenue}, net: ${processed.net_deposit}, fees: ${processed.total_fees}`);
    }

    // Process ticket classes for capacity
    if (ticketClassesData.ticket_classes) {
      processed.total_capacity = ticketClassesData.ticket_classes.reduce(
        (sum: number, tc: any) => sum + (tc.quantity_total || 0), 0
      );

      processed.ticket_classes = ticketClassesData.ticket_classes.map((tc: any) => ({
        name: tc.name,
        price: parseFloat(tc.cost?.major_value || '0'),
        quantity_sold: tc.quantity_sold || 0,
        quantity_total: tc.quantity_total || 0,
        ticket_revenue: (tc.quantity_sold || 0) * parseFloat(tc.cost?.major_value || '0'),
        on_sale_status: tc.on_sale_status || 'unknown'
      }));
    }

    // 5. Calculate quality score
    const quality = calculateDataQuality(processed);

    // 6. Store in cache (ALWAYS INSERT - preserve history!)
    const { data: insertedCache, error: insertError } = await supabaseClient
      .from('eventbrite_api_cache')
      .insert({
        event_id: event.id,
        eid: event.eid,
        eventbrite_id: event.eventbrite_id,

        event_data: salesReportData,
        ticket_classes: processed.ticket_classes,
        sales_summary: {
          api_method: 'sales_report',
          total_tickets: processed.total_tickets_sold,
          sales_report_used: true
        },

        total_tickets_sold: processed.total_tickets_sold,
        gross_revenue: processed.gross_revenue,
        ticket_revenue: processed.ticket_revenue,
        taxes_collected: processed.taxes_collected,
        eventbrite_fees: processed.eventbrite_fees,
        payment_processing_fees: processed.payment_processing_fees,
        total_fees: processed.total_fees,
        net_deposit: processed.net_deposit,
        total_capacity: processed.total_capacity,
        currency_code: processed.currency_code,

        api_response_status: apiResponseStatus,
        api_response_code: salesReportResponse.status,
        api_error_message: apiErrorMessage,
        data_quality_score: quality.score,
        data_quality_flags: quality.flags,

        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours
        fetch_duration_ms: apiCallDuration,

        fetched_by: 'fetch-eventbrite-data',
        fetch_reason: fetchReason,
        api_version: 'v3'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting cache:', insertError);
      // Continue anyway - we have the data
    }

    const totalDuration = Date.now() - startTime;

    // 7. Return formatted response
    return new Response(
      JSON.stringify({
        success: true,
        source: 'api',
        cache_age_hours: 0,
        event_eid: event.eid,
        event_name: event.name,

        ticket_data: {
          total_sold: processed.total_tickets_sold,
          total_capacity: processed.total_capacity,
          percentage_sold: processed.total_capacity > 0
            ? Number(((processed.total_tickets_sold / processed.total_capacity) * 100).toFixed(1))
            : 0,

          gross_revenue: processed.gross_revenue,
          ticket_revenue: processed.ticket_revenue,
          taxes_collected: processed.taxes_collected,
          eventbrite_fees: processed.eventbrite_fees,
          payment_processing_fees: processed.payment_processing_fees,
          total_fees: processed.total_fees,
          net_deposit: processed.net_deposit,

          currency_code: processed.currency_code,

          average_ticket_price: processed.total_tickets_sold > 0
            ? Number((processed.ticket_revenue / processed.total_tickets_sold).toFixed(2))
            : 0,
          average_net_per_ticket: processed.total_tickets_sold > 0
            ? Number((processed.net_deposit / processed.total_tickets_sold).toFixed(2))
            : 0,

          by_ticket_class: processed.ticket_classes,
        },

        quality: {
          score: quality.score,
          flags: quality.flags,
          confidence: quality.confidence,
          validated_at: new Date().toISOString()
        },

        metadata: {
          fetched_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          api_call_duration_ms: apiCallDuration,
          total_duration_ms: totalDuration
        },

        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'fetch-eventbrite-data',
          eventbrite_id: event.eventbrite_id,
          api_method_used: 'sales_report',
          sales_report_api_success: true,
          sales_report_status_code: salesReportResponse.status,
          organization_id: eventbriteOrgId
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-eventbrite-data:', error);

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'fetch-eventbrite-data',
          error_type: error.constructor.name,
          error_message: error.message,
          stack: error.stack,
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Data quality scoring function
function calculateDataQuality(data: any): { score: number; flags: string[]; confidence: string } {
  let score = 0;
  const flags: string[] = [];

  // Check 1: Revenue data present (40 points)
  if (data.ticket_revenue > 0 || data.total_tickets_sold === 0) {
    score += 40;
  } else if (data.total_tickets_sold > 0 && data.ticket_revenue === 0) {
    flags.push('ZERO_REVENUE_WITH_SALES');
  }

  // Check 2: Ticket classes detailed (20 points)
  if (data.ticket_classes && data.ticket_classes.length > 0) {
    score += 20;
  } else {
    flags.push('NO_TICKET_CLASSES');
  }

  // Check 3: Pricing consistency (20 points)
  const calculatedRevenue = (data.ticket_classes || []).reduce(
    (sum: number, tc: any) => sum + (tc.ticket_revenue || 0), 0
  );
  if (data.ticket_classes && data.ticket_classes.length > 0) {
    if (Math.abs(calculatedRevenue - data.ticket_revenue) < 1) {
      score += 20;
    } else {
      flags.push('REVENUE_MISMATCH');
    }
  } else {
    // If no ticket classes but has revenue from sales report, still give points
    if (data.ticket_revenue > 0) {
      score += 20;
    }
  }

  // Check 4: Capacity data (10 points)
  if (data.total_capacity > 0) {
    score += 10;
  } else {
    flags.push('NO_CAPACITY_DATA');
  }

  // Check 5: Currency specified (10 points)
  if (data.currency_code) {
    score += 10;
  } else {
    flags.push('NO_CURRENCY');
  }

  const confidence = score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low';

  return { score, flags, confidence };
}
