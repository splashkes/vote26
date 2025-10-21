import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const eventbriteToken = Deno.env.get('EB_AUTH_TOKEN')!;

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get eventbrite_id from request body or query params
    let eventbriteId: string | null = null;

    if (req.method === 'POST') {
      const body = await req.json();
      eventbriteId = body.eventbrite_id;
    } else if (req.method === 'GET') {
      const url = new URL(req.url);
      eventbriteId = url.searchParams.get('eventbrite_id');
    }

    if (!eventbriteId) {
      return new Response(
        JSON.stringify({ error: 'eventbrite_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching discount codes for event: ${eventbriteId}`);

    // Fetch discount codes from Eventbrite API
    const discountsUrl = `https://www.eventbriteapi.com/v3/events/${eventbriteId}/discounts/`;
    const discountsResponse = await fetch(discountsUrl, {
      headers: {
        'Authorization': `Bearer ${eventbriteToken}`
      }
    });

    if (!discountsResponse.ok) {
      const errorText = await discountsResponse.text();
      console.error('Eventbrite API error:', errorText);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch discounts from Eventbrite',
          details: errorText
        }),
        { status: discountsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const discountsData = await discountsResponse.json();

    // Enrich discount data with additional details if needed
    const enrichedDiscounts = [];

    for (const discount of discountsData.discounts || []) {
      try {
        // Try to get detailed info for each discount
        const detailUrl = `https://www.eventbriteapi.com/v3/discounts/${discount.id}/`;
        const detailResponse = await fetch(detailUrl, {
          headers: {
            'Authorization': `Bearer ${eventbriteToken}`
          }
        });

        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          enrichedDiscounts.push({
            id: detailData.id,
            code: detailData.code,
            type: detailData.type || detailData.discount_type,
            percent_off: detailData.percent_off,
            amount_off: detailData.amount_off,
            quantity_available: detailData.quantity_available,
            quantity_sold: detailData.quantity_sold || detailData.quantity_used || 0,
            start_date: detailData.start_date || detailData.start,
            end_date: detailData.end_date || detailData.end,
            status: detailData.status || 'active',
            ticket_class_ids: detailData.ticket_class_ids || [],
            applies_to_all_tickets: !detailData.ticket_class_ids || detailData.ticket_class_ids.length === 0
          });
        } else {
          // Fall back to basic data
          enrichedDiscounts.push({
            id: discount.id,
            code: discount.code || 'UNKNOWN',
            type: discount.type,
            percent_off: discount.percent_off,
            amount_off: discount.amount_off,
            quantity_available: discount.quantity_available,
            quantity_sold: discount.quantity_sold || 0,
            status: 'unknown'
          });
        }
      } catch (err) {
        console.error(`Error fetching detail for discount ${discount.id}:`, err);
        enrichedDiscounts.push(discount);
      }
    }

    // Filter to only active discounts (if dates are available)
    const now = new Date();
    const activeDiscounts = enrichedDiscounts.filter(discount => {
      // If no date restrictions, consider it active
      if (!discount.start_date && !discount.end_date) return true;

      // Check date range if available
      const start = discount.start_date ? new Date(discount.start_date) : new Date(0);
      const end = discount.end_date ? new Date(discount.end_date) : new Date('2099-12-31');

      return now >= start && now <= end;
    });

    // Sort by percentage (highest first), then by code
    activeDiscounts.sort((a, b) => {
      const percentA = a.percent_off || 0;
      const percentB = b.percent_off || 0;
      if (percentB !== percentA) return percentB - percentA;
      return (a.code || '').localeCompare(b.code || '');
    });

    return new Response(
      JSON.stringify({
        eventbrite_id: eventbriteId,
        total_discounts: discountsData.discounts?.length || 0,
        active_discounts: activeDiscounts.length,
        discounts: activeDiscounts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-eventbrite-discounts:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});