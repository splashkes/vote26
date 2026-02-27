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

    const { event_id } = await req.json();

    if (!event_id) {
      return new Response(
        JSON.stringify({ error: 'event_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get event details
    const { data: event, error: eventError } = await supabaseClient
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
      `)
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found', details: eventError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currencyCode = event.cities?.countries?.currency_code || 'USD';
    const currencySymbol = event.cities?.countries?.currency_symbol || '$';
    const artistPortion = event.artist_auction_portion || 0.5;

    // Fetch all data in parallel for better performance
    const [
      artworksResult,
      paymentLogsResult,
      paymentStatusesResult,
      stripePaymentsResult,
      eventbriteApiCacheResult,
      cachedEventDataResult
    ] = await Promise.all([
      // Get all artworks for this event
      supabaseClient
        .from('art')
        .select(`
          id,
          art_code,
          round,
          easel,
          current_bid,
          status,
          buyer_pay_recent_status_id,
          buyer_pay_recent_date,
          artist_profiles!inner(
            id,
            name,
            entry_id
          )
        `)
        .eq('event_id', event_id)
        .order('art_code'),

      // Get payment logs (admin-marked cash/partner payments)
      supabaseClient.rpc('get_payment_logs_admin', { p_event_id: event_id }),

      // Get payment statuses
      supabaseClient.rpc('get_payment_statuses_admin', { p_event_id: event_id }),

      // Get Stripe payments (online payments)
      supabaseClient
        .from('payment_processing')
        .select('art_id, amount, amount_with_tax, tax_amount, status, payment_method, completed_at')
        .eq('event_id', event_id)
        .eq('status', 'completed'),

      // Get fresh Eventbrite API cache data (< 6 hours old, quality >= 70)
      supabaseClient
        .from('eventbrite_api_cache')
        .select(`
          total_tickets_sold,
          gross_revenue,
          ticket_revenue,
          taxes_collected,
          eventbrite_fees,
          payment_processing_fees,
          total_fees,
          net_deposit,
          total_capacity,
          currency_code,
          data_quality_score,
          fetched_at,
          expires_at,
          api_response_status,
          ticket_classes,
          sales_summary,
          eventbrite_event_name,
          eventbrite_start_date
        `)
        .eq('eid', event.eid)
        .gt('expires_at', new Date().toISOString())
        .gte('data_quality_score', 70)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single(),

      // Get cached ticket sales data (fallback)
      supabaseClient
        .from('cached_event_data')
        .select('venue_capacity, ticket_capacity, current_sales, ticket_classes, sales_data, last_updated')
        .eq('eid', event.eid)
        .single()
    ]);

    const { data: artworks, error: artError } = artworksResult;
    if (artError) {
      throw new Error(`Failed to fetch artworks: ${artError.message}`);
    }

    const { data: paymentLogs, error: paymentLogsError } = paymentLogsResult;
    if (paymentLogsError) {
      console.error('Error fetching payment logs:', paymentLogsError);
    }

    const { data: paymentStatuses, error: statusError } = paymentStatusesResult;
    if (statusError) {
      console.error('Error fetching payment statuses:', statusError);
    }

    const { data: stripePayments, error: stripeError } = stripePaymentsResult;
    if (stripeError) {
      console.error('Error fetching stripe payments:', stripeError);
    }

    const { data: eventbriteApiCache, error: eventbriteApiError } = eventbriteApiCacheResult;
    if (eventbriteApiError) {
      console.error('Error fetching Eventbrite API cache:', eventbriteApiError);
    }

    const { data: cachedEventData, error: cachedEventError } = cachedEventDataResult;
    if (cachedEventError) {
      console.error('Error fetching cached event data:', cachedEventError);
    }

    // Get bids and media after we have artworks (needs artwork IDs)
    const artIds = artworks?.map(a => a.id) || [];

    const [bidsResult, mediaResult] = await Promise.all([
      supabaseClient
        .from('bids')
        .select('art_id, amount')
        .in('art_id', artIds),

      supabaseClient
        .from('art_media')
        .select(`
          art_id,
          media_id,
          media_type,
          display_order,
          media_files!art_media_media_id_fkey (
            id,
            original_url,
            thumbnail_url,
            compressed_url,
            file_type,
            cloudflare_id,
            created_at
          )
        `)
        .in('art_id', artIds)
        .eq('media_files.file_type', 'image')
        .order('created_at', { ascending: false })
    ]);

    const { data: bids, error: bidsError } = bidsResult;
    if (bidsError) {
      console.error('Error fetching bids:', bidsError);
    }

    const { data: mediaData, error: mediaError } = mediaResult;
    if (mediaError) {
      console.error('Error fetching media:', mediaError);
    }

    // Create a map of art_id to media URLs (first image thumbnail)
    const mediaByArt = new Map();
    if (mediaData) {
      mediaData.forEach(media => {
        if (!mediaByArt.has(media.art_id) && media.media_files) {
          const imageUrl = media.media_files.thumbnail_url ||
                          media.media_files.compressed_url ||
                          media.media_files.original_url;
          if (imageUrl) {
            mediaByArt.set(media.art_id, imageUrl);
          }
        }
      });
    }

    // Create lookup maps
    const paymentLogsMap = new Map();
    paymentLogs?.forEach(log => paymentLogsMap.set(log.art_id, log));

    const paymentStatusMap = new Map();
    paymentStatuses?.forEach(status => paymentStatusMap.set(status.id, status));

    const stripePaymentsMap = new Map();
    stripePayments?.forEach(payment => stripePaymentsMap.set(payment.art_id, payment));

    const artworkBidsMap = new Map();
    bids?.forEach(bid => {
      const existing = artworkBidsMap.get(bid.art_id) || [];
      existing.push(bid);
      artworkBidsMap.set(bid.art_id, existing);
    });

    // Process artworks to calculate metrics
    let totalTopBids = 0;
    let totalPaidOnline = 0;
    let totalPaidPartner = 0;
    let taxCollectedOnline = 0;
    let taxCollectedPartner = 0;
    let paidOnlineCount = 0;

    const unpaidPaintings = [];
    const noBidPaintings = [];

    artworks?.forEach(artwork => {
      const paymentLog = paymentLogsMap.get(artwork.id);
      const stripePayment = stripePaymentsMap.get(artwork.id);
      const paymentStatus = paymentStatusMap.get(artwork.buyer_pay_recent_status_id);
      const artworkBids = artworkBidsMap.get(artwork.id) || [];

      // Only count as having bids if there are actual bids in the bids table
      const hasBids = artworkBids.length > 0;

      // Calculate winning bid (highest bid from bids table)
      let winningBid = 0;
      if (artworkBids.length > 0) {
        winningBid = Math.max(...artworkBids.map(b => b.amount));
      }

      if (hasBids) {
        totalTopBids += winningBid;

        // Check if paid - either via Stripe (online) or admin log (partner)
        const hasStripePayment = !!stripePayment;
        const hasPartnerPayment = !!paymentLog?.payment_method;
        const isPaid = hasStripePayment || hasPartnerPayment ||
                      paymentStatus?.description?.toLowerCase().includes('paid') ||
                      paymentStatus?.description?.toLowerCase().includes('verified');

        if (isPaid) {
          // Stripe payment (online)
          if (hasStripePayment) {
            const amount = parseFloat(stripePayment.amount) || winningBid;
            const taxAmount = parseFloat(stripePayment.tax_amount) || 0;
            totalPaidOnline += amount; // Use pre-tax amount only
            taxCollectedOnline += taxAmount;
            paidOnlineCount++;
          }
          // Admin-marked payment (partner/cash)
          else if (hasPartnerPayment) {
            const actualAmount = parseFloat(paymentLog.actual_amount_collected) || winningBid;
            const taxAmount = parseFloat(paymentLog.actual_tax_collected) || 0;
            totalPaidPartner += actualAmount;
            taxCollectedPartner += taxAmount;
          }
        } else {
          // Has bid but not paid
          const daysSinceBid = artwork.buyer_pay_recent_date ?
            Math.floor((Date.now() - new Date(artwork.buyer_pay_recent_date).getTime()) / (1000 * 60 * 60 * 24)) :
            999;

          unpaidPaintings.push({
            art_id: artwork.id,
            art_code: artwork.art_code,
            artist_name: artwork.artist_profiles?.name || 'Unknown',
            winning_bid: winningBid,
            payment_status: paymentStatus?.description || 'No status',
            days_since_bid: daysSinceBid,
            image_url: mediaByArt.get(artwork.id),
          });
        }
      } else {
        // No bids at all
        noBidPaintings.push({
          art_id: artwork.id,
          art_code: artwork.art_code,
          artist_name: artwork.artist_profiles?.name || 'Unknown',
          round: artwork.round,
          easel: artwork.easel,
          image_url: mediaByArt.get(artwork.id),
        });
      }
    });

    // Calculate total unpaid amount
    const totalUnpaidAmount = unpaidPaintings.reduce((sum, p) => sum + p.winning_bid, 0);

    // Get sample thumbnails (first 3 images)
    const unpaidThumbnails = unpaidPaintings
      .slice(0, 3)
      .map(p => p.image_url)
      .filter(url => url);

    const noBidThumbnails = noBidPaintings
      .map(p => p.image_url)
      .filter(url => url);

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.id,
        event_eid: event.eid,
        event_name: event.name,

        auction_summary: {
          total_artworks: artworks?.length || 0,
          artworks_with_bids: artworks?.length - noBidPaintings.length || 0,
          artworks_without_bids: noBidPaintings.length,

          total_top_bids_amount: totalTopBids,
          total_paid_online: totalPaidOnline,
          total_paid_partner: totalPaidPartner,
          paid_online_count: paidOnlineCount,

          tax_collected_online: taxCollectedOnline,
          tax_collected_partner: taxCollectedPartner,

          // Processing fees: $1 + 2.9% per online transaction
          processing_fees: (paidOnlineCount * 1) + (totalPaidOnline * 0.029),

          currency_code: currencyCode,
          currency_symbol: currencySymbol,
          artist_auction_portion: artistPortion,
        },

        unpaid_paintings: {
          count: unpaidPaintings.length,
          total_amount: totalUnpaidAmount,
          list: unpaidPaintings.sort((a, b) => b.days_since_bid - a.days_since_bid),
          sample_thumbnails: unpaidThumbnails,
        },

        no_bid_paintings: {
          count: noBidPaintings.length,
          list: noBidPaintings.sort((a, b) => (a.art_code || '').localeCompare(b.art_code || '')),
          sample_thumbnails: noBidThumbnails,
        },

        ticket_sales: await (async () => {
          // Priority 1: Use fresh Eventbrite API cache data (< 6 hours old, quality >= 70)
          let apiCache = eventbriteApiCache;

          // If no valid cache, fetch fresh data from Eventbrite API
          if (!apiCache) {
            console.log(`No valid Eventbrite cache for ${event.eid}, fetching fresh data...`);
            try {
              const fetchResponse = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-eventbrite-data`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': req.headers.get('Authorization') || '',
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ eid: event.eid, fetch_reason: 'post_event_summary' })
                }
              );

              if (fetchResponse.ok) {
                const fetchData = await fetchResponse.json();
                console.log(`✅ Fresh Eventbrite data fetched for ${event.eid}`);

                // Query cache again to get the newly inserted data
                const { data: freshCache } = await supabaseClient
                  .from('eventbrite_api_cache')
                  .select('*')
                  .eq('eid', event.eid)
                  .order('fetched_at', { ascending: false })
                  .limit(1)
                  .single();

                apiCache = freshCache;
              } else {
                console.error(`Failed to fetch Eventbrite data: ${fetchResponse.status}`);
              }
            } catch (error) {
              console.error(`Error fetching Eventbrite data:`, error);
            }
          }

          // If we have API cache (either existing or freshly fetched), use it
          if (apiCache) {
            const cacheAgeHours = (Date.now() - new Date(apiCache.fetched_at).getTime()) / (1000 * 60 * 60);

            return {
              // Basic metrics
              total_sold: apiCache.total_tickets_sold || 0,
              total_capacity: apiCache.total_capacity || 0,
              percentage_sold: apiCache.total_capacity > 0
                ? ((apiCache.total_tickets_sold / apiCache.total_capacity) * 100).toFixed(1)
                : 0,

              // Financial breakdown (billing-accurate)
              gross_revenue: parseFloat(apiCache.gross_revenue || 0),
              ticket_revenue: parseFloat(apiCache.ticket_revenue || 0),
              taxes_collected: parseFloat(apiCache.taxes_collected || 0),
              eventbrite_fees: parseFloat(apiCache.eventbrite_fees || 0),
              payment_processing_fees: parseFloat(apiCache.payment_processing_fees || 0),
              total_fees: parseFloat(apiCache.total_fees || 0),
              net_deposit: parseFloat(apiCache.net_deposit || 0),

              // Calculated metrics
              average_ticket_price: apiCache.total_tickets_sold > 0
                ? (apiCache.ticket_revenue / apiCache.total_tickets_sold).toFixed(2)
                : 0,
              average_net_per_ticket: apiCache.total_tickets_sold > 0
                ? (apiCache.net_deposit / apiCache.total_tickets_sold).toFixed(2)
                : 0,

              // Currency
              currency_code: apiCache.currency_code || currencyCode,
              currency_symbol: currencySymbol,

              // Metadata
              data_source: 'Eventbrite API',
              data_quality_score: apiCache.data_quality_score,
              api_response_status: apiCache.api_response_status,
              cache_age_hours: cacheAgeHours.toFixed(2),
              fetched_at: apiCache.fetched_at,
              expires_at: apiCache.expires_at,

              // Event verification (to ensure correct Eventbrite event is linked)
              eventbrite_event_name: apiCache.eventbrite_event_name || null,
              eventbrite_start_date: apiCache.eventbrite_start_date || null,

              // Detailed breakdown
              ticket_classes: apiCache.ticket_classes || [],
              sales_summary: apiCache.sales_summary || {},
            };
          }

          // Priority 2: Fall back to legacy cached_event_data
          if (!cachedEventData) {
            return {
              total_sold: 0,
              total_revenue: 0,
              online_sales: 0,
              door_sales: 0,
              total_capacity: 0,
              venue_capacity: 0,
              data_source: 'No cached data available',
              last_updated: null,
            };
          }

          let totalRevenue = 0;
          let totalSold = 0;

          // Extract from current_sales if it's an object with both tickets and revenue
          if (cachedEventData.current_sales && typeof cachedEventData.current_sales === 'object') {
            totalSold = cachedEventData.current_sales.tickets || 0;
            totalRevenue = cachedEventData.current_sales.revenue || 0;
          }
          // Extract from ticket classes (most granular breakdown)
          else if (Array.isArray(cachedEventData.ticket_classes) && cachedEventData.ticket_classes.length > 0) {
            cachedEventData.ticket_classes.forEach(tc => {
              const sold = tc.quantitySold || 0;
              const price = parseFloat(tc.price) || 0;
              totalSold += sold;
              totalRevenue += sold * price;
            });
          }
          // Extract from sales_data array cumulative totals
          else if (Array.isArray(cachedEventData.sales_data) && cachedEventData.sales_data.length > 0) {
            // Get the last entry which has cumulative totals
            const lastEntry = cachedEventData.sales_data[cachedEventData.sales_data.length - 1];
            totalSold = lastEntry.cumulativeTickets || lastEntry.tickets || 0;
            totalRevenue = lastEntry.cumulativeRevenue || lastEntry.revenue || 0;
          }
          // current_sales as a simple number (no revenue data)
          else if (typeof cachedEventData.current_sales === 'number') {
            totalSold = cachedEventData.current_sales;
          }

          return {
            total_sold: totalSold,
            total_revenue: totalRevenue,
            average_price: totalSold > 0 ? totalRevenue / totalSold : 0,
            online_sales: totalSold, // Assuming all cached sales are online for now
            door_sales: 0, // No door sales data in cached_event_data
            total_capacity: cachedEventData.ticket_capacity || 0,
            venue_capacity: cachedEventData.venue_capacity || 0,
            data_source: `Legacy Eventbrite Cache`,
            last_updated: cachedEventData.last_updated,
            raw_data: {
              current_sales: cachedEventData.current_sales,
              ticket_classes: cachedEventData.ticket_classes,
              sales_data: cachedEventData.sales_data,
            },
          };
        })(),
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
          function_name: 'get-event-post-summary',
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
