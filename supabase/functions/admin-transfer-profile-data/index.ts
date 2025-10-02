import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TransferResult {
  success: boolean;
  transferred: {
    art?: number;
    invitations?: number;
    applications?: number;
    confirmations?: number;
    stripe_accounts?: number;
    payments?: number;
  };
  errors: string[];
  warnings: string[];
}

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

    const { data: adminCheck } = await supabaseClient
      .from('abhq_admin_users')
      .select('level, active, email')
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
      primary_profile_id,
      secondary_profile_ids,
      transfer_options = {
        art: true,
        invitations: true,
        applications: true,
        confirmations: true,
        stripe_accounts: true,
        payments: false // Intentionally false by default - payments are sensitive
      },
      safety_checks = true
    } = await req.json();

    if (!primary_profile_id || !secondary_profile_ids || secondary_profile_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'primary_profile_id and secondary_profile_ids are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for transfers
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const result: TransferResult = {
      success: false,
      transferred: {},
      errors: [],
      warnings: []
    };

    // Safety Check 1: Verify primary profile exists and has person link
    const { data: primaryProfile, error: primaryError } = await serviceClient
      .from('artist_profiles')
      .select('id, name, person_id, people(id, name, phone, auth_user_id)')
      .eq('id', primary_profile_id)
      .single();

    if (primaryError || !primaryProfile) {
      result.errors.push('Primary profile not found');
      return new Response(
        JSON.stringify(result),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety Check 2: Primary must have person link (preferably with auth)
    if (safety_checks && !primaryProfile.person_id) {
      result.errors.push('Primary profile must be linked to a person record');
      result.warnings.push('Consider linking the profile to a person before transferring data');
      return new Response(
        JSON.stringify(result),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety Check 3: Warn if primary has no auth (can't login)
    if (safety_checks && primaryProfile.people && !primaryProfile.people.auth_user_id) {
      result.warnings.push('Primary profile person has no authentication - artist may not be able to login');
    }

    // Safety Check 4: Verify all secondary profiles exist
    const { data: secondaryProfiles, error: secondaryError } = await serviceClient
      .from('artist_profiles')
      .select('id, name, person_id')
      .in('id', secondary_profile_ids);

    if (secondaryError || !secondaryProfiles || secondaryProfiles.length !== secondary_profile_ids.length) {
      result.errors.push('One or more secondary profiles not found');
      return new Response(
        JSON.stringify(result),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Safety Check 5: Check for active Stripe payouts in progress
    if (transfer_options.stripe_accounts && safety_checks) {
      const { data: activePayouts } = await serviceClient
        .from('artist_payments')
        .select('id, status')
        .in('artist_profile_id', secondary_profile_ids)
        .in('status', ['pending', 'processing']);

      if (activePayouts && activePayouts.length > 0) {
        result.errors.push(`Found ${activePayouts.length} active payouts in progress - cannot transfer Stripe accounts`);
        result.warnings.push('Wait for pending payouts to complete before transferring Stripe accounts');
        return new Response(
          JSON.stringify(result),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Begin transfers - each in try/catch for granular error handling
    console.log(`Starting transfer to primary profile ${primary_profile_id} from ${secondary_profile_ids.length} secondaries`);

    // Transfer 1: Art pieces
    if (transfer_options.art) {
      try {
        const { error: artError, count } = await serviceClient
          .from('art')
          .update({ artist_id: primary_profile_id })
          .in('artist_id', secondary_profile_ids);

        if (artError) throw artError;
        result.transferred.art = count || 0;
        console.log(`Transferred ${count} art pieces`);
      } catch (err) {
        result.errors.push(`Art transfer failed: ${err.message}`);
      }
    }

    // Transfer 2: Invitations
    if (transfer_options.invitations) {
      try {
        const { error: invError, count } = await serviceClient
          .from('artist_invitations')
          .update({ artist_profile_id: primary_profile_id })
          .in('artist_profile_id', secondary_profile_ids);

        if (invError) throw invError;
        result.transferred.invitations = count || 0;
        console.log(`Transferred ${count} invitations`);
      } catch (err) {
        result.errors.push(`Invitation transfer failed: ${err.message}`);
      }
    }

    // Transfer 3: Applications
    if (transfer_options.applications) {
      try {
        const { error: appError, count } = await serviceClient
          .from('artist_applications')
          .update({ artist_profile_id: primary_profile_id })
          .in('artist_profile_id', secondary_profile_ids);

        if (appError) throw appError;
        result.transferred.applications = count || 0;
        console.log(`Transferred ${count} applications`);
      } catch (err) {
        result.errors.push(`Application transfer failed: ${err.message}`);
      }
    }

    // Transfer 4: Confirmations
    if (transfer_options.confirmations) {
      try {
        const { error: confError, count } = await serviceClient
          .from('artist_confirmations')
          .update({ artist_profile_id: primary_profile_id })
          .in('artist_profile_id', secondary_profile_ids);

        if (confError) throw confError;
        result.transferred.confirmations = count || 0;
        console.log(`Transferred ${count} confirmations`);
      } catch (err) {
        result.errors.push(`Confirmation transfer failed: ${err.message}`);
      }
    }

    // Transfer 5: Stripe Accounts (CRITICAL - most sensitive)
    if (transfer_options.stripe_accounts) {
      try {
        // Check if primary already has a Stripe account
        const { data: existingStripe } = await serviceClient
          .from('artist_global_payments')
          .select('id, stripe_recipient_id')
          .eq('artist_profile_id', primary_profile_id)
          .maybeSingle();

        if (existingStripe) {
          result.warnings.push('Primary profile already has a Stripe account - skipping Stripe transfer to avoid conflicts');
        } else {
          const { error: stripeError, count } = await serviceClient
            .from('artist_global_payments')
            .update({ artist_profile_id: primary_profile_id })
            .in('artist_profile_id', secondary_profile_ids);

          if (stripeError) throw stripeError;
          result.transferred.stripe_accounts = count || 0;
          console.log(`Transferred ${count} Stripe accounts`);
        }
      } catch (err) {
        result.errors.push(`Stripe account transfer failed: ${err.message}`);
      }
    }

    // Transfer 6: Payments (opt-in only - very sensitive)
    if (transfer_options.payments) {
      try {
        const { error: payError, count } = await serviceClient
          .from('artist_payments')
          .update({ artist_profile_id: primary_profile_id })
          .in('artist_profile_id', secondary_profile_ids);

        if (payError) throw payError;
        result.transferred.payments = count || 0;
        console.log(`Transferred ${count} payment records`);
      } catch (err) {
        result.errors.push(`Payment transfer failed: ${err.message}`);
      }
    }

    // Create audit log entry
    try {
      await serviceClient
        .from('admin_audit_log')
        .insert({
          admin_email: adminCheck.email,
          action: 'profile_data_transfer',
          target_type: 'artist_profile',
          target_id: primary_profile_id,
          details: {
            primary_profile_id,
            secondary_profile_ids,
            transferred: result.transferred,
            errors: result.errors,
            warnings: result.warnings
          }
        });
    } catch (auditErr) {
      console.error('Failed to create audit log:', auditErr);
      // Don't fail the whole operation for audit log failure
    }

    // Determine overall success
    result.success = result.errors.length === 0;

    const totalTransferred = Object.values(result.transferred).reduce((sum, count) => sum + count, 0);

    return new Response(
      JSON.stringify({
        ...result,
        message: result.success
          ? `Successfully transferred ${totalTransferred} items to primary profile`
          : `Transfer completed with ${result.errors.length} errors`,
        primary_profile: {
          id: primaryProfile.id,
          name: primaryProfile.name
        },
        admin_email: adminCheck.email,
        timestamp: new Date().toISOString()
      }),
      {
        status: result.success ? 200 : 207, // 207 Multi-Status if partial success
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Transfer function error:', error);
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