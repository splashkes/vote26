#!/usr/bin/env node

/**
 * Test Eventbrite API for Organization Permissions and Users
 */

const EVENTBRITE_TOKEN = '7LME6RSW6TFLEFBDS6DU';
const EB_ORG_ID = '263333410230';

async function testOrgPermissions() {
  console.log('👥 Testing Eventbrite Organization Permissions API\n');
  console.log('═'.repeat(60));

  // 1. Test organization users endpoint
  console.log('\n1️⃣ Testing Organization Users');
  console.log('   Endpoint: /organizations/{id}/users/\n');

  try {
    const usersUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/users/`;
    const response = await fetch(usersUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Found ${data.users?.length || 0} user(s)`);

      if (data.users && data.users.length > 0) {
        console.log('\n   User Details:');
        data.users.forEach((user, i) => {
          console.log(`   ${i + 1}. Name: ${user.name || 'N/A'}`);
          console.log(`      Email: ${user.email || 'N/A'}`);
          console.log(`      ID: ${user.id}`);
          console.log(`      Roles: ${JSON.stringify(user.roles || 'N/A')}`);
          console.log(`      Permissions: ${JSON.stringify(user.permissions || 'N/A')}`);
        });
      }
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 2. Test organization members endpoint
  console.log('\n2️⃣ Testing Organization Members');
  console.log('   Endpoint: /organizations/{id}/members/\n');

  try {
    const membersUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/members/`;
    const response = await fetch(membersUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Response received`);
      console.log(`   Data:`, JSON.stringify(data, null, 2).substring(0, 500));
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 3. Test organization teams endpoint
  console.log('\n3️⃣ Testing Organization Teams');
  console.log('   Endpoint: /organizations/{id}/teams/\n');

  try {
    const teamsUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/teams/`;
    const response = await fetch(teamsUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Success! Found ${data.teams?.length || 0} team(s)`);

      if (data.teams && data.teams.length > 0) {
        console.log('\n   Team Details:');
        data.teams.forEach((team, i) => {
          console.log(`   ${i + 1}. Name: ${team.name}`);
          console.log(`      ID: ${team.id}`);
          console.log(`      Members: ${team.attendee_count || 'N/A'}`);
        });
      }
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 4. Test user details endpoint (for current user)
  console.log('\n4️⃣ Testing Current User Details');
  console.log('   Endpoint: /users/me/\n');

  try {
    const meUrl = `https://www.eventbriteapi.com/v3/users/me/`;
    const response = await fetch(meUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Current user info:`);
      console.log(`      Name: ${data.name}`);
      console.log(`      Email: ${data.emails?.[0]?.email || 'N/A'}`);
      console.log(`      ID: ${data.id}`);
      console.log(`      Image: ${data.image_id ? 'Yes' : 'No'}`);
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 5. Test organization details for permissions info
  console.log('\n5️⃣ Testing Organization Details');
  console.log('   Endpoint: /organizations/{id}/\n');

  try {
    const orgUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/`;
    const response = await fetch(orgUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Organization info:`);
      console.log(`      Name: ${data.name}`);
      console.log(`      ID: ${data.id}`);

      // Check for any permission-related fields
      const permissionFields = ['permissions', 'roles', 'access_levels', 'features'];
      permissionFields.forEach(field => {
        if (data[field]) {
          console.log(`      ${field}: ${JSON.stringify(data[field])}`);
        }
      });
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 6. Test webhooks endpoint (might show what the org has access to)
  console.log('\n6️⃣ Testing Organization Webhooks');
  console.log('   Endpoint: /organizations/{id}/webhooks/\n');

  try {
    const webhooksUrl = `https://www.eventbriteapi.com/v3/organizations/${EB_ORG_ID}/webhooks/`;
    const response = await fetch(webhooksUrl, {
      headers: {
        'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
      }
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Found ${data.webhooks?.length || 0} webhook(s)`);
    } else {
      const error = await response.text();
      console.log(`   ❌ Failed: ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 Summary:');
  console.log('   Testing complete. Check results above for available endpoints.');
}

testOrgPermissions().catch(console.error);