// Generate QR Code Edge Function
// Creates new QR codes with 10-minute expiration and cleans up old codes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Extract secret token from URL path or request body
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    let secretToken = pathParts[pathParts.length - 1]

    // If not in path, try request body
    if (!secretToken || secretToken === 'generate-qr-code') {
      const body = await req.json().catch(() => ({}))
      secretToken = body.secret_token
    }

    if (!secretToken) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Secret token required',
          message: 'This QR display requires a secret token from the event admin panel'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get event ID from secret token
    const { data: eventData, error: eventError } = await supabase
      .rpc('get_event_from_qr_secret', { p_secret_token: secretToken })

    if (eventError) {
      console.error('Error getting event from secret:', eventError)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid secret token',
          message: 'The provided secret token is not valid. Please check with your event administrator.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!eventData) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Secret token not found or inactive',
          message: 'This secret token does not exist or has been deactivated. Please generate a new one from the admin panel.'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const eventId = eventData

    // Get event details
    const { data: event, error: eventFetchError } = await supabase
      .from('events')
      .select('id, name, venue')
      .eq('id', eventId)
      .single()

    if (eventFetchError) {
      console.error('Error fetching event:', eventFetchError)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Event fetch error',
          message: 'Unable to fetch event details: ' + eventFetchError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!event) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Event not found',
          message: 'The event associated with this secret token could not be found.'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cleanup expired QR codes (older than 90 seconds)
    const { error: cleanupError } = await supabase
      .rpc('cleanup_expired_qr_codes')

    if (cleanupError) {
      console.error('Error cleaning up expired codes:', cleanupError)
      // Continue anyway - cleanup failure shouldn't break generation
    }

    // Generate new QR code
    const qrCode = generateRandomCode()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000) // 10 minutes from now

    // Insert new QR code
    const { data: qrData, error: insertError } = await supabase
      .from('qr_codes')
      .insert({
        code: qrCode,
        event_id: eventId,
        generated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting QR code:', insertError)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to generate QR code',
          message: 'An internal error occurred while generating the QR code. Please try again.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get scan statistics
    const { data: scanStats, error: statsError } = await supabase
      .from('people_qr_scans')
      .select('id, is_valid')
      .eq('event_id', eventId)

    const totalScans = scanStats?.length || 0
    const validScans = scanStats?.filter(scan => scan.is_valid).length || 0

    return new Response(
      JSON.stringify({
        success: true,
        qr_code: qrCode,
        event: {
          id: event.id,
          name: event.name,
          venue: event.venue
        },
        generated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        scan_url: `https://artb.art/upgrade/${qrCode}`,
        stats: {
          total_scans: totalScans,
          valid_scans: validScans
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in generate-qr-code function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred. Please try again or contact support.',
        details: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Generate a random alphanumeric code
function generateRandomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}