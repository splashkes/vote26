// City Analytics Edge Function
// Provides monthly aggregated analytics for cities including:
// - Revenue metrics (auction sales, registrations)
// - Audience metrics (QR scans, votes, bids)
// - Seasonal trend analysis

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EventData {
  eventId: string;
  eid: string;
  eventDate: string;
  eventDateLabel: string;
  year: number;
  registrations: number;
  auctionRevenue: number;
  ticketRevenue: number;
  totalRevenue: number;
  votes: number;
  bids: number;
  qrScans: number;
}

interface CityAnalytics {
  cityInfo: {
    cityId: string;
    cityName: string;
    country: string;
  };
  eventData: EventData[];
  summary: {
    totalAuctionRevenue: number;
    totalTicketRevenue: number;
    totalRevenue: number;
    totalRegistrations: number;
    totalQrScans: number;
    totalVotes: number;
    totalBids: number;
    totalEvents: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Get auth token from request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Missing authorization header'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create client with user's auth token for RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get city ID from request body
    const { cityId, eventIds } = await req.json()

    if (!cityId || !eventIds || eventIds.length === 0) {
      return new Response(JSON.stringify({
        error: 'City ID and event IDs required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('City analytics request:', { cityId, eventCount: eventIds.length })

    // Get city info
    const { data: cityInfo, error: cityError } = await supabase
      .from('cities')
      .select('id, name, countries(name, code)')
      .eq('id', cityId)
      .single()

    if (cityError) throw cityError

    // Use raw SQL for efficient aggregation
    const { data: monthlyStats, error: statsError } = await supabase.rpc('get_city_monthly_analytics', {
      p_event_ids: eventIds
    })

    // If the RPC doesn't exist, fall back to manual aggregation
    if (statsError && statsError.message.includes('function')) {
      console.log('RPC not found, using fallback aggregation')

      // Get events first to map everything to event dates
      const { data: events } = await supabase
        .from('events')
        .select('id, eid, event_start_datetime')
        .in('id', eventIds)

      // Create event maps
      const eventDateMap: Record<string, string> = {}
      const eventEidMap: Record<string, string> = {}
      const eventIdByEid: Record<string, string> = {}

      events?.forEach(event => {
        eventDateMap[event.id] = event.event_start_datetime
        eventEidMap[event.id] = event.eid
        eventIdByEid[event.eid] = event.id
      })

      // Get ticket sales from Eventbrite API cache
      const eids = events?.map(e => e.eid).filter(eid => eid) || []
      const { data: ticketSalesData, error: ticketError } = await supabase
        .from('eventbrite_api_cache')
        .select('eid, gross_revenue, ticket_revenue, net_deposit')
        .in('eid', eids)
        .order('fetched_at', { ascending: false })

      // Create map of eid to ticket revenue (use most recent cache per eid)
      const ticketRevenueByEid: Record<string, number> = {}
      ticketSalesData?.forEach(sale => {
        if (!ticketRevenueByEid[sale.eid]) {
          ticketRevenueByEid[sale.eid] = parseFloat(sale.gross_revenue || sale.ticket_revenue || sale.net_deposit || '0')
        }
      })

      // Get all data needed for aggregation - grouped by event_id
      const [
        { data: registrations },
        { data: artPieces },
        { data: votes },
        { data: bids },
        { data: qrScans }
      ] = await Promise.all([
        supabase
          .from('event_registrations')
          .select('event_id')
          .in('event_id', eventIds),

        supabase
          .from('art')
          .select('final_price, current_bid, event_id')
          .in('event_id', eventIds),

        supabase
          .from('votes')
          .select('event_id')
          .in('event_id', eventIds),

        supabase
          .from('bids')
          .select('amount, art_id, art!inner(event_id)')
          .in('art.event_id', eventIds),

        supabase
          .from('people_qr_scans')
          .select('event_id')
          .in('event_id', eventIds)
          .eq('is_valid', true)
      ])

      // Aggregate by EVENT (not by month)
      const eventDataMap: Record<string, EventData> = {}

      // Initialize each event with base data
      events?.forEach(event => {
        const eventDate = new Date(event.event_start_datetime)
        eventDataMap[event.id] = {
          eventId: event.id,
          eid: event.eid,
          eventDate: event.event_start_datetime,
          eventDateLabel: eventDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }),
          year: eventDate.getFullYear(),
          registrations: 0,
          auctionRevenue: 0,
          ticketRevenue: ticketRevenueByEid[event.eid] || 0,
          totalRevenue: 0,
          votes: 0,
          bids: 0,
          qrScans: 0
        }
      })

      // Process registrations by event
      registrations?.forEach(reg => {
        if (eventDataMap[reg.event_id]) {
          eventDataMap[reg.event_id].registrations += 1
        }
      })

      // Process art/auction revenue by event
      artPieces?.forEach(art => {
        if (eventDataMap[art.event_id]) {
          const revenue = parseFloat(art.final_price || art.current_bid || '0')
          eventDataMap[art.event_id].auctionRevenue += revenue
        }
      })

      // Process votes by event
      votes?.forEach(vote => {
        if (eventDataMap[vote.event_id]) {
          eventDataMap[vote.event_id].votes += 1
        }
      })

      // Process bids by event
      bids?.forEach(bid => {
        const eventId = bid.art?.event_id
        if (eventId && eventDataMap[eventId]) {
          eventDataMap[eventId].bids += 1
        }
      })

      // Process QR scans by event
      qrScans?.forEach(scan => {
        if (eventDataMap[scan.event_id]) {
          eventDataMap[scan.event_id].qrScans += 1
        }
      })

      // Calculate total revenue for each event (auction + ticket)
      Object.values(eventDataMap).forEach(event => {
        event.totalRevenue = event.auctionRevenue + event.ticketRevenue
      })

      // Convert to array and sort by date
      const eventData = Object.values(eventDataMap)
        .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())

      // Calculate summary
      const summary = {
        totalAuctionRevenue: eventData.reduce((sum, e) => sum + e.auctionRevenue, 0),
        totalTicketRevenue: eventData.reduce((sum, e) => sum + e.ticketRevenue, 0),
        totalRevenue: eventData.reduce((sum, e) => sum + e.totalRevenue, 0),
        totalRegistrations: eventData.reduce((sum, e) => sum + e.registrations, 0),
        totalQrScans: eventData.reduce((sum, e) => sum + e.qrScans, 0),
        totalVotes: eventData.reduce((sum, e) => sum + e.votes, 0),
        totalBids: eventData.reduce((sum, e) => sum + e.bids, 0),
        totalEvents: eventData.length,
        dateRange: {
          start: eventData[0]?.eventDate || '',
          end: eventData[eventData.length - 1]?.eventDate || ''
        }
      }

      const response: CityAnalytics = {
        cityInfo: {
          cityId: cityInfo.id,
          cityName: cityInfo.name,
          country: cityInfo.countries?.name || ''
        },
        eventData,
        summary
      }

      // Add debug info to help troubleshoot revenue data
      const eventsWithTicketRevenue = eventData.filter(e => e.ticketRevenue > 0).length
      const eventsWithAuctionRevenue = eventData.filter(e => e.auctionRevenue > 0).length
      const sampleEvents = eventData.slice(0, 3).map(e => ({
        eid: e.eid,
        ticketRevenue: e.ticketRevenue,
        auctionRevenue: e.auctionRevenue,
        votes: e.votes,
        bids: e.bids,
        registrations: e.registrations,
        qrScans: e.qrScans
      }))

      return new Response(JSON.stringify({
        ...response,
        debug: {
          totalEventsReturned: eventData.length,
          eventsWithTicketRevenue,
          eventsWithAuctionRevenue,
          eidsQueried: eids,
          eidsQueriedCount: eids.length,
          ticketQueryError: ticketError ? ticketError.message : null,
          ticketSalesDataReturned: ticketSalesData?.length || 0,
          ticketRevenueEidsFound: Object.keys(ticketRevenueByEid).length,
          sampleTicketRevenue: Object.entries(ticketRevenueByEid).slice(0, 3),
          sampleEvents,
          artPiecesFound: artPieces?.length || 0,
          votesFound: votes?.length || 0,
          bidsFound: bids?.length || 0
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // If RPC exists and works, format and return that data
    if (statsError) throw statsError

    return new Response(JSON.stringify({
      cityInfo: {
        cityId: cityInfo.id,
        cityName: cityInfo.name,
        country: cityInfo.countries?.name || ''
      },
      monthlyData: monthlyStats,
      summary: calculateSummary(monthlyStats, eventIds.length)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in city analytics:', error)
    return new Response(JSON.stringify({
      error: error.message,
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function calculateSummary(monthlyData: MonthlyData[], eventCount: number) {
  return {
    totalRevenue: monthlyData.reduce((sum, m) => sum + (m.auctionRevenue || 0), 0),
    totalRegistrations: monthlyData.reduce((sum, m) => sum + (m.registrations || 0), 0),
    totalQrScans: monthlyData.reduce((sum, m) => sum + (m.qrScans || 0), 0),
    totalVotes: monthlyData.reduce((sum, m) => sum + (m.votes || 0), 0),
    totalBids: monthlyData.reduce((sum, m) => sum + (m.bids || 0), 0),
    totalEvents: eventCount,
    dateRange: {
      start: monthlyData[0]?.month || '',
      end: monthlyData[monthlyData.length - 1]?.month || ''
    }
  }
}
