import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Use service role key for full database access without auth requirements
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const eventEid = url.pathname.split('/').pop()
    const template = url.searchParams.get('template')

    if (!eventEid) {
      return new Response('Event ID required', { status: 400, headers: corsHeaders })
    }

    // Get event details
    const { data: event, error: eventError } = await supabaseClient
      .from('events')
      .select('id, eid, name, eventbrite_id, venue, city_id, event_start_datetime')
      .eq('eid', eventEid)
      .single()

    if (eventError || !event) {
      return new Response(`Event ${eventEid} not found`, { status: 404, headers: corsHeaders })
    }

    // Get the most recent analysis data from event_analysis_history
    const { data: analysisData } = await supabaseClient
      .from('event_analysis_history')
      .select('venue_capacity, configured_tickets, capacity, current_metrics, analysis_date')
      .eq('eid', eventEid)
      .order('analysis_date', { ascending: false })
      .limit(1)
      .single()

    // Get detailed cached event data
    const { data: cachedData } = await supabaseClient
      .from('cached_event_data')
      .select('venue_capacity, ticket_capacity, current_sales, ticket_classes, last_updated')
      .eq('eid', eventEid)
      .single()

    // Determine ticket data source and extract metrics
    let ticketData = {
      tickets_sold: 0,
      revenue: 0,
      average_price: 0,
      total_capacity: 0,
      venue_capacity: 0,
      data_source: 'no_data'
    }

    if (cachedData) {
      // Use cached_event_data for current sales
      const ticketClasses = cachedData.ticket_classes || []
      let totalRevenue = 0
      let totalSold = 0
      
      if (Array.isArray(ticketClasses)) {
        ticketClasses.forEach(tc => {
          totalSold += tc.quantitySold || 0
          totalRevenue += tc.grossSales || 0
        })
      }

      ticketData = {
        tickets_sold: cachedData.current_sales || totalSold,
        revenue: totalRevenue,
        average_price: totalSold > 0 ? totalRevenue / totalSold : 0,
        total_capacity: cachedData.ticket_capacity || 0,
        venue_capacity: cachedData.venue_capacity || 0,
        data_source: `cached_event_data (updated: ${cachedData.last_updated})`
      }
    } else if (analysisData && analysisData.current_metrics) {
      // Use event_analysis_history current_metrics
      const metrics = analysisData.current_metrics
      ticketData = {
        tickets_sold: metrics.ticketsSold || 0,
        revenue: metrics.revenue || 0,
        average_price: metrics.ticketsSold > 0 ? (metrics.revenue || 0) / metrics.ticketsSold : 0,
        total_capacity: analysisData.capacity || analysisData.configured_tickets || 0,
        venue_capacity: analysisData.venue_capacity || 0,
        data_source: `event_analysis_history (analyzed: ${analysisData.analysis_date})`
      }
    }

    // Get city name
    let cityName = 'Unknown'
    if (event.city_id) {
      const { data: city } = await supabaseClient
        .from('cities')
        .select('name')
        .eq('id', event.city_id)
        .single()
      
      if (city) cityName = city.name
    }

    // Get artist booking data
    const { data: artistInvitations } = await supabaseClient
      .from('artist_invitations')
      .select('id, status')
      .eq('event_id', event.id)

    const { data: artistConfirmations } = await supabaseClient
      .from('artist_confirmations')
      .select('id, status')
      .eq('event_id', event.id)

    const { data: eventArtists } = await supabaseClient
      .from('event_artists')
      .select('id, status')
      .eq('event_id', event.id)

    // Calculate artist stats
    const invitedCount = artistInvitations?.length || 0
    const confirmedCount = artistConfirmations?.filter(a => a.status === 'confirmed').length || 0
    const readyCount = eventArtists?.filter(a => a.status === 'ready' || a.status === 'confirmed').length || 0

    // Get email marketing data
    const { data: emailCampaigns } = await supabaseClient
      .from('assigned_email_campaigns')
      .select('*')
      .eq('event_id', event.id)

    // Calculate email stats
    const emailCampaignCount = emailCampaigns?.length || 0
    const totalEmailRecipients = emailCampaigns?.reduce((sum, campaign) => sum + (campaign.recipients_count || 0), 0) || 0
    const avgOpenRate = emailCampaigns?.length > 0 ? 
      emailCampaigns.reduce((sum, campaign) => sum + (campaign.open_rate || 0), 0) / emailCampaigns.length : 0

    // Get SMS data (basic stats from sms_config or message_queue)
    const { data: smsStats } = await supabaseClient
      .from('message_queue')
      .select('id, message_type, status')
      .eq('event_id', event.id)
      .eq('message_type', 'sms')

    const smsCampaignCount = smsStats?.length || 0
    const smsRecipients = smsStats?.length || 0 // Each message = one recipient

    // Calculate days until event
    const eventDate = new Date(event.event_start_datetime)
    const today = new Date()
    const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    // Calculate health score
    let healthScore = 0
    let maxScore = 100

    // Ticket sales component (40 points max)
    const ticketPercentage = ticketData.total_capacity > 0 ? (ticketData.tickets_sold / ticketData.total_capacity) : 0
    healthScore += Math.min(40, ticketPercentage * 40)

    // Artist booking component (30 points max)
    const artistProgress = invitedCount > 0 ? ((confirmedCount + readyCount) / Math.max(invitedCount, 12)) : 0
    healthScore += Math.min(30, artistProgress * 30)

    // Marketing activity component (30 points max)
    const marketingScore = Math.min(30, (emailCampaignCount * 5) + (smsCampaignCount * 3) + (avgOpenRate * 100 * 0.2))
    healthScore += marketingScore

    healthScore = Math.round(healthScore)

    // Determine health status
    let healthStatus = 'poor'
    if (healthScore >= 80) healthStatus = 'excellent'
    else if (healthScore >= 60) healthStatus = 'good'
    else if (healthScore >= 40) healthStatus = 'fair'

    // Build response based on template
    if (template === 'simple') {
      const response = `## Health Report for ${event.name}
**Event ID:** ${event.eid}
**Health Score:** ${healthScore}/100 (${healthStatus})
**Venue:** ${event.venue || 'TBD'}
**City:** ${cityName}
**Days until event:** ${daysUntil}

### Tickets
**Tickets Sold:** ${ticketData.tickets_sold}/${ticketData.total_capacity} (${Math.round(ticketPercentage * 100)}%)
**Total Revenue:** $${ticketData.revenue.toFixed(2)}
**Average Price:** $${ticketData.average_price.toFixed(2)}

### Artists
**Invited:** ${invitedCount}
**Confirmed:** ${confirmedCount}
**Ready:** ${readyCount}

*Report generated: ${new Date().toISOString()}*`

      return new Response(response, {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      })
    }

    // Full comprehensive template matching old system format
    const response = `Following is a snapshot report providing the status of the event Art Battle "${event.name}" as of ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}.

**Event ID:** ${event.eid}
**Health Score:** ${healthScore}/100 (${healthStatus})
**Venue:** ${event.venue || 'TBD'}
**City:** ${cityName}
**Date:** ${eventDate.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}
**Days until event:** ${daysUntil}

## Marketing Performance Highlights

### Email Marketing
- **Campaigns Sent:** ${emailCampaignCount}
- **Total Recipients:** ${totalEmailRecipients.toLocaleString()}
- **Average Open Rate:** ${avgOpenRate.toFixed(1)}%

### SMS Marketing  
- **Campaigns Sent:** ${smsCampaignCount}
- **Total Recipients:** ${smsRecipients.toLocaleString()}

### Facebook Ads
*Facebook Ads integration in progress - data not yet available*
- Total Budget: TBD
- Spent: TBD  
- Reach: TBD
- Click-through Rate: TBD
- Conversions: TBD
- ROAS: TBD

## Tickets
### Ticket Sales Overview
**Tickets Sold**: ${ticketData.tickets_sold}/${ticketData.total_capacity} (${Math.round(ticketPercentage * 100)}%)
**Total Revenue**: $${ticketData.revenue.toFixed(2)}
**Average price paid per ticket**: $${ticketData.average_price.toFixed(2)}

**Data Source**: ${ticketData.data_source}

### Sales Curve Analysis
**Historical ${cityName} Sales Pattern**
*Data analysis in progress* - Limited historical data available

**Days Until Event**: ${daysUntil}
**Current Sales**: ${ticketData.tickets_sold} tickets

## Artist Booking Status
**Invited**: ${invitedCount} artists
**Confirmed**: ${confirmedCount} artists  
**Ready**: ${readyCount} artists

*Note: This report shows actual ticket data. For events with Eventbrite integration, cached data from Eventbrite API is displayed. For events without Eventbrite, internal registration counts are shown. Facebook Ads integration is in development.*

---
*Report generated: ${new Date().toISOString()}*`

    return new Response(response, {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    })

  } catch (error) {
    console.error('Health report error:', error)
    return new Response(`Error generating report: ${error.message}`, { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})