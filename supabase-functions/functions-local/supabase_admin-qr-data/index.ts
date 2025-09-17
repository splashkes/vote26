// Edge Function: admin-qr-data
// Provides QR admin data for broadcast version admin functionality
// Accepts EID format and returns QR secrets and related data

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's JWT to verify their session
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    // Get user from JWT
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      console.error('[admin-qr-data] Invalid user token:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get EID from URL parameters
    const url = new URL(req.url)
    const eid = url.searchParams.get('eid')

    if (!eid) {
      return new Response(
        JSON.stringify({ error: 'EID parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-qr-data] User ${user.id} requesting QR data for EID: ${eid}`)

    // Parse JWT to get admin_events claim
    const token = authHeader.replace('Bearer ', '')
    let adminEvents = {}
    try {
      // Use crypto.subtle to decode base64 in Deno
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      const payloadB64 = parts[1]
      // Add padding if needed
      const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4)
      const payloadBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0))
      const payloadText = new TextDecoder().decode(payloadBytes)
      const payload = JSON.parse(payloadText)

      console.log('[admin-qr-data] JWT payload keys:', Object.keys(payload))
      console.log('[admin-qr-data] admin_events in payload:', !!payload.admin_events)

      adminEvents = payload.admin_events || {}
    } catch (e) {
      console.error('[admin-qr-data] Failed to parse JWT:', e)
      console.error('[admin-qr-data] Token first 50 chars:', token.substring(0, 50))
      return new Response(
        JSON.stringify({ error: 'Invalid JWT token', details: e.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has admin permissions for this event
    if (!adminEvents[eid]) {
      console.error(`[admin-qr-data] User ${user.id} lacks admin permissions for event ${eid}`)
      console.log('[admin-qr-data] Available admin events:', Object.keys(adminEvents))
      return new Response(
        JSON.stringify({ error: 'Insufficient admin permissions for this event' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[admin-qr-data] User has ${adminEvents[eid]} admin access for event ${eid}`)

    // Get event UUID from EID first
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, eid, name')
      .eq('eid', eid)
      .single()

    if (eventError || !eventData) {
      console.error(`[admin-qr-data] Event not found for EID ${eid}:`, eventError)
      return new Response(
        JSON.stringify({ error: 'Event not found', details: eventError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get active QR secret for this event
    const { data: qrData, error: qrError } = await supabase
      .from('event_qr_secrets')
      .select('secret_token, created_at, updated_at')
      .eq('event_id', eventData.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    if (qrError) {
      console.error(`[admin-qr-data] Error fetching QR secrets:`, qrError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch QR data', details: qrError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = {
      event: {
        eid: eventData.eid,
        name: eventData.name,
        uuid: eventData.id
      },
      qr_secret: qrData?.[0] || null,
      timestamp: new Date().toISOString()
    }

    console.log(`[admin-qr-data] Successfully retrieved data for ${eid}`)

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('[admin-qr-data] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})