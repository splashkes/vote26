#!/usr/bin/env node

/**
 * Test Eventbrite API for Discount Code Access
 */

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const EB_ORG_ID = '263333410230';

// Test event ID (AB3040 Boston)
const TEST_EVENT_ID = '1448746823749';

async function testDiscountEndpoints() {
  console.log('🔍 Testing Eventbrite API Discount Code Endpoints\n');
  console.log('═'.repeat(60));

  // 1. Try to get discounts for a specific event
  console.log('\n1️⃣ Testing Event-level Discounts');
  console.log('   Endpoint: /events/{id}/discounts/\n');

  try {
    const discountsUrl = `https://www.eventbriteapi.com/v3/events/${TEST_EVENT_ID}/discounts/`;
    const response = await fetch(discountsUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Found ${data.discounts?.length || 0} discount(s)`);

      if (data.discounts && data.discounts.length > 0) {
        console.log('\n   Discount Details:');
        data.discounts.forEach((discount, i) => {
          console.log(`   ${i + 1}. Code: ${discount.code || 'N/A'}`);
          console.log(`      Type: ${discount.type || 'N/A'}`);
          console.log(`      Amount: ${discount.percent_off ? `${discount.percent_off}%` : `$${discount.amount_off}`}`);
          console.log(`      Status: ${discount.status || 'N/A'}`);
          console.log(`      Used: ${discount.quantity_sold || 0} / ${discount.quantity_available || '∞'}`);
        });
      }
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 2. Try to get organization-wide discounts
  console.log('\n2️⃣ Testing Organization-level Discounts');
  console.log('   Endpoint: /organizations/{id}/discounts/\n');

  try {
    const orgDiscountsUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/discounts/`;
    const response = await fetch(orgDiscountsUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Found ${data.discounts?.length || 0} org discount(s)`);

      if (data.discounts && data.discounts.length > 0) {
        console.log('\n   Organization Discount Details:');
        data.discounts.forEach((discount, i) => {
          console.log(`   ${i + 1}. Code: ${discount.code || 'N/A'}`);
          console.log(`      Type: ${discount.type || 'N/A'}`);
          console.log(`      Events: ${discount.event_ids?.length || 'All'} events`);
        });
      }
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 3. Try cross-event discount endpoint
  console.log('\n3️⃣ Testing Cross-Event Discounts');
  console.log('   Endpoint: /organizations/{id}/cross_event_discounts/\n');

  try {
    const crossEventUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/cross_event_discounts/`;
    const response = await fetch(crossEventUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Found data`);
      console.log(`   Response:`, JSON.stringify(data, null, 2).substring(0, 500));
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 4. Try to get a specific discount by ID (if we found any)
  console.log('\n4️⃣ Testing Discount Details Retrieval');
  console.log('   First, let\'s find an event with discounts...\n');

  // Get recent events to find one with discounts
  try {
    const eventsUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/events/?order_by=start_desc&status=live&page_size=10`;
    const eventsResponse = await fetch(eventsUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();

      for (const event of eventsData.events || []) {
        const discountUrl = `https://www.eventbriteapi.com/v3/events/${event.id}/discounts/`;
        const discountResponse = await fetch(discountUrl, {
          headers: {
            'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
          }
        });

        if (discountResponse.ok) {
          const discountData = await discountResponse.json();
          if (discountData.discounts && discountData.discounts.length > 0) {
            console.log(`   Found event with discounts: ${event.name.text}`);
            console.log(`   Event ID: ${event.id}`);
            console.log(`   Discounts:`);
            discountData.discounts.forEach(d => {
              console.log(`   - Code: ${d.code}, Type: ${d.type}, Status: ${d.status}`);
            });
            break;
          }
        }
      }
    }
  } catch (error) {
    console.log(`   ❌ Error scanning for discounts: ${error.message}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 Summary:');
  console.log('   The Eventbrite API supports discount code endpoints.');
  console.log('   Access depends on API token permissions.');
  console.log('   Available endpoints:');
  console.log('   - /events/{id}/discounts/ (per-event discounts)');
  console.log('   - /organizations/{id}/discounts/ (org-level discounts)');
  console.log('   - /organizations/{id}/cross_event_discounts/ (cross-event)');
}

testDiscountEndpoints().catch(console.error);