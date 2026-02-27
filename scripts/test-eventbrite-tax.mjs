#!/usr/bin/env node

/**
 * Test Eventbrite API for Tax Data Exploration
 *
 * Purpose: Explore all possible endpoints that might return tax breakdown data
 */

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const EB_ORG_ID = '263333410230';

// Use a recent event with sales - you can change this
let TEST_EVENT_ID = null;

async function fetchJson(url, label) {
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${EVENTBRITE_TOKEN}` }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      return await response.json();
    } else {
      const error = await response.text();
      console.log(`   Error: ${error.substring(0, 300)}`);
      return null;
    }
  } catch (error) {
    console.log(`   Exception: ${error.message}`);
    return null;
  }
}

async function findEventWithSales() {
  console.log('\n0️⃣  Finding a recent event with ticket sales...\n');

  const url = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/events/?order_by=start_desc&status=ended&page_size=20`;
  const data = await fetchJson(url, 'events');

  if (!data?.events) {
    console.log('   Could not fetch events list');
    return null;
  }

  // Check each event for sales via sales report
  for (const event of data.events) {
    const salesUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/reports/sales/?event_ids=${event.id}`;
    const salesData = await fetchJson(salesUrl, 'sales check');

    if (salesData?.totals?.quantity > 0) {
      console.log(`   Found: ${event.name.text}`);
      console.log(`   Event ID: ${event.id}`);
      console.log(`   Tickets sold: ${salesData.totals.quantity}`);
      console.log(`   Gross: ${salesData.totals.gross} ${salesData.totals.currency}`);
      return event.id;
    }
  }

  console.log('   No events with sales found in recent ended events');
  return null;
}

async function testSalesReportAPI(eventId) {
  console.log('\n1️⃣  Sales Report API (Organization Level)');
  console.log(`   Endpoint: /organizations/{org}/reports/sales/?event_ids=${eventId}\n`);

  const url = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/reports/sales/?event_ids=${eventId}`;
  const data = await fetchJson(url, 'sales report');

  if (data) {
    console.log('\n   === FULL RAW RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('   === END RAW RESPONSE ===\n');

    // Look for any tax-related fields
    const taxFields = findFieldsContaining(data, ['tax', 'Tax', 'TAX']);
    if (taxFields.length > 0) {
      console.log('   Tax-related fields found:');
      taxFields.forEach(f => console.log(`   - ${f}`));
    } else {
      console.log('   No tax-related fields found in Sales Report API');
    }
  }

  return data;
}

async function testOrdersAPI(eventId) {
  console.log('\n2️⃣  Orders API with expand=costs');
  console.log(`   Endpoint: /events/{id}/orders/?expand=costs\n`);

  const url = `https://www.eventbriteapi.com/v3/events/${eventId}/orders/?expand=costs`;
  const data = await fetchJson(url, 'orders');

  if (data?.orders && data.orders.length > 0) {
    console.log(`   Found ${data.orders.length} orders (showing first 3)\n`);

    // Show first 3 orders with full costs object
    const ordersToShow = data.orders.slice(0, 3);
    ordersToShow.forEach((order, i) => {
      console.log(`   --- Order ${i + 1} (ID: ${order.id}) ---`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.created}`);

      if (order.costs) {
        console.log('\n   COSTS OBJECT:');
        console.log(JSON.stringify(order.costs, null, 2).split('\n').map(l => '   ' + l).join('\n'));
      } else {
        console.log('   No costs object in order!');
      }
      console.log('');
    });

    // Aggregate tax from all orders
    let totalTax = 0;
    let ordersWithTax = 0;
    let taxComponents = new Set();

    data.orders.forEach(order => {
      if (order.costs?.tax) {
        const taxValue = parseFloat(order.costs.tax.major_value || order.costs.tax.value || 0);
        if (taxValue > 0) {
          totalTax += taxValue;
          ordersWithTax++;
        }
      }
      // Check for tax_components
      if (order.costs?.tax_components && order.costs.tax_components.length > 0) {
        order.costs.tax_components.forEach(tc => taxComponents.add(JSON.stringify(tc)));
      }
    });

    console.log('   === TAX SUMMARY (this page) ===');
    console.log(`   Orders on page: ${data.orders.length}`);
    console.log(`   Orders with tax > 0: ${ordersWithTax}`);
    console.log(`   Total tax on page: ${totalTax.toFixed(2)}`);

    if (taxComponents.size > 0) {
      console.log('   Tax components found:');
      taxComponents.forEach(tc => console.log(`   - ${tc}`));
    } else {
      console.log('   No tax_components arrays populated');
    }

    // Check for has_gts_tax
    const gtsCount = data.orders.filter(o => o.costs?.has_gts_tax === true).length;
    console.log(`   Orders with has_gts_tax=true: ${gtsCount}`);

    // Check pagination
    if (data.pagination) {
      console.log(`\n   Pagination: page ${data.pagination.page_number} of ${data.pagination.page_count}`);
      console.log(`   Total orders: ${data.pagination.object_count}`);
    }
  }

  return data;
}

async function testAttendeesAPI(eventId) {
  console.log('\n3️⃣  Attendees API with expand=costs');
  console.log(`   Endpoint: /events/{id}/attendees/?expand=costs\n`);

  const url = `https://www.eventbriteapi.com/v3/events/${eventId}/attendees/?expand=costs`;
  const data = await fetchJson(url, 'attendees');

  if (data?.attendees && data.attendees.length > 0) {
    console.log(`   Found ${data.attendees.length} attendees\n`);

    // Show first attendee's costs
    const firstAttendee = data.attendees[0];
    console.log('   First attendee costs:');
    if (firstAttendee.costs) {
      console.log(JSON.stringify(firstAttendee.costs, null, 2).split('\n').map(l => '   ' + l).join('\n'));
    } else {
      console.log('   No costs object on attendee');
    }
  }

  return data;
}

async function testReportEndpoints(eventId) {
  console.log('\n4️⃣  Testing Other Report Endpoints\n');

  const endpoints = [
    { name: 'Attendee Summary', url: `/organizations/${EB_ORG_ID}/reports/attendees/?event_ids=${eventId}` },
    { name: 'Sales by Ticket', url: `/organizations/${EB_ORG_ID}/reports/sales/?event_ids=${eventId}&group_by=ticket_type` },
    { name: 'Sales by Date', url: `/organizations/${EB_ORG_ID}/reports/sales/?event_ids=${eventId}&group_by=sales_date` },
    { name: 'Event Summary', url: `/events/${eventId}/` },
  ];

  for (const ep of endpoints) {
    console.log(`   Testing: ${ep.name}`);
    console.log(`   URL: ${ep.url}\n`);

    const data = await fetchJson(`https://www.eventbriteapi.com/v3${ep.url}`, ep.name);

    if (data) {
      // Look for tax fields
      const taxFields = findFieldsContaining(data, ['tax', 'Tax', 'fee', 'Fee']);
      if (taxFields.length > 0) {
        console.log('   Relevant fields:');
        taxFields.forEach(f => console.log(`   - ${f}`));
      }
      console.log('');
    }
  }
}

async function testSingleOrder(eventId) {
  console.log('\n5️⃣  Single Order Detail (with all expansions)');

  // First get an order ID
  const ordersUrl = `https://www.eventbriteapi.com/v3/events/${eventId}/orders/`;
  const ordersData = await fetchJson(ordersUrl, 'orders list');

  if (!ordersData?.orders || ordersData.orders.length === 0) {
    console.log('   No orders found');
    return;
  }

  const orderId = ordersData.orders[0].id;
  console.log(`   Endpoint: /orders/${orderId}/?expand=costs,attendees\n`);

  const url = `https://www.eventbriteapi.com/v3/orders/${orderId}/?expand=costs,attendees`;
  const data = await fetchJson(url, 'single order');

  if (data) {
    console.log('\n   === FULL ORDER RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('   === END ORDER RESPONSE ===\n');
  }
}

async function testTicketBuyerInfo(eventId) {
  console.log('\n6️⃣  Event Tax Settings');
  console.log(`   Endpoint: /events/${eventId}/?expand=ticket_classes\n`);

  const url = `https://www.eventbriteapi.com/v3/events/${eventId}/?expand=ticket_classes`;
  const data = await fetchJson(url, 'event details');

  if (data) {
    // Look for tax configuration on event
    const taxFields = findFieldsContaining(data, ['tax', 'Tax', 'fee', 'Fee', 'inclusive']);
    if (taxFields.length > 0) {
      console.log('   Tax/Fee related fields on event:');
      taxFields.forEach(f => console.log(`   - ${f}`));
    }

    // Check ticket classes for tax info
    if (data.ticket_classes) {
      console.log('\n   Ticket Classes:');
      data.ticket_classes.forEach((tc, i) => {
        console.log(`   ${i + 1}. ${tc.name}`);
        console.log(`      Price: ${tc.cost?.display || 'Free'}`);
        console.log(`      Fee: ${tc.fee?.display || 'N/A'}`);
        console.log(`      Tax: ${tc.tax?.display || 'N/A'}`);
        console.log(`      Include Fee: ${tc.include_fee}`);
        console.log(`      Tax Inclusive: ${tc.tax_inclusive || 'N/A'}`);
      });
    }
  }
}

// Helper: recursively find fields containing keywords
function findFieldsContaining(obj, keywords, path = '') {
  const results = [];

  if (!obj || typeof obj !== 'object') return results;

  for (const key of Object.keys(obj)) {
    const newPath = path ? `${path}.${key}` : key;

    // Check if key contains any keyword
    const keyLower = key.toLowerCase();
    if (keywords.some(kw => keyLower.includes(kw.toLowerCase()))) {
      results.push(`${newPath}: ${JSON.stringify(obj[key])}`);
    }

    // Recurse into objects and arrays
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      if (Array.isArray(obj[key])) {
        obj[key].forEach((item, i) => {
          results.push(...findFieldsContaining(item, keywords, `${newPath}[${i}]`));
        });
      } else {
        results.push(...findFieldsContaining(obj[key], keywords, newPath));
      }
    }
  }

  return results;
}

async function main() {
  console.log('🧾 Eventbrite Tax Data Exploration\n');
  console.log('═'.repeat(70));
  console.log(`Token: ${EVENTBRITE_TOKEN.substring(0, 8)}...`);
  console.log(`Org ID: ${EB_ORG_ID}`);

  // Find an event with sales
  TEST_EVENT_ID = await findEventWithSales();

  if (!TEST_EVENT_ID) {
    console.log('\n❌ Could not find an event with sales. Exiting.');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`Using Event ID: ${TEST_EVENT_ID}`);
  console.log('═'.repeat(70));

  // Run all tests
  await testSalesReportAPI(TEST_EVENT_ID);
  await testOrdersAPI(TEST_EVENT_ID);
  await testAttendeesAPI(TEST_EVENT_ID);
  await testReportEndpoints(TEST_EVENT_ID);
  await testSingleOrder(TEST_EVENT_ID);
  await testTicketBuyerInfo(TEST_EVENT_ID);

  console.log('\n' + '═'.repeat(70));
  console.log('📋 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`
Key findings to look for:
1. Sales Report API - Does it have ANY tax fields? (likely no)
2. Orders API costs object - What's in costs.tax and costs.tax_components?
3. Does has_gts_tax appear on any orders?
4. Are there tax fields on ticket_classes?
5. Single order detail - Any additional fields with full expansion?

If tax data exists, it should be in the Orders API costs object.
You would need to aggregate costs.tax.major_value across all orders.
  `);
}

main().catch(console.error);
