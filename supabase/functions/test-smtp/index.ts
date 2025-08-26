// Simple SMTP Test Function - Direct AWS SES
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

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

    const client = new SmtpClient();
    
    await client.connect({
      hostname: "email-smtp.us-east-2.amazonaws.com",
      port: 587,
      username: "REDACTED_AWS_ACCESS_KEY_ID_2",
      password: "BJ4tC/2Npi/iKjkk7UHyqXgF7it8mLqIsdRaRvr97PPn",
    });

    await client.send({
      from: "hello@artbattle.com",
      to: to,
      subject: "SMTP Test - You are invited!",
      content: "This is a simple SMTP test to verify the email system is working.",
      html: "<h2>🎨 SMTP Test - You are invited!</h2><p>This is a direct SMTP test email from Art Battle.</p><p>If you received this, the SMTP configuration is working correctly!</p>",
    });

    await client.close();

    return new Response(JSON.stringify({
      success: true,
      message: "SMTP test email sent successfully!",
      to: to
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});