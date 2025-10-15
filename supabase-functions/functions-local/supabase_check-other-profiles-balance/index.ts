import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get auth token and verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Extract person data from JWT claims (V2 auth system)
    let personId = null;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));

        if (payload.auth_version === 'v2-http') {
          if (payload.person_pending === true) {
            return new Response(
              JSON.stringify({
                error: 'User profile not fully initialized',
                otherProfiles: [],
                hasOtherProfilesWithBalance: false
              }),
              {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              }
            )
          }
          if (!payload.person_id) {
            throw new Error('No person data found in authentication token.');
          }
          personId = payload.person_id;
        } else {
          throw new Error(`Unsupported auth version: ${payload.auth_version || 'unknown'}`);
        }
      }
    } catch (jwtError) {
      console.error('Failed to extract person data from JWT:', jwtError);
      return new Response(
        JSON.stringify({
          error: 'User profile not fully initialized',
          otherProfiles: [],
          hasOtherProfilesWithBalance: false
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!personId) {
      return new Response(
        JSON.stringify({
          error: 'No person_id found',
          otherProfiles: [],
          hasOtherProfilesWithBalance: false
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get the current primary profile
    const { data: primaryProfileData } = await supabase
      .rpc('get_primary_artist_profile', { p_person_id: personId })

    const currentProfileId = primaryProfileData?.[0]?.id;

    if (!currentProfileId) {
      return new Response(
        JSON.stringify({
          error: 'No current profile found',
          otherProfiles: [],
          hasOtherProfilesWithBalance: false
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get current profile's phone for matching
    const { data: currentProfile } = await supabase
      .from('artist_profiles')
      .select('phone, person_id')
      .eq('id', currentProfileId)
      .single();

    const profilePhone = currentProfile?.phone;
    const profilePersonId = currentProfile?.person_id;

    // Collect all related profile IDs (same person_id OR same phone)
    const relatedProfileIdsSet = new Set<string>();

    // Match by person_id (catches linked profiles)
    if (profilePersonId) {
      const { data: personProfiles } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('person_id', profilePersonId);

      if (personProfiles) {
        personProfiles.forEach(p => relatedProfileIdsSet.add(p.id));
      }
    }

    // Match by phone number (catches unlinked duplicates)
    if (profilePhone) {
      const phoneDigitsOnly = profilePhone.replace(/\D/g, '');

      const { data: matchingProfiles } = await supabase
        .from('artist_profiles')
        .select('id, phone')
        .filter('phone', 'not.is', null);

      if (matchingProfiles) {
        matchingProfiles
          .filter(p => p.phone && p.phone.replace(/\D/g, '') === phoneDigitsOnly)
          .forEach(p => relatedProfileIdsSet.add(p.id));
      }
    }

    // Remove current profile from the set
    relatedProfileIdsSet.delete(currentProfileId);

    const otherProfileIds = Array.from(relatedProfileIdsSet);

    if (otherProfileIds.length === 0) {
      return new Response(
        JSON.stringify({
          otherProfiles: [],
          hasOtherProfilesWithBalance: false,
          currentProfileId: currentProfileId
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // For each other profile, calculate outstanding balance
    const otherProfilesWithBalance = await Promise.all(
      otherProfileIds.map(async (profileId) => {
        const { data: profile } = await supabase
          .from('artist_profiles')
          .select('id, name, entry_id, email, phone, city, country, created_at')
          .eq('id', profileId)
          .single();

        if (!profile) return null;

        // Calculate outstanding balance using same logic as artist-get-my-profile
        const { data: artSales } = await supabase
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

        // Get artwork count
        const { count: artworkCount } = await supabase
          .from('art')
          .select('*', { count: 'exact', head: true })
          .eq('artist_id', profileId);

        // Get sample works
        const { data: sampleWorks } = await supabase
          .rpc('get_unified_sample_works', { profile_id: profileId });

        return {
          ...profile,
          outstandingBalance,
          artworkCount: artworkCount || 0,
          sampleWorks: sampleWorks || []
        };
      })
    );

    // Filter out null profiles and profiles with $0 balance
    const profilesWithMoney = otherProfilesWithBalance
      .filter(p => p !== null && p.outstandingBalance > 0);

    return new Response(
      JSON.stringify({
        otherProfiles: profilesWithMoney,
        hasOtherProfilesWithBalance: profilesWithMoney.length > 0,
        currentProfileId: currentProfileId,
        totalOtherBalance: profilesWithMoney.reduce((sum, p) => sum + p.outstandingBalance, 0)
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error in check-other-profiles-balance:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
