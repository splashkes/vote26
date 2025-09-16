import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LedgerEntry {
  id: string;
  date: string;
  type: 'credit' | 'debit' | 'event';
  category: string;
  description: string;
  amount?: number;
  currency: string;
  balance_after?: number;
  metadata?: any;
  art_info?: {
    art_code: string;
    event_name: string;
    final_price?: number;
    status: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { artist_profile_id, include_zero_entry = false } = await req.json();

    if (!artist_profile_id) {
      return new Response(
        JSON.stringify({ error: 'artist_profile_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ledgerEntries: LedgerEntry[] = [];

    // 1. Get all art sales (CREDITS to artist account)
    const { data: artSales, error: artError } = await supabaseClient
      .from('art')
      .select(`
        id,
        art_code,
        final_price,
        current_bid,
        status,
        created_at,
        updated_at,
        closing_time,
        events!inner(name, currency)
      `)
      .eq('artist_id', artist_profile_id)
      .in('status', ['sold', 'paid', 'closed'])
      .order('created_at', { ascending: false });

    if (artError) throw artError;

    // Process art sales into ledger entries
    for (const art of artSales || []) {
      const salePrice = art.final_price || art.current_bid || 0;
      const currency = art.events?.currency || 'USD';

      if (art.status === 'sold' || art.status === 'paid') {
        // Calculate artist commission (50% of sale price)
        const artistCommission = salePrice * 0.5;
        const houseCommission = salePrice * 0.5;

        // TEMPORARILY DISABLED: Calculate credit card fees (2.5% of sale, artist pays half = 1.25% of sale)
        // const totalCCFees = salePrice * 0.025;
        // const artistCCFees = totalCCFees * 0.5; // Artist pays half of CC fees
        // const houseCCFees = totalCCFees * 0.5;  // House pays half of CC fees

        // Net amount artist receives = full commission (no CC fees deducted for now)
        const netToArtist = artistCommission;

        // CREDIT: Art sale earned (artist gets 50%)
        ledgerEntries.push({
          id: `art-sale-${art.id}`,
          date: art.closing_time || art.updated_at,
          type: 'credit',
          category: 'Art Sale',
          description: art.art_code,
          amount: artistCommission,
          currency: currency,
          art_info: {
            art_code: art.art_code,
            event_name: art.events?.name || 'Unknown Event',
            final_price: salePrice,
            artist_commission: artistCommission,
            house_commission: houseCommission,
            commission_rate: 0.5,
            status: art.status
          },
          metadata: {
            sale_type: 'art_sale',
            gross_sale_price: salePrice,
            commission_rate: 0.5,
            house_take: houseCommission,
            net_to_artist: artistCommission
          }
        });

        // TEMPORARILY DISABLED: DEBIT: Artist's portion of credit card fees (1.25% of sale)
        // if (artistCCFees > 0) {
        //   ledgerEntries.push({
        //     id: `cc-fees-${art.id}`,
        //     date: art.closing_time || art.updated_at,
        //     type: 'debit',
        //     category: 'Credit Card Fees',
        //     description: `CC fees (1.25% of $${salePrice.toFixed(2)}) - ${art.art_code}`,
        //     amount: artistCCFees,
        //     currency: currency,
        //     art_info: {
        //       art_code: art.art_code,
        //       event_name: art.events?.name || 'Unknown Event',
        //       final_price: salePrice,
        //       status: art.status
        //     },
        //     metadata: {
        //       fee_type: 'credit_card_fees',
        //       total_cc_fees: totalCCFees,
        //       artist_portion: artistCCFees,
        //       house_portion: houseCCFees,
        //       fee_rate: 0.025,
        //       artist_fee_rate: 0.0125,
        //       related_sale_id: `art-sale-${art.id}`
        //     }
        //   });
        // }
      } else if (art.status === 'closed') {
        // EVENT: Painting closed but not sold
        ledgerEntries.push({
          id: `art-closed-${art.id}`,
          date: art.closing_time || art.updated_at,
          type: 'event',
          category: 'Auction Closed',
          description: art.art_code,
          currency: currency,
          art_info: {
            art_code: art.art_code,
            event_name: art.events?.name || 'Unknown Event',
            final_price: salePrice,
            status: art.status
          },
          metadata: {
            potential_artist_earnings: salePrice * 0.5,
            lost_opportunity: true
          }
        });
      }
    }

    // 2. Get all artist payments (DEBITS from artist account - money paid out)
    const { data: payments, error: paymentsError } = await supabaseClient
      .from('artist_payments')
      .select(`
        id,
        gross_amount,
        net_amount,
        platform_fee,
        stripe_fee,
        currency,
        status,
        payment_type,
        payment_method,
        description,
        reference,
        created_at,
        paid_at,
        created_by
      `)
      .eq('artist_profile_id', artist_profile_id)
      .order('created_at', { ascending: false });

    if (paymentsError) throw paymentsError;

    // Process payments into ledger entries
    for (const payment of payments || []) {
      const paymentDate = payment.paid_at || payment.created_at;

      if (payment.payment_type === 'manual') {
        // DEBIT: Manual payment made
        let manualDescription = payment.description || `Manual ${payment.payment_method} payment`;
        if (payment.created_by) {
          manualDescription += ` (by ${payment.created_by})`;
        }
        if (payment.reference) {
          manualDescription += ` - Ref: ${payment.reference}`;
        }

        ledgerEntries.push({
          id: `manual-payment-${payment.id}`,
          date: paymentDate,
          type: 'debit',
          category: 'Manual Payment',
          description: manualDescription,
          amount: payment.net_amount,
          currency: payment.currency,
          metadata: {
            payment_method: payment.payment_method,
            reference: payment.reference,
            created_by: payment.created_by,
            status: payment.status,
            payment_type: 'manual'
          }
        });
      } else {
        // DEBIT: Automated payment made
        let autoDescription = `Stripe/Online payment - ${payment.status}`;
        if (payment.platform_fee > 0 || payment.stripe_fee > 0) {
          autoDescription += ` (fees: ${payment.platform_fee + payment.stripe_fee} ${payment.currency})`;
        }

        ledgerEntries.push({
          id: `auto-payment-${payment.id}`,
          date: paymentDate,
          type: 'debit',
          category: 'Stripe Payment',
          description: autoDescription,
          amount: payment.net_amount,
          currency: payment.currency,
          metadata: {
            gross_amount: payment.gross_amount,
            platform_fee: payment.platform_fee,
            stripe_fee: payment.stripe_fee,
            status: payment.status,
            payment_type: 'automated'
          }
        });
      }
    }

    // 3. Add ZERO ENTRY if requested (to balance out imported/legacy data)
    if (include_zero_entry) {
      // Calculate current balance before zero entry
      let runningBalance = 0;
      const sortedEntries = ledgerEntries
        .filter(entry => entry.amount !== undefined)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const entry of sortedEntries) {
        if (entry.type === 'credit') {
          runningBalance += entry.amount || 0;
        } else if (entry.type === 'debit') {
          runningBalance -= entry.amount || 0;
        }
      }

      if (runningBalance !== 0) {
        const zeroAmount = -runningBalance; // Opposite to zero out the balance
        ledgerEntries.push({
          id: `zero-entry-${Date.now()}`,
          date: new Date().toISOString(),
          type: zeroAmount > 0 ? 'credit' : 'debit',
          category: 'Account Adjustment',
          description: `Balance adjustment for system migration (zeroing ${Math.abs(runningBalance).toFixed(2)})`,
          amount: Math.abs(zeroAmount),
          currency: 'USD', // Default currency for zero entries
          metadata: {
            is_zero_entry: true,
            previous_balance: runningBalance,
            adjustment_amount: zeroAmount
          }
        });
      }
    }

    // 4. Sort all entries by date and calculate running balance
    const finalEntries = ledgerEntries
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    for (const entry of finalEntries) {
      if (entry.amount !== undefined) {
        if (entry.type === 'credit') {
          runningBalance += entry.amount;
        } else if (entry.type === 'debit') {
          runningBalance -= entry.amount;
        }
        entry.balance_after = runningBalance;
      }
    }

    // 5. Calculate summary with currency information
    const currencyTotals = {};

    // Group by currency
    for (const entry of finalEntries) {
      if (entry.amount !== undefined) {
        const currency = entry.currency || 'USD';
        if (!currencyTotals[currency]) {
          currencyTotals[currency] = { credits: 0, debits: 0, balance: 0 };
        }

        if (entry.type === 'credit') {
          currencyTotals[currency].credits += entry.amount;
        } else if (entry.type === 'debit') {
          currencyTotals[currency].debits += entry.amount;
        }
        currencyTotals[currency].balance = currencyTotals[currency].credits - currencyTotals[currency].debits;
      }
    }

    // Legacy totals (assuming USD for backward compatibility)
    const totalCredits = finalEntries
      .filter(e => e.type === 'credit' && e.amount)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const totalDebits = finalEntries
      .filter(e => e.type === 'debit' && e.amount)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const currentBalance = totalCredits - totalDebits;

    // Determine primary currency (most used currency)
    const currencies = Object.keys(currencyTotals);
    const primaryCurrency = currencies.length === 1 ? currencies[0] :
      currencies.reduce((a, b) =>
        (Math.abs(currencyTotals[a].balance) > Math.abs(currencyTotals[b].balance)) ? a : b, 'USD');

    const summary = {
      current_balance: currentBalance,
      total_credits: totalCredits,
      total_debits: totalDebits,
      entry_count: finalEntries.length,
      last_activity: finalEntries.length > 0 ? finalEntries[finalEntries.length - 1].date : null,
      currency_breakdown: currencyTotals,
      primary_currency: primaryCurrency,
      has_mixed_currencies: currencies.length > 1
    };

    return new Response(
      JSON.stringify({
        ledger: finalEntries.reverse(), // Most recent first for display
        summary: summary
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in artist-account-ledger:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});