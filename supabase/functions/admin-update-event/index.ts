import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    console.log('Starting admin-update-event function...');
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get the user from auth header
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    if (!authHeader) {
      console.log('No authorization header found');
      return new Response(JSON.stringify({
        error: 'No authorization header'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    const token = authHeader.replace('Bearer ', '');
    console.log('Token length:', token.length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    console.log('Auth result:', {
      user: user ? {
        id: user.id,
        email: user.email
      } : null,
      authError
    });
    if (authError || !user?.email) {
      console.log('Auth failed:', authError);
      return new Response(JSON.stringify({
        error: 'Invalid or expired token',
        details: authError?.message
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    // Check admin permissions
    console.log('Checking admin permissions for user:', user.email);
    const { data: adminUser, error: adminError } = await supabase.from('abhq_admin_users').select('level').eq('email', user.email).eq('active', true).maybeSingle();
    console.log('Admin user query result:', {
      adminUser,
      adminError
    });
    if (adminError) {
      console.error('Error checking admin permissions:', adminError);
      return new Response(JSON.stringify({
        error: 'Failed to check admin permissions',
        details: adminError.message
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    if (!adminUser) {
      return new Response(JSON.stringify({
        error: `User ${user.email} is not found in admin users table.`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    if (![
      'super',
      'producer'
    ].includes(adminUser.level)) {
      return new Response(JSON.stringify({
        error: `User has level '${adminUser.level}' but needs 'super' or 'producer' to create events.`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    let eventData;
    try {
      eventData = await req.json();
      console.log('Received event data:', eventData);
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // Validate required fields
    console.log('Validating required fields...');
    if (!eventData.id || !eventData.name || !eventData.eid || !eventData.event_start_datetime || !eventData.event_end_datetime || !eventData.timezone_icann) {
      const missing = [];
      if (!eventData.id) missing.push('id');
      if (!eventData.name) missing.push('name');
      if (!eventData.eid) missing.push('eid');
      if (!eventData.event_start_datetime) missing.push('event_start_datetime');
      if (!eventData.event_end_datetime) missing.push('event_end_datetime');
      if (!eventData.timezone_icann) missing.push('timezone_icann');
      console.log('Missing required fields:', missing);
      return new Response(JSON.stringify({
        error: `Missing required fields: ${missing.join(', ')}`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // Validate EID format
    if (!eventData.eid.match(/^AB\d{4,}$/)) {
      return new Response(JSON.stringify({
        error: 'EID must be in format AB#### (e.g., AB2900)'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // For updates, we don't enforce minimum EID number for existing events
    // This allows editing of legacy events with EIDs under 3000
    // Check if event exists for update
    const { data: existingEvent, error: existError } = await supabase.from('events').select('id, eid').eq('id', eventData.id).maybeSingle();
    if (existError) {
      console.error('Error checking existing event:', existError);
      return new Response(JSON.stringify({
        error: 'Failed to find event for update'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    if (!existingEvent) {
      return new Response(JSON.stringify({
        error: `Event with ID ${eventData.id} not found.`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 404
      });
    }
    // Check if EID is being changed and conflicts with another event
    if (existingEvent.eid !== eventData.eid) {
      const { data: eidConflict, error: eidError } = await supabase.from('events').select('id').eq('eid', eventData.eid).neq('id', eventData.id).maybeSingle();
      if (eidError) {
        console.error('Error checking EID conflict:', eidError);
        return new Response(JSON.stringify({
          error: 'Failed to validate EID uniqueness'
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 500
        });
      }
      if (eidConflict) {
        return new Response(JSON.stringify({
          error: `Event ID ${eventData.eid} already exists. Please choose a different EID.`
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 400
        });
      }
    }
    const eid = eventData.eid;
    // Update the event
    console.log('Attempting to update event with ID:', eventData.id, 'EID:', eid);
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
        // Create date in the specified timezone using Intl.DateTimeFormat
        const [year, month, day, hour, minute, second] = dateTimeStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/).slice(1);
        
        // Create a date string that represents the local time in the target timezone
        // then convert to UTC ISO string
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
        const offsetTotalMinutes = (parseInt(offsetHours) * 60) + (parseInt(offsetMinutes) * (offsetHours.startsWith('-') ? -1 : 1));
        
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
    
    // Prepare update data for Supabase
    const updateData = {
      eid: eid,
      name: eventData.name,
      description: eventData.description || '',
      venue: eventData.venue || '',
      venue_id: eventData.venue_id || null,
      city_id: eventData.city_id || null,
      country_id: eventData.country_id || null,
      event_start_datetime: startTimestamp,
      event_end_datetime: endTimestamp,
      timezone_icann: eventData.timezone_icann,
      enabled: eventData.enabled ?? false,
      show_in_app: eventData.show_in_app ?? false,
      current_round: eventData.current_round ?? 0,
      eventbrite_id: eventData.eventbrite_id || null,
      slack_channel: eventData.slack_channel || null,
      ticket_link: eventData.ticket_link || null,
      ticket_price_notes: eventData.ticket_price_notes || null,
      meta_ads_budget: eventData.meta_ads_budget || null,
      other_ads_budget: eventData.other_ads_budget || null,
      event_folder_link: eventData.event_folder_link || null,
      target_artists_booked: eventData.target_artists_booked || null,
      wildcard_expected: eventData.wildcard_expected ?? false,
      expected_number_of_rounds: eventData.expected_number_of_rounds || null,
      artist_auction_portion: eventData.artist_auction_portion ?? 0.5,
      enable_auction: eventData.enable_auction ?? true,
      auction_start_bid: eventData.auction_start_bid || null,
      min_bid_increment: eventData.min_bid_increment || null,
      winner_prize: eventData.winner_prize || null,
      winner_prize_currency: eventData.winner_prize_currency || null,
      other_prizes: eventData.other_prizes || null,
      advances_to_event_eid: eventData.advances_to_event_eid || null,
      updated_at: new Date().toISOString()
    };

    console.log('Update data prepared:', { ...updateData, converted_times: { start: startTimestamp, end: endTimestamp }});
    
    // Use standard Supabase update with properly converted timestamps
    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventData.id)
      .select()
      .single();
    if (updateError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to update event', 
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-update-event',
          update_error: updateError.message,
          update_error_details: updateError.details,
          update_error_hint: updateError.hint,
          update_error_code: updateError.code,
          received_data: eventData,
          processed_timestamps: {
            start_datetime: startDateTime,
            end_datetime: endDateTime,
            timezone: eventData.timezone_icann
          },
          update_data_sent: updateData
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    console.log('Event updated successfully:', updatedEvent);
    return new Response(JSON.stringify({
      success: true,
      event: updatedEvent,
      message: `Event "${eventData.name}" (${eid}) updated successfully`
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in admin-update-event function:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
