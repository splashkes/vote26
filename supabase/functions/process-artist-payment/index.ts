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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const {
      artist_profile_id,
      amount,
      currency = 'USD',
      event_id = null,
      payment_type = 'automated',
      description = 'Artist payment'
    } = await req.json();

    if (!artist_profile_id || !amount) {
      return new Response(
        JSON.stringify({ error: 'artist_profile_id and amount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current admin user when a bearer token is available.
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user } } = token
      ? await supabaseClient.auth.getUser(token)
      : { data: { user: null } };
    const adminEmail = user?.email || 'admin@artbattle.com';

    // Get artist information
    const { data: artist, error: artistError } = await supabaseClient
      .from('artist_profiles')
      .select('name, email')
      .eq('id', artist_profile_id)
      .single();

    if (artistError || !artist) {
      throw new Error(`Artist not found: ${artistError?.message}`);
    }

    // Get artist's payment account info
    const { data: paymentAccount, error: paymentError } = await supabaseClient
      .from('artist_global_payments')
      .select('stripe_recipient_id, status, default_currency')
      .eq('artist_profile_id', artist_profile_id)
      .single();

    if (paymentError || !paymentAccount?.stripe_recipient_id) {
      throw new Error('Artist payment account not found or not set up');
    }

    if (paymentAccount.status !== 'ready') {
      throw new Error(`Artist payment account not ready for payments. Status: ${paymentAccount.status}`);
    }

    let representativeArt = null;

    if (event_id) {
      const { data: eventArt, error: eventArtError } = await supabaseClient
        .from('art')
        .select('id, art_code')
        .eq('event_id', event_id)
        .eq('artist_id', artist_profile_id)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (eventArtError) {
        throw new Error(`Failed to find event artwork: ${eventArtError.message}`);
      }

      if (!eventArt) {
        throw new Error('No paid artwork found for this artist in the selected event');
      }

      representativeArt = eventArt;
    }

    // Create payment record in artist_payments table
    const { data: paymentRecord, error: insertError } = await supabaseClient
      .from('artist_payments')
      .insert({
        artist_profile_id: artist_profile_id,
        art_id: representativeArt?.id || null,
        gross_amount: amount,
        net_amount: amount, // Full amount for automated payments
        platform_fee: 0.00,
        stripe_fee: 0.00, // Will be calculated by Stripe
        currency: currency,
        status: 'pending',
        payment_type: payment_type,
        description: description,
        metadata: {
          created_via: 'admin_panel',
          created_by: adminEmail,
          created_at: new Date().toISOString(),
          stripe_account_id: paymentAccount.stripe_recipient_id,
          event_id: event_id,
          representative_art_id: representativeArt?.id || null,
          representative_art_code: representativeArt?.art_code || null
        }
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create payment record: ${insertError.message}`);
    }

    // TODO: Integrate with Stripe transfer API
    // For now, we'll mark as pending and log the payment
    // In production, this would create a Stripe transfer to the artist's account

    console.log(`Payment created for artist ${artist.name} (${artist_profile_id}): ${currency} ${amount}`);

    // Update payment status to processing (would be done after successful Stripe transfer)
    const { error: updateError } = await supabaseClient
      .from('artist_payments')
      .update({
        status: 'processing',
        metadata: {
          ...paymentRecord.metadata,
          processed_at: new Date().toISOString(),
          note: 'Payment processed via admin panel - Stripe integration pending'
        }
      })
      .eq('id', paymentRecord.id);

    if (updateError) {
      console.error('Failed to update payment status:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: paymentRecord.id,
        amount: amount,
        currency: currency,
        artist_name: artist.name,
        status: 'processing',
        message: 'Payment created successfully and is being processed'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing artist payment:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process payment',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
