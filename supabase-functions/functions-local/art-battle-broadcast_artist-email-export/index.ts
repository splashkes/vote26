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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get EID from URL path (e.g., /artist-email-export/AB3019)
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const eventEid = pathParts[pathParts.length - 1]

    if (!eventEid || eventEid === 'artist-email-export') {
      return new Response(
        JSON.stringify({ error: 'Event EID is required in URL path (e.g., /artist-email-export/AB3019)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get event details
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
      throw new Error(`Failed to fetch event: ${eventError.message}`)
    }

    // Get all artworks with artist info, payment info, and buyer info
    const { data: artworks, error: artError } = await supabase
      .from('art')
      .select(`
        id, art_code, round, easel, status, current_bid,
        artist_id,
        artist_profiles (
          name, entry_id, email, phone,
          people!artist_profiles_person_id_fkey (
            phone_number, email
          )
        )
      `)
      .eq('event_id', event.id)
      .not('artist_profiles.entry_id', 'is', null)
      .order('artist_id, art_code')

    if (artError) throw new Error(`Failed to fetch artworks: ${artError.message}`)

    // Get payment data for all artworks (manual payments)
    const { data: paymentData, error: paymentError } = await supabase.rpc('get_payment_logs_admin', { p_event_id: event.id })
    if (paymentError) console.log('Payment data fetch error:', paymentError.message)

    // Get payment statuses
    const { data: paymentStatuses, error: paymentStatusError } = await supabase.rpc('get_payment_statuses_admin', { p_event_id: event.id })
    if (paymentStatusError) console.log('Payment status fetch error:', paymentStatusError.message)

    // Get Stripe payment data
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

    // Create payment lookup maps
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

    // Group artworks by artist
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

    // Generate email content for each artist
    const emailContents = []
    
    for (const [artistId, { artist, artworks }] of artistGroups) {
      const artistName = artist?.name || 'Artist'
      const artistEmail = artist?.email || artist?.people?.email || 'No email on file'
      
      // Format event date  
      const eventDate = event.event_start_datetime ? new Date(event.event_start_datetime).toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }) : 'the event'
      
      const cityName = event.cities?.name || 'our location'
      
      // Calculate totals and determine payment status
      let totalSales = 0
      let artistShare = 0
      const soldArtworks = []
      const noBidArtworks = []
      let hasUnpaidSales = false
      let hasStripePaid = false
      
      artworks.forEach(artwork => {
        if ((artwork.status === 'sold' || artwork.status === 'paid') && artwork.current_bid > 0) {
          // Determine payment status based on artwork.status and payment data
          let paymentStatusText = 'NOT PAID'
          if (artwork.status === 'paid') {
            // If artwork status is 'paid', check payment method
            if (artwork.payment_log?.payment_method === 'STRIPE') {
              paymentStatusText = 'PAID STRIPE'
              hasStripePaid = true
            } else {
              paymentStatusText = 'PAID OTHER'
            }
          } else if (artwork.payment_status?.description?.includes('PAID')) {
            if (artwork.payment_log?.payment_method === 'STRIPE') {
              paymentStatusText = 'PAID STRIPE'
              hasStripePaid = true
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
            payment_method: artwork.payment_log?.payment_method || null
          })
          totalSales += artwork.current_bid
        } else if (artwork.status === 'closed' || ((artwork.status === 'sold' || artwork.status === 'paid') && artwork.current_bid === 0)) {
          noBidArtworks.push(artwork.art_code)
        }
      })
      
      artistShare = Math.round(totalSales * 0.5)
      
      // Build detailed artwork status text with payment info
      let detailedArtworkList = ''
      artworks.forEach(artwork => {
        const artworkCode = artwork.art_code
        const round = artwork.round
        const easel = artwork.easel
        
        if ((artwork.status === 'sold' || artwork.status === 'paid') && artwork.current_bid > 0) {
          // This is a sold artwork
          let paymentStatusText = 'NOT PAID YET'
          
          if (artwork.status === 'paid') {
            // Check manual payment log first
            if (artwork.payment_log?.payment_method === 'STRIPE') {
              paymentStatusText = 'PAID VIA STRIPE'
            } else if (artwork.payment_log?.payment_method === 'CASH') {
              paymentStatusText = 'PAID BY CASH'
            } else if (artwork.payment_log?.payment_method) {
              paymentStatusText = 'PAID BY OTHER'
            } else if (artwork.stripe_payment?.status === 'completed') {
              // No manual payment log, but has Stripe payment
              paymentStatusText = 'PAID VIA STRIPE'
            } else {
              paymentStatusText = 'PAID BY OTHER'
            }
          } else if (artwork.payment_status?.description?.includes('PAID')) {
            if (artwork.payment_log?.payment_method === 'STRIPE') {
              paymentStatusText = 'PAID VIA STRIPE'
            } else if (artwork.payment_log?.payment_method === 'CASH') {
              paymentStatusText = 'PAID BY CASH'
            } else if (artwork.stripe_payment?.status === 'completed') {
              paymentStatusText = 'PAID VIA STRIPE'
            } else {
              paymentStatusText = 'PAID BY OTHER'
            }
          }
          
          detailedArtworkList += `${artworkCode} (Round ${round}, Easel ${easel}) SOLD for $${artwork.current_bid} - Buyer has ${paymentStatusText}\n`
        } else {
          // This artwork had no bids
          detailedArtworkList += `${artworkCode} (Round ${round}, Easel ${easel}) NO BIDS\n`
        }
      })
      
      // Build single event link for all artworks
      const eventLink = `https://artb.art/event/${event.id}`
      
      // Payment method text based on event location
      let paymentMethodText = 'We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\n\nPayPal - email or handle\n\nZelle - email or phone'
      
      // Customize based on country/region - you can expand this logic
      if (cityName.toLowerCase().includes('toronto') || cityName.toLowerCase().includes('montreal')) {
        paymentMethodText = 'We send payments via Interac e-Transfer or PayPal. Please confirm one of the following, so we may get your payment sent promptly\n\nInterac e-Transfer - email address\n\nPayPal - email or handle'
      }
      
      // Generate subject line
      const subject = soldArtworks.length > 0 
        ? `Art Battle ${cityName} - Payment Information Required ($${artistShare} owed)`
        : `Art Battle ${cityName} - Thank you for participating!`
      
      // Build email body
      let emailBody = `Thank you for participating in Art Battle ${cityName}! `
      
      if (soldArtworks.length > 0) {
        emailBody += `Congratulations on the sale of your painting${soldArtworks.length > 1 ? 's' : ''}. We are thrilled that you were able to showcase your skills and share your art with our community.\n\n`
        
        emailBody += `We have provided a link to your paintings for your record or to share with others:\n\n${eventLink}\n\n${detailedArtworkList}\n`
        
        if (soldArtworks.length === 1) {
          emailBody += `Your painting sold for $${soldArtworks[0].sale_price}. You will receive 50% of the sale price, which comes to $${artistShare}.\n\n`
        } else {
          const salesText = soldArtworks.map((artwork, index) => 
            `your ${index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : 'fourth'} painting sold for $${artwork.sale_price}`
          ).join(', ')
          emailBody += `${salesText.charAt(0).toUpperCase() + salesText.slice(1)}. You will receive 50% of the sale price, which comes to $${artistShare}.\n\n`
        }
        
        // Add payment method instructions only if there are unpaid sales
        if (hasUnpaidSales) {
          emailBody += `${paymentMethodText}\n\n`
        }
        
        emailBody += `Please be aware that payments typically make their way to you within 7 to 10 days after the event. If you would like to change your payment method or if you have any questions, please let us know.\n\n`
      } else {
        emailBody += `Thank you for showcasing your artistic talents and contributing to the vibrant energy of our event.\n\n`
        emailBody += `We have provided a link to your paintings for your record or to share with others:\n\n${eventLink}\n\n${detailedArtworkList}\n`
      }
      
      emailBody += `Thank you for your participation in Art Battle ${cityName}. We look forward to seeing you back at the easel soon.\n\n`
      emailBody += `Best regards,\n\nArt Battle HQ\nArt Battle Artist Payments`
      
      emailContents.push({
        artistName,
        artistEmail,
        subject,
        emailBody,
        soldCount: soldArtworks.length,
        totalEarned: artistShare,
        artworkCodes: artworks.map(a => a.art_code).join(', ')
      })
    }

    // Generate text output
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    let textContent = `ARTIST EMAIL CONTENT FOR ${event.eid} - ${event.name}\n`
    textContent += `Generated: ${timestamp}\n`
    textContent += `${'='.repeat(80)}\n\n`
    
    emailContents.forEach((email, index) => {
      textContent += `ARTIST ${index + 1} of ${emailContents.length}\n`
      textContent += `Name: ${email.artistName}\n`
      textContent += `Email: ${email.artistEmail}\n`
      textContent += `Artworks: ${email.artworkCodes}\n`
      textContent += `Subject: ${email.subject}\n`
      textContent += `${'-'.repeat(60)}\n`
      textContent += `${email.emailBody}\n`
      textContent += `${'='.repeat(80)}\n\n`
    })

    return new Response(textContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain'
      }
    })

  } catch (error) {
    console.error('Artist email export error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})