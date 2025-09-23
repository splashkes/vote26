// Event Analytics Dashboard Edge Function
// Provides comprehensive real-time analytics for events including:
// - Guest composition matrix (QR/Online x New/Return)
// - Time series data (QR scans, votes, bids - cumulative)
// - Engagement rates and trends

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TimeSeriesPoint {
  timestamp: string;
  qr_scans_cumulative: number;
  votes_cumulative: number;
  bids_cumulative: number;
  qr_scans_hourly: number;
  votes_hourly: number;
  bids_hourly: number;
}

interface GuestCategory {
  guest_category: string;
  guests: number;
  guest_pct: number;
  votes: number;
  vote_rate: number;
  bids: number;
  bid_rate: number;
}

interface EventAnalytics {
  event_info: {
    eid: string;
    name: string;
    venue: string;
    event_start: string;
    event_end: string;
    status: string;
  };
  summary: {
    total_participants: number;
    total_qr_scans: number;
    total_votes: number;
    total_bids: number;
    new_guest_percentage: number;
    return_guest_percentage: number;
  };
  guest_composition: GuestCategory[];
  time_series: TimeSeriesPoint[];
  recent_activity: {
    last_10_minutes: {
      qr_scans: number;
      votes: number;
      bids: number;
    };
    last_hour: {
      qr_scans: number;
      votes: number;
      bids: number;
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
    // Use service role key for all operations - no user auth required
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get event ID from URL params
    const url = new URL(req.url)
    const eventId = url.pathname.split('/').pop()

    if (!eventId) {
      return new Response(JSON.stringify({
        error: 'Event ID required in URL path'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('Public analytics request for event:', eventId)

    // Get event info
    const { data: eventInfo, error: eventError } = await supabase
      .from('events')
      .select('eid, name, venue, event_start_datetime, event_end_datetime, enabled')
      .eq('id', eventId)
      .single()

    if (eventError || !eventInfo) {
      return new Response(JSON.stringify({
        error: 'Event not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get guest composition matrix
    const { data: guestComposition } = await supabase.rpc('get_event_guest_composition', {
      p_event_id: eventId
    })

    // Get time series data
    const { data: timeSeries } = await supabase.rpc('get_event_time_series', {
      p_event_id: eventId,
      p_interval_minutes: 30 // 30-minute intervals
    })

    // Get recent activity
    const { data: recentActivity } = await supabase.rpc('get_event_recent_activity', {
      p_event_id: eventId
    })

    // Calculate summary stats
    const totalQrScans = await supabase
      .from('people_qr_scans')
      .select('id', { count: 'exact' })
      .eq('event_id', eventId)

    const totalVotes = await supabase
      .from('votes')
      .select('id', { count: 'exact' })
      .eq('event_id', eventId)

    const totalBids = await supabase
      .from('bids')
      .select('bids.id', { count: 'exact' })
      .eq('art.event_id', eventId)
      .join('art', 'bids.art_id', 'art.id')

    // Calculate participant stats
    const totalParticipants = guestComposition?.reduce((sum: number, category: any) => sum + category.guests, 0) || 0
    const newGuests = guestComposition?.filter((cat: any) => cat.guest_category.includes('New'))
      .reduce((sum: number, category: any) => sum + category.guests, 0) || 0
    const returnGuests = guestComposition?.filter((cat: any) => cat.guest_category.includes('Return'))
      .reduce((sum: number, category: any) => sum + category.guests, 0) || 0

    const analytics: EventAnalytics = {
      event_info: {
        eid: eventInfo.eid,
        name: eventInfo.name,
        venue: eventInfo.venue,
        event_start: eventInfo.event_start_datetime,
        event_end: eventInfo.event_end_datetime,
        status: eventInfo.enabled ? 'active' : 'inactive'
      },
      summary: {
        total_participants: totalParticipants,
        total_qr_scans: totalQrScans.count || 0,
        total_votes: totalVotes.count || 0,
        total_bids: totalBids.count || 0,
        new_guest_percentage: totalParticipants > 0 ? Math.round((newGuests / totalParticipants) * 100 * 10) / 10 : 0,
        return_guest_percentage: totalParticipants > 0 ? Math.round((returnGuests / totalParticipants) * 100 * 10) / 10 : 0
      },
      guest_composition: guestComposition || [],
      time_series: timeSeries || [],
      recent_activity: recentActivity?.[0] || {
        last_10_minutes: { qr_scans: 0, votes: 0, bids: 0 },
        last_hour: { qr_scans: 0, votes: 0, bids: 0 }
      }
    }

    return new Response(JSON.stringify(analytics), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in event-analytics-dashboard:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})