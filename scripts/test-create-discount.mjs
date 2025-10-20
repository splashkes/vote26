#!/usr/bin/env node

/**
 * Test Creating Eventbrite Discount Codes
 */

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const TEST_EVENT_ID = '1448746823749'; // AB3040 Boston

async function testCreateDiscount() {
  console.log('🎫 Testing Eventbrite Discount Code Creation\n');
  console.log('═'.repeat(60));

  // Test discount data
  const discountData = {
    "discount": {
      "type": "coded",
      "code": "TESTCODE123",
      "percent_off": "15.00",
      "quantity_available": 50,
      "start_date": "2025-01-01T00:00:00Z",
      "end_date": "2025-12-31T23:59:59Z"
    }
  };

  console.log('\n📝 Attempting to create discount code...');
  console.log(`   Event ID: ${TEST_EVENT_ID}`);
  console.log(`   Code: ${discountData.discount.code}`);
  console.log(`   Discount: ${discountData.discount.percent_off}%\n`);

  try {
    // Try POST to event-specific endpoint
    console.log('1️⃣ Testing POST to /events/{id}/discounts/');

    const response = await fetch(
      `https://www.eventbriteapi.com/v3/events/${TEST_EVENT_ID}/discounts/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EVENTBRITE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(discountData)
      }
    );

    console.log(`   Status: ${response.status} ${response.statusText}`);

    const responseText = await response.text();

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('   ✅ Success! Discount created:');
      console.log(`      ID: ${data.id}`);
      console.log(`      Code: ${data.code}`);
      console.log('\n   Full response:');
      console.log(JSON.stringify(data, null, 2));

      // Try to delete the test discount
      if (data.id) {
        console.log('\n🗑️  Cleaning up test discount...');
        const deleteResponse = await fetch(
          `https://www.eventbriteapi.com/v3/discounts/${data.id}/`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
            }
          }
        );
        console.log(`   Delete status: ${deleteResponse.status}`);
      }
    } else {
      console.log('   ❌ Failed to create discount');
      console.log('   Error response:');
      try {
        const errorData = JSON.parse(responseText);
        console.log(JSON.stringify(errorData, null, 2).substring(0, 500));
      } catch {
        console.log(responseText.substring(0, 500));
      }
    }
  } catch (error) {
    console.log(`   ❌ Request error: ${error.message}`);
  }

  // Try alternative approaches
  console.log('\n2️⃣ Testing alternative discount creation methods...\n');

  // Try with minimal data
  const minimalDiscount = {
    "code": "SIMPLETEST",
    "percent_off": "10"
  };

  try {
    const response = await fetch(
      `https://www.eventbriteapi.com/v3/events/${TEST_EVENT_ID}/discounts/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EVENTBRITE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(minimalDiscount)
      }
    );

    console.log(`   Minimal data status: ${response.status}`);

    if (!response.ok) {
      const error = await response.text();
      console.log(`   Response: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Check if we can UPDATE existing discounts
  console.log('\n3️⃣ Checking for existing discounts to update...\n');

  try {
    const getResponse = await fetch(
      `https://www.eventbriteapi.com/v3/events/${TEST_EVENT_ID}/discounts/`,
      {
        headers: {
          'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
        }
      }
    );

    if (getResponse.ok) {
      const data = await getResponse.json();

      if (data.discounts && data.discounts.length > 0) {
        const firstDiscount = data.discounts[0];
        console.log(`   Found discount: ${firstDiscount.code} (ID: ${firstDiscount.id})`);

        // Try to update it
        console.log('   Attempting to update...');

        const updateResponse = await fetch(
          `https://www.eventbriteapi.com/v3/discounts/${firstDiscount.id}/`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${EVENTBRITE_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              "quantity_available": 100
            })
          }
        );

        console.log(`   Update status: ${updateResponse.status}`);

        if (!updateResponse.ok) {
          const error = await updateResponse.text();
          console.log(`   Error: ${error.substring(0, 200)}`);
        }
      } else {
        console.log('   No existing discounts found to update');
      }
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 Summary:');
  console.log('   Testing complete. Check results above for capabilities.');
}

testCreateDiscount().catch(console.error);