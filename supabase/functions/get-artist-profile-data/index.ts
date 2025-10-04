import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authentication required');
    }

    const requestBody = await req.json();
    const { artist_profile_id } = requestBody;

    if (!artist_profile_id) {
      throw new Error('artist_profile_id is required');
    }

    const now = new Date().toISOString();

    // Get invitations/confirmations/applications across ALL profiles with same person_id OR phone number (handles duplicate profiles)
    // First, get the phone number and person_id for this profile
    const { data: profileData, error: profileError } = await supabase
      .from('artist_profiles')
      .select('phone, person_id')
      .eq('id', artist_profile_id)
      .single();

    if (profileError) throw profileError;

    const profilePhone = profileData?.phone;
    const profilePersonId = profileData?.person_id;
    let invitationsRaw = [];
    let relatedProfileIds = []; // Declare at higher scope for use in confirmations

    // Collect all related profile IDs (same person_id OR same phone)
    const relatedProfileIdsSet = new Set([artist_profile_id]); // Start with current profile

    // Match by person_id (catches linked profiles)
    if (profilePersonId) {
      const { data: personProfiles, error: personError } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('person_id', profilePersonId);

      if (!personError && personProfiles) {
        personProfiles.forEach(p => relatedProfileIdsSet.add(p.id));
      }
    }

    // Match by phone number (catches unlinked duplicates)
    if (profilePhone) {
      const phoneDigitsOnly = profilePhone.replace(/\D/g, '');

      const { data: matchingProfiles, error: profilesError } = await supabase
        .from('artist_profiles')
        .select('id, phone')
        .filter('phone', 'not.is', null);

      if (!profilesError && matchingProfiles) {
        matchingProfiles
          .filter(p => p.phone && p.phone.replace(/\D/g, '') === phoneDigitsOnly)
          .forEach(p => relatedProfileIdsSet.add(p.id));
      }
    }

    relatedProfileIds = Array.from(relatedProfileIdsSet);

    // Get applications across ALL related profiles
    let applicationsRaw = [];
    if (relatedProfileIds.length > 0) {
      const { data: allApplications, error: appsError } = await supabase
        .from('artist_applications')
        .select('*')
        .in('artist_profile_id', relatedProfileIds)
        .order('applied_at', { ascending: false })
        .limit(10);

      if (appsError) throw appsError;
      applicationsRaw = allApplications || [];
    }

    // Get future event details for applications
    const applications = [];
    if (applicationsRaw) {
      for (const app of applicationsRaw) {
        if (app.event_id) {
          // Use proper foreign key relationship for applications
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('id, eid, name, event_start_datetime, event_end_datetime, venue, applications_open, cities(name)')
            .eq('id', app.event_id)
            .gte('event_start_datetime', now)
            .single();

          if (!eventError && eventData) {
            applications.push({
              ...app,
              event: {
                ...eventData,
                city: eventData.cities?.name || null
              }
            });
          }
        }
      }
    }

    // Get invitations for ALL related profiles
    if (relatedProfileIds.length > 0) {
      const { data: allInvitations, error: invitationsError } = await supabase
        .from('artist_invitations')
        .select('*')
        .in('artist_profile_id', relatedProfileIds)
        .eq('status', 'pending')
        .is('accepted_at', null)
        .order('created_at', { ascending: false });

      if (invitationsError) throw invitationsError;
      invitationsRaw = allInvitations || [];
    }

    // Deduplicate invitations by event_eid (keep most recent per event)
    const deduplicatedInvitations = [];
    const seenEvents = new Map();

    for (const invitation of invitationsRaw) {
      const existing = seenEvents.get(invitation.event_eid);
      if (!existing || new Date(invitation.created_at) > new Date(existing.created_at)) {
        seenEvents.set(invitation.event_eid, invitation);
      }
    }

    const uniqueInvitations = Array.from(seenEvents.values());

    // Get future event details for invitations
    const invitations = [];
    if (uniqueInvitations) {
      for (const invitation of uniqueInvitations) {
        if (invitation.event_eid && invitation.event_eid.trim()) {
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('id, eid, name, event_start_datetime, event_end_datetime, venue, applications_open, cities(name)')
            .eq('eid', invitation.event_eid)
            .gte('event_start_datetime', now)
            .single();

          if (!eventError && eventData) {
            invitations.push({
              ...invitation,
              event: {
                ...eventData,
                city: eventData.cities?.name || null
              }
            });
          }
        }
      }
    }

    // Get confirmations across ALL related profiles (same person_id OR phone number)
    // Use the same relatedProfileIds from invitations query above
    let confirmationsRaw = [];

    if (relatedProfileIds && relatedProfileIds.length > 0) {
      // Get confirmations for ALL related profiles
      const { data: allConfirmations, error: confirmationsError } = await supabase
        .from('artist_confirmations')
        .select('*')
        .in('artist_profile_id', relatedProfileIds)
        .eq('confirmation_status', 'confirmed')
        .order('created_at', { ascending: false });

      if (confirmationsError) throw confirmationsError;
      confirmationsRaw = allConfirmations || [];
    }

    // Deduplicate confirmations by event_eid (keep most recent per event)
    const deduplicatedConfirmations = [];
    const seenConfirmationEvents = new Map();

    for (const confirmation of confirmationsRaw) {
      const existing = seenConfirmationEvents.get(confirmation.event_eid);
      if (!existing || new Date(confirmation.created_at) > new Date(existing.created_at)) {
        seenConfirmationEvents.set(confirmation.event_eid, confirmation);
      }
    }

    const uniqueConfirmations = Array.from(seenConfirmationEvents.values());

    // Get future event details for confirmations
    const confirmations = [];
    if (uniqueConfirmations) {
      for (const confirmation of uniqueConfirmations) {
        if (confirmation.event_eid && confirmation.event_eid.trim()) {
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .select('id, eid, name, event_start_datetime, event_end_datetime, venue, applications_open, cities(name)')
            .eq('eid', confirmation.event_eid)
            .gte('event_start_datetime', now)
            .single();

          if (!eventError && eventData) {
            confirmations.push({
              ...confirmation,
              event: {
                ...eventData,
                city: eventData.cities?.name || null
              }
            });
          }
        }
      }
    }

    // Get sample works
    const { data: sampleWorks, error: worksError } = await supabase
      .from('artist_sample_works')
      .select('*')
      .eq('artist_profile_id', artist_profile_id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (worksError) throw worksError;

    // Check recent activity for payment banner eligibility (within 120 days)
    const oneHundredTwentyDaysAgo = new Date();
    oneHundredTwentyDaysAgo.setDate(oneHundredTwentyDaysAgo.getDate() - 120);

    const { data: recentConfirmations } = await supabase
      .from('artist_confirmations')
      .select('id, artist_number, created_at')
      .eq('artist_profile_id', artist_profile_id)
      .eq('confirmation_status', 'confirmed')
      .gte('created_at', oneHundredTwentyDaysAgo.toISOString());

    const { data: recentEventArtists } = await supabase
      .from('event_artists')
      .select('id, added_at')
      .eq('artist_id', artist_profile_id)
      .gte('added_at', oneHundredTwentyDaysAgo.toISOString());

    const hasRecentActivity = (recentConfirmations?.some(conf => conf.artist_number) || false) ||
                             (recentEventArtists?.length > 0 || false);

    return new Response(JSON.stringify({
      success: true,
      data: {
        applications: applications.slice(0, 5),
        invitations,
        confirmations,
        sampleWorks: sampleWorks || [],
        hasRecentActivity,
        stats: {
          total_applications: applicationsRaw?.length || 0,
          future_applications: applications.length,
          total_invitations: invitationsRaw?.length || 0,
          future_invitations: invitations.length,
          total_confirmations: confirmationsRaw?.length || 0,
          future_confirmations: confirmations.length
        }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in get-artist-profile-data:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});