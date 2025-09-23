// Automated Artist Payment Processing Edge Function
// Processes pending artist payments through Global Payments system
// Designed to run via cron job with pause/resume capability

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface ProcessingControl {
  system_enabled: boolean;
  global_payments_enabled: boolean;
  processing_batch_size: number;
  max_daily_payments: number;
  daily_payment_count: number;
}

interface PendingPayment {
  id: string;
  artist_profile_id: string;
  artist_name: string;
  artist_email: string;
  gross_amount: number;
  currency: string;
  description: string;
  stripe_recipient_id: string;
  payment_status: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🚀 Auto-process-artist-payments started');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get processing control configuration
    const { data: controlData, error: controlError } = await supabase
      .from('payment_processing_control')
      .select('*')
      .limit(1)
      .single();

    if (controlError || !controlData) {
      throw new Error('Payment processing control not found: ' + (controlError?.message || 'No data'));
    }

    const control: ProcessingControl = controlData;

    // Check if system is enabled
    if (!control.system_enabled) {
      console.log('⏸️ Payment processing is disabled');
      return new Response(JSON.stringify({
        success: true,
        message: 'Payment processing is currently disabled',
        processed_count: 0,
        status: 'disabled'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if Global Payments is enabled
    if (!control.global_payments_enabled) {
      console.log('⏸️ Global Payments processing is disabled');
      return new Response(JSON.stringify({
        success: true,
        message: 'Global Payments processing is currently disabled',
        processed_count: 0,
        status: 'disabled'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check daily limits
    if (control.daily_payment_count >= control.max_daily_payments) {
      console.log(`📊 Daily payment limit reached: ${control.daily_payment_count}/${control.max_daily_payments}`);
      return new Response(JSON.stringify({
        success: true,
        message: 'Daily payment limit reached',
        processed_count: 0,
        daily_count: control.daily_payment_count,
        daily_limit: control.max_daily_payments,
        status: 'limit_reached'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log('✅ Payment processing is enabled, checking for pending payments...');

    // Get pending payments that need processing
    // Focus on Global Payments system (artists with stripe_recipient_id)
    const { data: pendingPayments, error: paymentsError } = await supabase
      .rpc('get_pending_payments_for_processing', {
        batch_limit: control.processing_batch_size
      });

    if (paymentsError) {
      console.error('Error fetching pending payments:', paymentsError);
      throw new Error('Failed to fetch pending payments: ' + paymentsError.message);
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      console.log('📭 No pending payments found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending payments to process',
        processed_count: 0,
        status: 'no_payments'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`💳 Found ${pendingPayments.length} pending payments to process`);

    const processedPayments = [];
    const failedPayments = [];

    // Process each payment
    for (const payment of pendingPayments) {
      try {
        console.log(`Processing payment ${payment.id} for ${payment.artist_name} (${payment.gross_amount} ${payment.currency})`);

        // Check if artist has Global Payments account ready
        if (!payment.stripe_recipient_id) {
          console.log(`⚠️ Skipping ${payment.artist_name} - no Global Payments account`);
          failedPayments.push({
            ...payment,
            error: 'No Global Payments account setup',
            skipped: true
          });
          continue;
        }

        if (payment.payment_status !== 'ready') {
          console.log(`⚠️ Skipping ${payment.artist_name} - payment account not ready (${payment.payment_status})`);
          failedPayments.push({
            ...payment,
            error: `Payment account not ready: ${payment.payment_status}`,
            skipped: true
          });
          continue;
        }

        // Process payment through Global Payments system
        const { data: payoutResult, error: payoutError } = await supabase.functions.invoke('stripe-global-payments-payout', {
          body: {
            artist_profile_id: payment.artist_profile_id,
            amount: payment.gross_amount,
            currency: payment.currency,
            description: payment.description || `Automated payment for artwork sales`,
            artist_payment_id: payment.id
          }
        });

        if (payoutError) {
          console.error(`❌ Failed to process payment for ${payment.artist_name}:`, payoutError);
          failedPayments.push({
            ...payment,
            error: payoutError.message
          });
          continue;
        }

        console.log(`✅ Successfully processed payment for ${payment.artist_name}`);
        processedPayments.push({
          ...payment,
          payout_result: payoutResult
        });

      } catch (error) {
        console.error(`❌ Error processing payment ${payment.id}:`, error);
        failedPayments.push({
          ...payment,
          error: error.message
        });
      }
    }

    // Update processing control with results
    const newDailyCount = control.daily_payment_count + processedPayments.length;
    const { error: updateError } = await supabase
      .from('payment_processing_control')
      .update({
        last_processed_at: new Date().toISOString(),
        daily_payment_count: newDailyCount,
        metadata: {
          ...control.metadata,
          last_run_results: {
            processed_count: processedPayments.length,
            failed_count: failedPayments.length,
            timestamp: new Date().toISOString()
          }
        }
      })
      .eq('id', controlData.id);

    if (updateError) {
      console.error('Error updating processing control:', updateError);
    }

    const result = {
      success: true,
      message: `Processed ${processedPayments.length} payments, ${failedPayments.length} failed/skipped`,
      processed_count: processedPayments.length,
      failed_count: failedPayments.length,
      daily_count: newDailyCount,
      daily_limit: control.max_daily_payments,
      status: 'completed',
      processed_payments: processedPayments.map(p => ({
        id: p.id,
        artist_name: p.artist_name,
        amount: p.gross_amount,
        currency: p.currency
      })),
      failed_payments: failedPayments.map(p => ({
        id: p.id,
        artist_name: p.artist_name,
        amount: p.gross_amount,
        currency: p.currency,
        error: p.error,
        skipped: p.skipped || false
      }))
    };

    console.log('🎉 Auto-process-artist-payments completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Auto-process-artist-payments error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      processed_count: 0,
      failed_count: 0,
      status: 'error'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});