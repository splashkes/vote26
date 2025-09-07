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
      function_name: 'app-analytics-batch',
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
    debugInfo.session_data = {
      session_id,
      user_id: userId,
      person_id: personId,
      has_device_info: !!device_info
    }

    // 1. Update or create analytics session
    const sessionData = {
      session_id,
      user_id: userId,
      person_id: personId,
      last_active: timestamp || new Date().toISOString(),
      device_info: device_info,
      app_version: device_info.app_version,
      os_version: device_info.os_version
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

    // 2. Process engagement events
    if (events.engagement && Array.isArray(events.engagement)) {
      const engagementRows = events.engagement.map(e => ({
        session_id,
        user_id: userId,
        person_id: personId,
        item_id: e.item_id,
        content_id: e.content_id,
        content_type: e.content_type,
        timestamp: e.timestamp || new Date().toISOString(),
        dwell_time_ms: e.dwell_time_ms,
        viewport_percentage: e.viewport_percentage,
        video_watch_percentage: e.video_watch_percentage,
        actions: e.actions || [],
        gestures: e.gestures || [],
        exit_action: e.exit_action,
        swipe_velocity: e.swipe_velocity
      }))

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

      if (!engagementError) {
        processed.engagement = engagementRows.length

        // Process actions for content statistics (fire and forget)
        engagementRows.forEach(async (event) => {
          if (event.actions && Array.isArray(event.actions)) {
            for (const action of event.actions) {
              if (['like', 'share', 'save'].includes(action.type)) {
                supabase.rpc('app_increment_content_stat', {
                  p_content_id: event.content_id,
                  p_content_type: event.content_type,
                  p_stat_type: action.type
                }).catch(err => console.warn('Failed to increment stat:', err))
              }
            }
          }

          // Always increment view count
          supabase.rpc('app_increment_content_stat', {
            p_content_id: event.content_id,
            p_content_type: event.content_type,
            p_stat_type: 'view'
          }).catch(err => console.warn('Failed to increment view:', err))
        })

        // Track exposure for engaged content
        const exposureRows = engagementRows
          .filter(e => e.dwell_time_ms > 1000) // Only track significant engagement
          .map(e => ({
            session_id,
            user_id: userId,
            item_id: e.item_id,
            content_id: e.content_id,
            interaction_type: 'engaged',
            timestamp: e.timestamp,
            metadata: {
              dwell_time_ms: e.dwell_time_ms,
              actions: e.actions?.length || 0
            }
          }))

        if (exposureRows.length > 0) {
          supabase
            .from('app_exposure_tracking')
            .insert(exposureRows)
            .catch(err => console.warn('Failed to track exposure:', err))
        }
      } else {
        console.error('Engagement insert error:', engagementError)
      }
    }

    // 3. Process performance metrics
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
        console.error('Performance insert error:', performanceError)
      }
    }

    // 4. Process error events
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
        console.error('Error insert error:', errorInsertError)
      }
    }

    // 5. Process navigation events (optional - for future analytics)
    if (events.navigation && Array.isArray(events.navigation)) {
      processed.navigation = events.navigation.length
      // Could store in a separate navigation_events table if needed
    }

    // 6. Update user preferences based on engagement (async, fire-and-forget)
    if (userId && events.engagement && events.engagement.length > 0) {
      updateUserPreferences(supabase, userId, personId, events.engagement)
        .catch(err => console.warn('Failed to update preferences:', err))
    }

    // 7. Generate response
    const response = {
      success: true,
      batch_id: batch_id || `batch_${Date.now()}`,
      processed,
      recommendations_updated: userId ? true : false,
      user_segments: await getUserSegments(supabase, userId, personId)
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      debug: {
        timestamp: new Date().toISOString(),
        function_name: 'app-analytics-batch',
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

// Helper function to update user preferences based on engagement
async function updateUserPreferences(supabase: any, userId: string, personId: string | null, engagementEvents: any[]) {
  try {
    // Get current preferences
    const { data: currentPrefs } = await supabase
      .from('app_personalization_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    // Extract preferences from engagement events
    const likedCategories = new Set(currentPrefs?.liked_categories || [])
    const likedArtists = new Set(currentPrefs?.liked_artists || [])
    const likedStyles = new Set(currentPrefs?.liked_styles || [])

    let totalDwellTime = 0
    let dwellTimeCount = 0

    for (const event of engagementEvents) {
      // Update dwell time averages
      if (event.dwell_time_ms > 0) {
        totalDwellTime += event.dwell_time_ms
        dwellTimeCount++
      }

      // Process actions for preferences
      if (event.actions && Array.isArray(event.actions)) {
        const hasLike = event.actions.some(a => a.type === 'like')
        const hasShare = event.actions.some(a => a.type === 'share')
        const hasLongDwell = event.dwell_time_ms > 5000 // 5+ seconds

        if (hasLike || hasShare || hasLongDwell) {
          // Get content details to extract preferences
          const { data: contentDetails } = await supabase
            .from('app_curated_content')
            .select('tags, mood_tags, data')
            .eq('content_id', event.content_id)
            .single()

          if (contentDetails) {
            // Add liked categories
            if (contentDetails.tags) {
              contentDetails.tags.forEach((tag: string) => likedCategories.add(tag))
            }

            // Add liked styles
            if (contentDetails.mood_tags) {
              contentDetails.mood_tags.forEach((mood: string) => likedStyles.add(mood))
            }

            // Add liked artists (if artwork)
            if (event.content_type === 'artwork' && contentDetails.data?.artistId) {
              likedArtists.add(contentDetails.data.artistId)
            }
          }
        }
      }
    }

    // Calculate new average dwell time
    const newAvgDwellTime = dwellTimeCount > 0 
      ? Math.round((currentPrefs?.avg_dwell_time_ms || 0) * 0.8 + (totalDwellTime / dwellTimeCount) * 0.2)
      : currentPrefs?.avg_dwell_time_ms || 0

    // Determine primary usage time
    const currentHour = new Date().getHours()
    let primaryUsageTime = 'day'
    if (currentHour >= 6 && currentHour < 12) primaryUsageTime = 'morning'
    else if (currentHour >= 12 && currentHour < 18) primaryUsageTime = 'afternoon'  
    else if (currentHour >= 18 && currentHour < 24) primaryUsageTime = 'evening'
    else primaryUsageTime = 'night'

    // Update or create preferences
    const preferencesData = {
      user_id: userId,
      person_id: personId,
      liked_categories: Array.from(likedCategories).slice(0, 50), // Limit size
      liked_artists: Array.from(likedArtists).slice(0, 100),
      liked_styles: Array.from(likedStyles).slice(0, 30),
      avg_dwell_time_ms: newAvgDwellTime,
      primary_usage_time: primaryUsageTime,
      last_updated: new Date().toISOString()
    }

    await supabase
      .from('app_personalization_profiles')
      .upsert(preferencesData, {
        onConflict: 'user_id'
      })

  } catch (error) {
    console.error('Error updating preferences:', error)
  }
}

// Helper function to determine user segments
async function getUserSegments(supabase: any, userId: string | null, personId: string | null): Promise<string[]> {
  if (!userId) return ['anonymous']

  const segments = ['authenticated']

  try {
    // Check engagement level
    const { data: engagementData } = await supabase
      .from('app_engagement_events')
      .select('id')
      .eq('user_id', userId)
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days

    if (engagementData && engagementData.length > 10) {
      segments.push('active')
    }

    if (engagementData && engagementData.length > 50) {
      segments.push('power_user')
    }

    // Check if they have preferences (personalized user)
    const { data: prefData } = await supabase
      .from('app_personalization_profiles')
      .select('liked_categories')
      .eq('user_id', userId)
      .single()

    if (prefData && prefData.liked_categories && prefData.liked_categories.length > 0) {
      segments.push('personalized')
    }

    // Check if they're an artist
    if (personId) {
      const { data: artistData } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('person_id', personId)
        .limit(1)

      if (artistData && artistData.length > 0) {
        segments.push('artist')
      }
    }

    // Check geography if available
    const { data: sessionData } = await supabase
      .from('app_analytics_sessions')
      .select('device_info')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (sessionData?.device_info?.location) {
      segments.push('geo_aware')
    }

  } catch (error) {
    console.warn('Error determining user segments:', error)
  }

  return segments
}