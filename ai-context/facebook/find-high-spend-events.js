#!/usr/bin/env node
const TOKEN = process.env.META_ACCESS_TOKEN || process.argv[2];
const ACCOUNT_ID = 'act_10154340035865743';

async function findHighSpendCampaigns() {
  console.log('🔍 Finding campaigns with highest spend...\n');

  const url = new URL(`https://graph.facebook.com/v23.0/${ACCOUNT_ID}/campaigns`);
  url.searchParams.set('access_token', TOKEN);
  url.searchParams.set('fields', 'id,name,lifetime_budget,insights{spend}');
  url.searchParams.set('limit', '50');

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error('❌ Error:', data.error);
    return;
  }

  const campaignsWithSpend = data.data
    .map(c => ({
      name: c.name,
      spend: parseFloat(c.insights?.data?.[0]?.spend || 0),
      budget: c.lifetime_budget ? (c.lifetime_budget / 100).toFixed(2) : 'N/A'
    }))
    .filter(c => c.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  console.log('Top 10 campaigns by spend:\n');
  campaignsWithSpend.slice(0, 10).forEach((c, i) => {
    const eidMatch = c.name.match(/AB\d+/);
    console.log(`${i + 1}. ${eidMatch ? eidMatch[0] : 'Unknown'} - $${c.spend.toFixed(2)} spent (Budget: $${c.budget})`);
    console.log(`   ${c.name}\n`);
  });
}

findHighSpendCampaigns().catch(console.error);
