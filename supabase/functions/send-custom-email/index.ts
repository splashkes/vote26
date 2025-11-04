// Custom Email via AWS SES REST API - Like Sendy
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
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const {
      to,
      subject = "Art Battle Notification",
      html,
      text,
      from = 'Art Battle Payments <payments@artbattle.com>',
      cc
    } = await req.json();

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: to, subject, and either html or text'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // AWS SES REST API credentials (same as Sendy)
    const AWS_ACCESS_KEY = 'REDACTED_AWS_ACCESS_KEY_ID';
    const AWS_SECRET_KEY = 'REDACTED_AWS_SECRET_ACCESS_KEY';
    const AWS_REGION = 'us-east-2';
    const SES_ENDPOINT = `https://email.${AWS_REGION}.amazonaws.com/`;

    // Create AWS signature
    const createSignature = async (method: string, url: string, headers: Record<string, string>, body: string) => {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);
      
      headers['host'] = `email.${AWS_REGION}.amazonaws.com`;
      headers['x-amz-date'] = amzDate;
      
      // Create canonical request
      const canonicalHeaders = Object.keys(headers)
        .sort()
        .map(key => `${key.toLowerCase()}:${headers[key]}\n`)
        .join('');
      
      const signedHeaders = Object.keys(headers)
        .sort()
        .map(key => key.toLowerCase())
        .join(';');
      
      // Hash the body
      const bodyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      const bodyHashHex = Array.from(new Uint8Array(bodyHash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      const canonicalRequest = [
        method,
        '/',
        '',
        canonicalHeaders,
        signedHeaders,
        bodyHashHex
      ].join('\n');
      
      // Create string to sign
      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${dateStamp}/${AWS_REGION}/ses/aws4_request`;
      const canonicalRequestHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest));
      const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        canonicalRequestHashHex
      ].join('\n');
      
      // Create signing key
      const getSignatureKey = async (key: string, dateStamp: string, regionName: string, serviceName: string) => {
        const kDate = await crypto.subtle.importKey('raw', new TextEncoder().encode('AWS4' + key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const kRegion = await crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.sign('HMAC', kDate, new TextEncoder().encode(dateStamp))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const kService = await crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.sign('HMAC', kRegion, new TextEncoder().encode(regionName))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const kSigning = await crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.sign('HMAC', kService, new TextEncoder().encode(serviceName))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const kFinal = await crypto.subtle.importKey('raw', new Uint8Array(await crypto.subtle.sign('HMAC', kSigning, new TextEncoder().encode('aws4_request'))), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return kFinal;
      };
      
      const signingKey = await getSignatureKey(AWS_SECRET_KEY, dateStamp, AWS_REGION, 'ses');
      const signature = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(stringToSign));
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      const authorizationHeader = `${algorithm} Credential=${AWS_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
      
      return { ...headers, 'Authorization': authorizationHeader };
    };

    // Prepare email content
    const emailContent = html || `<html><body><p>${text}</p></body></html>`;

    // Create SES SendEmail request
    const params = new URLSearchParams({
      'Action': 'SendEmail',
      'Source': from,
      'Destination.ToAddresses.member.1': to,
      'Message.Subject.Data': subject,
      'Message.Body.Html.Data': emailContent,
      'Message.Body.Text.Data': text || subject,
      'Version': '2010-12-01'
    });

    // Add CC addresses if provided
    if (cc) {
      const ccAddresses = Array.isArray(cc) ? cc : [cc];
      ccAddresses.forEach((ccEmail, index) => {
        params.set(`Destination.CcAddresses.member.${index + 1}`, ccEmail);
      });
    }

    const body = params.toString();
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
    };

    // Create AWS signature
    const signedHeaders = await createSignature('POST', SES_ENDPOINT, headers, body);

    // Send to AWS SES
    const response = await fetch(SES_ENDPOINT, {
      method: 'POST',
      headers: signedHeaders,
      body: body
    });

    const responseText = await response.text();
    console.log('AWS SES Response:', response.status, responseText);

    if (!response.ok) {
      throw new Error(`AWS SES API error: ${response.status} - ${responseText}`);
    }

    // Log the email for auditing
    try {
      await supabase.from('email_logs').insert({
        recipient: to,
        subject: subject,
        sender: from,
        sent_at: new Date().toISOString(),
        status: 'sent',
        method: 'aws_ses_api'
      });
    } catch (logError) {
      console.error('Failed to log email:', logError);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Email sent successfully via AWS SES REST API',
      details: {
        from,
        to,
        subject,
        method: 'aws_ses_api',
        timestamp: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in send-custom-email function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to send email via AWS SES REST API'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});