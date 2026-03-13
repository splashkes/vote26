import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const DEFAULT_REDIRECT_TO = 'https://artb.art/';

const buildEmailHtml = ({ code, link }: { code: string; link: string }) => `
  <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
    <h2 style="margin: 0 0 16px;">Your Art Battle sign-in code</h2>
    <p style="margin: 0 0 12px;">Use this code to finish signing in:</p>
    <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 12px 0 20px;">
      ${code}
    </div>
    <p style="margin: 0 0 12px;">Or open this direct sign-in link:</p>
    <p style="margin: 0 0 20px;">
      <a href="${link}" style="color: #0a66c2;">Sign in to Art Battle</a>
    </p>
    <p style="color: #666; font-size: 14px; margin: 0;">
      If you did not request this, you can ignore this email.
    </p>
  </div>
`;

const buildEmailText = ({ code, link }: { code: string; link: string }) => `
Your Art Battle sign-in code: ${code}

Direct sign-in link:
${link}

If you did not request this, you can ignore this email.
`.trim();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { email, redirectTo = DEFAULT_REDIRECT_TO } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Email is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid email address'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let linkType: 'magiclink' | 'signup' = 'magiclink';
    let linkResponse = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        redirectTo
      }
    });

    if (linkResponse.error) {
      linkType = 'signup';
      const signupPassword = crypto.randomUUID() + crypto.randomUUID();
      linkResponse = await supabase.auth.admin.generateLink({
        type: 'signup',
        email: normalizedEmail,
        password: signupPassword,
        options: {
          redirectTo,
          data: {
            source: 'broadcast-email-otp'
          }
        }
      });
    }

    if (linkResponse.error || !linkResponse.data?.properties?.email_otp || !linkResponse.data.properties.action_link) {
      throw new Error(linkResponse.error?.message || 'Failed to generate login code');
    }

    const emailPayload = {
      to: normalizedEmail,
      subject: 'Your Art Battle sign-in code',
      html: buildEmailHtml({
        code: linkResponse.data.properties.email_otp,
        link: linkResponse.data.properties.action_link
      }),
      text: buildEmailText({
        code: linkResponse.data.properties.email_otp,
        link: linkResponse.data.properties.action_link
      }),
      from: 'Art Battle <hello@artbattle.com>'
    };

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-custom-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify(emailPayload)
    });

    const emailResult = await emailResponse.json().catch(() => null);
    if (!emailResponse.ok || !emailResult?.success) {
      throw new Error(emailResult?.error || emailResult?.details || 'Failed to send login email');
    }

    return new Response(JSON.stringify({
      success: true,
      verificationType: linkType,
      email: normalizedEmail
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('broadcast-send-email-otp error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to send email OTP'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
