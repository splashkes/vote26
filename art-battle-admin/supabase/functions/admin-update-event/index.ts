import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EventRequest {
  id: string // Required for updates
  name: string
  eid: string
  description?: string
  venue?: string
  city_id?: string
  country_id?: string
  event_start_datetime: string
  event_end_datetime: string
  timezone_icann: string
  enabled?: boolean
  show_in_app?: boolean
  current_round?: number
  capacity?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting admin-update-event function...')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the user from auth header
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)
    
    if (!authHeader) {
      console.log('No authorization header found')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('Token length:', token.length)
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    console.log('Auth result:', { user: user ? { id: user.id, email: user.email } : null, authError })
    
    if (authError || !user?.email) {
      console.log('Auth failed:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', details: authError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin permissions
    console.log('Checking admin permissions for user:', user.email)
    
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle()

    console.log('Admin user query result:', { adminUser, adminError })

    if (adminError) {
      console.error('Error checking admin permissions:', adminError)
      return new Response(
        JSON.stringify({ error: 'Failed to check admin permissions', details: adminError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!adminUser) {
      return new Response(
        JSON.stringify({ error: `User ${user.email} is not found in admin users table.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    if (!['super', 'producer'].includes(adminUser.level)) {
      return new Response(
        JSON.stringify({ error: `User has level '${adminUser.level}' but needs 'super' or 'producer' to create events.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    let eventData: EventRequest
    try {
      eventData = await req.json()
      console.log('Received event data:', eventData)
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validate required fields
    console.log('Validating required fields...')
    if (!eventData.id || !eventData.name || !eventData.eid || !eventData.event_start_datetime || !eventData.event_end_datetime || !eventData.timezone_icann) {
      const missing = []
      if (!eventData.id) missing.push('id')
      if (!eventData.name) missing.push('name')
      if (!eventData.eid) missing.push('eid') 
      if (!eventData.event_start_datetime) missing.push('event_start_datetime')
      if (!eventData.event_end_datetime) missing.push('event_end_datetime')
      if (!eventData.timezone_icann) missing.push('timezone_icann')
      
      console.log('Missing required fields:', missing)
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validate EID format
    if (!eventData.eid.match(/^AB\d{4,}$/)) {
      return new Response(
        JSON.stringify({ error: 'EID must be in format AB#### (e.g., AB3000)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // For updates, we don't enforce minimum EID number for existing events
    // This allows editing of legacy events with EIDs under 3000

    // Check if event exists for update
    const { data: existingEvent, error: existError } = await supabase
      .from('events')
      .select('id, eid')
      .eq('id', eventData.id)
      .maybeSingle()

    if (existError) {
      console.error('Error checking existing event:', existError)
      return new Response(
        JSON.stringify({ error: 'Failed to find event for update' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!existingEvent) {
      return new Response(
        JSON.stringify({ error: `Event with ID ${eventData.id} not found.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check if EID is being changed and conflicts with another event
    if (existingEvent.eid !== eventData.eid) {
      const { data: eidConflict, error: eidError } = await supabase
        .from('events')
        .select('id')
        .eq('eid', eventData.eid)
        .neq('id', eventData.id)
        .maybeSingle()

      if (eidError) {
        console.error('Error checking EID conflict:', eidError)
        return new Response(
          JSON.stringify({ error: 'Failed to validate EID uniqueness' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
      }

      if (eidConflict) {
        return new Response(
          JSON.stringify({ error: `Event ID ${eventData.eid} already exists. Please choose a different EID.` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
    }

    const eid = eventData.eid

    // Update the event
    console.log('Attempting to update event with ID:', eventData.id, 'EID:', eid)
    
    // Convert datetime-local format to proper ISO timestamp
    const startDateTime = eventData.event_start_datetime.includes('T') 
      ? new Date(eventData.event_start_datetime).toISOString()
      : new Date(eventData.event_start_datetime + 'T00:00:00').toISOString()
      
    const endDateTime = eventData.event_end_datetime.includes('T')
      ? new Date(eventData.event_end_datetime).toISOString() 
      : new Date(eventData.event_end_datetime + 'T23:59:59').toISOString()

    const updateData = {
      eid,
      name: eventData.name,
      description: eventData.description || '',
      venue: eventData.venue || '',
      city_id: eventData.city_id || null,
      country_id: eventData.country_id || null,
      event_start_datetime: startDateTime,
      event_end_datetime: endDateTime,
      timezone_icann: eventData.timezone_icann,
      enabled: eventData.enabled ?? false,
      show_in_app: eventData.show_in_app ?? false,
      current_round: eventData.current_round ?? 0,
      capacity: eventData.capacity || 200,
      updated_at: new Date().toISOString()
    }

    console.log('Update data prepared:', updateData)

    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventData.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating event:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update event', details: updateError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Event updated successfully:', updatedEvent)

    return new Response(
      JSON.stringify({ 
        success: true, 
        event: updatedEvent,
        message: `Event "${eventData.name}" (${eid}) updated successfully` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-update-event function:', error)
    console.error('Error stack:', error.stack)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        stack: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})