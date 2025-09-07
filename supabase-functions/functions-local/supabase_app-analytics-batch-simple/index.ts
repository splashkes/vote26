import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body with debug info
    let batch
    let debugInfo = {
      timestamp: new Date().toISOString(),
      function_name: 'app-analytics-batch-simple',
      step: 'initialization'
    }

    try {
      batch = await req.json()
      debugInfo.request_parsed = true
      debugInfo.received_keys = Object.keys(batch || {})
    } catch (parseError) {
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body',
        debug: { ...debugInfo, parse_error: parseError.message }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Validate required fields
    if (!batch.session_id) {
      return new Response(JSON.stringify({
        error: 'session_id is required',
        debug: { ...debugInfo, validation_failed: 'missing_session_id', received_data: batch }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const { session_id, batch_id, timestamp, events = {}, device_info = {} } = batch
    
    debugInfo.step = 'authentication'
    debugInfo.session_id = session_id
    debugInfo.has_events = !!events
    debugInfo.event_types = Object.keys(events)

    // Get user info if authenticated
    let userId = null
    let personId = null
    const authHeader = req.headers.get('authorization')
    
    if (authHeader) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        if (authError) {
          return new Response(JSON.stringify({
            error: 'Authentication failed',
            debug: { ...debugInfo, auth_error: authError.message, auth_header_present: !!authHeader }
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }
        
        if (user) {
          userId = user.id
          personId = user.user_metadata?.person_id || null
          debugInfo.user_authenticated = true
          debugInfo.user_id = userId
          debugInfo.person_id = personId
        }
      } catch (authError) {
        return new Response(JSON.stringify({
          error: 'Authentication error',
          debug: { ...debugInfo, auth_exception: authError.message }
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        })
      }
    }

    // Track processing counts
    const processed = {
      engagement: 0,
      performance: 0,
      errors: 0,
      navigation: 0
    }

    debugInfo.step = 'session_upsert'

    // 1. Update or create analytics session (simplified)
    const sessionData = {
      session_id,
      user_id: userId,
      person_id: personId,
      last_active: timestamp || new Date().toISOString(),
      device_info: device_info || {},
      app_version: device_info?.app_version || null,
      os_version: device_info?.os_version || null
    }

    const { error: sessionError } = await supabase
      .from('app_analytics_sessions')
      .upsert(sessionData, {
        onConflict: 'session_id'
      })

    if (sessionError) {
      return new Response(JSON.stringify({
        error: 'Failed to update analytics session',
        debug: { 
          ...debugInfo, 
          session_error: sessionError.message,
          session_error_details: sessionError.details,
          session_error_code: sessionError.code,
          session_data: sessionData
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    debugInfo.step = 'engagement_processing'
    debugInfo.engagement_count = events.engagement ? events.engagement.length : 0

    // 2. Process engagement events (simplified - no async operations)
    if (events.engagement && Array.isArray(events.engagement)) {
      try {
        const engagementRows = []
        
        for (const e of events.engagement) {
          // Validate required fields for engagement
          if (!e.item_id || !e.content_id || !e.content_type) {
            return new Response(JSON.stringify({
              error: 'Engagement event missing required fields',
              debug: { 
                ...debugInfo, 
                invalid_engagement_event: e,
                required_fields: ['item_id', 'content_id', 'content_type']
              }
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            })
          }
          
          engagementRows.push({
            session_id,
            user_id: userId,
            person_id: personId,
            item_id: e.item_id,
            content_id: e.content_id,
            content_type: e.content_type,
            timestamp: e.timestamp || new Date().toISOString(),
            dwell_time_ms: e.dwell_time_ms || null,
            viewport_percentage: e.viewport_percentage || null,
            video_watch_percentage: e.video_watch_percentage || null,
            actions: e.actions || [],
            gestures: e.gestures || [],
            exit_action: e.exit_action || null,
            swipe_velocity: e.swipe_velocity || null
          })
        }

        debugInfo.engagement_rows_prepared = engagementRows.length
        debugInfo.sample_engagement_row = engagementRows[0] || null

        const { error: engagementError } = await supabase
          .from('app_engagement_events')
          .insert(engagementRows)

        if (engagementError) {
          return new Response(JSON.stringify({
            error: 'Failed to insert engagement events',
            debug: { 
              ...debugInfo,
              engagement_error: engagementError.message,
              engagement_error_details: engagementError.details,
              engagement_error_code: engagementError.code,
              engagement_rows: engagementRows
            }
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          })
        }

        processed.engagement = engagementRows.length

      } catch (engagementProcessingError) {
        return new Response(JSON.stringify({
          error: 'Engagement processing failed',
          debug: { 
            ...debugInfo,
            processing_error: engagementProcessingError.message,
            processing_error_stack: engagementProcessingError.stack
          }
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        })
      }
    }

    debugInfo.step = 'performance_processing'
    // 3. Process performance metrics (simplified)
    if (events.performance && Array.isArray(events.performance)) {
      const performanceRows = events.performance.map(p => ({
        session_id,
        metric_type: p.type,
        value: p.value,
        metadata: p.metadata || {},
        timestamp: p.timestamp || new Date().toISOString()
      }))

      const { error: performanceError } = await supabase
        .from('app_performance_metrics')
        .insert(performanceRows)

      if (!performanceError) {
        processed.performance = performanceRows.length
      } else {
        debugInfo.performance_error = performanceError.message
      }
    }

    debugInfo.step = 'error_processing'
    // 4. Process error events (simplified)
    if (events.errors && Array.isArray(events.errors)) {
      const errorRows = events.errors.map(e => ({
        session_id,
        error_type: e.type,
        message: e.message,
        stack_trace: e.stack_trace,
        metadata: e.metadata || {},
        timestamp: e.timestamp || new Date().toISOString()
      }))

      const { error: errorInsertError } = await supabase
        .from('app_error_events')
        .insert(errorRows)

      if (!errorInsertError) {
        processed.errors = errorRows.length
      } else {
        debugInfo.error_insert_error = errorInsertError.message
      }
    }

    debugInfo.step = 'response_generation'
    
    // 5. Generate response (no complex async operations)
    const response = {
      success: true,
      batch_id: batch_id || `batch_${Date.now()}`,
      processed,
      user_id: userId,
      person_id: personId,
      debug: debugInfo
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'app-analytics-batch-simple',
        error_message: error.message,
        error_name: error.constructor.name,
        error_stack: error.stack
      }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})