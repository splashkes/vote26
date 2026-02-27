import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchRequest {
  eid?: string;
  event_id?: string;
  eventbrite_id?: string;
  force_refresh?: boolean;  // Re-fetch even if already cached
}

interface OrdersCacheResult {
  success: boolean;
  event_eid: string;
  eventbrite_event_id: string;
  orders_fetched: number;
  orders_inserted: number;
  orders_updated: number;
  orders_skipped: number;
  pages_fetched: number;
  totals: {
    total_orders: number;
    placed_orders: number;
    refunded_orders: number;
    total_attendees: number;
    total_base_price: number;
    total_tax: number;
    total_eventbrite_fees: number;
    total_payment_fees: number;
    total_gross: number;
    currency_code: string;
  };
  duration_ms: number;
  already_cached?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const input: FetchRequest = await req.json();

    const eventbriteToken = Deno.env.get('EVENTBRITE_ACCESS_TOKEN');
    if (!eventbriteToken) {
      throw new Error('EVENTBRITE_ACCESS_TOKEN not configured');
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

    console.log(`📋 Fetching orders for: EID=${event.eid}, EventbriteID=${event.eventbrite_id}`);

    // 2. Check if already cached (unless force_refresh)
    if (!input.force_refresh) {
      const { data: existingOrders, error: checkError } = await supabaseClient
        .from('eventbrite_orders_cache')
        .select('order_id')
        .eq('eid', event.eid)
        .limit(1);

      if (!checkError && existingOrders && existingOrders.length > 0) {
        // Already have cached orders, return summary from view
        const { data: summary } = await supabaseClient
          .from('eventbrite_orders_summary')
          .select('*')
          .eq('eid', event.eid)
          .single();

        return new Response(
          JSON.stringify({
            success: true,
            already_cached: true,
            event_eid: event.eid,
            eventbrite_event_id: event.eventbrite_id,
            message: 'Orders already cached. Use force_refresh: true to re-fetch.',
            totals: summary ? {
              total_orders: summary.total_orders,
              placed_orders: summary.placed_orders,
              refunded_orders: summary.refunded_orders,
              total_attendees: summary.total_attendees,
              total_base_price: parseFloat(summary.total_base_price) || 0,
              total_tax: parseFloat(summary.total_tax) || 0,
              total_eventbrite_fees: parseFloat(summary.total_eventbrite_fees) || 0,
              total_payment_fees: parseFloat(summary.total_payment_fees) || 0,
              total_gross: parseFloat(summary.total_gross) || 0,
              currency_code: summary.currency_code
            } : null,
            duration_ms: Date.now() - startTime
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Fetch all orders from Eventbrite (paginated)
    let allOrders: any[] = [];
    let page = 1;
    let hasMorePages = true;
    let pagesFetched = 0;

    while (hasMorePages) {
      const url = `https://www.eventbriteapi.com/v3/events/${event.eventbrite_id}/orders/?expand=costs,attendees&page=${page}&page_size=50`;

      console.log(`📡 Fetching page ${page}: ${url}`);

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${eventbriteToken}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Eventbrite API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      pagesFetched++;

      if (data.orders && data.orders.length > 0) {
        allOrders = allOrders.concat(data.orders);
      }

      // Check pagination
      if (data.pagination) {
        hasMorePages = data.pagination.has_more_items || page < data.pagination.page_count;
        page++;
      } else {
        hasMorePages = false;
      }

      // Safety limit
      if (page > 100) {
        console.warn('⚠️ Hit 100 page limit, stopping pagination');
        break;
      }
    }

    console.log(`✅ Fetched ${allOrders.length} orders across ${pagesFetched} pages`);

    // 4. Upsert orders into cache
    let ordersInserted = 0;
    let ordersUpdated = 0;
    let ordersSkipped = 0;

    for (const order of allOrders) {
      const orderData = {
        event_id: event.id,
        eid: event.eid,
        eventbrite_event_id: event.eventbrite_id,
        order_id: order.id,
        resource_uri: order.resource_uri,
        order_created: order.created,
        order_changed: order.changed,
        buyer_name: order.name,
        buyer_first_name: order.first_name,
        buyer_last_name: order.last_name,
        buyer_email: order.email,
        order_status: order.status,
        time_remaining: order.time_remaining,
        base_price: parseFloat(order.costs?.base_price?.major_value || '0'),
        tax: parseFloat(order.costs?.tax?.major_value || '0'),
        eventbrite_fee: parseFloat(order.costs?.eventbrite_fee?.major_value || '0'),
        payment_fee: parseFloat(order.costs?.payment_fee?.major_value || '0'),
        gross: parseFloat(order.costs?.gross?.major_value || '0'),
        currency_code: order.costs?.gross?.currency || order.costs?.base_price?.currency,
        has_gts_tax: order.costs?.has_gts_tax || false,
        tax_components: order.costs?.tax_components || [],
        fee_components: order.costs?.fee_components || [],
        shipping_components: order.costs?.shipping_components || [],
        attendee_count: order.attendees?.length || 0,
        attendees: order.attendees || [],
        costs_raw: order.costs,
        order_raw: order,
        fetched_at: new Date().toISOString(),
        fetched_by: 'fetch-eventbrite-orders',
        updated_at: new Date().toISOString()
      };

      // Upsert using order_id as conflict key
      const { data: upsertResult, error: upsertError } = await supabaseClient
        .from('eventbrite_orders_cache')
        .upsert(orderData, {
          onConflict: 'order_id',
          ignoreDuplicates: false
        })
        .select('id');

      if (upsertError) {
        console.error(`❌ Error upserting order ${order.id}:`, upsertError);
        ordersSkipped++;
      } else {
        // Can't easily tell insert vs update with upsert, count all as success
        ordersInserted++;
      }
    }

    // 5. Get summary from view
    const { data: summary } = await supabaseClient
      .from('eventbrite_orders_summary')
      .select('*')
      .eq('eid', event.eid)
      .single();

    const result: OrdersCacheResult = {
      success: true,
      event_eid: event.eid,
      eventbrite_event_id: event.eventbrite_id,
      orders_fetched: allOrders.length,
      orders_inserted: ordersInserted,
      orders_updated: ordersUpdated,
      orders_skipped: ordersSkipped,
      pages_fetched: pagesFetched,
      totals: {
        total_orders: summary?.total_orders || allOrders.length,
        placed_orders: summary?.placed_orders || 0,
        refunded_orders: summary?.refunded_orders || 0,
        total_attendees: summary?.total_attendees || 0,
        total_base_price: parseFloat(summary?.total_base_price) || 0,
        total_tax: parseFloat(summary?.total_tax) || 0,
        total_eventbrite_fees: parseFloat(summary?.total_eventbrite_fees) || 0,
        total_payment_fees: parseFloat(summary?.total_payment_fees) || 0,
        total_gross: parseFloat(summary?.total_gross) || 0,
        currency_code: summary?.currency_code || ''
      },
      duration_ms: Date.now() - startTime
    };

    console.log(`✅ Cached ${ordersInserted} orders for ${event.eid}`);
    console.log(`   Total tax: ${result.totals.total_tax} ${result.totals.currency_code}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-eventbrite-orders:', error);

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        duration_ms: Date.now() - startTime
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
