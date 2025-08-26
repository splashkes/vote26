// Send Email Edge Function
// Sends custom emails using Supabase's configured SMTP settings
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing Supabase configuration'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Parse request body
    const { 
      to, 
      subject, 
      html, 
      text,
      from = 'hello@artbattle.com' // Default sender
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid email address format'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use admin invite method only - this sends proper invitation emails
    let emailSent = false;
    let emailMethod = '';
    let emailData = null;
    let emailError = null;

    try {
      // First delete the user if they exist to allow re-invitation
      const { data: users } = await supabase.auth.admin.listUsers();
      const existingUser = users.users?.find(u => u.email === to);
      
      if (existingUser) {
        await supabase.auth.admin.deleteUser(existingUser.id);
        console.log(`Deleted existing user ${to} to allow re-invitation`);
      }
      
      // Send admin invitation which uses our SMTP and allows custom data
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(to, {
        redirectTo: 'https://artbattle.com',
        data: {
          custom_subject: subject,
          custom_message: html || text,
          notification_type: 'custom',
          sender: from
        }
      });
      
      if (!error) {
        emailSent = true;
        emailMethod = 'admin_invite';
        emailData = data;
        console.log(`Successfully sent invitation to ${to}`);
      } else {
        emailError = error;
        console.error('Admin invite failed:', error);
      }
    } catch (err) {
      emailError = err;
      console.error('Admin invite process failed:', err);
    }

    if (!emailSent) {
      console.error('Email send failed:', emailError);
      throw new Error(`Failed to send email: ${emailError?.message || 'Unknown error'}`);
    }

    // Log the email send for auditing
    try {
      await supabase.from('email_logs').insert({
        recipient: to,
        subject,
        sender: from,
        sent_at: new Date().toISOString(),
        status: 'sent',
        method: emailMethod
      });
    } catch (logError) {
      console.error('Failed to log email:', logError);
      // Don't fail the request for logging errors
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Email sent successfully via ${emailMethod}`,
      method: emailMethod,
      details: {
        from,
        to,
        subject,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in send-email function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});