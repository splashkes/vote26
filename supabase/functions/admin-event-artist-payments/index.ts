import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role for unrestricted access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { event_id, event_eid } = await req.json();

    if (!event_id && !event_eid) {
      return new Response(
        JSON.stringify({ error: 'event_id or event_eid is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get event details
    let eventQuery = supabaseClient
      .from('events')
      .select(`
        id,
        eid,
        name,
        artist_auction_portion,
        cities!inner(
          countries!inner(
            currency_code,
            currency_symbol
          )
        )
      `);

    if (event_id) {
      eventQuery = eventQuery.eq('id', event_id);
    } else {
      eventQuery = eventQuery.eq('eid', event_eid);
    }

    const { data: event, error: eventError } = await eventQuery.single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found', details: eventError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currencyCode = event.cities?.countries?.currency_code || 'USD';
    const currencySymbol = event.cities?.countries?.currency_symbol || '$';
    const artistPortion = event.artist_auction_portion || 0.5;

    // Get all artworks for this event first (don't filter by artist_confirmations yet)
    // This ensures we capture all artworks even if there are duplicate artist profiles
    const { data: allArtworks, error: artworksError } = await supabaseClient
      .from('art')
      .select(`
        id,
        art_code,
        current_bid,
        round,
        easel,
        artist_profiles!inner(
          id,
          name,
          entry_id,
          email
        )
      `)
      .eq('event_id', event.id);

    if (artworksError) {
      throw new Error(`Failed to fetch artworks: ${artworksError.message}`);
    }

    // Get unique artist IDs ONLY from artworks (confirmations are not relevant post-event)
    const artistIds = [...new Set(allArtworks?.map(a => a.artist_profiles.id) || [])];

    // Get artist confirmations for supplementary info (artist_number) but NOT for determining who to show
    const { data: artistConfirmations, error: confirmError } = await supabaseClient
      .from('artist_confirmations')
      .select(`
        artist_profile_id,
        artist_number,
        artist_profiles!inner(
          id,
          name,
          entry_id,
          email
        )
      `)
      .eq('event_eid', event.eid)
      .eq('confirmation_status', 'confirmed');

    if (confirmError) {
      throw new Error(`Failed to fetch artist confirmations: ${confirmError.message}`);
    }

    // Get artwork IDs for this event (to filter bids)
    const artworkIds = allArtworks?.map(a => a.id) || [];

    // Fetch all relevant data in parallel
    const [
      paymentsInResult,
      paymentsOutResult,
      bidsResult,
      paymentInvitationsResult,
      paymentRequestsResult
    ] = await Promise.all([

      // Get all payments IN (from buyers) for this event
      supabaseClient
        .from('payment_processing')
        .select('art_id, amount, amount_with_tax, tax_amount, status, completed_at, payment_method')
        .eq('event_id', event.id)
        .eq('status', 'completed'),

      // Get all payments OUT (to artists) - don't filter by status, we'll skip cancelled ones later
      supabaseClient
        .from('artist_payments')
        .select('artist_profile_id, art_id, gross_amount, net_amount, status, payment_type, payment_method, paid_at, created_at')
        .in('artist_profile_id', artistIds),

      // Get bids for all artworks in this event
      supabaseClient
        .from('bids')
        .select('art_id, amount')
        .in('art_id', artworkIds),

      // Get payment invitations for artists
      supabaseClient
        .from('payment_invitations')
        .select('artist_profile_id, invite_type, sent_at, status, completed_at')
        .in('artist_profile_id', artistIds)
        .order('sent_at', { ascending: false }),

      // Get payment requests to check for stripe_recipient_id
      supabaseClient
        .from('global_payment_requests')
        .select('artist_profile_id, stripe_recipient_id')
        .in('artist_profile_id', artistIds)
    ]);

    const { data: paymentsIn, error: payInError } = paymentsInResult;
    if (payInError) {
      console.error('Error fetching payments in:', payInError);
    }

    const { data: paymentsOut, error: payOutError } = paymentsOutResult;
    if (payOutError) {
      console.error('Error fetching payments out:', payOutError);
    }

    const { data: bids, error: bidsError} = bidsResult;
    if (bidsError) {
      console.error('Error fetching bids:', bidsError);
    }

    const { data: paymentInvitations, error: invitationsError } = paymentInvitationsResult;
    if (invitationsError) {
      console.error('Error fetching payment invitations:', invitationsError);
    }

    const { data: paymentRequests, error: requestsError } = paymentRequestsResult;
    if (requestsError) {
      console.error('Error fetching payment requests:', requestsError);
    }

    // Create lookup maps
    const artworksByArtist = new Map();
    const paymentsInByArt = new Map();
    const paymentsOutByArtist = new Map();
    const bidsByArt = new Map();
    const invitationsByArtist = new Map();
    const paymentAccountByArtist = new Map();
    const confirmationByArtistId = new Map();

    // Map confirmations by artist_profile_id for later lookup
    artistConfirmations?.forEach(confirmation => {
      confirmationByArtistId.set(confirmation.artist_profile_id, confirmation);
    });

    allArtworks?.forEach(art => {
      const artistId = art.artist_profiles.id;
      if (!artworksByArtist.has(artistId)) {
        artworksByArtist.set(artistId, []);
      }
      artworksByArtist.get(artistId).push(art);
    });

    paymentsIn?.forEach(payment => {
      paymentsInByArt.set(payment.art_id, payment);
    });

    paymentsOut?.forEach(payment => {
      if (!paymentsOutByArtist.has(payment.artist_profile_id)) {
        paymentsOutByArtist.set(payment.artist_profile_id, []);
      }
      paymentsOutByArtist.get(payment.artist_profile_id).push(payment);
    });

    bids?.forEach(bid => {
      if (!bidsByArt.has(bid.art_id)) {
        bidsByArt.set(bid.art_id, []);
      }
      bidsByArt.get(bid.art_id).push(bid);
    });

    // Map invitations (get most recent for each artist)
    paymentInvitations?.forEach(invitation => {
      if (!invitationsByArtist.has(invitation.artist_profile_id)) {
        invitationsByArtist.set(invitation.artist_profile_id, invitation);
      }
    });

    // Map payment accounts (check if artist has stripe_recipient_id)
    paymentRequests?.forEach(request => {
      if (!paymentAccountByArtist.has(request.artist_profile_id) && request.stripe_recipient_id) {
        paymentAccountByArtist.set(request.artist_profile_id, {
          stripe_recipient_id: request.stripe_recipient_id,
          status: 'ready'
        });
      }
    });

    // Process each artist (ONLY artists who created artworks in this event)
    let totalOwedToArtists = 0;
    let totalPaidToArtistsStripe = 0;
    let totalPaidToArtistsManual = 0;

    const artistPaymentData = artistIds.map(artistId => {
      // Get artist works (all artists in this list have artworks by definition)
      const artistWorks = artworksByArtist.get(artistId) || [];

      // Get artist info from first artwork (primary source since they participated)
      const artistName = artistWorks[0].artist_profiles.name;
      const entryId = artistWorks[0].artist_profiles.entry_id;
      const email = artistWorks[0].artist_profiles.email;

      // Get artist_number from confirmation if available (supplementary data)
      const confirmation = confirmationByArtistId.get(artistId);
      const artistNumber = confirmation?.artist_number || null;

      // Process each artwork
      const artworkDetails = artistWorks.map(art => {
        const artBids = bidsByArt.get(art.id) || [];
        const winningBid = artBids.length > 0 ? Math.max(...artBids.map(b => b.amount)) : 0;
        const paymentIn = paymentsInByArt.get(art.id);

        // Only calculate artist earnings if the artwork has been PAID FOR
        let artistEarnings = 0;
        let salePrice = 0;

        if (paymentIn) {
          // Use the actual payment amount (without tax) as the sale price
          salePrice = parseFloat(paymentIn.amount) || 0;
          artistEarnings = salePrice * artistPortion;
        }

        return {
          art_id: art.id,
          art_code: art.art_code,
          round: art.round,
          easel: art.easel,
          winning_bid: winningBid,
          sale_price: salePrice,
          is_paid: !!paymentIn,
          payment_in: paymentIn ? {
            amount: parseFloat(paymentIn.amount_with_tax) || parseFloat(paymentIn.amount),
            amount_before_tax: salePrice,
            paid_at: paymentIn.completed_at,
            method: paymentIn.payment_method
          } : null,
          artist_earnings: artistEarnings
        };
      });

      // Get ALL payments to this artist (not filtering by art_id since it's often NULL)
      // Skip only cancelled payments - include paid, verified, pending, processing statuses
      const artistPaymentsAll = (paymentsOutByArtist.get(artistId) || [])
        .filter(p => p.status !== 'cancelled');

      const paymentsToArtist = artistPaymentsAll.map(payment => ({
        art_id: payment.art_id,
        amount: parseFloat(payment.net_amount),
        payment_type: payment.payment_type,
        payment_method: payment.payment_method,
        status: payment.status,
        paid_at: payment.paid_at || payment.created_at
      }));

      // Separate paid, unpaid, and no-bid artworks
      const paidArtworks = artworkDetails.filter(a => a.is_paid);
      const unpaidArtworks = artworkDetails.filter(a => !a.is_paid && a.winning_bid > 0);
      const noBidArtworks = artworkDetails.filter(a => !a.is_paid && a.winning_bid === 0);

      // Calculate totals - count all payments that aren't failed/cancelled
      const totalEarned = paidArtworks.reduce((sum, art) => sum + art.artist_earnings, 0);
      const countedPayments = paymentsToArtist.filter(p =>
        p.status !== 'failed' && p.status !== 'cancelled'
      );
      const totalPaidStripe = countedPayments
        .filter(p => p.payment_type !== 'manual')
        .reduce((sum, p) => sum + p.amount, 0);
      const totalPaidManual = countedPayments
        .filter(p => p.payment_type === 'manual')
        .reduce((sum, p) => sum + p.amount, 0);
      const totalPaid = totalPaidStripe + totalPaidManual;
      const amountOwed = totalEarned - totalPaid;

      // Update summary totals
      totalOwedToArtists += amountOwed;
      totalPaidToArtistsStripe += totalPaidStripe;
      totalPaidToArtistsManual += totalPaidManual;

      // Get invitation and payment account info
      const invitation = invitationsByArtist.get(artistId);
      const paymentAccount = paymentAccountByArtist.get(artistId);

      return {
        artist_id: artistId,
        artist_name: artistName,
        artist_number: artistNumber,
        entry_id: entryId,
        email: email,
        artworks_paid: paidArtworks,
        artworks_unpaid: unpaidArtworks,
        artworks_no_bid: noBidArtworks,
        payments_in: paidArtworks.map(a => a.payment_in),
        payments_out: paymentsToArtist,
        payment_invitation: invitation ? {
          invite_type: invitation.invite_type,
          sent_at: invitation.sent_at,
          status: invitation.status,
          completed_at: invitation.completed_at
        } : null,
        payment_account_status: paymentAccount ? 'ready' : (invitation?.status === 'completed' ? 'pending' : 'not_invited'),
        stripe_recipient_id: paymentAccount?.stripe_recipient_id || null,
        totals: {
          total_earned: totalEarned,
          total_paid_stripe: totalPaidStripe,
          total_paid_manual: totalPaidManual,
          total_paid: totalPaid,
          amount_owed: amountOwed
        }
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.id,
        event_eid: event.eid,
        event_name: event.name,
        currency_code: currencyCode,
        currency_symbol: currencySymbol,
        artist_auction_portion: artistPortion,
        artists: artistPaymentData,
        summary: {
          total_artists: artistPaymentData.length,
          total_owed_to_artists: totalOwedToArtists,
          total_paid_to_artists_stripe: totalPaidToArtistsStripe,
          total_paid_to_artists_manual: totalPaidToArtistsManual,
          total_paid_to_artists: totalPaidToArtistsStripe + totalPaidToArtistsManual
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-event-artist-payments',
          error_type: error.constructor.name,
          error_message: error.message,
          stack: error.stack,
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
