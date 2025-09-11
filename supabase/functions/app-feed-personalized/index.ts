import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const { 
      session_id, 
      exclude_ids = [], 
      count = 20, 
      context = 'default',
      content_types = ['artwork', 'event', 'artist_spotlight', 'artist_application'] 
    } = await req.json()

    // Validate session_id
    if (!session_id) {
      return new Response(JSON.stringify({
        error: 'session_id is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Get or create analytics session
    await supabase
      .from('app_analytics_sessions')
      .upsert({
        session_id,
        last_active: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      })

    // Get user preferences if authenticated
    let userPreferences = null
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (user) {
        const { data: prefs } = await supabase
          .from('app_personalization_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        userPreferences = prefs
        
        // Update session with user info
        await supabase
          .from('app_analytics_sessions')
          .update({ 
            user_id: user.id,
            person_id: user.user_metadata?.person_id || null
          })
          .eq('session_id', session_id)
      }
    }

    // Get previously shown content to avoid repeats
    // TODO: Re-enable exposure tracking when ready for production
    // const { data: exposedContent } = await supabase
    //   .from('app_exposure_tracking')
    //   .select('content_id')
    //   .eq('session_id', session_id)
    //   .in('interaction_type', ['shown', 'engaged'])

    const excludedContentIds = [
      ...exclude_ids,
      // ...(exposedContent?.map(e => e.content_id) || [])
    ]

    // Build content query
    let contentQuery = supabase
      .from('app_curated_content')
      .select(`
        id,
        content_id,
        content_type,
        title,
        description,
        image_url,
        video_url,
        thumbnail_url,
        image_urls,
        thumbnail_urls,
        tags,
        color_palette,
        mood_tags,
        engagement_score,
        trending_score,
        quality_score,
        data,
        status
      `)
      .eq('status', 'active')
      .in('content_type', content_types)

    // Exclude already shown content
    if (excludedContentIds.length > 0) {
      contentQuery = contentQuery.not('content_id', 'in', `(${excludedContentIds.join(',')})`)
    }

    // Apply availability filter
    contentQuery = contentQuery.or(`available_until.is.null,available_until.gt.${new Date().toISOString()}`)

    const { data: availableContent, error } = await contentQuery.limit(count * 3) // Get more for scoring

    if (error) {
      console.error('Content query error:', error)
      return new Response(JSON.stringify({
        error: 'Failed to fetch content'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    if (!availableContent || availableContent.length === 0) {
      return new Response(JSON.stringify({
        session_id,
        items: [],
        algorithm: { version: '1.0.0', message: 'No available content' }
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Filter out poor performing content based on dwell time (bottom 20% with 5+ reports)
    const { data: dwellStats } = await supabase
      .from('app_engagement_events')
      .select(`
        content_id,
        dwell_time_ms
      `)
      .in('content_id', availableContent.map(item => item.content_id))
      .not('dwell_time_ms', 'is', null)
      .gt('dwell_time_ms', 0)

    const contentDwellMap = new Map()
    
    if (dwellStats) {
      // Group dwell times by content_id
      for (const stat of dwellStats) {
        if (!contentDwellMap.has(stat.content_id)) {
          contentDwellMap.set(stat.content_id, [])
        }
        contentDwellMap.get(stat.content_id).push(stat.dwell_time_ms)
      }

      // Calculate average dwell times and identify bottom 20%
      const contentPerformance = []
      for (const [contentId, dwellTimes] of contentDwellMap.entries()) {
        if (dwellTimes.length >= 5) { // Only filter content with 5+ dwell reports
          const avgDwellTime = dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length
          contentPerformance.push({ contentId, avgDwellTime, reportCount: dwellTimes.length })
        }
      }

      if (contentPerformance.length > 0) {
        // Sort by average dwell time and identify bottom 20%
        contentPerformance.sort((a, b) => a.avgDwellTime - b.avgDwellTime)
        const bottom20PercentCount = Math.ceil(contentPerformance.length * 0.2)
        const poorPerformingIds = contentPerformance
          .slice(0, bottom20PercentCount)
          .map(item => item.contentId)

        // Filter out poor performing content
        const filteredContent = availableContent.filter(item => 
          !poorPerformingIds.includes(item.content_id)
        )
        
        console.log(`Dwell filter: removed ${availableContent.length - filteredContent.length} poor performers`)
        availableContent.splice(0, availableContent.length, ...filteredContent)
      }
    }

    if (availableContent.length === 0) {
      return new Response(JSON.stringify({
        session_id,
        items: [],
        algorithm: { version: '1.0.0', message: 'No available content' }
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Score and rank content using 70/20/10 algorithm
    const scoredContent = availableContent.map((item, index) => {
      let personalizedScore = 0
      
      // 70% Exploitation: User preference matching
      if (userPreferences) {
        // Category matching
        const categoryMatch = userPreferences.liked_categories?.some(cat => 
          item.tags?.includes(cat)
        ) ? 0.7 : 0.3

        // Artist matching for artwork
        const artistMatch = item.content_type === 'artwork' && 
          userPreferences.liked_artists?.includes(item.data?.artistId) ? 0.8 : 0.4

        // Style/tag matching
        const styleMatch = userPreferences.liked_styles?.some(style =>
          item.mood_tags?.includes(style) || item.tags?.includes(style)
        ) ? 0.6 : 0.3

        personalizedScore = (categoryMatch * 0.4 + artistMatch * 0.3 + styleMatch * 0.3) * 0.7
      } else {
        // No user data - use content quality
        personalizedScore = item.quality_score * 0.7
      }

      // 20% Exploration: Diversity and new categories
      const explorationScore = (1 - (index / availableContent.length)) * 0.2

      // 10% Trending: Recent popularity
      const trendingScore = item.trending_score * 0.1

      // Context adjustments
      let contextMultiplier = 1.0
      const currentHour = new Date().getHours()
      
      if (context === 'morning' || (currentHour >= 6 && currentHour < 12)) {
        // Morning: prefer inspiring, bright content
        if (item.mood_tags?.includes('inspiring') || item.mood_tags?.includes('energetic')) {
          contextMultiplier = 1.2
        }
      } else if (context === 'evening' || (currentHour >= 18 && currentHour < 24)) {
        // Evening: prefer calming, contemplative content
        if (item.mood_tags?.includes('peaceful') || item.mood_tags?.includes('contemplative')) {
          contextMultiplier = 1.2
        }
      }

      const totalScore = (personalizedScore + explorationScore + trendingScore) * contextMultiplier

      return {
        ...item,
        score: Math.min(totalScore, 1.0), // Cap at 1.0
        reasoning: personalizedScore > 0.5 ? 'personalized' : 
                  trendingScore > 0.05 ? 'trending' : 'exploration'
      }
    })

    // Sort by score and apply diversity rules
    scoredContent.sort((a, b) => b.score - a.score)

    // Apply diversity: no more than 2 consecutive items of same type
    // TODO: Re-enable diversity filtering when ready for production
    // const diversifiedContent = []
    // let lastType = null
    // let consecutiveCount = 0

    // for (const item of scoredContent) {
    //   if (diversifiedContent.length >= count) break

    //   if (item.content_type === lastType) {
    //     consecutiveCount++
    //     if (consecutiveCount >= 2) continue // Skip to maintain diversity
    //   } else {
    //     consecutiveCount = 1
    //   }

    //   diversifiedContent.push(item)
    //   lastType = item.content_type
    // }

    // For testing: just take the top scored items without diversity filtering
    let diversifiedContent = scoredContent.slice(0, count)

    // Randomize the final output order
    for (let i = diversifiedContent.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [diversifiedContent[i], diversifiedContent[j]] = [diversifiedContent[j], diversifiedContent[i]]
    }

    // Format response items
    const responseItems = diversifiedContent.slice(0, count).map((item, index) => ({
      id: `feed_${item.id}`,
      type: item.content_type,
      content_id: item.content_id,
      score: item.score,
      reasoning: item.reasoning,
      data: {
        title: item.title,
        description: item.description,
        // Backwards compatibility (required)
        imageUrl: item.image_url,
        videoUrl: item.video_url,
        thumbnailUrl: item.thumbnail_url,
        // NEW: Multiple images support
        imageUrls: item.image_urls || (item.image_url ? [item.image_url] : []),
        thumbnailUrls: item.thumbnail_urls || (item.thumbnail_url ? [item.thumbnail_url] : []),
        tags: item.tags || [],
        colorPalette: item.color_palette || [],
        moodTags: item.mood_tags || [],
        engagementScore: item.engagement_score || 0,
        trendingScore: item.trending_score || 0,
        qualityScore: item.quality_score || 0,
        ...item.data // Include type-specific data
      }
    }))

    // Track exposure for these items
    // TODO: Re-enable exposure tracking when ready for production
    // if (responseItems.length > 0) {
    //   const exposureRecords = responseItems.map(item => ({
    //     session_id,
    //     user_id: userPreferences?.user_id || null,
    //     item_id: item.id.replace('feed_', ''),
    //     content_id: item.content_id,
    //     interaction_type: 'shown',
    //     timestamp: new Date().toISOString()
    //   }))

    //   // Fire and forget - don't wait for this
    //   supabase
    //     .from('app_exposure_tracking')
    //     .insert(exposureRecords)
    //     .then(() => console.log(`Tracked exposure for ${exposureRecords.length} items`))
    //     .catch(err => console.warn('Failed to track exposure:', err))
    // }

    // Calculate algorithm distribution for debugging
    const exploitationCount = responseItems.filter(i => i.reasoning === 'personalized').length
    const explorationCount = responseItems.filter(i => i.reasoning === 'exploration').length
    const trendingCount = responseItems.filter(i => i.reasoning === 'trending').length
    const total = responseItems.length

    return new Response(JSON.stringify({
      session_id,
      items: responseItems,
      algorithm: {
        version: '1.0.0',
        distribution: {
          exploitation: total > 0 ? exploitationCount / total : 0,
          exploration: total > 0 ? explorationCount / total : 0,
          trending: total > 0 ? trendingCount / total : 0
        },
        personalization_strength: userPreferences ? 0.75 : 0.0,
        context,
        excluded_count: excludedContentIds.length
      }
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (error) {
    console.error('Feed personalization error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})