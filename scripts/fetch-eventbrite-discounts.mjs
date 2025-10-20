#!/usr/bin/env node

/**
 * Fetch Eventbrite Discount Codes for Events
 */

import pg from 'pg';
const { Pool } = pg;

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const EB_ORG_ID = '263333410230';

const pool = new Pool({
  host: 'db.xsqdkubgyqwpyvfltnrf.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '6kEtvU9n0KhTVr5'
});

async function fetchDiscountsForEvent(eventId, eventName) {
  try {
    const url = `https://www.eventbriteapi.com/v3/events/${eventId}/discounts/`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.discounts && data.discounts.length > 0) {
      // Fetch detailed info for each discount
      const detailedDiscounts = [];

      for (const discount of data.discounts) {
        try {
          const detailUrl = `https://www.eventbriteapi.com/v3/discounts/${discount.id}/`;
          const detailResponse = await fetch(detailUrl, {
            headers: {
              'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
            }
          });

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            detailedDiscounts.push(detailData);
          } else {
            // If detail fetch fails, use basic info
            detailedDiscounts.push(discount);
          }
        } catch (error) {
          detailedDiscounts.push(discount);
        }
      }

      return {
        eventId,
        eventName,
        discounts: detailedDiscounts
      };
    }

    return { eventId, eventName, discounts: [] };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  console.log('🎫 Fetching Eventbrite Discount Codes\n');
  console.log('═'.repeat(80));

  // Get upcoming events with Eventbrite IDs
  const result = await pool.query(`
    SELECT e.eid, e.name, e.eventbrite_id, e.event_start_datetime, c.name as city_name
    FROM events e
    LEFT JOIN cities c ON e.city_id = c.id
    WHERE e.eventbrite_id IS NOT NULL
      AND e.eventbrite_id != ''
      AND e.event_start_datetime >= CURRENT_DATE
    ORDER BY e.event_start_datetime
    LIMIT 20
  `);

  console.log(`\n📅 Checking ${result.rows.length} upcoming events for discount codes...\n`);

  const eventsWithDiscounts = [];

  for (const event of result.rows) {
    process.stdout.write(`   Checking ${event.eid} (${event.city_name})... `);

    const discountData = await fetchDiscountsForEvent(event.eventbrite_id, event.name);

    if (discountData.error) {
      console.log(`❌ Error: ${discountData.error}`);
    } else if (discountData.discounts && discountData.discounts.length > 0) {
      console.log(`✅ ${discountData.discounts.length} discount(s) found!`);
      eventsWithDiscounts.push({ ...event, ...discountData });
    } else {
      console.log(`⚪ No discounts`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Display detailed results
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 DISCOUNT CODE SUMMARY\n');

  if (eventsWithDiscounts.length === 0) {
    console.log('   No discount codes found for upcoming events.');
  } else {
    for (const event of eventsWithDiscounts) {
      const eventDate = new Date(event.event_start_datetime).toLocaleDateString();
      console.log(`\n🎨 ${event.eid} - ${event.city_name} (${eventDate})`);
      console.log(`   Event ID: ${event.eventbrite_id}`);
      console.log(`   Discounts:`);

      for (const discount of event.discounts) {
        console.log(`\n   📌 Code: "${discount.code || 'N/A'}"`);

        // Display all available fields
        const fields = {
          'ID': discount.id,
          'Type': discount.type || discount.discount_type,
          'Amount Off': discount.amount_off,
          'Percent Off': discount.percent_off,
          'Status': discount.status,
          'Start': discount.start_date || discount.start,
          'End': discount.end_date || discount.end,
          'Quantity Available': discount.quantity_available,
          'Quantity Sold': discount.quantity_sold || discount.quantity_used,
          'Ticket Classes': discount.ticket_class_ids?.length || 'All',
          'Hold IDs': discount.hold_ids?.join(', ') || 'None'
        };

        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined && value !== null && value !== '') {
            console.log(`      ${key}: ${value}`);
          }
        }
      }
    }

    // Summary statistics
    console.log('\n' + '═'.repeat(80));
    console.log('\n📈 STATISTICS:');
    console.log(`   Events with discounts: ${eventsWithDiscounts.length}`);
    const totalDiscounts = eventsWithDiscounts.reduce((sum, e) => sum + e.discounts.length, 0);
    console.log(`   Total discount codes: ${totalDiscounts}`);

    // Find common codes
    const codeFrequency = {};
    for (const event of eventsWithDiscounts) {
      for (const discount of event.discounts) {
        const code = discount.code || 'Unknown';
        codeFrequency[code] = (codeFrequency[code] || 0) + 1;
      }
    }

    const sortedCodes = Object.entries(codeFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sortedCodes.length > 0) {
      console.log(`\n   Most Common Codes:`);
      sortedCodes.forEach(([code, count]) => {
        console.log(`   - "${code}": used in ${count} event(s)`);
      });
    }
  }

  await pool.end();
}

main().catch(console.error);