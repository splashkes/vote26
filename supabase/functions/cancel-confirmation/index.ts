import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { emailTemplates, formatEventDateTime } from '../_shared/emailTemplates.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper function to send Slack notifications
async function sendSlackNotification(supabase, messageType, text) {
  try {
    await supabase.rpc('queue_slack_notification', {
      p_channel_name: 'profile-debug',
      p_message_type: messageType,
      p_text: text,
      p_blocks: null,
      p_event_id: null
    });
  } catch (slackError) {
    console.error('Failed to queue slack notification:', slackError);
  }
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  const startTime = Date.now();
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    const body = await req.json();
    console.log('Cancel confirmation request body:', body);
    const { confirmation_id, reason } = body;
    // Add detailed validation with debug info
    if (!confirmation_id) {
      console.log('Missing confirmation_id in request:', body);
      return new Response(JSON.stringify({
        error: 'confirmation_id is required',
        success: false,
        debug: {
          received_body: body,
          confirmation_id_value: confirmation_id,
          confirmation_id_type: typeof confirmation_id,
          body_keys: Object.keys(body || {}),
          timestamp: new Date().toISOString()
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    console.log('Processing cancellation for confirmation:', confirmation_id);
    // Get confirmation details first (without the problematic join)
    const { data: confirmation, error: getError } = await supabase.from('artist_confirmations').select(`
        *,
        artist_profiles!inner (
          name,
          person_id
        )
      `).eq('id', confirmation_id).eq('confirmation_status', 'confirmed').single();
    if (getError || !confirmation) {
      return new Response(JSON.stringify({
        error: 'Confirmation not found or already withdrawn',
        success: false,
        debug: {
          confirmation_id: confirmation_id,
          get_error: getError,
          confirmation_found: !!confirmation,
          query_details: {
            table: 'artist_confirmations',
            filter_id: confirmation_id,
            filter_status: 'confirmed'
          },
          timestamp: new Date().toISOString()
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // Get event details separately using the event_eid
    const { data: eventData, error: eventError } = await supabase.from('events').select(`
        name,
        eid,
        event_start_datetime,
        venue,
        slack_channel,
        timezone_icann,
        cities!city_id(name),
        venues(name)
      `).eq('eid', confirmation.event_eid).single();
    // Combine the data
    const confirmationWithEvent = {
      ...confirmation,
      events: eventData
    };
    // Verify ownership - user must own this confirmation through their profile
    const { data: profileOwnership } = await supabase.from('artist_profiles').select('person_id').eq('id', confirmationWithEvent.artist_profile_id).single();
    
    // Extract person data from JWT claims (V2 auth system)
    let userPersonId = null;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        
        if (payload.auth_version === 'v2-http') {
          if (payload.person_pending === true) {
            throw new Error('User authentication is incomplete. Please sign in again.');
          }
          if (!payload.person_id) {
            throw new Error('No person data found in authentication token.');
          }
          userPersonId = payload.person_id;
        } else {
          throw new Error(`Unsupported auth version: ${payload.auth_version || 'unknown'}`);
        }
      }
    } catch (jwtError) {
      console.error('Failed to extract person data from JWT:', jwtError);
      throw new Error('User authentication is incomplete. Please sign in again.');
    }
    
    if (!userPersonId || profileOwnership?.person_id !== userPersonId) {
      throw new Error('Not authorized to cancel this confirmation');
    }
    // Update confirmation to withdrawn status
    const { data: updatedConfirmation, error: updateError } = await supabase.from('artist_confirmations').update({
      confirmation_status: 'withdrawn',
      withdrawn_at: new Date().toISOString(),
      withdrawal_reason: reason || 'No reason provided',
      updated_at: new Date().toISOString()
    }).eq('id', confirmation_id).select().single();
    if (updateError) {
      throw new Error(`Failed to cancel confirmation: ${updateError.message}`);
    }
    const duration = Date.now() - startTime;
    // Send email notification to artist
    try {
      // Get artist profile with email
      const { data: profileData } = await supabase.from('artist_profiles').select('name, person:people(email)').eq('id', confirmationWithEvent.artist_profile_id).single();
      if (profileData?.person?.email && confirmationWithEvent.events) {
        const emailData = emailTemplates.artistCancelled({
          artistName: profileData.name || 'Artist',
          eventEid: confirmationWithEvent.event_eid,
          eventName: confirmationWithEvent.events.name || confirmationWithEvent.event_eid,
          eventStartDateTime: confirmationWithEvent.events.event_start_datetime || '',
          eventVenue: confirmationWithEvent.events.venues?.name || confirmationWithEvent.events.venue || 'TBD',
          cityName: confirmationWithEvent.events.cities?.name || 'Unknown',
          timezoneIcann: confirmationWithEvent.events.timezone_icann || undefined
        });
        // Call send-custom-email function
        const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-custom-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: profileData.person.email,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text,
            from: 'hello@artbattle.com'
          })
        });
        const emailResult = await emailResponse.json();
        if (emailResult.success) {
          console.log('Cancellation email sent successfully to:', profileData.person.email);
        } else {
          console.error('Failed to send cancellation email:', emailResult.error);
        }
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError);
    // Don't fail the cancellation if email fails
    }
    // Send Slack notification about the cancellation
    const eventDate = confirmationWithEvent.events?.event_start_datetime
      ? formatEventDateTime(confirmationWithEvent.events.event_start_datetime, confirmationWithEvent.events.cities?.name || 'Unknown', confirmationWithEvent.events.timezone_icann || undefined)
      : 'Unknown date';
    // Create rich Slack blocks format matching current confirmation style
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚫 ${confirmationWithEvent.artist_profiles?.name} withdrew from ${confirmationWithEvent.event_eid}`,
          emoji: true
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Artist:*\n${confirmationWithEvent.artist_profiles?.name}`
          },
          {
            type: "mrkdwn",
            text: `*Artist #:*\n${confirmationWithEvent.artist_number}`
          },
          {
            type: "mrkdwn",
            text: `*Event:*\n${confirmationWithEvent.events?.name || confirmationWithEvent.event_eid}`
          },
          {
            type: "mrkdwn",
            text: `*Date:*\n${eventDate}`
          }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Withdrawal Reason:*\n${reason || '_No reason provided_'}`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Venue:* ${confirmationWithEvent.events?.venue || 'TBD'} • *City:* ${confirmationWithEvent.events?.cities?.name || 'Unknown'} • *Withdrawn:* ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`
          }
        ]
      }
    ];
    // Send the notification using the same format as other functions
    // Remove # from slack_channel if present
    const rawChannelName = confirmationWithEvent.events?.slack_channel || 'profile-debug';
    const channelName = rawChannelName.startsWith('#') ? rawChannelName.substring(1) : rawChannelName;
    const notificationText = `${confirmationWithEvent.artist_profiles?.name} withdrew from ${confirmationWithEvent.event_eid}`;
    await supabase.rpc('queue_slack_notification', {
      p_channel_name: channelName,
      p_message_type: 'confirmation_withdrawn',
      p_text: notificationText,
      p_blocks: blocks,
      p_event_id: null
    });
    console.log(`Confirmation withdrawn: ${confirmationWithEvent.artist_profiles?.name} from ${confirmationWithEvent.event_eid}`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Confirmation successfully withdrawn',
      confirmation: updatedConfirmation
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in cancel-confirmation:', error);
    // Detailed error response for debugging
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      debug: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name,
        stack: error.stack,
        function_name: 'cancel-confirmation'
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
