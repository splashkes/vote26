import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RFMScore {
  recencyScore: number      // 1-5 (5 = most recent)
  frequencyScore: number    // 1-5 (5 = most frequent) 
  monetaryScore: number     // 1-5 (5 = highest value)
  totalScore: number        // Sum of all scores (3-15)
  segment: string           // Customer segment name
  segmentCode: string       // RFM code (e.g., "555")
  daysSinceLastActivity: number
  totalActivities: number
  totalSpent: number        // Sum of highest bid per lot
  calculatedAt: Date
}

const SEGMENT_MAPPING: Record<string, string> = {
  // Tier 1: Active Customers (High Recency)
  'HHH': 'Champion',
  'HHM': 'Active Collector', 
  'HHL': 'Event Enthusiast',
  'HMH': 'Selective Collector',
  'HMM': 'Steady Participant',
  'HML': 'Regular Attendee',
  'HLH': 'New Collector',
  'HLM': 'New Customer',
  'HLL': 'Fresh Visitor',
  
  // Tier 2: Reactivation Opportunities (Medium Recency)
  'MHH': 'Potential Champion',
  'MHM': 'Collector Prospect',
  'MHL': 'Engagement Opportunity',
  'MMH': 'Collection Potential',
  'MMM': 'Re-engagement Target',
  'MML': 'Growth Prospect',
  'MLH': 'Untapped Collector',
  'MLM': 'Activation Candidate', 
  'MLL': 'Awakening Opportunity',
  
  // Tier 3: At-Risk Customers (Low Recency)
  'LHH': 'Past Champion',
  'LHM': 'Former Collector',
  'LHL': 'Dormant Enthusiast',
  'LMH': 'Lost Collector',
  'LMM': 'Hibernating',
  'LML': 'Cooling Interest',
  'LLH': 'One-Time Collector',
  'LLM': 'Nearly Lost',
  'LLL': 'Lost'
}

// Database cache TTL (30 minutes)
const CACHE_TTL_MINUTES = 30

async function getCachedScore(supabase: any, personId: string): Promise<RFMScore | null> {
  try {
    const { data, error } = await supabase
      .from('rfm_score_cache')
      .select('*')
      .eq('person_id', personId)
      .single()
    
    if (error || !data) return null
    
    // Check if cache is still valid (within TTL)
    const cacheAge = Date.now() - new Date(data.calculated_at).getTime()
    const isExpired = cacheAge > (CACHE_TTL_MINUTES * 60 * 1000)
    
    if (isExpired) return null
    
    // Convert database row to RFMScore format
    return {
      recencyScore: data.recency_score,
      frequencyScore: data.frequency_score,
      monetaryScore: data.monetary_score,
      totalScore: data.total_score,
      segment: data.segment,
      segmentCode: data.segment_code,
      daysSinceLastActivity: data.days_since_last_activity,
      totalActivities: data.total_activities,
      totalSpent: parseFloat(data.total_spent),
      calculatedAt: new Date(data.calculated_at)
    }
  } catch (error) {
    console.error('Error getting cached RFM score:', error)
    return null
  }
}

async function setCachedScore(supabase: any, personId: string, score: RFMScore): Promise<void> {
  try {
    const { error } = await supabase
      .from('rfm_score_cache')
      .upsert({
        person_id: personId,
        recency_score: score.recencyScore,
        frequency_score: score.frequencyScore,
        monetary_score: score.monetaryScore,
        total_score: score.totalScore,
        segment: score.segment,
        segment_code: score.segmentCode,
        days_since_last_activity: score.daysSinceLastActivity,
        total_activities: score.totalActivities,
        total_spent: score.totalSpent,
        calculated_at: score.calculatedAt
      }, {
        onConflict: 'person_id'
      })
    
    if (error) {
      console.error('Error caching RFM score:', error)
    }
  } catch (error) {
    console.error('Error setting cached RFM score:', error)
  }
}

function calculateRecencyScore(lastActivity: Date | null): number {
  if (!lastActivity) return 1
  
  const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
  
  // Simple time-based recency scoring
  if (daysSince <= 90) return 5      // Within 3 months
  if (daysSince <= 180) return 4     // Within 6 months  
  if (daysSince <= 365) return 3     // Within 1 year
  if (daysSince <= 730) return 2     // Within 2 years
  return 1                           // More than 2 years
}

function calculateFrequencyScore(totalActivities: number): number {
  if (totalActivities >= 50) return 5
  if (totalActivities >= 20) return 4
  if (totalActivities >= 10) return 3
  if (totalActivities >= 5) return 2
  return 1
}

function calculateMonetaryScore(totalSpent: number): number {
  if (totalSpent >= 750) return 5
  if (totalSpent >= 400) return 4
  if (totalSpent >= 100) return 3
  if (totalSpent >= 50) return 2
  return 1
}

