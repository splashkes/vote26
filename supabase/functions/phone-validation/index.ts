import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

function buildBasicValidation(phoneNumber: string, degradedReason?: string) {
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${digitsOnly}`;

  return {
    valid: digitsOnly.length >= 10,
    phoneNumber: normalizedPhone,
    nationalFormat: phoneNumber,
    source: 'basic',
    confidence: 'low',
    degradedReason
  };
}

serve(async (req)=>{
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const rawBody = await req.text();
    if (!rawBody.trim()) {
      return new Response(JSON.stringify({
        error: 'Phone number is required',
        details: 'Empty request body'
      }), {
        status: 400,
        headers: jsonHeaders
      });
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (_error) {
      return new Response(JSON.stringify({
        error: 'Invalid JSON body',
        details: 'Request body must be valid JSON'
      }), {
        status: 400,
        headers: jsonHeaders
      });
    }

    const { phoneNumber, countryCode } = parsedBody;
    if (!phoneNumber) {
      return new Response(JSON.stringify({
        error: 'Phone number is required'
      }), {
        status: 400,
        headers: jsonHeaders
      });
    }
    // Get Twilio credentials from environment
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!twilioAccountSid || !twilioAuthToken) {
      // Fallback to basic validation if Twilio not configured
      return new Response(JSON.stringify(buildBasicValidation(
        phoneNumber,
        'twilio_credentials_missing'
      )), {
        status: 200,
        headers: jsonHeaders
      });
    }
    // Call Twilio Lookup API v2
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`;
    const params = new URLSearchParams({
      Fields: 'line_type_intelligence' // Removed 'validation' field that was causing issues
    });
    if (countryCode) {
      params.append('CountryCode', countryCode.toUpperCase());
    }
    console.log('🔍 Calling Twilio with:', {
      url: `${url}?${params}`,
      phoneNumber,
      countryCode
    });
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        'Accept': 'application/json'
      }
    });
    console.log('📞 Twilio response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Twilio error response:', errorText);

      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify(buildBasicValidation(
          phoneNumber,
          `twilio_lookup_auth_failed:${response.status}`
        )), {
          status: 200,
          headers: jsonHeaders
        });
      }

      throw new Error(`Twilio API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log('📞 Raw Twilio response:', JSON.stringify(data, null, 2));
    // Format response - use Twilio's top-level 'valid' field
    const result = {
      valid: data.valid || false,
      phoneNumber: data.phone_number || phoneNumber,
      nationalFormat: data.national_format,
      countryCode: data.country_code,
      carrierName: data.line_type_intelligence?.carrier_name,
      lineType: data.line_type_intelligence?.type,
      isMobile: data.line_type_intelligence?.type === 'mobile',
      validationErrors: [],
      source: 'twilio',
      confidence: 'high'
    };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: jsonHeaders
    });
  } catch (error) {
    console.error('Phone validation error:', error);
    return new Response(JSON.stringify({
      error: 'Phone validation failed',
      details: error.message
    }), {
      status: 500,
      headers: jsonHeaders
    });
  }
});
