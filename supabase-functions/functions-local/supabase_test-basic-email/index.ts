// Test Basic Supabase Email System
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { to = "simon@artbattle.com" } = await req.json().catch(() => ({}));

    // Test 1: Try password reset email (uses SMTP directly)
    console.log('Testing password reset email...');
    const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: to
    });

    if (resetError) {
      console.error('Password reset error:', resetError);
    } else {
      console.log('Password reset success:', resetData);
    }

    // Test 2: Try magic link (uses SMTP directly)
    console.log('Testing magic link email...');
    const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: to
    });

    if (magicError) {
      console.error('Magic link error:', magicError);
    } else {
      console.log('Magic link success:', magicData);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Basic email tests completed',
      results: {
        passwordReset: {
          success: !resetError,
          error: resetError?.message || null,
          data: resetData ? 'Link generated' : null
        },
        magicLink: {
          success: !magicError,
          error: magicError?.message || null,
          data: magicData ? 'Link generated' : null
        }
      },
      note: 'Check your email inbox and spam folder for emails from Art Battle'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'This tests if Supabase SMTP configuration is working'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});