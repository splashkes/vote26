#!/usr/bin/env node
const TOKEN = process.env.META_ACCESS_TOKEN || process.argv[2];
const ACCOUNT_ID = 'act_10154340035865743';
const EVENT_EID = 'AB3023'; // High spend event

async function deepDiveConversions() {
  console.log(`🔍 Deep dive into conversion data for ${EVENT_EID}...\n`);

  // Test 1: Try website_purchases specifically
  console.log('========================================');
  console.log('TEST 1: Website Purchase Actions');
  console.log('========================================');
  
  const url1 = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/adsets`);
  url1.searchParams.set('access_token', TOKEN);
  url1.searchParams.set('fields', 'id,name,insights{spend,website_purchases,purchase_roas,actions,action_values}');
  url1.searchParams.set('filtering', JSON.stringify([{field: 'campaign.name', operator: 'CONTAIN', value: EVENT_EID}]));
  url1.searchParams.set('limit', '2');

  let res = await fetch(url1);
  let data = await res.json();
  
  if (data.data) {
    data.data.forEach(adset => {
      const insights = adset.insights?.data?.[0];
      console.log(`\nAdset: ${adset.name}`);
      console.log('  Spend:', insights?.spend);
      console.log('  Website Purchases:', insights?.website_purchases || 'Not available');
      console.log('  Purchase ROAS:', insights?.purchase_roas || 'Not available');
      
      // Look for purchase actions
      const purchaseActions = insights?.actions?.filter(a => 
        a.action_type.includes('purchase') || 
        a.action_type.includes('offsite_conversion')
      );
      console.log('  Purchase-related actions:', purchaseActions?.length || 0);
      if (purchaseActions?.length > 0) {
        purchaseActions.forEach(a => console.log(`    - ${a.action_type}: ${a.value}`));
      }
      
      // Look for purchase values
      const purchaseValues = insights?.action_values?.filter(a => 
        a.action_type.includes('purchase') || 
        a.action_type.includes('offsite_conversion')
      );
      console.log('  Purchase values:', purchaseValues?.length || 0);
      if (purchaseValues?.length > 0) {
        purchaseValues.forEach(a => console.log(`    - ${a.action_type}: $${a.value}`));
      }
    });
  } else {
    console.log('Error:', data.error?.message);
  }

  // Test 2: Check all possible conversion fields
  console.log('\n========================================');
  console.log('TEST 2: All Conversion Fields');
  console.log('========================================');
  
  const url2 = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/insights`);
  url2.searchParams.set('access_token', TOKEN);
  url2.searchParams.set('level', 'adset');
  url2.searchParams.set('fields', 'spend,impressions,reach,clicks,actions,action_values,website_purchase_roas,purchase_roas,cost_per_action_type,conversions,conversion_values');
  url2.searchParams.set('filtering', JSON.stringify([{field: 'campaign.name', operator: 'CONTAIN', value: EVENT_EID}]));
  url2.searchParams.set('limit', '2');

  res = await fetch(url2);
  data = await res.json();
  
  if (data.data && data.data.length > 0) {
    console.log('\nAvailable fields in response:');
    console.log(Object.keys(data.data[0]));
    console.log('\nFull first insight:');
    console.log(JSON.stringify(data.data[0], null, 2));
  } else {
    console.log('Error or no data:', data.error?.message || 'No insights found');
  }

  // Test 3: Action breakdowns
  console.log('\n========================================');
  console.log('TEST 3: Action Type Breakdown');
  console.log('========================================');
  
  const url3 = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/insights`);
  url3.searchParams.set('access_token', TOKEN);
  url3.searchParams.set('level', 'adset');
  url3.searchParams.set('action_breakdowns', 'action_type');
  url3.searchParams.set('fields', 'spend,actions,action_values,cost_per_action_type');
  url3.searchParams.set('filtering', JSON.stringify([{field: 'campaign.name', operator: 'CONTAIN', value: EVENT_EID}]));
  url3.searchParams.set('limit', '1');

  res = await fetch(url3);
  data = await res.json();
  
  if (data.data && data.data.length > 0) {
    const insight = data.data[0];
    console.log('\nAll actions:');
    insight.actions?.forEach(a => console.log(`  ${a.action_type}: ${a.value}`));
    
    console.log('\nAll action values:');
    insight.action_values?.forEach(a => console.log(`  ${a.action_type}: $${a.value}`));
    
    console.log('\nCost per action:');
    if (insight.cost_per_action_type) {
      insight.cost_per_action_type.forEach(c => console.log(`  ${c.action_type}: $${c.value}`));
    }
  } else {
    console.log('Error:', data.error?.message || 'No data');
  }

  // Test 4: Campaign-level conversions
  console.log('\n========================================');
  console.log('TEST 4: Campaign-Level Insights');
  console.log('========================================');
  
  const url4 = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/campaigns`);
  url4.searchParams.set('access_token', TOKEN);
  url4.searchParams.set('fields', 'name,insights{spend,actions,action_values,conversions,conversion_values,website_purchase_roas}');
  url4.searchParams.set('filtering', JSON.stringify([{field: 'name', operator: 'CONTAIN', value: EVENT_EID}]));
  url4.searchParams.set('limit', '1');

  res = await fetch(url4);
  data = await res.json();
  
  if (data.data && data.data.length > 0) {
    const campaign = data.data[0];
    const insights = campaign.insights?.data?.[0];
    console.log(`\nCampaign: ${campaign.name}`);
    console.log('Spend:', insights?.spend);
    console.log('Conversions field:', insights?.conversions || 'Not available');
    console.log('Conversion values field:', insights?.conversion_values || 'Not available');
    console.log('Website purchase ROAS:', insights?.website_purchase_roas || 'Not available');
    
    console.log('\nAll actions:');
    insights?.actions?.forEach(a => console.log(`  ${a.action_type}: ${a.value}`));
    
    console.log('\nAll action values:');
    if (insights?.action_values?.length > 0) {
      insights.action_values.forEach(a => console.log(`  ${a.action_type}: $${a.value}`));
    } else {
      console.log('  (none)');
    }
  }
}

deepDiveConversions().catch(console.error);
