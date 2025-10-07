import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { emailTemplates } from '../_shared/emailTemplates.ts';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Create admin client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { artist_profile_id, event_id, application_message } = await req.json();
    console.log('Submit application request:', {
      artist_profile_id,
      event_id,
      message_length: application_message?.length
    });
    // Validate required fields
    if (!artist_profile_id || !event_id) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: artist_profile_id, event_id'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get artist profile data including email
    const { data: profileData, error: profileError } = await supabase.from('artist_profiles').select(`
        entry_id,
        name,
        person:people(email)
      `).eq('id', artist_profile_id).single();
    if (profileError) {
      console.error('Profile error:', profileError);
      return new Response(JSON.stringify({
        error: 'Failed to get artist profile: ' + profileError.message
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get event data with city information
    const { data: eventData, error: eventError } = await supabase.from('events').select(`
        eid,
        name,
        event_start_datetime,
        venue,
        cities(name)
      `).eq('id', event_id).single();
    if (eventError) {
      console.error('Event error:', eventError);
      return new Response(JSON.stringify({
        error: 'Failed to get event: ' + eventError.message
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Insert application - this should fire the trigger
    const { data: applicationData, error: applicationError } = await supabase.from('artist_applications').insert({
      artist_profile_id,
      event_id,
      application_status: 'pending',
      artist_number: profileData.entry_id?.toString(),
      event_eid: eventData.eid,
      message_to_producer: application_message || null,
      metadata: {
        applied_via: 'artist_portal_edge_function',
        applied_at: new Date().toISOString()
      }
    }).select().single();
    if (applicationError) {
      console.error('Application insert error:', applicationError);
      return new Response(JSON.stringify({
        error: 'Failed to submit application: ' + applicationError.message,
        code: applicationError.code
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Application submitted successfully:', applicationData.id);
    // Send email notification to artist
    const artistEmail = profileData.person?.email;
    if (artistEmail) {
      try {
        const emailData = emailTemplates.applicationReceived({
          artistName: profileData.name || 'Artist',
          eventEid: eventData.eid,
          eventName: eventData.name || eventData.eid,
          eventStartDateTime: eventData.event_start_datetime || '',
          eventVenue: eventData.venue || 'TBD',
          cityName: eventData.cities?.name || 'Unknown'
        });
        // Call send-custom-email function
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-custom-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            to: artistEmail,
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text,
            from: 'hello@artbattle.com'
          })
        });
        const emailResult = await emailResponse.json();
        if (emailResult.success) {
          console.log('Application email sent successfully to:', artistEmail);
        } else {
          console.error('Failed to send application email:', emailResult.error);
        }
      } catch (emailError) {
        console.error('Email sending error:', emailError);
      // Don't fail the application if email fails
      }
    } else {
      console.warn('No email address found for artist profile:', artist_profile_id);
    }
    return new Response(JSON.stringify({
      success: true,
      application_id: applicationData.id,
      message: 'Application submitted successfully'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Submit application error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
