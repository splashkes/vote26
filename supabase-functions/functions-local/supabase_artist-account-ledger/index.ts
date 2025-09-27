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

  let artist_profile_id = null;
  let include_zero_entry = false;
  let user = null;

  try {
    // Create client with anon key for RLS-aware operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? ''
          }
        }
      }
    );

    // Create service role client for admin operations if needed
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    artist_profile_id = requestBody.artist_profile_id;
    include_zero_entry = requestBody.include_zero_entry || false;

    if (!artist_profile_id) {
      return new Response(
        JSON.stringify({ error: 'artist_profile_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is authenticated
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser();
    user = authUser;
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the user is an ABHQ super admin first
    const { data: adminCheck, error: adminError } = await supabaseClient
      .from('abhq_admin_users')
      .select('level, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    let isAbhqAdmin = false;
    if (!adminError && adminCheck) {
      isAbhqAdmin = true;
    }

    // If not an admin, verify the user owns the artist profile
    if (!isAbhqAdmin) {
      // Check if the user owns this artist profile
      const { data: profileCheck, error: profileError } = await supabaseClient
        .from('artist_profiles')
        .select('person_id')
        .eq('id', artist_profile_id)
        .single();

      if (profileError || !profileCheck) {
        return new Response(
          JSON.stringify({ error: 'Artist profile not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get the person_id from JWT claims (for auth v2-http system)
      // The person_id is stored in the JWT root level for auth v2-http
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '');

      let personId = null;
      try {
        // Decode JWT payload (simple base64 decode - no verification needed as Supabase already verified)
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));
        personId = payload.person_id;
      } catch (e) {
        // Fallback to querying people table with user.id
        const { data: personData } = await supabaseClient
          .from('people')
          .select('id')
          .eq('id', user.id)
          .single();
        personId = personData?.id;
      }

      if (!personId || personId !== profileCheck.person_id) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // At this point, user is either:
    // 1. An ABHQ admin (can access any artist's data), OR
    // 2. The artist who owns this profile (can access their own data)

    const ledgerEntries: LedgerEntry[] = [];

    // 1. Get all art sales (CREDITS to artist account)
    // Use service client for art data as it may not have RLS policies for artists
    const { data: artSales, error: artError } = await serviceClient
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
        events!inner(name, currency, artist_auction_portion)
      `)
      .eq('artist_id', artist_profile_id)
      .in('status', ['sold', 'paid', 'closed'])
      .order('created_at', { ascending: false });

    if (artError) throw artError;

    // Process art sales into ledger entries
    for (const art of artSales || []) {
      const salePrice = art.final_price || art.current_bid || 0;
      const currency = art.events?.currency || 'USD';
      // FIXED: Use dynamic artist_auction_portion instead of hardcoded 0.5
      const artistAuctionPortion = art.events?.artist_auction_portion || 0.5;

      if (art.status === 'sold' || art.status === 'paid') {
        // Calculate artist commission using dynamic percentage
        const artistCommission = salePrice * artistAuctionPortion;
        const houseCommission = salePrice * (1 - artistAuctionPortion);

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
            commission_rate: artistAuctionPortion,
            status: art.status
          },
          metadata: {
            sale_type: 'art_sale',
            gross_sale_price: salePrice,
            commission_rate: artistAuctionPortion,
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
            potential_artist_earnings: salePrice * artistAuctionPortion,
            lost_opportunity: true
          }
        });
      }
    }

    // 2. Get all artist payments (DEBITS from artist account - money paid out)
    // Use service client for payment data as it may not have RLS policies for artists
    const { data: payments, error: paymentsError } = await serviceClient
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
        // For positive balance (artist is owed money), we create a payment (debit) to zero it out
        // For negative balance (artist was overpaid), we can't use artist_payments table to add credit
        if (runningBalance > 0) {
          // Artist has positive balance - create a payment to zero it out
          const paymentAmount = runningBalance; // Payment amount equals the balance owed

          // Insert the zero entry payment into the database
          const { data: insertedPayment, error: insertError } = await serviceClient
            .from('artist_payments')
            .insert({
              artist_profile_id: artist_profile_id,
              gross_amount: paymentAmount,
              net_amount: paymentAmount,
              platform_fee: 0.00,
              stripe_fee: 0.00,
              currency: 'USD',
              description: `Balance adjustment for system migration (zeroing $${runningBalance.toFixed(2)} owed)`,
              payment_method: 'Balance Adjustment',
              payment_type: 'manual',
              status: 'paid',
              created_by: user.email || 'admin@artbattle.com',
              reference: `zero-entry-${Date.now()}`
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error inserting zero entry payment:', insertError);
            return new Response(
              JSON.stringify({
                error: 'Failed to create zero entry payment',
                success: false,
                debug: {
                  timestamp: new Date().toISOString(),
                  function_name: 'artist-account-ledger',
                  artist_profile_id: artist_profile_id,
                  include_zero_entry: include_zero_entry,
                  running_balance: runningBalance,
                  payment_amount: paymentAmount,
                  insert_error: {
                    message: insertError.message,
                    details: insertError.details,
                    hint: insertError.hint,
                    code: insertError.code
                  },
                  user_info: {
                    user_id: user?.id,
                    user_email: user?.email
                  }
                }
              }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            );
          }

          // Add the persisted zero entry to ledger entries
          ledgerEntries.push({
            id: `zero-entry-${insertedPayment.id}`,
            date: insertedPayment.created_at,
            type: 'debit',
            category: 'Account Adjustment',
            description: insertedPayment.description,
            amount: paymentAmount,
            currency: insertedPayment.currency,
            metadata: {
              is_zero_entry: true,
              previous_balance: runningBalance,
              payment_id: insertedPayment.id,
              payment_method: insertedPayment.payment_method,
              reference: insertedPayment.reference,
              created_by: insertedPayment.created_by
            }
          });
        } else {
          // Artist has negative balance (was overpaid) - just add a virtual entry for display
          // We can't create actual credits in artist_payments table
          ledgerEntries.push({
            id: `zero-entry-${Date.now()}`,
            date: new Date().toISOString(),
            type: 'credit',
            category: 'Account Adjustment',
            description: `Balance adjustment for system migration (correcting $${Math.abs(runningBalance).toFixed(2)} overpayment)`,
            amount: Math.abs(runningBalance),
            currency: 'USD',
            metadata: {
              is_zero_entry: true,
              previous_balance: runningBalance,
              is_virtual_entry: true,
              note: 'Virtual entry - negative balances cannot be adjusted via payments table'
            }
          });
        }
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
      if (entry.amount !== undefined && entry.amount !== null) {
        const currency = entry.currency || 'USD';
        if (!currencyTotals[currency]) {
          currencyTotals[currency] = { credits: 0, debits: 0, balance: 0 };
        }

        const amount = entry.amount || 0;
        if (entry.type === 'credit') {
          currencyTotals[currency].credits += amount;
        } else if (entry.type === 'debit') {
          currencyTotals[currency].debits += amount;
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
    let primaryCurrency = 'USD';
    if (currencies.length === 1) {
      primaryCurrency = currencies[0];
    } else if (currencies.length > 1) {
      primaryCurrency = currencies.reduce((a, b) => {
        const aBalance = currencyTotals[a] && currencyTotals[a].balance !== undefined ? Math.abs(currencyTotals[a].balance) : 0;
        const bBalance = currencyTotals[b] && currencyTotals[b].balance !== undefined ? Math.abs(currencyTotals[b].balance) : 0;
        return aBalance > bBalance ? a : b;
      }, currencies[0] || 'USD');
    }

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
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'artist-account-ledger',
          error_type: error.constructor.name,
          stack: error.stack,
          request_data: {
            artist_profile_id: artist_profile_id,
            include_zero_entry: include_zero_entry
          },
          auth_info: {
            has_auth_header: !!req.headers.get('Authorization'),
            user_available: !!user
          }
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});