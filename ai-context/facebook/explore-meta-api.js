#!/usr/bin/env node
/**
 * Explore Meta API fields to understand what's available for ROAS calculation
 *
 * This script will:
 * 1. Query an actual AB3065 adset
 * 2. Show all available fields in insights
 * 3. Document action types for conversions
 * 4. Find purchase value fields
 */

const TOKEN = process.argv[2];
const ACCOUNT_ID = 'act_10154340035865743'; // USD account
const EVENT_EID = 'AB3065';

if (!TOKEN) {
  console.error('Usage: node explore-meta-api.js <META_ACCESS_TOKEN>');
  process.exit(1);
}

async function exploreMetaAPI() {
  console.log('🔍 Exploring Meta Marketing API for ROAS fields...\n');

  // Test 1: Get basic adset with insights
  console.log('========================================');
  console.log('TEST 1: Basic Insights Fields');
  console.log('========================================');

  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/adsets`);
    url.searchParams.set('access_token', TOKEN);
    url.searchParams.set('fields', 'id,name,insights{spend,impressions,reach,clicks,actions,action_values}');
    url.searchParams.set('filtering', JSON.stringify([{
      field: 'campaign.name',
      operator: 'CONTAIN',
      value: EVENT_EID
    }]));
    url.searchParams.set('limit', '1');

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('❌ API Error:', data.error);
      return;
    }

    if (data.data && data.data.length > 0) {
      const adset = data.data[0];
      const insights = adset.insights?.data?.[0];

      console.log('✅ Found adset:', adset.name);
      console.log('   Spend:', insights?.spend);
      console.log('   Reach:', insights?.reach);
      console.log('   Clicks:', insights?.clicks);
      console.log('\n📊 Actions array:');
      console.log(JSON.stringify(insights?.actions || [], null, 2));
      console.log('\n💰 Action Values array:');
      console.log(JSON.stringify(insights?.action_values || [], null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Try conversion-specific fields
  console.log('\n========================================');
  console.log('TEST 2: Conversion & ROAS Fields');
  console.log('========================================');

  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/adsets`);
    url.searchParams.set('access_token', TOKEN);
    url.searchParams.set('fields', 'id,name,insights{spend,conversions,conversion_values,purchase_roas,website_purchase_roas,cost_per_conversion}');
    url.searchParams.set('filtering', JSON.stringify([{
      field: 'campaign.name',
      operator: 'CONTAIN',
      value: EVENT_EID
    }]));
    url.searchParams.set('limit', '1');

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('❌ API Error:', data.error.message);
      console.log('   Error details:', JSON.stringify(data.error, null, 2));
    } else if (data.data && data.data.length > 0) {
      const adset = data.data[0];
      const insights = adset.insights?.data?.[0];

      console.log('✅ Adset:', adset.name);
      console.log('   Available fields:', Object.keys(insights || {}));
      console.log('\n   Full insights:');
      console.log(JSON.stringify(insights || {}, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Get ALL available action types
  console.log('\n========================================');
  console.log('TEST 3: All Action Types');
  console.log('========================================');

  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/adsets`);
    url.searchParams.set('access_token', TOKEN);
    url.searchParams.set('fields', 'insights{actions,action_values,cost_per_action_type}');
    url.searchParams.set('filtering', JSON.stringify([{
      field: 'campaign.name',
      operator: 'CONTAIN',
      value: EVENT_EID
    }]));
    url.searchParams.set('limit', '2');

    const response = await fetch(url);
    const data = await response.json();

    if (data.data) {
      const allActionTypes = new Set();
      const allActionValueTypes = new Set();

      data.data.forEach(adset => {
        const insights = adset.insights?.data?.[0];
        insights?.actions?.forEach(action => allActionTypes.add(action.action_type));
        insights?.action_values?.forEach(av => allActionValueTypes.add(av.action_type));
      });

      console.log('✅ Available action types:');
      Array.from(allActionTypes).sort().forEach(type => console.log(`   - ${type}`));

      console.log('\n✅ Available action_value types:');
      Array.from(allActionValueTypes).sort().forEach(type => console.log(`   - ${type}`));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 4: Campaign-level insights
  console.log('\n========================================');
  console.log('TEST 4: Campaign-Level Budget & Insights');
  console.log('========================================');

  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/campaigns`);
    url.searchParams.set('access_token', TOKEN);
    url.searchParams.set('fields', 'id,name,daily_budget,lifetime_budget,budget_remaining,insights{spend,purchase_roas}');
    url.searchParams.set('filtering', JSON.stringify([{
      field: 'name',
      operator: 'CONTAIN',
      value: EVENT_EID
    }]));
    url.searchParams.set('limit', '1');

    const response = await fetch(url);
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const campaign = data.data[0];
      console.log('✅ Campaign:', campaign.name);
      console.log('   Lifetime Budget:', campaign.lifetime_budget ? `$${(campaign.lifetime_budget / 100).toFixed(2)}` : 'None');
      console.log('   Daily Budget:', campaign.daily_budget ? `$${(campaign.daily_budget / 100).toFixed(2)}` : 'None');
      console.log('   Budget Remaining:', campaign.budget_remaining ? `$${(campaign.budget_remaining / 100).toFixed(2)}` : 'None');
      console.log('\n   Campaign Insights:');
      console.log(JSON.stringify(campaign.insights?.data?.[0] || {}, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n✨ Exploration complete!');
}

exploreMetaAPI().catch(console.error);
