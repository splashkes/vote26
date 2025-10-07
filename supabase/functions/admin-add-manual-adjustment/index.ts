import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManualAdjustmentRequest {
  artist_profile_id: string;
  amount: number; // Positive for credits (owed TO artist), Negative for debits (paid OUT to artist)
  adjustment_type: 'credit' | 'debit';
  currency?: string;
  reason_category: 'prize' | 'private_event' | 'supplies_reimbursement' | 'adjustment' | 'other';
  description: string;
  reference?: string;
  payment_method?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is ABHQ admin
    const { data: adminCheck, error: adminError } = await supabaseClient
      .from('abhq_admin_users')
      .select('level, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (adminError || !adminCheck) {
      return new Response(
        JSON.stringify({ error: 'Access denied. ABHQ admin access required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const requestData: ManualAdjustmentRequest = await req.json();
    const {
      artist_profile_id,
      amount,
      adjustment_type,
      currency = 'USD',
      reason_category,
      description,
      reference,
      payment_method = 'manual_adjustment'
    } = requestData;

    // Validation
    if (!artist_profile_id || amount === undefined || amount === 0) {
      return new Response(
        JSON.stringify({ error: 'artist_profile_id and non-zero amount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!adjustment_type || !['credit', 'debit'].includes(adjustment_type)) {
      return new Response(
        JSON.stringify({ error: 'adjustment_type must be either "credit" or "debit"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!reason_category || !['prize', 'private_event', 'supplies_reimbursement', 'adjustment', 'other'].includes(reason_category)) {
      return new Response(
        JSON.stringify({ error: 'Invalid reason_category. Must be: prize, private_event, supplies_reimbursement, adjustment, or other' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!description || description.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'description is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get artist information
    const { data: artist, error: artistError } = await supabaseClient
      .from('artist_profiles')
      .select('id, name, email')
      .eq('id', artist_profile_id)
      .single();

    if (artistError || !artist) {
      return new Response(
        JSON.stringify({ error: `Artist not found: ${artistError?.message}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate the stored amount based on adjustment type
    // CREDIT: Negative amount (increases balance owed TO artist)
    // DEBIT: Positive amount (decreases balance owed, represents payment OUT)
    const storedAmount = adjustment_type === 'credit' ? -Math.abs(amount) : Math.abs(amount);

    // Create manual adjustment record
    const { data: adjustment, error: insertError } = await supabaseClient
      .from('artist_payments')
      .insert({
        artist_profile_id: artist_profile_id,
        gross_amount: storedAmount,
        net_amount: storedAmount,
        platform_fee: 0.00,
        stripe_fee: 0.00,
        currency: currency,
        status: 'paid', // Manual adjustments are immediately effective
        payment_type: 'manual',
        payment_method: payment_method,
        reason_category: reason_category,
        description: description,
        reference: reference || null,
        created_by: user.email || 'admin@artbattle.com',
        metadata: {
          adjustment_type: adjustment_type,
          original_amount_input: amount,
          created_via: 'admin-add-manual-adjustment',
          created_at: new Date().toISOString(),
          admin_user_id: user.id,
          admin_email: user.email
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create manual adjustment:', insertError);
      return new Response(
        JSON.stringify({
          error: 'Failed to create manual adjustment',
          details: insertError.message,
          hint: insertError.hint
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get updated balance for the artist
    const { data: balanceData, error: balanceError } = await supabaseClient
      .rpc('get_artists_owed')
      .eq('artist_id', artist_profile_id)
      .single();

    const currentBalance = balanceError ? null : balanceData?.estimated_balance || 0;

    // Log the action
    console.log(`Manual ${adjustment_type} created by ${user.email} for artist ${artist.name} (${artist_profile_id}): ${currency} ${amount} (${reason_category})`);

    return new Response(
      JSON.stringify({
        success: true,
        adjustment: {
          id: adjustment.id,
          artist_profile_id: artist_profile_id,
          artist_name: artist.name,
          adjustment_type: adjustment_type,
          amount: Math.abs(amount),
          stored_amount: storedAmount,
          currency: currency,
          reason_category: reason_category,
          description: description,
          reference: reference,
          created_by: user.email,
          created_at: adjustment.created_at,
          status: adjustment.status
        },
        current_balance: currentBalance,
        message: `Manual ${adjustment_type} of ${currency} ${Math.abs(amount)} created successfully for ${artist.name}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-add-manual-adjustment:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
