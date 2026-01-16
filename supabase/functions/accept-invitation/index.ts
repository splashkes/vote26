import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { emailTemplates } from '../_shared/emailTemplates.ts';
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
      return new Response(JSON.stringify({
        error: 'No authorization header',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'accept-invitation',
          auth_header_present: false
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'accept-invitation',
          auth_error: authError?.message,
          user_present: !!user
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    const body = await req.json();
    console.log('Accept invitation request body:', body);
    const { submissionData, invitationId } = body;
    if (!submissionData || !invitationId) {
      return new Response(JSON.stringify({
        error: 'submissionData and invitationId are required',
        success: false,
        debug: {
          received_body: body,
          has_submission_data: !!submissionData,
          has_invitation_id: !!invitationId,
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
    // Verify ownership - user must own the artist profile
    // Extract person data from JWT claims (V2 auth system)
    let userPersonId = null;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('JWT payload extracted:', {
          auth_version: payload.auth_version,
          person_id: payload.person_id,
          person_pending: payload.person_pending
        });
        
        if (payload.auth_version === 'v2-http') {
          if (payload.person_pending === true) {
            return new Response(JSON.stringify({
              error: 'User authentication is incomplete. Please sign in again.',
              success: false,
              debug: {
                user_id: user.id,
                person_pending: true,
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
      return new Response(JSON.stringify({
        error: 'User authentication is incomplete. Please sign in again.',
        success: false,
        debug: {
          user_id: user.id,
          jwt_error: jwtError.message,
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

    if (!userPersonId) {
      return new Response(JSON.stringify({
        error: 'User has no person_id in authentication token',
        success: false,
        debug: {
          user_id: user.id,
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

    // Verify profile ownership
    const { data: profileOwnership, error: ownershipError } = await supabase.from('artist_profiles').select('person_id').eq('id', submissionData.artistProfileId).single();
    if (ownershipError || !profileOwnership || profileOwnership.person_id !== userPersonId) {
      return new Response(JSON.stringify({
        error: 'Not authorized to accept invitation for this profile',
        success: false,
        debug: {
          user_person_id: userPersonId,
          profile_person_id: profileOwnership?.person_id,
          ownership_error: ownershipError?.message,
          artist_profile_id: submissionData.artistProfileId,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    // Check if already confirmed for this event
    const { data: existingConfirmation, error: checkError } = await supabase.from('artist_confirmations').select('id, event_eid, confirmation_status').eq('artist_profile_id', submissionData.artistProfileId).eq('event_eid', submissionData.eventEid).maybeSingle();
    if (checkError) {
      return new Response(JSON.stringify({
        error: 'Failed to check existing confirmations',
        success: false,
        debug: {
          check_error: checkError,
          artist_profile_id: submissionData.artistProfileId,
          event_eid: submissionData.eventEid,
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
    if (existingConfirmation && existingConfirmation.confirmation_status !== 'withdrawn') {
      return new Response(JSON.stringify({
        error: 'You have already accepted an invitation for this event',
        success: false,
        debug: {
          existing_confirmation_id: existingConfirmation.id,
          existing_status: existingConfirmation.confirmation_status,
          event_eid: submissionData.eventEid,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 409
      });
    }

    // Check if applications are still open for this event
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('applications_open')
      .eq('eid', submissionData.eventEid)
      .single();

    if (eventError) {
      return new Response(JSON.stringify({
        error: 'Failed to check event status',
        success: false,
        debug: {
          event_error: eventError,
          event_eid: submissionData.eventEid,
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

    if (!eventData || !eventData.applications_open) {
      return new Response(JSON.stringify({
        error: 'Applications for this event are now closed. You cannot accept this invitation.',
        success: false,
        debug: {
          event_eid: submissionData.eventEid,
          applications_open: eventData?.applications_open,
          timestamp: new Date().toISOString()
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    // Update artist profile with pronouns if provided
    if (submissionData.profileUpdates) {
      const { error: profileUpdateError } = await supabase.from('artist_profiles').update(submissionData.profileUpdates).eq('id', submissionData.artistProfileId);
      if (profileUpdateError) {
        return new Response(JSON.stringify({
          error: 'Failed to update profile: ' + profileUpdateError.message,
          success: false,
          debug: {
            profile_update_error: profileUpdateError,
            profile_updates: submissionData.profileUpdates,
            artist_profile_id: submissionData.artistProfileId,
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
    }
    // Create comprehensive confirmation entry
    const confirmationData = {
      artist_profile_id: submissionData.artistProfileId,
      event_eid: submissionData.eventEid,
      artist_number: submissionData.artistNumber,
      confirmation_status: 'confirmed',
      entry_date: new Date().toISOString(),
      form_19_entry_id: null,
      // Enhanced confirmation data
      legal_name: submissionData.confirmationData.legalName,
      social_promotion_consent: submissionData.confirmationData.socialPromotionConsent,
      social_usernames: submissionData.confirmationData.socialUsernames,
      message_to_organizers: submissionData.confirmationData.messageToOrganizers,
      public_message: submissionData.confirmationData.publicMessage,
      payment_method: submissionData.confirmationData.paymentMethod,
      payment_details: submissionData.confirmationData.paymentDetails,
      legal_agreements: submissionData.confirmationData.legalAgreements,
      promotion_artwork_url: submissionData.confirmationData.promotionArtworkUrl,
      metadata: {
        accepted_invitation_at: new Date().toISOString(),
        original_invitation_id: invitationId,
        accepted_via: 'artist_portal_enhanced_home',
        invited_artist_number: submissionData.invitedArtistNumber, // Track if invitation was for different profile
        confirmed_artist_number: submissionData.artistNumber // Track which profile actually confirmed
      }
    };
    const { data: newConfirmation, error: confirmError } = await supabase.from('artist_confirmations').insert(confirmationData).select().single();
    if (confirmError) {
      return new Response(JSON.stringify({
        error: 'Failed to create confirmation: ' + confirmError.message,
        success: false,
        debug: {
          confirm_error: confirmError,
          confirmation_data: confirmationData,
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
    // Update the invitation with accepted_at timestamp
    const { error: invitationUpdateError } = await supabase.from('artist_invitations').update({
      accepted_at: new Date().toISOString(),
      status: 'accepted'
    }).eq('id', invitationId);
    if (invitationUpdateError) {
      console.warn('Failed to update invitation accepted_at:', invitationUpdateError.message);
    // Continue anyway - the confirmation is created, which is the important part
    }

    // Add artist to event_artists table (required for payment processing and other systems)
    try {
      // Get event_id from event_eid
      const { data: eventForArtists, error: eventLookupError } = await supabase
        .from('events')
        .select('id')
        .eq('eid', submissionData.eventEid)
        .single();

      if (eventLookupError) {
        console.error('Failed to lookup event_id for event_artists:', eventLookupError);
      } else if (eventForArtists?.id) {
        // Check if artist already exists in event_artists
        const { data: existingEventArtist } = await supabase
          .from('event_artists')
          .select('id, status')
          .eq('event_id', eventForArtists.id)
          .eq('artist_id', submissionData.artistProfileId)
          .maybeSingle();

        if (existingEventArtist) {
          // Update existing record
          const { error: updateEventArtistError } = await supabase
            .from('event_artists')
            .update({
              status: 'confirmed',
              artist_number: submissionData.artistNumber,
              notes: 'Confirmed via invitation acceptance'
            })
            .eq('id', existingEventArtist.id);

          if (updateEventArtistError) {
            console.error('Failed to update event_artists:', updateEventArtistError);
          } else {
            console.log(`Updated event_artists record for artist ${submissionData.artistNumber} in event ${submissionData.eventEid}`);
          }
        } else {
          // Create new record
          const { error: insertEventArtistError } = await supabase
            .from('event_artists')
            .insert({
              event_id: eventForArtists.id,
              artist_id: submissionData.artistProfileId,
              status: 'confirmed',
              artist_number: submissionData.artistNumber,
              added_at: new Date().toISOString(),
              notes: 'Confirmed via invitation acceptance'
            });

          if (insertEventArtistError) {
            console.error('Failed to insert into event_artists:', insertEventArtistError);
          } else {
            console.log(`Added to event_artists: artist ${submissionData.artistNumber} for event ${submissionData.eventEid}`);
          }
        }
      }
    } catch (eventArtistError) {
      console.error('Error managing event_artists:', eventArtistError);
      // Don't fail the confirmation if event_artists fails
    }

    const duration = Date.now() - startTime;
    // Send email notification to artist
    try {
      // Get artist profile and event data for email
      const { data: profileData } = await supabase.from('artist_profiles').select('name, entry_id, person:people(email)').eq('id', submissionData.artistProfileId).single();
      const { data: eventData } = await supabase.from('events').select('eid, name, event_start_datetime, venue, timezone_icann, cities(name)').eq('eid', submissionData.eventEid).single();
      if (profileData?.person?.email && eventData) {
        const emailData = emailTemplates.artistConfirmed({
          artistName: profileData.name || submissionData.confirmationData.legalName || 'Artist',
          eventEid: eventData.eid,
          eventName: eventData.name || eventData.eid,
          eventStartDateTime: eventData.event_start_datetime,
          eventVenue: eventData.venue || 'TBD',
          cityName: eventData.cities?.name || 'Unknown',
          artistNumber: profileData.entry_id?.toString() || submissionData.artistNumber || 'TBD',
          timezoneIcann: eventData.timezone_icann || undefined
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
          console.log('Confirmation email sent successfully to:', profileData.person.email);
        } else {
          console.error('Failed to send confirmation email:', emailResult.error);
        }
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError);
    // Don't fail the confirmation if email fails
    }
    // Send Slack notification about the acceptance
    await sendSlackNotification(supabase, 'invitation_accepted', `✅ INVITATION ACCEPTED: ${submissionData.confirmationData.legalName} confirmed for ${submissionData.eventEid} (Artist #${submissionData.artistNumber})`);
    console.log(`Invitation accepted: ${submissionData.confirmationData.legalName} for ${submissionData.eventEid}`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Invitation accepted successfully',
      confirmation: newConfirmation,
      duration: duration
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in accept-invitation:', error);
    // Detailed error response for debugging
    return new Response(JSON.stringify({
      error: error.message,
      success: false,
      debug: {
        timestamp: new Date().toISOString(),
        error_type: error.constructor.name,
        stack: error.stack,
        function_name: 'accept-invitation'
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
