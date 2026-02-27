// One-time Admin Function: Delete Specific Stripe Accounts
// Deletes the 75 accounts that were already removed from database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@13.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The 75 accounts already deleted from database
const ACCOUNTS_TO_DELETE = [
  { id: "acct_1SRFo11h9LxTd2BN", country: "CA", name: "Morgan Currie" },
  { id: "acct_1SPQ8ZBVKGI5J32G", country: "US", name: "Victoria Grassmid" },
  { id: "acct_1SPAZl12EmsgEbXn", country: "CA", name: "JJ Normandeau" },
  { id: "acct_1SMryl0krB3kzvKL", country: "CA", name: "Aileen McQueen" },
  { id: "acct_1SMhmn0YESimJ4bH", country: "CA", name: "Raevyn Berg" },
  { id: "acct_1SL2bSP57vBslvuC", country: "CA", name: "Abolfazl Mirgalouibayat" },
  { id: "acct_1SKT6VBGpTSHCRqK", country: "US", name: "Kenly" },
  { id: "acct_1SKQ28BSPvJP3yry", country: "US", name: "P-Ro" },
  { id: "acct_1SKO8I086dj1mYik", country: "CA", name: "Armela Mema" },
  { id: "acct_1SJyyB01Ao03Dty4", country: "CA", name: "Lisa Lynn Adams" },
  { id: "acct_1SJLLv0vwcsqpivC", country: "CA", name: "Simon Plashkes" },
  { id: "acct_1SIdHk0kd2qO54qG", country: "CA", name: "Patrick.S.Greene" },
  { id: "acct_1SIbcT0LK20I3GbJ", country: "CA", name: "Daniel Martelock" },
  { id: "acct_1STR5i0ixvmgf96o", country: "CA", name: "Sofia Hernandez" },
  { id: "acct_1SIV3a1dCHFREHc2", country: "CA", name: "Trevor Ball" },
  { id: "acct_1SJvOcP3YaXVgNZf", country: "CA", name: "Silvia" },
  { id: "acct_1SIfxH1RnlUDHcuW", country: "CA", name: "Rob Nicholson" },
  { id: "acct_1SIX350uVRMWXT00", country: "CA", name: "Sawsan Hussein Shorbajee" },
  { id: "acct_1SHoomBh72SLNEu9", country: "US", name: "Tiffany Burkey" },
  { id: "acct_1SJ3150vtuLd9k9U", country: "CA", name: "MEDĒIO" },
  { id: "acct_1SGkBR0YiUz8J2Pc", country: "CA", name: "Keith williams" },
  { id: "acct_1SGfZlB2zF7wVBY9", country: "TH", name: "iamthesenseinu" },
  { id: "acct_1SKoDi1WqnhqHTl2", country: "CA", name: "Christopher Padayachee" },
  { id: "acct_1SGTSy0Z1DS4sYzz", country: "CA", name: "Marc Belanger" },
  { id: "acct_1SGKJqB54Sx4iEhO", country: "US", name: "Emily Kwong" },
  { id: "acct_1SFcPO0lmkcOkMPh", country: "CA", name: "Julia Ioannou" },
  { id: "acct_1SFM2dPg6reQBCEl", country: "TH", name: "Pahas Tongting" },
  { id: "acct_1SFKDdBnoS4IuVil", country: "TH", name: "Watthana Petchkeaw" },
  { id: "acct_1SKMdu0oS5GVztvq", country: "CA", name: "Kareem David James Mitchell" },
  { id: "acct_1SF1MY0qlcIxaV4o", country: "CA", name: "Makhdoom Sadiq Khan" },
  { id: "acct_1SEwaM0E54prBGwz", country: "CA", name: "Kyla Yager" },
  { id: "acct_1SEuoU0OwDtNsOrG", country: "CA", name: "Mariia Charuta" },
  { id: "acct_1SEh4qBAuMspUsRy", country: "NZ", name: "Cindy Nguyen" },
  { id: "acct_1SHTN71jNVIymicp", country: "CA", name: "Cory Hall" },
  { id: "acct_1SEelw09Yw7gpwUr", country: "CA", name: "Ghazal Alkassab" },
  { id: "acct_1SRE54PZKGcLGfYf", country: "US", name: "Alana Tucker" },
  { id: "acct_1SEFt5PlkO2fAsTt", country: "US", name: "Sarah Mason" },
  { id: "acct_1SECweB5svcqdkQg", country: "NL", name: "JULIO europe TEST TEST" },
  { id: "acct_1SECVI1dNTvlTac2", country: "CA", name: "Julio Test instagram Window" },
  { id: "acct_1SEANcB1VctMeYz8", country: "US", name: "Prabin Badhia" },
  { id: "acct_1SDeVm0J6Cj0sKoa", country: "CA", name: "WATT" },
  { id: "acct_1SDRlcPmLWjNxKav", country: "US", name: "Chad Divel" },
  { id: "acct_1SDGTS17VWUbHVZk", country: "CA", name: "Heather Chytil" },
  { id: "acct_1STmGOBo5YXHGqPu", country: "US", name: "Allie Overgaard" },
  { id: "acct_1SEZjs0JCUKrARJn", country: "CA", name: "Julia Davids" },
  { id: "acct_1SClDVBIWkG8pPlY", country: "US", name: "Nicole Zimmer" },
  { id: "acct_1SCiiZB0QcLsCdnr", country: "AU", name: "Sohyun Bae" },
  { id: "acct_1SCYixP0VIAArKSX", country: "CA", name: "Cedric Taillon" },
  { id: "acct_1SDoiU1yAZXti6Z3", country: "CA", name: "Vanessa Hill" },
  { id: "acct_1SBvJz1D37bvgAXW", country: "CA", name: "Mandy Kaur" },
  { id: "acct_1SBk850eWaoiBrf2", country: "CA", name: "Makhdoom Sadiq Khan" },
  { id: "acct_1SBfqOBCPB1Z5Vq2", country: "US", name: "Ysabel Ledesma Portilla" },
  { id: "acct_1SB7wGBrSatS3rVT", country: "AU", name: "Poppi Hmelnitsky" },
  { id: "acct_1SB5AGAxAhvsIUCk", country: "AU", name: "Nicolas Nunez Diaz" },
  { id: "acct_1SO36K1IOmAih3fG", country: "CA", name: "Victor Hernández" },
  { id: "acct_1SB2M2BXtjde14by", country: "US", name: "ashley a petrash" },
  { id: "acct_1SAqUnBQClRn1n88", country: "AU", name: "Eve" },
  { id: "acct_1SD7o01vb3WOfh1c", country: "CA", name: "Andrea Michelle Proano Munoz" },
  { id: "acct_1SABK20iykWmN3T1", country: "CA", name: "Kyla Yager" },
  { id: "acct_1SJInD1RRGNMK2PZ", country: "CA", name: "Audrey Greenlees" },
  { id: "acct_1SEtxV0bVIIr4C3H", country: "CA", name: "Kelsey Nelson" },
  { id: "acct_1S914yB4Md7CRu7N", country: "TH", name: "Sarocha Sriapinyayotin" },
  { id: "acct_1S8nxfPjx53yFGhG", country: "US", name: "Tina Baylor" },
  { id: "acct_1S8ZJIBGTjkT1j3N", country: "US", name: "Marcell D. Williams" },
  { id: "acct_1SG1Ji1piSaE6IXm", country: "CA", name: "Heather Morrison" },
  { id: "acct_1S6cOEBRtld9XZFp", country: "NZ", name: "NZ4" },
  { id: "acct_1S6bqpB4HgZqTus2", country: "NZ", name: "NZ TEst" },
  { id: "acct_1S6bjnPVuEC4rc7s", country: "AU", name: "AU TEST 333" },
  { id: "acct_1S6b9jBTc5YtlSgr", country: "AU", name: "AU TEST" },
  { id: "acct_1S6aTPBeFLPqxyfr", country: "NL", name: "NL Test" },
  { id: "acct_1S6aJYBRW5Ud1aik", country: "US", name: "Test Ottawa Canada" },
  { id: "acct_1S6a4APkj1KWbX53", country: "US", name: "TEST US" },
  { id: "acct_1S6a1KBrqQlR075g", country: "US", name: "Tesgin Thailand" }
];

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // NO AUTH CHECK - one-time cleanup function
    console.log('🗑️ Starting batch deletion of 73 Stripe accounts...');

    // Initialize Stripe clients
    const stripeCanadaKey = Deno.env.get('stripe_canada_secret_key');
    const stripeIntlKey = Deno.env.get('stripe_intl_secret_key');

    if (!stripeCanadaKey || !stripeIntlKey) {
      throw new Error('Stripe API keys not configured');
    }

    const stripeCanada = new Stripe(stripeCanadaKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    const stripeIntl = new Stripe(stripeIntlKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    });

    let deleted = 0;
    let alreadyDeleted = 0;
    let failed = 0;
    const results = [];

    for (const account of ACCOUNTS_TO_DELETE) {
      // Try Canada key first, then International key
      let accountDeleted = false;
      let lastError = null;

      for (const stripe of [stripeCanada, stripeIntl]) {
        try {
          await stripe.accounts.del(account.id);
          deleted++;
          console.log(`✓ DELETED: ${account.id} (${account.name} - ${account.country})`);
          results.push({ ...account, status: 'deleted' });
          accountDeleted = true;
          break; // Success, no need to try other key
        } catch (error: any) {
          if (error.code === 'resource_missing') {
            alreadyDeleted++;
            console.log(`⚠ ALREADY DELETED: ${account.id} (${account.name})`);
            results.push({ ...account, status: 'already_deleted' });
            accountDeleted = true;
            break; // Account doesn't exist, no need to try other key
          }
          // If access denied, try the other key
          lastError = error;
        }
      }

      if (!accountDeleted) {
        failed++;
        console.error(`✗ FAILED: ${account.id} - ${lastError?.message}`);
        results.push({ ...account, status: 'failed', error: lastError?.message });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const summary = {
      total: ACCOUNTS_TO_DELETE.length,
      deleted,
      already_deleted: alreadyDeleted,
      failed
    };

    console.log('📊 Batch Deletion Summary:', summary);

    return new Response(JSON.stringify({
      success: true,
      summary,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Error in batch deletion:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
