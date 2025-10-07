// Edge function to update exchange rates from external API
// Called by cron job daily

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const cronSecret = req.headers.get('X-Cron-Secret');
    const expectedSecret = Deno.env.get('CRON_SECRET_EXCHANGE_RATES');

    if (cronSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch rates from exchangerate-api.io (free tier, no auth needed)
    // Free tier: 1500 requests/month (way more than we need for daily updates)
    const response = await fetch('https://open.exchangerate-api.com/v6/latest/USD');

    if (!response.ok) {
      throw new Error(`Exchange rate API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.rates) {
      throw new Error('No rates data in response');
    }

    // The API gives us rates FROM USD, we need TO USD
    // So we need to invert the rates (1 / rate)
    const currencies = ['CAD', 'AUD', 'NZD', 'EUR', 'GBP', 'THB', 'JPY', 'CNY'];
    let updated = 0;
    let errors = [];

    for (const currency of currencies) {
      if (data.rates[currency]) {
        // Invert: if USD->CAD is 1.35, then CAD->USD is 1/1.35 = 0.74
        const rateToUSD = 1 / data.rates[currency];

        const { error } = await supabase
          .from('exchange_rates')
          .upsert({
            currency_code: currency,
            rate_to_usd: rateToUSD,
            last_updated: new Date().toISOString(),
            source: 'exchangerate-api.io'
          }, {
            onConflict: 'currency_code'
          });

        if (error) {
          errors.push(`${currency}: ${error.message}`);
        } else {
          updated++;
        }
      }
    }

    // Always ensure USD is 1.0
    await supabase
      .from('exchange_rates')
      .upsert({
        currency_code: 'USD',
        rate_to_usd: 1.0,
        last_updated: new Date().toISOString(),
        source: 'base'
      }, {
        onConflict: 'currency_code'
      });

    return new Response(
      JSON.stringify({
        success: true,
        updated: updated,
        errors: errors.length > 0 ? errors : null,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error updating exchange rates:', error);

    return new Response(
      JSON.stringify({
        error: 'Failed to update exchange rates',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
