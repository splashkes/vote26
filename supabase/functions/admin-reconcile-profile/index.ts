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
    // Create authenticated client
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

    const {
      phone_number,
      canonical_person_id,
      canonical_artist_profile_id,
      all_person_ids,
      all_artist_profile_ids
    } = await req.json();

    if (!canonical_person_id || !canonical_artist_profile_id) {
      return new Response(
        JSON.stringify({ error: 'Both canonical_person_id and canonical_artist_profile_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for admin operations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const errors: string[] = [];
    const changes = {
      artist_profiles_updated: 0,
      people_superseded: 0,
      artist_profiles_superseded: 0,
      auth_user_linked: false
    };

    // Step 1: Link canonical artist_profile to canonical person
    const { error: profileLinkError } = await serviceClient
      .from('artist_profiles')
      .update({ person_id: canonical_person_id })
      .eq('id', canonical_artist_profile_id);

    if (profileLinkError) {
      errors.push(`Failed to link canonical profile: ${profileLinkError.message}`);
    } else {
      changes.artist_profiles_updated++;
    }

    // Step 2: Transfer all other artist_profiles to canonical person
    const otherProfileIds = all_artist_profile_ids.filter((id: string) => id !== canonical_artist_profile_id);

    if (otherProfileIds.length > 0) {
      const { data: transferredProfiles, error: transferError } = await serviceClient
        .from('artist_profiles')
        .update({ person_id: canonical_person_id })
        .in('id', otherProfileIds)
        .select('id');

      if (transferError) {
        errors.push(`Failed to transfer profiles: ${transferError.message}`);
      } else {
        changes.artist_profiles_updated += (transferredProfiles?.length || 0);
      }
    }

    // Step 3: Mark non-canonical artist_profiles as superseded
    if (otherProfileIds.length > 0) {
      const { data: supersededProfiles, error: supersedError } = await serviceClient
        .from('artist_profiles')
        .update({ superseded_by: canonical_artist_profile_id })
        .in('id', otherProfileIds)
        .select('id');

      if (supersedError) {
        errors.push(`Failed to mark profiles as superseded: ${supersedError.message}`);
      } else {
        changes.artist_profiles_superseded = (supersededProfiles?.length || 0);
      }
    }

    // Step 4: Get canonical person to check if they already have auth_user_id
    const { data: canonicalPerson } = await serviceClient
      .from('people')
      .select('auth_user_id, phone')
      .eq('id', canonical_person_id)
      .single();

    let authUserId: string | null = canonicalPerson?.auth_user_id || null;

    // If canonical person doesn't have auth_user_id, try to find one
    if (!authUserId && phone_number) {
      // Normalize phone number to try multiple formats
      const cleanPhone = phone_number.replace(/[\s\-()]/g, '');
      const phoneVariants = [
        cleanPhone,
        `+${cleanPhone}`,
        `+1${cleanPhone}`,
        `1${cleanPhone}`
      ];

      // Check if auth.user exists for this phone
      const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
      const userWithPhone = existingUsers?.users.find(u =>
        phoneVariants.some(variant => u.phone === variant)
      );

      if (userWithPhone) {
        authUserId = userWithPhone.id;
      }
    }

    // Step 5: Link canonical person to auth.user
    if (authUserId && !canonicalPerson?.auth_user_id) {
      const { error: personAuthError } = await serviceClient
        .from('people')
        .update({ auth_user_id: authUserId })
        .eq('id', canonical_person_id);

      if (personAuthError) {
        errors.push(`Failed to link person to auth user: ${personAuthError.message}`);
      } else {
        changes.auth_user_linked = true;
      }
    } else if (authUserId && canonicalPerson?.auth_user_id) {
      // Already linked
      changes.auth_user_linked = true;
    } else if (phone_number) {
      errors.push(`No auth.user found for phone ${phone_number}. Person is ready - user just needs to sign in with OTP once to create account.`);
    }

    // Step 6: Clear auth_user_id from non-canonical people and mark as superseded
    const otherPersonIds = all_person_ids.filter((id: string) => id !== canonical_person_id);

    if (otherPersonIds.length > 0) {
      const { data: supersededPeople, error: peopleSupersedError } = await serviceClient
        .from('people')
        .update({
          auth_user_id: null,
          superseded_by: canonical_person_id
        })
        .in('id', otherPersonIds)
        .select('id');

      if (peopleSupersedError) {
        errors.push(`Failed to supersede people: ${peopleSupersedError.message}`);
      } else {
        changes.people_superseded = (supersededPeople?.length || 0);
      }
    }

    const success = errors.length === 0;

    return new Response(
      JSON.stringify({
        success,
        changes,
        errors: errors.length > 0 ? errors : undefined,
        message: success
          ? `Successfully reconciled profile. ${changes.artist_profiles_updated} profiles linked to canonical person, ${changes.people_superseded} people marked as superseded.`
          : 'Reconciliation completed with errors.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Reconcile function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.toString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
