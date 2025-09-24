// Public Analytics Dashboard Edge Function
// NO AUTHENTICATION REQUIRED - Public analytics data only

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    // Connect directly to PostgreSQL like timer-data function
    const dbUrl = 'postgresql://postgres:6kEtvU9n0KhTVr5@db.xsqdkubgyqwpyvfltnrf.supabase.co:5432/postgres'
    const { Client } = await import('https://deno.land/x/postgres@v0.17.0/mod.ts')
    const client = new Client(dbUrl)

    try {
      await client.connect()

      // Get event info - handle both UUID and EID inputs
      let eventQuery, eventParams
      if (eventId.length === 36 && eventId.includes('-')) {
        // Input looks like a UUID
        eventQuery = `SELECT id, eid, name, venue, event_start_datetime, event_end_datetime, enabled FROM events WHERE id = $1`
        eventParams = [eventId]
      } else {
        // Input looks like an EID
        eventQuery = `SELECT id, eid, name, venue, event_start_datetime, event_end_datetime, enabled FROM events WHERE eid = $1`
        eventParams = [eventId]
      }

      const eventResult = await client.queryObject(eventQuery, eventParams)

      if (eventResult.rows.length === 0) {
        await client.end()
        return new Response(JSON.stringify({
          error: 'Event not found'
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const eventInfo = eventResult.rows[0] as any
      const eventUuid = eventInfo.id

      // Get analytics data using the database functions
      const [guestCompositionResult, guestComparisonsResult, timeSeriesResult, recentActivityResult] = await Promise.all([
        client.queryObject(`SELECT * FROM get_event_guest_composition($1)`, [eventUuid]),
        client.queryObject(`SELECT * FROM get_guest_composition_with_comparisons($1)`, [eventUuid]),
        client.queryObject(`SELECT * FROM get_event_time_series($1, $2)`, [eventUuid, 5]),
        client.queryObject(`SELECT * FROM get_event_recent_activity($1)`, [eventUuid])
      ])

      // Get summary counts - use DISTINCT for QR scans to count unique people, not total scans
      const [qrScansResult, votesResult, bidsResult] = await Promise.all([
        client.queryObject(`SELECT COUNT(DISTINCT person_id) as count FROM people_qr_scans WHERE event_id = $1`, [eventUuid]),
        client.queryObject(`SELECT COUNT(*) as count FROM votes WHERE event_id = $1`, [eventUuid]),
        client.queryObject(`
          WITH highest_bids AS (
            SELECT
              a.id as art_id,
              MAX(b.amount) as highest_bid
            FROM art a
            LEFT JOIN bids b ON a.id = b.art_id
            WHERE a.event_id = $1
            GROUP BY a.id
          )
          SELECT
            (SELECT COUNT(*) FROM bids JOIN art ON bids.art_id = art.id WHERE art.event_id = $1) as count,
            COALESCE(SUM(highest_bid), 0) as total_amount
          FROM highest_bids
        `, [eventUuid])
      ])

      await client.end()

      // Convert BigInt values to numbers for JSON serialization
      const guestComposition = guestCompositionResult.rows.map(row => ({
        ...row,
        guests: Number(row.guests || 0),
        votes: Number(row.votes || 0),
        bids: Number(row.bids || 0),
        guest_pct: Number(row.guest_pct || 0),
        vote_rate: Number(row.vote_rate || 0),
        bid_rate: Number(row.bid_rate || 0)
      }))

      // Process guest composition comparisons for stacked bar chart
      const guestComparisons = guestComparisonsResult.rows.map(row => ({
        guest_category: row.guest_category,
        current_pct: Number(row.current_pct || 0),
        city_avg_pct: Number(row.city_avg_pct || 0),
        global_avg_pct: Number(row.global_avg_pct || 0)
      }))

      const timeSeries = timeSeriesResult.rows.map(row => ({
        ...row,
        qr_scans_cumulative: Number(row.qr_scans_cumulative || 0),
        votes_cumulative: Number(row.votes_cumulative || 0),
        bids_cumulative: Number(row.bids_cumulative || 0),
        qr_scans_interval: Number(row.qr_scans_interval || 0),
        votes_interval: Number(row.votes_interval || 0),
        bids_interval: Number(row.bids_interval || 0),
        auction_value_cumulative: Number(row.auction_value_cumulative || 0),
        auction_value_interval: Number(row.auction_value_interval || 0)
      }))

      const recentActivity = recentActivityResult.rows[0] ? {
        last_10_minutes: {
          qr_scans: Number(recentActivityResult.rows[0].last_10_minutes?.qr_scans || 0),
          votes: Number(recentActivityResult.rows[0].last_10_minutes?.votes || 0),
          bids: Number(recentActivityResult.rows[0].last_10_minutes?.bids || 0)
        },
        last_hour: {
          qr_scans: Number(recentActivityResult.rows[0].last_hour?.qr_scans || 0),
          votes: Number(recentActivityResult.rows[0].last_hour?.votes || 0),
          bids: Number(recentActivityResult.rows[0].last_hour?.bids || 0)
        }
      } : {}


      // Calculate summary stats - convert all BigInt values to numbers
      const totalParticipants = guestComposition.reduce((sum, category) => sum + Number(category.guests || 0), 0)
      const newGuests = guestComposition.filter(cat => cat.guest_category?.includes('New'))
        .reduce((sum, category) => sum + Number(category.guests || 0), 0)
      const returnGuests = guestComposition.filter(cat => cat.guest_category?.includes('Return'))
        .reduce((sum, category) => sum + Number(category.guests || 0), 0)

      const totalQrScans = Number(qrScansResult.rows[0]?.count || 0)
      const totalVotes = Number(votesResult.rows[0]?.count || 0)
      const totalBids = Number(bidsResult.rows[0]?.count || 0)
      const totalBidAmount = Number(bidsResult.rows[0]?.total_amount || 0)

      const analytics = {
        event_info: {
          eid: eventInfo.eid,
          name: eventInfo.name,
          venue: eventInfo.venue,
          event_start: eventInfo.event_start_datetime,
          event_end: eventInfo.event_end_datetime,
          status: eventInfo.enabled ? "active" : "inactive"
        },
        summary: {
          total_participants: totalParticipants,
          total_qr_scans: totalQrScans,
          total_votes: totalVotes,
          total_bids: totalBids,
          total_bid_amount: totalBidAmount,
          new_guest_percentage: totalParticipants > 0 ? (newGuests / totalParticipants * 100) : 0,
          return_guest_percentage: totalParticipants > 0 ? (returnGuests / totalParticipants * 100) : 0
        },
        guest_composition: guestComposition,
        guest_composition_comparisons: guestComparisons,
        time_series: timeSeries,
        recent_activity: recentActivity || {},
        generated_at: new Date().toISOString()
      }

      return new Response(JSON.stringify(analytics), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } catch (dbError) {
      console.error('Database connection error:', dbError)
      await client.end().catch(() => {}) // Ignore errors when closing
      return new Response(JSON.stringify({
        error: 'Database connection failed',
        details: dbError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('Error in public-analytics:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})