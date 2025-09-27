import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // ALWAYS set CORS headers for ANY response
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Wrap EVERYTHING in try-catch to ensure CORS headers are always returned
  try {
    // Create service role client for admin operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request parameters
    let event_id: string | null = null;
    let days_back = 30;
    let requestBody = null;

    try {
      requestBody = await req.json();
      event_id = requestBody.event_id;
      days_back = requestBody.days_back || 30;
    } catch {
      // Use defaults if no body
    }

    if (!event_id) {
      return new Response(JSON.stringify({
        error: 'event_id is required',
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'event-admin-payments',
          request_method: req.method,
          received_body: requestBody
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const debugInfo = {
      timestamp: new Date().toISOString(),
      function_name: 'event-admin-payments',
      request_method: req.method,
      event_id,
      days_back,
      has_request_body: !!requestBody,
      supabase_url: Deno.env.get('SUPABASE_URL') ?? 'missing',
      service_key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'present' : 'missing'
    };

    console.log(`Event admin payments: Getting data for event ${event_id}, ${days_back} days`);

    // Verify the user has access to this event
    // First get the user's phone from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Authorization header required',
        success: false,
        debug: debugInfo
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Create a client with the user's JWT for permission checking
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Get the user from JWT
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Invalid authentication',
        success: false,
        debug: { ...debugInfo, auth_error: userError?.message }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      });
    }

    // Check if user is super admin first (ABHQ admin), then check event admin
    let accessLevel = null;
    let accessType = null;
    let isSuperAdmin = false;

    // Check for ABHQ super admin access
    // ABHQ admins have login@artbattle.com or similar admin emails
    if (user.email === 'login@artbattle.com' || user.email?.endsWith('@artbattle.com')) {
      // Try the is_super_admin function as well to be thorough
      try {
        const { data: superAdminResult, error: superAdminError } = await serviceClient
          .rpc('is_super_admin');

        if (!superAdminError && superAdminResult) {
          isSuperAdmin = true;
        } else if (user.email === 'login@artbattle.com') {
          // Fallback: login@artbattle.com is always super admin
          isSuperAdmin = true;
        }
      } catch (e) {
        // If function fails, still allow login@artbattle.com
        if (user.email === 'login@artbattle.com') {
          isSuperAdmin = true;
        }
      }
    }

    if (isSuperAdmin) {
      accessLevel = 'super_admin';
      accessType = 'super_admin';
      console.log(`✅ User ${user.email} has ABHQ super admin access to all events`);
    } else {
      // Check if user is event admin for this specific event
      const { data: eventAdminCheck, error: adminError } = await serviceClient
        .from('event_admins')
        .select('admin_level')
        .eq('event_id', event_id)
        .eq('phone', user.phone)
        .single();

      if (adminError || !eventAdminCheck) {
        return new Response(JSON.stringify({
          error: 'Access denied: Not a super admin or event admin for this event',
          success: false,
          debug: {
            ...debugInfo,
            user_email: user.email,
            user_phone: user.phone,
            admin_check_error: adminError?.message,
            super_admin_error: superAdminError?.message,
            is_super_admin: isSuperAdmin,
            event_id: event_id
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        });
      }

      accessLevel = eventAdminCheck.admin_level;
      accessType = 'event_admin';
      console.log(`✅ User ${user.phone} has ${eventAdminCheck.admin_level} access to event ${event_id}`);
    }

    // Convert event_id (eid) to UUID if needed
    let event_uuid = event_id;

    // Check if event_id is an eid (like AB3044) and convert to UUID
    if (!event_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // This is an eid, look up the UUID
      const { data: eventLookup, error: lookupError } = await serviceClient
        .from('events')
        .select('id')
        .eq('eid', event_id)
        .single();

      if (lookupError || !eventLookup) {
        return new Response(JSON.stringify({
          error: `Event not found with eid: ${event_id}`,
          success: false,
          debug: {
            ...debugInfo,
            operation: 'event_lookup',
            lookup_error: lookupError?.message
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        });
      }

      event_uuid = eventLookup.id;
      console.log(`✅ Converted eid ${event_id} to UUID ${event_uuid}`);
    }

    // Now fetch event-specific payment data using our new functions

    // 1. Get event artists owed money
    const { data: eventArtistsOwed, error: owedError } = await serviceClient
      .rpc('get_event_artists_owed', { p_event_id: event_uuid });

    if (owedError) {
      return new Response(JSON.stringify({
        error: 'Failed to get event artists owed money',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_event_artists_owed',
          database_error: {
            message: owedError.message,
            code: owedError.code,
            details: owedError.details,
            hint: owedError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.event_artists_owed_count = eventArtistsOwed?.length || 0;
    console.log(`✅ Found ${eventArtistsOwed?.length} event artists owed money`);

    // Calculate currency totals for this event
    const eventCurrencyTotals = (eventArtistsOwed || []).reduce((totals, artist) => {
      const currency = artist.balance_currency || 'USD';
      const amount = Number(artist.estimated_balance) || 0;

      if (!totals[currency]) {
        totals[currency] = { count: 0, total: 0 };
      }

      totals[currency].count += 1;
      totals[currency].total += amount;

      return totals;
    }, {});

    debugInfo.event_currency_totals = eventCurrencyTotals;
    console.log(`💰 Event currency breakdown:`, eventCurrencyTotals);

    // 2. Get event ready to pay artists
    const { data: eventReadyToPay, error: readyError } = await serviceClient
      .rpc('get_event_ready_to_pay', { p_event_id: event_uuid });

    if (readyError) {
      return new Response(JSON.stringify({
        error: 'Failed to get event ready to pay artists',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_event_ready_to_pay',
          database_error: {
            message: readyError.message,
            code: readyError.code,
            details: readyError.details,
            hint: readyError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.event_ready_to_pay_count = eventReadyToPay?.length || 0;
    console.log(`✅ Found ${eventReadyToPay?.length} event ready to pay artists`);

    // 3. Get event payment attempts
    const { data: eventPaymentAttempts, error: attemptsError } = await serviceClient
      .rpc('get_event_payment_attempts', { p_event_id: event_uuid, p_days_back: days_back });

    if (attemptsError) {
      return new Response(JSON.stringify({
        error: 'Failed to get event payment attempts',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_event_payment_attempts',
          database_error: {
            message: attemptsError.message,
            code: attemptsError.code,
            details: attemptsError.details,
            hint: attemptsError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.event_payment_attempts_count = eventPaymentAttempts?.length || 0;
    console.log(`✅ Found ${eventPaymentAttempts?.length} event payment attempts`);

    // 4. Get event art status (sold vs paid)
    const { data: eventArtStatus, error: artStatusError } = await serviceClient
      .rpc('get_event_art_status', { p_event_id: event_uuid });

    if (artStatusError) {
      return new Response(JSON.stringify({
        error: 'Failed to get event art status',
        success: false,
        debug: {
          ...debugInfo,
          operation: 'get_event_art_status',
          database_error: {
            message: artStatusError.message,
            code: artStatusError.code,
            details: artStatusError.details,
            hint: artStatusError.hint
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    debugInfo.event_art_status_count = eventArtStatus?.length || 0;
    console.log(`✅ Found ${eventArtStatus?.length} event art pieces with status`);

    // 5. Get event payment summary (temporarily disabled due to function error)
    let eventSummary = null;
    try {
      const { data: summary, error: summaryError } = await serviceClient
        .rpc('get_event_payment_summary', { p_event_id: event_uuid });

      if (!summaryError) {
        eventSummary = summary;
        console.log(`✅ Retrieved event payment summary`);
      } else {
        console.log(`⚠️  Event payment summary failed, continuing without it:`, summaryError.message);
      }
    } catch (e) {
      console.log(`⚠️  Event payment summary error, continuing without it:`, e.message);
    }

    // Add processing debug info
    debugInfo.data_processing = {
      event_artists_owed_sample: eventArtistsOwed?.slice(0, 1) || [],
      event_ready_to_pay_sample: eventReadyToPay?.slice(0, 1) || [],
      event_payment_attempts_sample: eventPaymentAttempts?.slice(0, 1) || [],
      event_art_status_sample: eventArtStatus?.slice(0, 1) || [],
      event_summary: eventSummary?.[0] || null
    };

    // Format response in expected structure for frontend UI (event-scoped version)
    const response = {
      // Event information
      event_id: event_id,
      user_access_level: accessLevel,
      user_access_type: accessType,

      // Event artists owed money (currency-aware)
      event_artists_owing: eventArtistsOwed?.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: artist.payment_account_status,
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        balance_currency: artist.balance_currency || 'USD',
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: null,
        payment_history_summary: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          manual_count: 0
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests) || 0,
        is_recent_contestant: true, // They participated in this event
        currency_info: {
          primary_currency: artist.balance_currency || 'USD',
          has_mixed_currencies: false
        },
        invitation_info: artist.invitation_count > 0 ? {
          invitation_count: artist.invitation_count,
          latest_invitation_method: artist.latest_invitation_method,
          latest_invitation_date: artist.latest_invitation_date,
          time_since_latest: artist.time_since_latest
        } : null
      })) || [],

      // Event ready to pay artists
      event_artists_ready_to_pay: eventReadyToPay?.map(artist => ({
        artist_profiles: {
          id: artist.artist_id,
          name: artist.artist_name,
          email: artist.artist_email,
          phone: artist.artist_phone,
          entry_id: artist.artist_entry_id,
          country: artist.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: 'ready',
        stripe_recipient_id: artist.stripe_recipient_id,
        estimated_balance: Number(artist.estimated_balance),
        balance_currency: artist.balance_currency || 'USD',
        current_balance: Number(artist.estimated_balance),
        latest_payment_status: null,
        payment_history_summary: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          manual_count: 0
        },
        recent_city: artist.recent_city,
        recent_contests: Number(artist.recent_contests) || 0,
        is_recent_contestant: true,
        currency_info: {
          primary_currency: artist.default_currency || 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      // Event payment attempts (in progress)
      event_payment_attempts: eventPaymentAttempts?.map(attempt => ({
        artist_profiles: {
          id: attempt.artist_id,
          name: attempt.artist_name,
          email: attempt.artist_email,
          phone: attempt.artist_phone,
          entry_id: attempt.artist_entry_id,
          country: attempt.artist_country,
          person_id: null,
          created_at: null
        },
        payment_account_status: 'processing',
        stripe_recipient_id: attempt.stripe_recipient_id,
        estimated_balance: 0,
        current_balance: 0,
        latest_payment_status: attempt.payment_status,
        payment_id: attempt.payment_id,
        payment_amount: Number(attempt.payment_amount) || 0,
        payment_currency: attempt.payment_currency || 'USD',
        payment_method: attempt.payment_method,
        payment_type: attempt.payment_type,
        payment_date: attempt.payment_date,
        stripe_transfer_id: attempt.stripe_transfer_id,
        error_message: attempt.error_message,
        payment_history_summary: {
          pending: 0,
          processing: 1,
          completed: 0,
          failed: 0,
          manual_count: 0
        },
        recent_city: attempt.recent_city,
        recent_contests: 0,
        is_recent_contestant: true,
        currency_info: {
          primary_currency: attempt.payment_currency || 'USD',
          has_mixed_currencies: false
        },
        invitation_info: null
      })) || [],

      // Event art status (sold vs paid for reminder triggers)
      event_art_status: eventArtStatus?.map(art => ({
        art_id: art.art_id,
        art_code: art.art_code,
        artist_name: art.artist_name,
        artist_email: art.artist_email,
        title: art.title,
        current_bid: Number(art.current_bid) || 0,
        final_price: Number(art.final_price) || 0,
        art_status: art.art_status,
        currency: art.currency,
        sold_date: art.sold_date,
        payment_status: art.payment_status,
        payment_date: art.payment_date,
        days_since_sale: art.days_since_sale,
        needs_reminder: art.needs_reminder,
        needs_runner_up_offer: art.needs_runner_up_offer
      })) || [],

      // Event summary metrics
      event_summary: eventSummary?.[0] ? {
        event_name: eventSummary[0].event_name,
        event_currency: eventSummary[0].event_currency,
        total_art_pieces: eventSummary[0].total_art_pieces,
        sold_art_pieces: eventSummary[0].sold_art_pieces,
        paid_art_pieces: eventSummary[0].paid_art_pieces,
        unpaid_art_pieces: eventSummary[0].unpaid_art_pieces,
        total_sales_amount: Number(eventSummary[0].total_sales_amount) || 0,
        total_artist_earnings: Number(eventSummary[0].total_artist_earnings) || 0,
        total_payments_made: Number(eventSummary[0].total_payments_made) || 0,
        outstanding_artist_payments: Number(eventSummary[0].outstanding_artist_payments) || 0,
        artists_owed_count: eventSummary[0].artists_owed_count,
        artists_ready_to_pay_count: eventSummary[0].artists_ready_to_pay_count,
        payment_attempts_count: eventSummary[0].payment_attempts_count,
        currency_breakdown: eventSummary[0].currency_breakdown,
        event_currency_totals: eventCurrencyTotals,
        generated_at: new Date().toISOString()
      } : null,

      // Debug information
      debug: debugInfo,
      success: true
    };

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in event-admin-payments:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'event-admin-payments',
          error_type: error.constructor.name,
          error_message: error.message,
          stack: error.stack,
          name: error.name
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});