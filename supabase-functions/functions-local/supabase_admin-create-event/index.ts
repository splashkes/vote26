import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting admin-create-event function...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the user from auth header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);

    if (!authHeader) {
      console.log('No authorization header found');
      return new Response(JSON.stringify({
        error: 'No authorization header'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Token length:', token.length);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    console.log('Auth result:', {
      user: user ? { id: user.id, email: user.email } : null,
      authError
    });

    if (authError || !user?.email) {
      console.log('Auth failed:', authError);
      return new Response(JSON.stringify({
        error: 'Invalid or expired token',
        details: authError?.message
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Check admin permissions
    console.log('Checking admin permissions for user:', user.email);
    const { data: adminUser, error: adminError } = await supabase
      .from('abhq_admin_users')
      .select('level')
      .eq('email', user.email)
      .eq('active', true)
      .maybeSingle();

    console.log('Admin user query result:', { adminUser, adminError });

    if (adminError) {
      console.error('Error checking admin permissions:', adminError);
      return new Response(JSON.stringify({
        error: 'Failed to check admin permissions',
        details: adminError.message
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    if (!adminUser) {
      return new Response(JSON.stringify({
        error: `User ${user.email} is not found in admin users table.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      });
    }

    if (!['super', 'producer'].includes(adminUser.level)) {
      return new Response(JSON.stringify({
        error: `User has level '${adminUser.level}' but needs 'super' or 'producer' to create events.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      });
    }

    // Parse request body
    let eventData;
    try {
      eventData = await req.json();
      console.log('Received event data:', eventData);
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Validate required fields
    console.log('Validating required fields...');
    if (!eventData.name || !eventData.eid || !eventData.event_start_datetime ||
        !eventData.event_end_datetime || !eventData.timezone_icann) {
      const missing = [];
      if (!eventData.name) missing.push('name');
      if (!eventData.eid) missing.push('eid');
      if (!eventData.event_start_datetime) missing.push('event_start_datetime');
      if (!eventData.event_end_datetime) missing.push('event_end_datetime');
      if (!eventData.timezone_icann) missing.push('timezone_icann');

      console.log('Missing required fields:', missing);
      return new Response(JSON.stringify({
        error: `Missing required fields: ${missing.join(', ')}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Validate EID format
    if (!eventData.eid.match(/^AB\d{4,}$/)) {
      return new Response(JSON.stringify({
        error: 'EID must be in format AB#### (e.g., AB2900)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Validate minimum EID number for new events
    const eidNumber = parseInt(eventData.eid.slice(2));
    if (eidNumber < 2900) {
      return new Response(JSON.stringify({
        error: 'Event Number (EID) must be AB2900 or higher for new events'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Check if EID already exists
    const { data: existingEvent, error: eidError } = await supabase
      .from('events')
      .select('id')
      .eq('eid', eventData.eid)
      .maybeSingle();

    if (eidError) {
      console.error('Error checking EID uniqueness:', eidError);
      return new Response(JSON.stringify({
        error: 'Failed to validate EID uniqueness'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    if (existingEvent) {
      return new Response(JSON.stringify({
        error: `Event ID ${eventData.eid} already exists. Please choose a different EID.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Convert datetime-local + timezone to proper timestamptz for PostgreSQL
    const convertToTimestampTz = (dateTimeStr: string, timezone: string): string => {
      if (!dateTimeStr) throw new Error('DateTime string is required');
      if (!timezone) throw new Error('Timezone is required');

      // Ensure proper format with seconds
      if (dateTimeStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
        dateTimeStr += ':00';
      } else if (!dateTimeStr.includes('T')) {
        dateTimeStr += 'T00:00:00';
      }

      try {
        // Create date in the specified timezone
        const [year, month, day, hour, minute, second] = dateTimeStr
          .match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)!.slice(1);

        const tempDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);

        // Get timezone offset for the target timezone at this date
        const formatter = new Intl.DateTimeFormat('en', {
          timeZone: timezone,
          timeZoneName: 'longOffset'
        });

        const offsetMatch = formatter.formatToParts(tempDate).find(part => part.type === 'timeZoneName');
        if (!offsetMatch) throw new Error(`Could not determine offset for timezone ${timezone}`);

        // Parse offset like "GMT-08:00" or "GMT+05:30"
        const offsetStr = offsetMatch.value.replace('GMT', '');
        const [offsetHours, offsetMinutes = '0'] = offsetStr.split(':');
        const offsetTotalMinutes = (parseInt(offsetHours) * 60) +
          (parseInt(offsetMinutes) * (offsetHours.startsWith('-') ? -1 : 1));

        // Adjust the date by the offset to get the correct UTC time
        const utcTime = new Date(tempDate.getTime() - (offsetTotalMinutes * 60 * 1000));
        return utcTime.toISOString();

      } catch (error) {
        console.error('Timezone conversion error:', error);
        throw new Error(`Failed to convert ${dateTimeStr} in timezone ${timezone}: ${error.message}`);
      }
    };

    const startTimestamp = convertToTimestampTz(eventData.event_start_datetime, eventData.timezone_icann);
    const endTimestamp = convertToTimestampTz(eventData.event_end_datetime, eventData.timezone_icann);

    // Prepare insert data for Supabase
    const insertData = {
      eid: eventData.eid,
      name: eventData.name,
      description: eventData.description || '',
      venue: eventData.venue || '',
      city_id: eventData.city_id || null,
      country_id: eventData.country_id || null,
      event_start_datetime: startTimestamp,
      event_end_datetime: endTimestamp,
      timezone_icann: eventData.timezone_icann,
      enabled: eventData.enabled ?? false,
      show_in_app: eventData.show_in_app ?? false,
      current_round: eventData.current_round ?? 0,
      capacity: eventData.capacity || 200,
      eventbrite_id: eventData.eventbrite_id || null,
      slack_channel: eventData.slack_channel || null,
      artist_auction_portion: eventData.artist_auction_portion ?? 0.5,
      currency: 'USD' // Default currency
    };

    console.log('Insert data prepared:', {
      ...insertData,
      converted_times: { start: startTimestamp, end: endTimestamp }
    });

    // Create the event
    const { data: newEvent, error: insertError } = await supabase
      .from('events')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating event:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to create event',
        success: false,
        details: insertError.message,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-create-event',
          insert_error: insertError.message,
          insert_error_details: insertError.details,
          insert_error_hint: insertError.hint,
          insert_error_code: insertError.code,
          received_data: eventData,
          processed_timestamps: {
            start_datetime: startTimestamp,
            end_datetime: endTimestamp,
            timezone: eventData.timezone_icann
          },
          insert_data_sent: insertData
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    console.log('Event created successfully:', newEvent.id);
    return new Response(JSON.stringify({
      success: true,
      message: 'Event created successfully',
      event: newEvent
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Unexpected error in admin-create-event:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message,
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'admin-create-event',
        error_message: error.message,
        error_stack: error.stack
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});