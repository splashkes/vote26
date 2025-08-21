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
      .select('venue_capacity, configured_tickets, current_metrics, predictions, curve_analysis, analysis_date, days_until_event')
      .eq('eid', eventEid)
      .order('analysis_date', { ascending: false })
      .limit(1)
      .single()

    // Get detailed cached event data
    const { data: cachedData } = await supabaseClient
      .from('cached_event_data')
      .select('venue_capacity, ticket_capacity, current_sales, ticket_classes, sales_data, last_updated')
      .eq('eid', eventEid)
      .single()

    // Determine ticket data source and extract metrics
    let ticketData = {
      tickets_sold: 0,
      revenue: 0,
      average_price: 0,
      total_capacity: 0,
      venue_capacity: 0,
      data_source: 'TICKET DATA MISSING'
    }

    // Priority 1: Use event_analysis_history (most comprehensive)
    if (analysisData && analysisData.current_metrics) {
      const metrics = analysisData.current_metrics
      ticketData = {
        tickets_sold: metrics.ticketsSold || 0,
        revenue: metrics.revenue || 0,
        average_price: metrics.ticketsSold > 0 ? (metrics.revenue || 0) / metrics.ticketsSold : 0,
        total_capacity: analysisData.configured_tickets || 0,
        venue_capacity: analysisData.venue_capacity || 0,
        data_source: `Event Analysis System (${new Date(analysisData.analysis_date).toLocaleDateString()})`
      }
    }
    // Priority 2: Use cached_event_data if analysis unavailable  
    else if (cachedData && (cachedData.current_sales || cachedData.ticket_classes)) {
      let totalRevenue = 0
      let totalSold = 0
      
      // Extract from current_sales object if available
      if (cachedData.current_sales && typeof cachedData.current_sales === 'object') {
        totalSold = cachedData.current_sales.tickets || 0
        totalRevenue = cachedData.current_sales.revenue || 0
      }
      // Extract revenue from ticket classes if available
      else if (Array.isArray(cachedData.ticket_classes)) {
        cachedData.ticket_classes.forEach(tc => {
          const sold = tc.quantitySold || 0
          const price = parseFloat(tc.price) || 0
          totalSold += sold
          totalRevenue += price * sold
        })
      }

      ticketData = {
        tickets_sold: totalSold,
        revenue: totalRevenue,
        average_price: totalSold > 0 ? totalRevenue / totalSold : 0,
        total_capacity: cachedData.ticket_capacity || 0,
        venue_capacity: cachedData.venue_capacity || 0,
        data_source: `Eventbrite Cache (${new Date(cachedData.last_updated).toLocaleDateString()})`
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

    // Get artist booking data using event_eid
    const { data: artistApplications } = await supabaseClient
      .from('artist_applications')
      .select('id, application_status, artist_number')
      .eq('event_eid', eventEid)

    const { data: artistInvitations } = await supabaseClient
      .from('artist_invitations')
      .select('id, status, artist_number')
      .eq('event_eid', eventEid)

    const { data: artistConfirmations } = await supabaseClient
      .from('artist_confirmations')
      .select('id, artist_number')
      .eq('event_eid', eventEid)

    // Calculate artist stats
    const applicationsCount = artistApplications?.length || 0
    const invitedCount = artistInvitations?.length || 0
    const confirmedCount = artistConfirmations?.length || 0

    // Get email marketing data using correct column name
    const { data: emailCampaigns } = await supabaseClient
      .from('assigned_email_campaigns')
      .select('*')
      .eq('assigned_event_abid', eventEid)

    // Calculate email stats
    const emailCampaignCount = emailCampaigns?.length || 0
    const totalEmailRecipients = emailCampaigns?.reduce((sum, campaign) => sum + (campaign.total_recipients || 0), 0) || 0
    const avgOpenRate = emailCampaigns?.length > 0 ? 
      emailCampaigns.reduce((sum, campaign) => sum + (campaign.open_rate || 0), 0) / emailCampaigns.length : 0

    // Get SMS promotion data using correct column name
    const { data: smsPromotions } = await supabaseClient
      .from('assigned_promotions')
      .select('*')
      .eq('assigned_event_abid', eventEid)

    const smsCampaignCount = smsPromotions?.length || 0
    const smsRecipients = smsPromotions?.reduce((sum, promo) => sum + (promo.total_recipients || 0), 0) || 0

    // Get Meta Ads data from meta-ads-report function using service role
    let metaAdsData = null
    try {
      const metaResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-ads-report/${eventEid}`, {
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        }
      })
      
      if (metaResponse.ok) {
        metaAdsData = await metaResponse.json()
      } else {
        console.log('Meta ads response not OK:', metaResponse.status)
      }
    } catch (error) {
      console.log('Meta ads data not available:', error.message)
    }

    // Calculate days until event (use analysis data if available for accuracy)
    const eventDate = new Date(event.event_start_datetime)
    const today = new Date()
    let daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    // Use analysis data if available (more reliable)
    if (analysisData && typeof analysisData.days_until_event === 'number') {
      daysUntil = analysisData.days_until_event
    }
    
    // Handle past events
    const isPastEvent = daysUntil < 0
    const daysDisplay = isPastEvent ? `${Math.abs(daysUntil)} days ago` : `${daysUntil} days`

    // Calculate health score
    let healthScore = 0
    let maxScore = 100

    // Ticket sales component (40 points max)
    const ticketPercentage = ticketData.total_capacity > 0 ? (ticketData.tickets_sold / ticketData.total_capacity) : 0
    healthScore += Math.min(40, ticketPercentage * 40)

    // Artist booking component (30 points max) - need minimum 12 artists typically
    const targetArtists = 12
    const artistProgress = confirmedCount / targetArtists
    healthScore += Math.min(30, artistProgress * 30)

    // Marketing activity component (30 points max)
    let marketingScore = (emailCampaignCount * 5) + (smsCampaignCount * 3) + (avgOpenRate * 100 * 0.2)
    
    // Add Facebook ads score if available
    if (metaAdsData) {
      const adSpendScore = Math.min(10, (metaAdsData.total_spend / 100) * 10) // 10 points for $100+ spend
      const reachScore = Math.min(5, (metaAdsData.total_reach / 1000) * 5) // 5 points for 1000+ reach
      marketingScore += adSpendScore + reachScore
    }
    
    healthScore += Math.min(30, marketingScore)

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
**Days until event:** ${daysDisplay}

### Tickets
**Tickets Sold:** ${ticketData.tickets_sold}/${ticketData.total_capacity} (${Math.round(ticketPercentage * 100)}%)
**Total Revenue:** $${ticketData.revenue.toFixed(2)}
**Average Price:** $${ticketData.average_price.toFixed(2)}

### Artists
**Applications:** ${applicationsCount}
**Invited:** ${invitedCount}
**Confirmed:** ${confirmedCount}

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
**Days until event:** ${daysDisplay}

## Marketing Performance Highlights

### Email Marketing
- **Campaigns Sent:** ${emailCampaignCount}
- **Total Recipients:** ${totalEmailRecipients.toLocaleString()}
- **Average Open Rate:** ${avgOpenRate.toFixed(1)}%

### SMS Marketing  
- **Campaigns Sent:** ${smsCampaignCount}
- **Total Recipients:** ${smsRecipients.toLocaleString()}

### Facebook Ads
${metaAdsData ? 
  `- **Total Budget**: $${metaAdsData.total_budget?.toFixed(2) || '0.00'} ${metaAdsData.currency || 'USD'}
- **Spent**: $${metaAdsData.total_spend?.toFixed(2) || '0.00'} ${metaAdsData.currency || 'USD'}
- **Reach**: ${metaAdsData.total_reach?.toLocaleString() || '0'} people
- **Clicks**: ${metaAdsData.total_clicks?.toLocaleString() || '0'}
- **Click-through Rate**: ${metaAdsData.total_reach > 0 ? ((metaAdsData.total_clicks / metaAdsData.total_reach) * 100).toFixed(2) : '0.00'}%
- **Conversions**: ${metaAdsData.conversions || 0}
- **ROAS**: ${metaAdsData.total_spend > 0 ? (metaAdsData.conversion_value / metaAdsData.total_spend).toFixed(2) : '0.00'}x` :
  '**FACEBOOK ADS DATA MISSING** - Integration not available for this event'}

## Tickets
### Ticket Sales Overview
**Tickets Sold**: ${ticketData.tickets_sold}/${ticketData.total_capacity} (${Math.round(ticketPercentage * 100)}%)
**Total Revenue**: $${ticketData.revenue.toFixed(2)}
**Average price paid per ticket**: $${ticketData.average_price.toFixed(2)}

**Data Source**: ${ticketData.data_source}

### Sales Curve Analysis
**Historical ${cityName} Sales Pattern**
${analysisData?.curve_analysis?.characteristics || 'SALES CURVE DATA MISSING'}

**Analysis Type**: ${analysisData?.curve_analysis?.type || 'DATA MISSING'}
**Prediction Methodology**: ${analysisData?.predictions?.methodology || 'DATA MISSING'}
**Confidence Level**: ${analysisData?.predictions?.confidence ? Math.round(analysisData.predictions.confidence * 100) + '%' : 'DATA MISSING'}

**Days Until Event**: ${daysDisplay}
**Current Sales**: ${ticketData.tickets_sold} tickets
**Projected Final Sales**: ${analysisData?.predictions?.finalTickets || 'PREDICTION DATA MISSING'} tickets

## Artist Booking Status
**Applications**: ${applicationsCount} artists
**Invited**: ${invitedCount} artists
**Confirmed**: ${confirmedCount} artists

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