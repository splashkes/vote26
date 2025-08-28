import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: `Method ${req.method} not allowed`,
      debug: {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Verify the token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check if the user is a super admin
    const { data: adminUser, error: adminError } = await supabase.from('abhq_admin_users').select('level').eq('email', user.email).eq('active', true).single();
    if (adminError || !adminUser || adminUser.level !== 'super') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Access denied: Super admin access required'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse the request body
    const { userId, email, newPassword } = await req.json();
    if (!userId || !email || !newPassword) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing userId, email, or newPassword'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Password must be at least 8 characters long'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Setting password for admin user: ${email} (ID: ${userId})`);
    // Get the user's auth ID from the abhq_admin_users table
    const { data: adminUserToUpdate, error: fetchError } = await supabase.from('abhq_admin_users').select('user_id, email').eq('id', userId).single();
    if (fetchError || !adminUserToUpdate) {
      console.error('Error fetching admin user:', fetchError);
      return new Response(JSON.stringify({
        success: false,
        error: 'User not found',
        debug: {
          timestamp: new Date().toISOString(),
          function_name: 'admin-set-password',
          step: 'fetch_admin_user',
          userId: userId,
          fetchError: fetchError,
          adminUserToUpdate: adminUserToUpdate,
          query_details: {
            table: 'abhq_admin_users',
            select_fields: 'user_id, email',
            filter_id: userId
          }
        }
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // If no user_id exists, we need to create the auth user first
    if (!adminUserToUpdate.user_id) {
      console.log('Creating auth user for admin user:', email);
      // Create the auth user
      const { data: authUser, error: createAuthError } = await supabase.auth.admin.createUser({
        email: email,
        password: newPassword,
        email_confirm: true // Auto-confirm the email
      });
      if (createAuthError || !authUser.user) {
        console.error('Error creating auth user:', createAuthError);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to create auth user: ${createAuthError?.message}`,
          debug: {
            timestamp: new Date().toISOString(),
            function_name: 'admin-set-password',
            step: 'create_auth_user',
            email: email,
            createAuthError: createAuthError,
            authUser_present: !!authUser,
            authUser_user_present: !!authUser?.user,
            create_user_params: {
              email: email,
              password_length: newPassword?.length,
              email_confirm: true
            }
          }
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Update the abhq_admin_users record with the new user_id
      const { error: updateError } = await supabase.from('abhq_admin_users').update({
        user_id: authUser.user.id,
        updated_at: new Date().toISOString()
      }).eq('id', userId);
      if (updateError) {
        console.error('Error updating abhq_admin_users with user_id:', updateError);
        // Try to cleanup the created auth user
        await supabase.auth.admin.deleteUser(authUser.user.id);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to link auth user: ${updateError.message}`
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log(`Successfully created auth user and set password for: ${email}`);
    } else {
      // Update existing auth user's password and confirm email
      const { error: passwordError } = await supabase.auth.admin.updateUserById(adminUserToUpdate.user_id, {
        password: newPassword,
        email_confirm: true
      });
      if (passwordError) {
        console.error('Error updating password:', passwordError);
        return new Response(JSON.stringify({
          success: false,
          error: `Failed to update password: ${passwordError.message}`
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log(`Successfully updated password for: ${email}`);
    }
    // Update the updated_at timestamp in abhq_admin_users
    const { error: updateTimestampError } = await supabase.from('abhq_admin_users').update({
      updated_at: new Date().toISOString()
    }).eq('id', userId);
    if (updateTimestampError) {
      console.warn('Error updating timestamp:', updateTimestampError);
    // Don't fail the operation for this
    }
    return new Response(JSON.stringify({
      success: true,
      message: `Password has been set successfully for ${email}`
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in admin-set-password function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'admin-set-password',
        error_type: error.constructor.name,
        error_message: error.message,
        stack: error.stack,
        // Include any relevant debug info that might help
        environment_check: {
          supabase_url_present: !!Deno.env.get('SUPABASE_URL'),
          service_key_present: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        }
      }
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
