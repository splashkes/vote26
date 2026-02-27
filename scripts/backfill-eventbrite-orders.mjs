#!/usr/bin/env node

/**
 * Backfill Eventbrite Orders Cache
 *
 * Fetches and caches all orders for events within the 12-month API retention window.
 * Run this to ensure tax data is captured before it expires.
 */

import { createClient } from '@supabase/supabase-js';

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// If no service key in env, use direct connection approach
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNjE1NTkyNiwiZXhwIjoyMDQxNzMxOTI2fQ.LpgTLZE_eg8vvKvOHqmRNzz2FQl2jNcZlHZI2rle9SI');

async function fetchEventbriteOrders(eventbriteEventId) {
  const allOrders = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const url = `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/orders/?expand=costs,attendees&page=${page}&page_size=50`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${EVENTBRITE_TOKEN}` }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`      Event ${eventbriteEventId} not found or no orders`);
        return [];
      }
      throw new Error(`API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.orders && data.orders.length > 0) {
      allOrders.push(...data.orders);
    }

    if (data.pagination) {
      hasMorePages = data.pagination.has_more_items || page < data.pagination.page_count;
      page++;
    } else {
      hasMorePages = false;
    }

    // Safety limit
    if (page > 100) break;
  }

  return allOrders;
}

async function cacheOrders(event, orders) {
  let inserted = 0;
  let errors = 0;

  for (const order of orders) {
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
      fetched_by: 'backfill-script',
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('eventbrite_orders_cache')
      .upsert(orderData, { onConflict: 'order_id' });

    if (error) {
      console.error(`      Error caching order ${order.id}:`, error.message);
      errors++;
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🔄 Eventbrite Orders Backfill');
  console.log('═'.repeat(70));

  // Calculate 12-month cutoff
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 11); // 11 months to be safe
  console.log(`\nFetching events since: ${cutoffDate.toISOString().split('T')[0]}`);

  // Get all events with eventbrite_id that are within the 12-month window
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, eid, name, eventbrite_id, start_time')
    .not('eventbrite_id', 'is', null)
    .gte('start_time', cutoffDate.toISOString())
    .order('start_time', { ascending: false });

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
    process.exit(1);
  }

  console.log(`Found ${events.length} events with Eventbrite IDs in the last 11 months\n`);

  // Check which events already have cached orders
  const { data: cachedEvents } = await supabase
    .from('eventbrite_orders_cache')
    .select('eid')
    .then(r => ({
      data: [...new Set(r.data?.map(x => x.eid) || [])]
    }));

  const cachedSet = new Set(cachedEvents || []);

  let totalOrders = 0;
  let totalTax = 0;
  let eventsProcessed = 0;
  let eventsSkipped = 0;
  let eventsFailed = 0;

  for (const event of events) {
    const startDate = new Date(event.start_time).toISOString().split('T')[0];

    // Skip if already cached
    if (cachedSet.has(event.eid)) {
      console.log(`⏭️  ${event.eid} (${startDate}) - Already cached`);
      eventsSkipped++;
      continue;
    }

    console.log(`\n📥 ${event.eid} - ${event.name}`);
    console.log(`   Date: ${startDate}`);
    console.log(`   Eventbrite ID: ${event.eventbrite_id}`);

    try {
      const orders = await fetchEventbriteOrders(event.eventbrite_id);

      if (orders.length === 0) {
        console.log(`   No orders found`);
        eventsProcessed++;
        continue;
      }

      console.log(`   Found ${orders.length} orders`);

      const { inserted, errors } = await cacheOrders(event, orders);

      // Calculate totals
      const eventTax = orders
        .filter(o => o.status === 'placed')
        .reduce((sum, o) => sum + parseFloat(o.costs?.tax?.major_value || '0'), 0);

      console.log(`   ✅ Cached: ${inserted} orders, Tax: $${eventTax.toFixed(2)}`);
      if (errors > 0) {
        console.log(`   ⚠️  Errors: ${errors}`);
      }

      totalOrders += orders.length;
      totalTax += eventTax;
      eventsProcessed++;

      // Rate limiting - be gentle on the API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      eventsFailed++;
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Events processed:  ${eventsProcessed}`);
  console.log(`Events skipped:    ${eventsSkipped} (already cached)`);
  console.log(`Events failed:     ${eventsFailed}`);
  console.log(`Total orders:      ${totalOrders}`);
  console.log(`Total tax cached:  $${totalTax.toFixed(2)}`);
  console.log('═'.repeat(70));

  // Show summary from view
  console.log('\n📈 Database Summary:');
  const { data: summary, error: summaryError } = await supabase
    .from('eventbrite_orders_summary')
    .select('*')
    .limit(10);

  if (summary && summary.length > 0) {
    console.log('\nTop events by tax collected:');
    const sorted = summary.sort((a, b) => (parseFloat(b.total_tax) || 0) - (parseFloat(a.total_tax) || 0));
    sorted.slice(0, 5).forEach(s => {
      console.log(`  ${s.eid}: $${parseFloat(s.total_tax || 0).toFixed(2)} tax, ${s.placed_orders} orders`);
    });
  }
}

main().catch(console.error);
