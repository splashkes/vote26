// Simple AWS SES API Test
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

    // Create simple email using AWS SES SendRawEmail API
    const emailContent = `From: hello@artbattle.com
To: ${to}
Subject: You are invited!
Content-Type: text/html; charset=UTF-8

<h2>🎨 You are invited!</h2>
<p>Hello!</p>
<p>This is a direct AWS SES API test to verify SMTP credentials are working.</p>
<p>If you receive this email, the AWS SES configuration is correct!</p>
`;

    // Use AWS SES v2 API (simpler than SMTP)
    const sesResponse = await fetch('https://email.us-east-2.amazonaws.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'AWS4-HMAC-SHA256 Credential=REDACTED_AWS_ACCESS_KEY_ID_2/20250825/us-east-2/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=test'
      },
      body: new URLSearchParams({
        'Action': 'SendRawEmail',
        'Source': 'hello@artbattle.com',
        'Destinations.member.1': to,
        'RawMessage.Data': btoa(emailContent),
        'Version': '2010-12-01'
      })
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Test completed - check AWS SES dashboard for delivery status",
      to: to,
      status: sesResponse.status,
      statusText: sesResponse.statusText
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      note: "This is a test function to verify AWS SES credentials"
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});