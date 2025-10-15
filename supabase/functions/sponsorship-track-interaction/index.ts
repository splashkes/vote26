import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { hash, interactionType, packageId, metadata } = await req.json()

    if (!hash || !interactionType) {
      return new Response(
        JSON.stringify({ error: 'Hash and interactionType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get IP and user agent from request
    // Store full x-forwarded-for chain (comma-separated list)
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null
    const userAgent = req.headers.get('user-agent') || null

    const { data, error } = await supabaseClient.rpc('track_sponsorship_interaction', {
      p_invite_hash: hash,
      p_interaction_type: interactionType,
      p_package_id: packageId || null,
      p_metadata: metadata || {},
      p_ip_address: ipAddress,
      p_user_agent: userAgent
    })

    if (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
          success: false,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'sponsorship-track-interaction',
            error_type: error.constructor?.name || 'Error',
            error_message: error.message,
            error_details: error.details || null,
            error_hint: error.hint || null,
            error_code: error.code || null,
            input: {
              hash,
              interactionType,
              packageId,
              hasMetadata: !!metadata
            }
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send Slack notification for request_call interactions
    if (interactionType === 'request_call' && metadata) {
      try {
        const slackToken = Deno.env.get('SLACK_BOT_TOKEN')
        const slackChannel = Deno.env.get('SLACK_SPONSORSHIP_CHANNEL') || '#sponsor-inqiure'

        if (slackToken) {
          // Format the message with all details
          const {
            inviteData,
            selectedPackage,
            selectedAddons = [],
            selectedEvents = [],
            totalPrice,
            pricePerEvent,
            totalEvents,
            discount,
            phoneNumber,
            phoneNationalFormat
          } = metadata

          let messageText = `🔔 *Sponsorship Call Request*\n\n`
          messageText += `*Prospect:* ${inviteData?.prospect_company || inviteData?.prospect_name || 'Unknown'}\n`
          messageText += `*Event:* ${inviteData?.event_name || 'Unknown'} (${inviteData?.event_city || 'Unknown'})\n`
          messageText += `*Date:* ${inviteData?.event_start_datetime ? new Date(inviteData.event_start_datetime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown'}\n`
          messageText += `*Venue:* ${inviteData?.event_venue || 'Unknown'}\n\n`

          messageText += `*Package Selection:*\n`
          messageText += `• ${selectedPackage?.name || 'Unknown Package'} ($${selectedPackage?.base_price?.toLocaleString() || '0'})\n`

          if (selectedAddons.length > 0) {
            messageText += `*Add-ons:*\n`
            selectedAddons.forEach(addon => {
              messageText += `• ${addon.name} ($${addon.base_price?.toLocaleString() || '0'})\n`
            })
          }

          if (selectedEvents.length > 0) {
            messageText += `\n*Multi-Event Selection:*\n`
            messageText += `• Primary Event: ${inviteData?.event_name || 'Unknown'}\n`
            selectedEvents.forEach(event => {
              messageText += `• ${event.name}\n`
            })
            messageText += `\n*Total Events:* ${totalEvents}\n`
            if (discount) {
              messageText += `*Discount:* ${discount}% OFF\n`
            }
            messageText += `*Price Per Event:* $${pricePerEvent?.toLocaleString() || '0'}\n`
          }

          messageText += `\n*Total Price:* $${totalPrice?.toLocaleString() || '0'} ${selectedPackage?.currency || 'USD'}\n`
          messageText += `\n📞 *CALL THIS NUMBER:* ${phoneNationalFormat || phoneNumber || 'No phone provided'}\n`
          messageText += `*Email:* ${inviteData?.prospect_email || 'No email'}\n`

          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${slackToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              channel: slackChannel,
              text: messageText,
              unfurl_links: false,
              unfurl_media: false,
            }),
          })
        }
      } catch (slackError) {
        // Log Slack error but don't fail the interaction tracking
        console.error('Failed to send Slack notification:', slackError)
      }
    }

    return new Response(
      JSON.stringify({ success: true, interactionId: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'sponsorship-track-interaction',
          error_type: error.constructor?.name || 'Error',
          error_message: error.message,
          stack: error.stack
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
