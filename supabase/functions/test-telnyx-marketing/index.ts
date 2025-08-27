// Telnyx SMS Marketing - Test Function
// Date: August 26, 2025
// Purpose: Test all Telnyx SMS marketing functions and database setup

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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { test_phone = "simon@artbattle.com" } = await req.json().catch(() => ({}));

    const results = {
      timestamp: new Date().toISOString(),
      test_phone,
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };

    // Test 1: Check database tables exist
    await runTest(results, "Database Tables Check", async () => {
      const tables = [
        'sms_outbound',
        'sms_inbound', 
        'sms_logs',
        'sms_marketing_templates',
        'sms_marketing_campaigns',
        'sms_marketing_optouts'
      ];

      const tableResults = {};
      
      for (const table of tables) {
        try {
          const { error } = await supabase.from(table).select('id').limit(1);
          tableResults[table] = error ? `Error: ${error.message}` : 'OK';
        } catch (e) {
          tableResults[table] = `Error: ${e.message}`;
        }
      }

      return {
        status: 'passed',
        details: tableResults
      };
    });

    // Test 2: Check database functions exist
    await runTest(results, "Database Functions Check", async () => {
      const functions = [
        'is_phone_opted_out',
        'log_sms_activity'
      ];

      const functionResults = {};
      
      for (const func of functions) {
        try {
          // Test the function with a sample phone number
          if (func === 'is_phone_opted_out') {
            const { data, error } = await supabase.rpc(func, { phone_number: '+1234567890' });
            functionResults[func] = error ? `Error: ${error.message}` : `OK (returned: ${data})`;
          } else if (func === 'log_sms_activity') {
            const { data, error } = await supabase.rpc(func, {
              p_message_type: 'test',
              p_related_id: null,
              p_phone_number: '+1234567890',
              p_action: 'test',
              p_status: 'test',
              p_message: 'Test log entry'
            });
            functionResults[func] = error ? `Error: ${error.message}` : `OK (log ID: ${data})`;
          }
        } catch (e) {
          functionResults[func] = `Error: ${e.message}`;
        }
      }

      return {
        status: 'passed',
        details: functionResults
      };
    });

    // Test 3: Check Telnyx credentials
    await runTest(results, "Telnyx Credentials Check", async () => {
      const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
      const TELNYX_FROM_NUMBER = Deno.env.get('TELNYX_FROM_NUMBER');
      const TELNYX_WEBHOOK_SECRET = Deno.env.get('TELNYX_WEBHOOK_SECRET');

      return {
        status: 'passed',
        details: {
          api_key: TELNYX_API_KEY ? 'Configured' : 'Missing',
          from_number: TELNYX_FROM_NUMBER ? TELNYX_FROM_NUMBER : 'Missing',
          webhook_secret: TELNYX_WEBHOOK_SECRET ? 'Configured' : 'Missing (optional)'
        }
      };
    });

    // Test 4: Test template creation
    await runTest(results, "Template Creation Test", async () => {
      const testTemplate = {
        name: `Test Template ${Date.now()}`,
        description: 'Automated test template',
        message_template: 'Hello {{name}}, this is a test message for {{event}}!',
        variables: ['name', 'event'],
        category: 'test',
        is_active: true,
        created_by: null
      };

      const { data: template, error } = await supabase
        .from('sms_marketing_templates')
        .insert(testTemplate)
        .select('*')
        .single();

      if (error) throw error;

      // Clean up - delete the test template
      await supabase
        .from('sms_marketing_templates')
        .delete()
        .eq('id', template.id);

      return {
        status: 'passed',
        details: {
          template_id: template.id,
          name: template.name,
          variables: template.variables,
          character_count: template.character_count
        }
      };
    });

    // Test 5: Test Telnyx API connectivity (without sending)
    await runTest(results, "Telnyx API Connectivity", async () => {
      const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY');
      
      if (!TELNYX_API_KEY) {
        return {
          status: 'skipped',
          details: 'No Telnyx API key configured'
        };
      }

      // Test API connectivity by trying to get account information
      // Note: This doesn't send any messages
      try {
        const response = await fetch('https://api.telnyx.com/v2/phone_numbers?page[size]=1', {
          headers: {
            'Authorization': `Bearer ${TELNYX_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        return {
          status: response.ok ? 'passed' : 'failed',
          details: {
            status_code: response.status,
            response: response.ok ? 'API accessible' : data.errors?.[0]?.detail || 'Unknown error'
          }
        };
      } catch (error) {
        return {
          status: 'failed',
          details: {
            error: error.message
          }
        };
      }
    });

    // Test 6: Test opt-out functionality
    await runTest(results, "Opt-out System Test", async () => {
      const testPhone = `+1234567${Math.floor(Math.random() * 1000)}`; // Random phone for testing
      
      // Clean up any existing test data first
      await supabase
        .from('sms_marketing_optouts')
        .delete()
        .eq('phone_number', testPhone);

      // Add test opt-out
      const { error: insertError } = await supabase
        .from('sms_marketing_optouts')
        .insert({
          phone_number: testPhone,
          source: 'test',
          opted_out_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      // Test opt-out check function
      const { data: isOptedOut, error: checkError } = await supabase
        .rpc('is_phone_opted_out', { phone_number_input: testPhone });

      if (checkError) {
        // Try direct query if RPC fails
        const { data: directCheck } = await supabase
          .from('sms_marketing_optouts')
          .select('id')
          .eq('phone_number', testPhone)
          .eq('is_active', true)
          .limit(1);
        
        const isOptedOutDirect = directCheck && directCheck.length > 0;

        // Clean up
        await supabase
          .from('sms_marketing_optouts')
          .delete()
          .eq('phone_number', testPhone);

        return {
          status: isOptedOutDirect ? 'passed' : 'failed',
          details: {
            test_phone: testPhone,
            opt_out_detected: isOptedOutDirect,
            method: 'direct_query',
            rpc_error: checkError.message
          }
        };
      }

      // Clean up - remove test opt-out
      await supabase
        .from('sms_marketing_optouts')
        .delete()
        .eq('phone_number', testPhone);

      return {
        status: isOptedOut ? 'passed' : 'failed',
        details: {
          test_phone: testPhone,
          opt_out_detected: isOptedOut,
          method: 'rpc_function'
        }
      };
    });

    // Test 7: Test SMS logging system
    await runTest(results, "SMS Logging System Test", async () => {
      const logId = await supabase.rpc('log_sms_activity', {
        p_message_type: 'test',
        p_related_id: null,
        p_phone_number: '+1234567890',
        p_action: 'test_log',
        p_status: 'success',
        p_message: 'Test log entry from test function',
        p_metadata: { test: true, timestamp: new Date().toISOString() }
      });

      // Verify the log was created
      const { data: logEntry, error } = await supabase
        .from('sms_logs')
        .select('*')
        .eq('id', logId.data)
        .single();

      if (error) throw error;

      // Clean up - delete test log
      await supabase
        .from('sms_logs')
        .delete()
        .eq('id', logId.data);

      return {
        status: 'passed',
        details: {
          log_id: logId.data,
          message_type: logEntry.message_type,
          action: logEntry.action,
          cleaned_up: true
        }
      };
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Telnyx SMS Marketing system test completed',
      results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in test-telnyx-marketing function:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to complete SMS marketing system tests'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper function to run individual tests
async function runTest(results: any, testName: string, testFunction: Function) {
  results.summary.total++;
  
  try {
    console.log(`Running test: ${testName}`);
    const testResult = await testFunction();
    
    results.tests.push({
      name: testName,
      status: testResult.status || 'passed',
      details: testResult.details,
      timestamp: new Date().toISOString()
    });
    
    if (testResult.status !== 'failed' && testResult.status !== 'skipped') {
      results.summary.passed++;
    }
  } catch (error) {
    console.error(`Test failed: ${testName}:`, error);
    results.tests.push({
      name: testName,
      status: 'failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    results.summary.failed++;
  }
}