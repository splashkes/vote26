import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create authenticated client to get user
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: req.headers.get('Authorization') ?? '',
          },
        },
      }
    );

    // Get user from JWT
    const { data: { user }, error: userError } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Authentication required',
        notes: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Decode JWT to get person_id
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const base64Payload = token.split('.')[1];
    const decodedPayload = JSON.parse(atob(base64Payload));
    const personId = decodedPayload.person_id;

    if (!personId) {
      return new Response(JSON.stringify({
        error: 'No person_id in token',
        notes: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // Create service role client for queries
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get primary artist profile using the authoritative selection function
    const { data: profileData, error: profileError } = await serviceClient
      .rpc('get_primary_artist_profile', { p_person_id: personId });

    if (profileError) {
      console.error('Error getting primary artist profile:', profileError);
      return new Response(JSON.stringify({
        error: 'Failed to get artist profile',
        notes: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    const artistProfile = profileData?.[0];

    if (!artistProfile) {
      return new Response(JSON.stringify({
        notes: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Determine country from artist profile
    const artistCountry = artistProfile.country || null;
    const hasAdminOverride = artistProfile.manual_payment_override || false;

    // Get dismissed notes for this user
    const { data: dismissedNotes } = await serviceClient
      .from('artist_note_dismissals')
      .select('note_id')
      .eq('person_id', personId);

    const dismissedNoteIds = new Set(dismissedNotes?.map(n => n.note_id) || []);

    const notes = [];

    // Note 1: Manual payment eligibility (check balance and event age) - PRIORITY: Show first
    if (!dismissedNoteIds.has('manual-payment-eligible-2025-10')) {
      // Get balance and currency using the DB function (based on event location)
      const { data: balanceData, error: balanceError } = await serviceClient
        .rpc('get_artist_balance_and_currency', { p_entry_id: artistProfile.entry_id });

      if (balanceError) {
        console.error('Error getting artist balance:', balanceError);
      }

      const balance = balanceData?.[0]?.balance || 0;
      const currency = balanceData?.[0]?.currency || 'USD';

      if (balance > 0) {
        // Get events from event_artists (actual participation, not just confirmations)
        const { data: eventArtists } = await serviceClient
          .from('event_artists')
          .select('event_id')
          .eq('artist_id', artistProfile.id);

        let events = [];
        if (eventArtists && eventArtists.length > 0) {
          const eventIds = eventArtists.map(ea => ea.event_id);
          const { data: eventData } = await serviceClient
            .from('events')
            .select('id, eid, name, event_start_datetime')
            .in('id', eventIds);
          events = eventData || [];
        }

        // If admin override is enabled, show note immediately (bypass age checks)
        if (hasAdminOverride) {
          notes.push({
            id: 'manual-payment-eligible-2025-10',
            variant: 'warning',
            title: 'Manual Payment Available',
            content: {
              type: 'manual-payment-request',
              balance: balance,
              currency: currency,
              country: artistCountry,
              events: events.map(e => ({
                id: e.id,
                eid: e.eid,
                name: e.name,
                date: e.event_start_datetime
              }))
            }
          });
        } else if (events.length > 0) {
          // Normal flow: check for events older than 2 days (TEMPORARY - was 14 days)
          const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

          const oldEvents = events.filter(e => {
            const eventDate = new Date(e.event_start_datetime);
            return eventDate < twoDaysAgo;
          });

          // Show manual payment option only if events are old enough
          if (oldEvents.length > 0) {
            notes.push({
              id: 'manual-payment-eligible-2025-10',
              variant: 'warning',
              title: 'Manual Payment Available',
              content: {
                type: 'manual-payment-request',
                balance: balance,
                currency: currency,
                country: artistCountry,
                events: oldEvents.map(e => ({
                  id: e.id,
                  eid: e.eid,
                  name: e.name,
                  date: e.event_start_datetime
                }))
              }
            });
          }
        }
      }
    }

    // Note 2: Payment options info (general info, show after urgent notes)
    if (!dismissedNoteIds.has('payment-options-info-2025-10')) {
      notes.push({
        id: 'payment-options-info-2025-10',
        variant: 'info',
        title: "We're Making Payment Improvements!",
        content: {
          type: 'structured',
          sections: [
            {
              text: 'There are several ways to receive payment for Art Battle auction sales and prizes:'
            },
            {
              type: 'timeline',
              items: [
                {
                  emoji: '⚡',
                  title: 'Fastest (2-4 days after event/sale)',
                  description: 'Add your bank account through our financial partner Stripe.',
                  action: { type: 'navigate', tab: 'payments', label: 'Set up now' }
                },
                {
                  emoji: '📧',
                  title: 'Standard (14-21 days after event/sale)',
                  description: 'Payment through Zelle (US), SWIFT transfer (EU/AU/NZ), PayPal (Global except CA), or Interac (CA)'
                },
                {
                  emoji: '🤝',
                  title: 'Manual (21+ days after event/sale)',
                  description: 'Payment from local producer (CashApp, cash, etc.) - available after 2 days (temporary)'
                }
              ]
            },
            {
              type: 'callout',
              color: 'blue',
              title: 'Why Stripe is fastest:',
              text: "It's more secure (your info never reaches our team via email), ensures the correct amount is sent every time, and processes automatically."
            },
            {
              type: 'callout',
              color: 'amber',
              title: "Don't see your balance?",
              text: '**If you believe you are owed money from participating in a recent event, but it does not show above, please contact artists@artbattle.com with your name, phone number, and most recent event city/date**'
            }
          ]
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        notes: notes
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in artist-get-notes:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        notes: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
