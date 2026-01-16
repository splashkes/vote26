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
    console.log('=== ADMIN SEND INVITATION FUNCTION ===');
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get the user from auth header
    const authHeader = req.headers.get('Authorization');
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
        error: 'Invalid or expired token'
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
    if (adminError) {
      console.error('Error checking admin permissions:', adminError);
      return new Response(JSON.stringify({
        error: 'Failed to check admin permissions'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    if (!adminUser || ![
      'super',
      'producer',
      'photo'
    ].includes(adminUser.level)) {
      return new Response(JSON.stringify({
        error: 'Insufficient permissions. Only super admins, producers, and photo admins can send invitations.'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    let invitationData;
    try {
      invitationData = await req.json();
      console.log('Received invitation data:', invitationData);
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
    console.log('Validating fields:', {
      artist_number: invitationData.artist_number,
      event_eid: invitationData.event_eid,
      message_from_producer: invitationData.message_from_producer
    });
    if (!invitationData.artist_number || !invitationData.event_eid || !invitationData.message_from_producer) {
      const missing = [];
      if (!invitationData.artist_number) missing.push('artist_number');
      if (!invitationData.event_eid) missing.push('event_eid');
      if (!invitationData.message_from_producer) missing.push('message_from_producer');
      console.error('Missing required fields:', missing);
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
    // Check if invitation already exists
    const { data: existingInvitation } = await supabase.from('artist_invitations').select('id').eq('artist_number', invitationData.artist_number).eq('event_eid', invitationData.event_eid).maybeSingle();
    if (existingInvitation) {
      return new Response(JSON.stringify({
        error: `Artist ${invitationData.artist_number} has already been invited to ${invitationData.event_eid}. You cannot send duplicate invitations.`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }

    // Auto-lookup artist_profile_id from artist_number if not provided
    let profileId = invitationData.artist_profile_id;
    if (!profileId && invitationData.artist_number) {
      console.log('Looking up artist_profile_id for artist_number:', invitationData.artist_number);
      const { data: profile, error: profileError } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('entry_id', invitationData.artist_number)
        .maybeSingle();

      if (profile) {
        profileId = profile.id;
        console.log('Found artist_profile_id:', profileId);
      } else {
        console.warn('No artist profile found for artist_number:', invitationData.artist_number, profileError);
      }
    }

    // Create the invitation
    console.log('Creating invitation...');
    const { data: newInvitation, error: insertError } = await supabase.from('artist_invitations').insert({
      artist_number: invitationData.artist_number,
      event_eid: invitationData.event_eid,
      message_from_producer: invitationData.message_from_producer,
      artist_profile_id: profileId || null,
      status: 'pending',
      entry_date: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      metadata: {
        sent_by: user.email,
        sent_at: new Date().toISOString()
      }
    }).select().single();
    if (insertError) {
      console.error('Error creating invitation:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to create invitation',
        details: insertError.message
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    console.log('Invitation created successfully:', newInvitation);
    
    // Send invitation email
    let emailResult = { success: false, error: 'Email not attempted' };
    try {
      // Get artist profile and email data (using same pattern as accept-invitation)
      const { data: profileData } = await supabase
        .from('artist_profiles')
        .select('name, entry_id, person:people(email)')
        .eq('id', invitationData.artist_profile_id)
        .single();
      
      // Get event data
      const { data: eventData } = await supabase
        .from('events')
        .select('eid, name, event_start_datetime, venue, timezone_icann, cities(name)')
        .eq('eid', invitationData.event_eid)
        .single();

      if (profileData?.person?.email && eventData) {
        const { emailTemplates } = await import('../_shared/emailTemplates.ts');

        const emailData = emailTemplates.artistInvited({
          artistName: profileData.name || 'Artist',
          eventEid: eventData.eid,
          eventName: eventData.name || eventData.eid,
          eventStartDateTime: eventData.event_start_datetime,
          eventVenue: eventData.venue || 'TBD',
          cityName: eventData.cities?.name || 'Unknown',
          timezoneIcann: eventData.timezone_icann || undefined
        });
        
        // Send email using send-custom-email function
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
            from: 'artists@artbattle.com'
          })
        });
        
        emailResult = await emailResponse.json();
        if (emailResult.success) {
          console.log('Invitation email sent successfully to:', profileData.person.email);
        } else {
          console.error('Failed to send invitation email:', emailResult.error);
        }
      } else {
        console.log('No email available for artist profile:', invitationData.artist_profile_id);
        emailResult = { success: false, error: 'No email address found for artist' };
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      emailResult = { success: false, error: emailError.message };
    }
    
    return new Response(JSON.stringify({
      success: true,
      invitation: newInvitation,
      email: emailResult,
      message: `Invitation created for artist ${invitationData.artist_number} for event ${invitationData.event_eid}${emailResult.success ? ' and email sent' : ' but email failed'}`
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in admin-send-invitation function:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