function getSegmentCode(recency: number, frequency: number, monetary: number): string {
  const toRFMRange = (score: number): string => {
    if (score >= 4) return 'H'
    if (score === 3) return 'M'
    return 'L'
  }
  
  return toRFMRange(recency) + toRFMRange(frequency) + toRFMRange(monetary)
}

async function calculateRFMScore(supabase: any, personId: string): Promise<RFMScore> {
  // Check database cache first
  const cached = await getCachedScore(supabase, personId)
  if (cached) {
    return cached
  }

  const fiveYearsAgo = new Date()
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5)

  // Get person's activity data including historical registrations
  const [votesResult, bidsResult, qrScansResult, registrationsResult] = await Promise.all([
    // Votes (event attendance + individual votes) - use timestamp for actual vote time
    supabase
      .from('votes')
      .select('timestamp, created_at, event_id')
      .eq('person_id', personId)
      .gte('timestamp', fiveYearsAgo.toISOString())
      .not('timestamp', 'is', null),
    
    // Bids (auction activity) 
    supabase
      .from('bids')
      .select('amount, created_at, art(id)')
      .eq('person_id', personId)
      .gte('created_at', fiveYearsAgo.toISOString()),
      
    // QR scans (engagement activity) - use scan_timestamp for actual scan time
    supabase
      .from('people_qr_scans')
      .select('scan_timestamp, created_at')
      .eq('person_id', personId)
      .gte('scan_timestamp', fiveYearsAgo.toISOString()),

    // Event registrations (historical engagement) - use registered_at for actual registration time
    supabase
      .from('event_registrations')
      .select('registered_at, event_id, registration_type')
      .eq('person_id', personId)
      .gte('registered_at', fiveYearsAgo.toISOString())
  ])

  const votes = votesResult.data || []
  const bids = bidsResult.data || []
  const qrScans = qrScansResult.data || []
  const registrations = registrationsResult.data || []

  // Calculate Recency: Most recent activity date using proper timestamp fields
  const allActivityDates = [
    ...votes.map(v => new Date(v.timestamp)),
    ...bids.map(b => new Date(b.created_at)),
    ...qrScans.map(s => new Date(s.scan_timestamp)),
    ...registrations.map(r => new Date(r.registered_at))
  ].sort((a, b) => b.getTime() - a.getTime())

  const lastActivity = allActivityDates.length > 0 ? allActivityDates[0] : null
  const daysSinceLastActivity = lastActivity 
    ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    : 999

  // Calculate Frequency: Total activities (events attended + votes + bids + qr scans + registrations)
  const uniqueEventsFromVotes = new Set(votes.map(v => v.event_id))
  const uniqueEventsFromRegistrations = new Set(registrations.map(r => r.event_id))
  const allUniqueEvents = new Set([...uniqueEventsFromVotes, ...uniqueEventsFromRegistrations])
  
  const eventAttendance = allUniqueEvents.size
  const individualVotes = votes.length
  const bidActivities = bids.length
  const qrScanActivities = qrScans.length
  const registrationActivities = registrations.length
  
  const totalActivities = eventAttendance + individualVotes + bidActivities + qrScanActivities + registrationActivities

  // Calculate Monetary: Sum of highest bid per art piece (lot)
  const artHighestBids = new Map<string, number>()
  bids.forEach(bid => {
    const artId = bid.art?.id
    if (artId) {
      const currentHighest = artHighestBids.get(artId) || 0
      if (bid.amount > currentHighest) {
        artHighestBids.set(artId, bid.amount)
      }
    }
  })
  
  const totalSpent = Array.from(artHighestBids.values()).reduce((sum, amount) => sum + amount, 0)

  // Calculate scores
  const recencyScore = calculateRecencyScore(lastActivity)
  const frequencyScore = calculateFrequencyScore(totalActivities)
  const monetaryScore = calculateMonetaryScore(totalSpent)
  const totalScore = recencyScore + frequencyScore + monetaryScore

  // Get segment
  const segmentCode = getSegmentCode(recencyScore, frequencyScore, monetaryScore)
  const segment = SEGMENT_MAPPING[segmentCode] || 'Unknown'

  const rfmScore: RFMScore = {
    recencyScore,
    frequencyScore,
    monetaryScore,
    totalScore,
    segment,
    segmentCode,
    daysSinceLastActivity,
    totalActivities,
    totalSpent,
    calculatedAt: new Date()
  }

  // Cache the result in database
  await setCachedScore(supabase, personId, rfmScore)
  
  return rfmScore
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const personId = url.searchParams.get('person_id')
    
    if (!personId) {
      return new Response(
        JSON.stringify({ error: 'person_id parameter is required' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify admin permissions
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract token and verify admin status
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if user is admin
    const { data: adminData } = await supabaseClient
      .from('abhq_admin_users')
      .select('active')
      .eq('user_id', user.id)
      .eq('active', true)
      .single()

    if (!adminData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate RFM score
    const rfmScore = await calculateRFMScore(supabaseClient, personId)

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: rfmScore,
        cached: getCachedScore(personId) !== null
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error calculating RFM score:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})