import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create authenticated client (will use user's permissions via RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // Verify user is admin
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin status
    const { data: adminCheck } = await supabaseClient
      .from('abhq_admin_users')
      .select('level, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, search_type = 'comprehensive' } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for comprehensive search
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let profileIds: string[] = [];

    // Determine search strategy based on query format
    const isPhone = /^\+?[\d\s\-()]+$/.test(query.trim());
    const isEmail = query.includes('@');

    if (isPhone) {
      // Phone search - try multiple formats
      const cleanPhone = query.replace(/[\s\-()]/g, '');
      const phoneVariants = [
        cleanPhone,
        `+${cleanPhone}`,
        `+1${cleanPhone}`,
        `1${cleanPhone}`
      ];

      // Search in people table
      const { data: peopleResults } = await serviceClient
        .from('people')
        .select('id')
        .or(phoneVariants.map(v => `phone.eq.${v}`).join(','));

      if (peopleResults && peopleResults.length > 0) {
        const personIds = peopleResults.map(p => p.id);

        // Find all artist profiles linked to these people
        const { data: linkedProfiles } = await serviceClient
          .from('artist_profiles')
          .select('id')
          .in('person_id', personIds);

        if (linkedProfiles) {
          profileIds.push(...linkedProfiles.map(p => p.id));
        }
      }

      // Also search directly in artist_profiles phone field
      const { data: profileResults } = await serviceClient
        .from('artist_profiles')
        .select('id')
        .or(phoneVariants.map(v => `phone.eq.${v}`).join(','));

      if (profileResults) {
        profileIds.push(...profileResults.map(p => p.id));
      }
    } else if (isEmail) {
      // Email search
      // Search in people table
      const { data: peopleResults } = await serviceClient
        .from('people')
        .select('id')
        .ilike('email', `%${query}%`);

      if (peopleResults && peopleResults.length > 0) {
        const personIds = peopleResults.map(p => p.id);

        const { data: linkedProfiles } = await serviceClient
          .from('artist_profiles')
          .select('id')
          .in('person_id', personIds);

        if (linkedProfiles) {
          profileIds.push(...linkedProfiles.map(p => p.id));
        }
      }

      // Search directly in artist_profiles
      const { data: profileResults } = await serviceClient
        .from('artist_profiles')
        .select('id')
        .ilike('email', `%${query}%`);

      if (profileResults) {
        profileIds.push(...profileResults.map(p => p.id));
      }
    } else {
      // Name search
      const { data: profileResults } = await serviceClient
        .from('artist_profiles')
        .select('id')
        .ilike('name', `%${query}%`);

      if (profileResults) {
        profileIds.push(...profileResults.map(p => p.id));
      }
    }

    // Remove duplicates
    profileIds = [...new Set(profileIds)];

    if (profileIds.length === 0) {
      return new Response(
        JSON.stringify({
          profiles: [],
          message: 'No profiles found matching query'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use analyze_artist_profiles_for_merge to get detailed info
    const { data: analysisData, error: analysisError } = await serviceClient
      .rpc('analyze_artist_profiles_for_merge', {
        profile_ids: profileIds
      });

    if (analysisError) {
      console.error('Analysis error:', analysisError);
      throw analysisError;
    }

    // Transform analysis data into UI-friendly format
    const profiles = await Promise.all(Object.entries(analysisData).map(async ([profileId, data]: [string, any]) => {
      const activityCounts = data.table_counts || {};
      const totalActivity = Object.values(activityCounts).reduce((sum: number, count: any) => sum + (count as number), 0);

      // Calculate outstanding balance from art sales
      const { data: artSales } = await serviceClient
        .from('art')
        .select('final_price, current_bid, status')
        .eq('artist_id', profileId)
        .in('status', ['sold', 'paid', 'closed']);

      const outstandingBalance = artSales?.reduce((sum, art) => {
        if (art.status === 'sold' || art.status === 'paid') {
          const salePrice = art.final_price || art.current_bid || 0;
          return sum + (salePrice * 0.5); // 50% artist commission
        }
        return sum;
      }, 0) || 0;

      // Get Stripe account details
      const { data: stripeAccount } = await serviceClient
        .from('artist_global_payments')
        .select('stripe_recipient_id, stripe_status, created_at')
        .eq('artist_profile_id', profileId)
        .maybeSingle();

      // Calculate priority score (matches playbook criteria)
      let priorityScore = 0;

      // Authentication capability (highest priority)
      if (data.person?.auth_user_id) {
        priorityScore += 5;
      }

      // Has phone (can be contacted/verified)
      if (data.person?.phone) {
        priorityScore += 2;
      }

      // Art sales (business priority)
      priorityScore += (activityCounts.art || 0) * 2;

      // Payments (shows financial activity)
      priorityScore += (activityCounts.artist_payments || 0) * 1.5;

      // Stripe account (payment readiness)
      if (activityCounts.artist_global_payments > 0) {
        priorityScore += 3;
      }

      // Recent activity
      const profileAge = new Date().getTime() - new Date(data.profile.created_at).getTime();
      const daysOld = profileAge / (1000 * 60 * 60 * 24);
      if (daysOld < 30) {
        priorityScore += 1;
      }

      return {
        id: profileId,
        name: data.profile.name,
        email: data.profile.email,
        phone: data.profile.phone,
        created_at: data.profile.created_at,
        superseded_by: data.profile.superseded_by || null,
        person: data.profile.person_id ? {
          id: data.profile.person_id,
          name: data.person?.name || null,
          email: data.person?.email || null,
          phone: data.person?.phone || null,
          auth_user_id: data.person?.auth_user_id || null,
          has_login: !!data.person?.auth_user_id,
          superseded_by: data.person?.superseded_by || null
        } : null,
        activity_counts: activityCounts,
        total_activity: totalActivity,
        priority_score: Math.round(priorityScore * 10) / 10,
        can_login: !!data.person?.auth_user_id,
        has_stripe: (activityCounts.artist_global_payments || 0) > 0,
        outstanding_balance: Math.round(outstandingBalance * 100) / 100,
        stripe_account: stripeAccount ? {
          stripe_recipient_id: stripeAccount.stripe_recipient_id,
          stripe_status: stripeAccount.stripe_status,
          created_at: stripeAccount.created_at
        } : null
      };
    }));

    // Sort by priority score descending
    profiles.sort((a, b) => b.priority_score - a.priority_score);

    // Identify potential duplicates (same person_id or very similar profiles)
    const groupedByPerson: { [key: string]: any[] } = {};
    const orphanProfiles: any[] = [];

    profiles.forEach(profile => {
      if (profile.person?.id) {
        if (!groupedByPerson[profile.person.id]) {
          groupedByPerson[profile.person.id] = [];
        }
        groupedByPerson[profile.person.id].push(profile);
      } else {
        orphanProfiles.push(profile);
      }
    });

    const duplicateGroups = Object.entries(groupedByPerson)
      .filter(([_, profiles]) => profiles.length > 1)
      .map(([personId, profiles]) => ({
        person_id: personId,
        person_name: profiles[0].person.name,
        profile_count: profiles.length,
        profiles: profiles,
        recommended_primary: profiles[0] // Highest priority
      }));

    return new Response(
      JSON.stringify({
        success: true,
        query: query,
        search_type: isPhone ? 'phone' : isEmail ? 'email' : 'name',
        total_profiles: profiles.length,
        profiles: profiles,
        duplicate_groups: duplicateGroups,
        orphan_profiles: orphanProfiles,
        has_duplicates: duplicateGroups.length > 0 || orphanProfiles.length > 0
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Search function error:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});