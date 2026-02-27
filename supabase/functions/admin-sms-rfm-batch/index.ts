// SMS Promotion System - Batch RFM Processing
// Date: August 27, 2025
// Purpose: Async batch processing of RFM scores for promotion audiences

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// RFM Cache TTL (30 minutes - matching existing RFM function)
const CACHE_TTL_MINUTES = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if user is super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check admin status using service role client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: adminCheck, error: adminError } = await serviceClient
      .from('abhq_admin_users')
      .select('level')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (adminError || !adminCheck) {
      return new Response(JSON.stringify({ 
        error: 'Admin access required',
        details: adminError?.message 
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use serviceClient for all subsequent database operations

    // Parse request body
    const { person_ids = [], force_refresh = false } = await req.json();

    if (!Array.isArray(person_ids) || person_ids.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'person_ids array is required and must not be empty' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check which people need RFM updates
    const { data: existingScores, error: cacheError } = await supabase
      .from('rfm_score_cache')
      .select('person_id, calculated_at')
      .in('person_id', person_ids);

    if (cacheError) {
      console.error('Error checking RFM cache:', cacheError);
    }

    const existingScoreMap = new Map();
    if (existingScores) {
      existingScores.forEach(score => {
        existingScoreMap.set(score.person_id, score.calculated_at);
      });
    }

    // Determine which people need RFM processing
    const needsUpdate = [];

    for (const personId of person_ids) {
      if (force_refresh) {
        needsUpdate.push(personId);
      } else {
        const existingTimestamp = existingScoreMap.get(personId);
        if (!existingTimestamp) {
          // No cache - needs calculation
          needsUpdate.push(personId);
        }
        // Has cache - use it (don't check expiration unless force_refresh is true)
      }
    }

    if (needsUpdate.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        total_requested: person_ids.length,
        needed_updates: 0,
        processed: 0,
        errors: 0,
        message: 'All RFM scores are current'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process RFM scores in batches to avoid timeouts
    const batchSize = 10; // Process 10 at a time
    const results = {
      processed: 0,
      errors: 0,
      error_details: []
    };

    console.log(`Processing RFM scores for ${needsUpdate.length} people in batches of ${batchSize}`);

    for (let i = 0; i < needsUpdate.length; i += batchSize) {
      const batch = needsUpdate.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (personId) => {
        try {
          // Call the existing RFM scoring function
          const rfmResponse = await fetch(`${supabaseUrl}/functions/v1/rfm-scoring`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ person_id: personId })
          });

          if (!rfmResponse.ok) {
            const errorText = await rfmResponse.text();
            throw new Error(`RFM scoring failed for person ${personId}: ${errorText}`);
          }

          const rfmResult = await rfmResponse.json();
          if (rfmResult.success) {
            results.processed++;
            return { personId, success: true };
          } else {
            throw new Error(`RFM scoring returned error for person ${personId}: ${rfmResult.error}`);
          }
        } catch (error) {
          results.errors++;
          results.error_details.push({
            person_id: personId,
            error: error.message
          });
          console.error(`Error processing RFM for person ${personId}:`, error);
          return { personId, success: false, error: error.message };
        }
      });

      await Promise.allSettled(batchPromises);
      
      // Add a small delay between batches to prevent overwhelming the system
      if (i + batchSize < needsUpdate.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_requested: person_ids.length,
      needed_updates: needsUpdate.length,
      processed: results.processed,
      errors: results.errors,
      error_details: results.error_details.slice(0, 10), // Limit error details to first 10
      completion_rate: needsUpdate.length > 0 ? (results.processed / needsUpdate.length * 100).toFixed(1) : '100.0'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in admin-sms-rfm-batch:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});