import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EventRequest {
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
  eventbrite_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting admin-create-event function...')
    
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
    if (!eventData.name || !eventData.eid || !eventData.event_start_datetime || !eventData.event_end_datetime || !eventData.timezone_icann) {
      const missing = []
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

    // Validate minimum EID number (AB3000)
    const eidNumber = parseInt(eventData.eid.slice(2))
    if (eidNumber < 3000) {
      return new Response(
        JSON.stringify({ error: 'EID must be AB3000 or higher' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if EID already exists
    const { data: existingEvent, error: existError } = await supabase
      .from('events')
      .select('id')
      .eq('eid', eventData.eid)
      .maybeSingle()

    if (existError) {
      console.error('Error checking existing EID:', existError)
      return new Response(
        JSON.stringify({ error: 'Failed to validate EID uniqueness' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (existingEvent) {
      return new Response(
        JSON.stringify({ error: `Event ID ${eventData.eid} already exists. Please choose a different EID.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const eid = eventData.eid

    // Create the event
    console.log('Attempting to create event with EID:', eid)
    
    // Convert datetime-local format to proper ISO timestamp
    const startDateTime = eventData.event_start_datetime.includes('T') 
      ? new Date(eventData.event_start_datetime).toISOString()
      : new Date(eventData.event_start_datetime + 'T00:00:00').toISOString()
      
    const endDateTime = eventData.event_end_datetime.includes('T')
      ? new Date(eventData.event_end_datetime).toISOString() 
      : new Date(eventData.event_end_datetime + 'T23:59:59').toISOString()

    const insertData = {
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
      eventbrite_id: eventData.eventbrite_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    console.log('Insert data prepared:', insertData)

    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating event:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create event', details: insertError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('Event created successfully:', newEvent)

    // Add the creating user as a producer admin for this event
    if (newEvent) {
      // First get the current user's events_access array
      const { data: currentAdmin, error: fetchAdminError } = await supabase
        .from('abhq_admin_users')
        .select('events_access')
        .eq('email', user.email)
        .single()

      if (fetchAdminError) {
        console.warn('Failed to fetch admin user for event access update:', fetchAdminError)
      } else if (currentAdmin) {
        // Add the new event ID to the events_access array
        const updatedAccess = [...(currentAdmin.events_access || []), newEvent.id]
        
        const { error: adminError } = await supabase
          .from('abhq_admin_users')
          .update({
            events_access: updatedAccess
          })
          .eq('email', user.email)

        if (adminError) {
          console.warn('Failed to add creator as admin for new event:', adminError)
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        event: newEvent,
        message: `Event "${eventData.name}" (${eid}) created successfully` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-create-event function:', error)
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