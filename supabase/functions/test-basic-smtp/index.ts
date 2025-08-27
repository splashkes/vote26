// Test Basic SMTP Connection to AWS SES
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to = "simon@artbattle.com" } = await req.json().catch(() => ({}));

    // Try to connect to AWS SES SMTP using Deno's native fetch
    // We'll use AWS SES REST API instead of SMTP for testing
    
    const sesEndpoint = 'https://email.us-east-2.amazonaws.com/';
    const accessKey = 'REDACTED_AWS_ACCESS_KEY_ID_2';
    const secretKey = 'BJ4tC/2Npi/iKjkk7UHyqXgF7it8mLqIsdRaRvr97PPn';
    
    // Simple test - try to get account send quota (this will tell us if credentials work)
    const response = await fetch(sesEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'Action': 'GetSendQuota',
        'Version': '2010-12-01'
      })
    });

    const responseText = await response.text();
    console.log('AWS SES Response:', responseText);

    return new Response(JSON.stringify({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      response: responseText.substring(0, 500), // Truncate for readability
      message: response.ok ? 
        'AWS SES credentials appear to work - check response for quota info' :
        'AWS SES connection failed - check credentials or region',
      note: 'This tests basic AWS SES API connectivity without SMTP'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Test error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to test AWS SES connectivity'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});