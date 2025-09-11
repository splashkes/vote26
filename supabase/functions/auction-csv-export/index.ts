import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get EID from URL path (e.g., /auction-csv-export/AB3019)
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const eventEid = pathParts[pathParts.length - 1] // Last part of path
    ;
    if (!eventEid || eventEid === 'auction-csv-export') {
      return new Response(JSON.stringify({
        error: 'Event EID is required in URL path (e.g., /auction-csv-export/AB3019)'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get event details by EID and convert to UUID for other queries
    const { data: event, error: eventError } = await supabase.from('events').select('id, name, eid').eq('eid', eventEid).single();
    if (eventError) {
      throw new Error(`Failed to fetch event: ${eventError.message}`);
    }
    // Use existing working functions to get all the data
    const [{ data: artworks, error: artError }, { data: paymentLogs, error: paymentLogsError }, { data: paymentStatuses, error: paymentStatusesError }, { data: bidderData, error: bidderError }, { data: directBids, error: directBidsError }, { data: stripePayments, error: stripePaymentsError }] = await Promise.all([
      // Get basic artwork data
      supabase.from('art').select(`
          id, art_code, round, easel, status, current_bid, 
          auction_extended, extension_count, closing_time,
          buyer_pay_recent_status_id, buyer_pay_recent_date,
          artist_id,
          artist_profiles (
            name, entry_id, email, phone,
            people!artist_profiles_person_id_fkey (
              phone_number, email
            )
          )
        `).eq('event_id', event.id).order('art_code'),
      // Get payment logs using our working function
      supabase.rpc('get_payment_logs_admin', {
        p_event_id: event.id
      }),
      // Get payment statuses using our working function  
      supabase.rpc('get_payment_statuses_admin', {
        p_event_id: event.id
      }),
      // Get bidder info using admin function with service role access
      supabase.rpc('get_admin_auction_details', {
        p_event_id: event.id,
        p_admin_phone: 'service-role' // Service role bypasses phone check
      }),
      // Get direct bid counts for each artwork
      supabase.from('bids').select(`
          art_id,
          amount,
          art!inner(event_id)
        `).eq('art.event_id', event.id),
      // Get Stripe payment data
      supabase.from('payment_processing').select(`
          art_id,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          status,
          metadata,
          art!inner(event_id)
        `).eq('art.event_id', event.id).eq('status', 'completed')
    ]);
    if (artError) throw new Error(`Failed to fetch artworks: ${artError.message}`);
    if (paymentLogsError) throw new Error(`Failed to fetch payment logs: ${paymentLogsError.message}`);
    if (paymentStatusesError) throw new Error(`Failed to fetch payment statuses: ${paymentStatusesError.message}`);
    if (bidderError) throw new Error(`Failed to fetch bidder data: ${bidderError.message}`);
    if (directBidsError) throw new Error(`Failed to fetch direct bids: ${directBidsError.message}`);
    if (stripePaymentsError) throw new Error(`Failed to fetch Stripe payments: ${stripePaymentsError.message}`);
    // Create lookup maps for efficient data joining
    const paymentLogsMap = new Map();
    paymentLogs?.forEach((log)=>{
      paymentLogsMap.set(log.art_id, log);
    });
    const paymentStatusMap = new Map();
    paymentStatuses?.forEach((status)=>{
      paymentStatusMap.set(status.id, status);
    });
    // Create direct bid count map from actual bids
    const bidCountMap = new Map();
    const highestBidMap = new Map();
    directBids?.forEach((bid)=>{
      const artId = bid.art_id.toString();
      const currentCount = bidCountMap.get(artId) || 0;
      const currentHighest = highestBidMap.get(artId) || 0;
      bidCountMap.set(artId, currentCount + 1);
      if (bid.amount > currentHighest) {
        highestBidMap.set(artId, bid.amount);
      }
    });
    // Create Stripe payments map
    const stripePaymentsMap = new Map();
    stripePayments?.forEach((payment)=>{
      stripePaymentsMap.set(payment.art_id, payment);
    });
    const bidderMap = new Map();
    // bidderData is the result from get_admin_auction_details - use the bids object for bidder info only
    if (bidderData?.success && bidderData.bids) {
      Object.entries(bidderData.bids).forEach(([artId, bidInfo])=>{
        bidderMap.set(artId, bidInfo);
      });
    }
    // Filter out artworks without Artist Entry ID and combine all data
    const auctionData = artworks?.filter((artwork)=>artwork.artist_profiles?.entry_id).map((artwork)=>{
      const paymentLog = paymentLogsMap.get(artwork.id);
      const paymentStatus = paymentStatusMap.get(artwork.buyer_pay_recent_status_id);
      const bidInfo = bidderMap.get(artwork.id.toString());
      const stripePayment = stripePaymentsMap.get(artwork.id);
      return {
        // Artwork info
        art_code: artwork.art_code,
        round: artwork.round,
        easel: artwork.easel,
        artwork_status: artwork.status,
        current_bid: artwork.current_bid,
        auction_extended: artwork.auction_extended,
        extension_count: artwork.extension_count,
        closing_time: artwork.closing_time,
        // Artist info
        artist_name: artwork.artist_profiles?.name || '',
        artist_entry_id: artwork.artist_profiles?.entry_id || '',
        artist_email: artwork.artist_profiles?.email || artwork.artist_profiles?.people?.email || '',
        artist_phone: artwork.artist_profiles?.phone || '',
        artist_profile_phone: artwork.artist_profiles?.people?.phone_number || '',
        // Bidding info - use direct counts from actual bids table
        winning_bid: highestBidMap.get(artwork.id.toString()) || artwork.current_bid || 0,
        bid_count: bidCountMap.get(artwork.id.toString()) || 0,
        // Buyer info (from highest bidder OR Stripe metadata)
        buyer_first_name: bidInfo?.highestBidder?.first_name || stripePayment?.metadata?.buyer_name?.split(' ')[0] || '',
        buyer_last_name: bidInfo?.highestBidder?.last_name || stripePayment?.metadata?.buyer_name?.split(' ').slice(1).join(' ') || '',
        buyer_nickname: bidInfo?.highestBidder?.nickname || '',
        buyer_email: bidInfo?.highestBidder?.email || stripePayment?.metadata?.buyer_email || '',
        buyer_phone: bidInfo?.highestBidder?.phone_number || stripePayment?.metadata?.buyer_phone || bidInfo?.highestBidder?.auth_phone || '',
        buyer_auth_phone: bidInfo?.highestBidder?.auth_phone || stripePayment?.metadata?.buyer_phone || '',
        // Payment info
        payment_status_description: paymentStatus?.description || '',
        payment_method: paymentLog?.payment_method || '',
        payment_date: paymentLog?.created_at || artwork.buyer_pay_recent_date || '',
        admin_marked_by: paymentLog?.admin_phone || '',
        actual_amount_collected: paymentLog?.actual_amount_collected || '',
        actual_tax_collected: paymentLog?.actual_tax_collected || '',
        collection_notes: paymentLog?.collection_notes || '',
        // Stripe metadata (from Stripe payments table)
        stripe_session_id: stripePayment?.stripe_checkout_session_id || paymentLog?.metadata?.stripe_session_id || '',
        stripe_payment_intent: stripePayment?.stripe_payment_intent_id || paymentLog?.metadata?.stripe_payment_intent || '',
        stripe_customer_id: paymentLog?.metadata?.stripe_customer_id || ''
      };
    }) || [];
    // Build CSV content
    const csvHeaders = [
      'Art Code',
      'Round',
      'Easel',
      'Artist Name',
      'Artist Entry ID',
      'Artist Email',
      'Artist Phone',
      'Artist Profile Phone',
      'Artwork Status',
      'Current Bid',
      'Winning Bid',
      'Bid Count',
      'Buyer First Name',
      'Buyer Last Name',
      'Buyer Nickname',
      'Buyer Email',
      'Buyer Phone',
      'Buyer Auth Phone',
      'Payment Status',
      'Payment Method',
      'Payment Date',
      'Admin Who Marked Paid',
      'Actual Amount Collected',
      'Actual Tax Collected',
      'Collection Notes',
      'Stripe Session ID',
      'Stripe Payment Intent',
      'Stripe Customer ID',
      'Auction Extended',
      'Extension Count',
      'Closing Time'
    ];
    const csvRows = auctionData.map((item)=>[
        item.art_code || '',
        item.round || '',
        item.easel || '',
        item.artist_name || '',
        item.artist_entry_id || '',
        item.artist_email || '',
        item.artist_phone || '',
        item.artist_profile_phone || '',
        item.artwork_status || '',
        item.current_bid || '',
        item.winning_bid || '',
        item.bid_count || '0',
        item.buyer_first_name || '',
        item.buyer_last_name || '',
        item.buyer_nickname || '',
        item.buyer_email || '',
        item.buyer_phone || '',
        item.buyer_auth_phone || '',
        item.payment_status_description || '',
        item.payment_method || '',
        item.payment_date ? new Date(item.payment_date).toLocaleString() : '',
        item.admin_marked_by || '',
        item.actual_amount_collected || '',
        item.actual_tax_collected || '',
        item.collection_notes || '',
        item.stripe_session_id || '',
        item.stripe_payment_intent || '',
        item.stripe_customer_id || '',
        item.auction_extended ? 'Yes' : 'No',
        item.extension_count || '0',
        item.closing_time ? new Date(item.closing_time).toLocaleString() : ''
      ]);
    // Convert to CSV format
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map((row)=>row.map((field)=>`"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filename = `${event.eid}_auction_export_${timestamp}.csv`;
    return new Response(csvContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('Auction CSV export error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
