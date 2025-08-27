import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailTemplates } from '../_shared/emailTemplates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get EID from URL path (e.g., /populate-email-queue/AB3019)
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const eventEid = pathParts[pathParts.length - 1]

    if (!eventEid || eventEid === 'populate-email-queue') {
      return new Response(
        JSON.stringify({ error: 'Event EID is required in URL path (e.g., /populate-email-queue/AB3019)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Populating email queue for event:', eventEid)

    // Get event details - COPY EXACT SCHEMA FROM WORKING FUNCTION
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(`
        id, name, eid, event_start_datetime,
        cities!fk_events_city (
          name
        )
      `)
      .eq('eid', eventEid)
      .single()

    if (eventError) {
      console.error('Event query error:', eventError)
      throw new Error(`Failed to fetch event: ${eventError.message}`)
    }

    console.log('Found event:', { id: event.id, eid: event.eid, name: event.name })

    // Get all artworks with artist info - COPY EXACT SCHEMA FROM WORKING FUNCTION
    const { data: artworks, error: artError } = await supabase
      .from('art')
      .select(`
        id, art_code, round, easel, status, current_bid,
        artist_id,
        artist_profiles (
          id, name, entry_id, email, phone,
          people!artist_profiles_person_id_fkey (
            phone_number, email
          )
        )
      `)
      .eq('event_id', event.id)
      .not('artist_profiles.entry_id', 'is', null)
      .order('artist_id, art_code')

    if (artError) {
      console.error('Artworks query error:', artError)
      throw new Error(`Failed to fetch artworks: ${artError.message}`)
    }

    console.log(`Found ${artworks?.length || 0} artworks`)

    // Get payment data - COPY EXACT SCHEMA FROM WORKING FUNCTION
    const { data: paymentData, error: paymentError } = await supabase.rpc('get_payment_logs_admin', { p_event_id: event.id })
    if (paymentError) console.log('Payment data fetch error:', paymentError.message)

    const { data: paymentStatuses, error: paymentStatusError } = await supabase.rpc('get_payment_statuses_admin', { p_event_id: event.id })
    if (paymentStatusError) console.log('Payment status fetch error:', paymentStatusError.message)

    const { data: stripePayments, error: stripeError } = await supabase
      .from('payment_processing')
      .select(`
        art_id,
        status,
        metadata,
        art!inner(event_id)
      `)
      .eq('art.event_id', event.id)
      .eq('status', 'completed')
    if (stripeError) console.log('Stripe payment fetch error:', stripeError.message)

    // Create payment lookup maps - COPY EXACT LOGIC FROM WORKING FUNCTION
    const paymentLogsMap = new Map()
    paymentData?.forEach(log => {
      paymentLogsMap.set(log.art_id, log)
    })

    const paymentStatusMap = new Map()
    paymentStatuses?.forEach(status => {
      paymentStatusMap.set(status.id, status)
    })

    const stripePaymentsMap = new Map()
    stripePayments?.forEach(payment => {
      stripePaymentsMap.set(payment.art_id, payment)
    })

    // Group artworks by artist - COPY EXACT LOGIC FROM WORKING FUNCTION
    const artistGroups = new Map()
    
    artworks?.forEach(artwork => {
      const artistId = artwork.artist_id
      if (!artistGroups.has(artistId)) {
        artistGroups.set(artistId, {
          artist: artwork.artist_profiles,
          artworks: []
        })
      }
      
      const paymentLog = paymentLogsMap.get(artwork.id)
      const paymentStatus = paymentStatusMap.get(artwork.buyer_pay_recent_status_id)
      const stripePayment = stripePaymentsMap.get(artwork.id)
      
      artistGroups.get(artistId).artworks.push({
        ...artwork,
        payment_log: paymentLog,
        payment_status: paymentStatus,
        stripe_payment: stripePayment
      })
    })

    console.log(`Grouped into ${artistGroups.size} artists`)

    // Format event date and city name - COPY FROM WORKING FUNCTION
    const eventDate = event.event_start_datetime ? new Date(event.event_start_datetime).toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : 'the event'
    
    const cityName = event.cities?.name || 'our location'

    // Process each artist and populate queue
    const queueEntries = []
    
    for (const [artistId, { artist, artworks }] of artistGroups) {
      const artistName = artist?.name || 'Artist'
      const artistEmail = artist?.email || artist?.people?.email || 'No email on file'
      
      console.log(`Processing artist: ${artistName} (ID: ${artist?.id})`)

      // Validate artist profile ID
      if (!artist?.id) {
        console.warn(`Skipping artist ${artistName} - no profile ID`)
        queueEntries.push({
          artist: artistName,
          success: false,
          error: 'No artist profile ID found'
        })
        continue
      }

      // Calculate artist data - COPY EXACT LOGIC FROM WORKING FUNCTION
      let totalSales = 0
      let artistShare = 0
      const soldArtworks = []
      const noBidArtworks = []
      let hasUnpaidSales = false

      artworks.forEach(artwork => {
        if ((artwork.status === 'sold' || artwork.status === 'paid') && artwork.current_bid > 0) {
          let paymentStatusText = 'NOT PAID'
          if (artwork.status === 'paid') {
            if (artwork.payment_log?.payment_method === 'STRIPE') {
              paymentStatusText = 'PAID STRIPE'
            } else {
              paymentStatusText = 'PAID OTHER'
            }
          } else if (artwork.payment_status?.description?.includes('PAID')) {
            if (artwork.payment_log?.payment_method === 'STRIPE') {
              paymentStatusText = 'PAID STRIPE'
            } else {
              paymentStatusText = 'PAID OTHER'
            }
          } else {
            hasUnpaidSales = true
          }
          
          soldArtworks.push({
            art_code: artwork.art_code,
            sale_price: artwork.current_bid,
            payment_status: paymentStatusText,
            round: artwork.round,
            easel: artwork.easel
          })
          totalSales += artwork.current_bid
        } else if (artwork.status === 'closed' || ((artwork.status === 'sold' || artwork.status === 'paid') && artwork.current_bid === 0)) {
          noBidArtworks.push(artwork.art_code)
        }
      })
      
      artistShare = Math.round(totalSales * 0.5)

      // Prepare template data for email queue
      const templateData = {
        artistName: artistName,
        eventEid: event.eid,
        eventName: event.name || event.eid,
        eventDate: eventDate,
        cityName: cityName,
        soldArtworks: soldArtworks,
        noBidArtworks: noBidArtworks,
        totalEarned: artistShare,
        eventLink: `https://artb.art/event/${event.id}`,
        paymentMethodText: cityName.toLowerCase().includes('toronto') || cityName.toLowerCase().includes('montreal') 
          ? 'We send payments via Interac e-Transfer or PayPal. Please confirm one of the following, so we may get your payment sent promptly\n\nInterac e-Transfer - email address\n\nPayPal - email or handle'
          : 'We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\n\nPayPal - email or handle\n\nZelle - email or phone',
        hasUnpaidSales: hasUnpaidSales,
        artistEmail: artistEmail
      }

      try {
        // Insert into queue using UPSERT to handle duplicates
        const { data: queueEntry, error: insertError } = await supabase
          .from('artist_payment_email_queue')
          .upsert({
            event_id: event.id,
            artist_profile_id: artist.id, // Using UUID artist_profiles.id 
            email_data: templateData,
            template_type: 'payment_notification',
            status: 'ready_for_review'
          })
          .select()
          .single()

        if (insertError) {
          console.error(`Failed to queue email for ${artistName}:`, insertError)
          queueEntries.push({
            artist: artistName,
            success: false,
            error: insertError.message
          })
        } else {
          console.log(`Successfully queued email for ${artistName}`)
          queueEntries.push({
            artist: artistName,
            success: true,
            queue_id: queueEntry.id
          })
        }
      } catch (error) {
        console.error(`Error queuing email for ${artistName}:`, error)
        queueEntries.push({
          artist: artistName,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = queueEntries.filter(e => e.success).length
    const failCount = queueEntries.length - successCount

    return new Response(JSON.stringify({
      success: true,
      message: `Email queue populated for event ${event.eid}`,
      event: {
        eid: event.eid,
        name: event.name,
        city: cityName
      },
      summary: {
        total_emails: queueEntries.length,
        queued_successfully: successCount,
        failed_to_queue: failCount
      },
      queue_entries: queueEntries
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('Populate email queue error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})