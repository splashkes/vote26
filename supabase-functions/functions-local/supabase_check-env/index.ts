import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const envCheck = {
    timestamp: new Date().toISOString(),
    stripe_keys: {
      STRIPE_SECRET_KEY: !!Deno.env.get('STRIPE_SECRET_KEY'),
      STRIPE_SECRET_KEY_CA: !!Deno.env.get('STRIPE_SECRET_KEY_CA'),
      STRIPE_SECRET_KEY_US: !!Deno.env.get('STRIPE_SECRET_KEY_US'),
      STRIPE_SECRET_KEY_GLOBAL: !!Deno.env.get('STRIPE_SECRET_KEY_GLOBAL'),
      STRIPE_SECRET_KEY_CANADA: !!Deno.env.get('STRIPE_SECRET_KEY_CANADA'),
      STRIPE_SECRET_KEY_INTERNATIONAL: !!Deno.env.get('STRIPE_SECRET_KEY_INTERNATIONAL')
    },
    all_env_vars: Object.keys(Deno.env.toObject()).filter(key =>
      key.includes('STRIPE') || key.includes('stripe')
    )
  };

  return new Response(
    JSON.stringify(envCheck, null, 2),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});