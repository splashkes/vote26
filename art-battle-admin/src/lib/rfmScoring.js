import { supabase } from './supabase';

/**
 * RFMScore interface
 * @typedef {Object} RFMScore
 * @property {number} recencyScore - 1-5 (5 = most recent)
 * @property {number} frequencyScore - 1-5 (5 = most frequent) 
 * @property {number} monetaryScore - 1-5 (5 = highest value)
 * @property {number} totalScore - Sum of all scores (3-15)
 * @property {string} segment - Customer segment name
 * @property {string} segmentCode - RFM code (e.g., "555")
 * @property {number} daysSinceLastActivity
 * @property {number} totalActivities
 * @property {number} totalSpent - Sum of highest bid per lot
 * @property {string} calculatedAt
 */

// RFM scores are cached server-side in database with 30-minute TTL
// No client-side caching needed

/**
 * Get RFM score for a person with caching
 * @param {string} personId - The person's UUID
 * @returns {Promise<RFMScore>} - The RFM score object
 */
export async function getRFMScore(personId) {
  if (!personId) {
    throw new Error('personId is required');
  }

  try {
    // Get current user's session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // Call the RFM scoring edge function (with database caching)
    const response = await fetch(
      `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/rfm-scoring?person_id=${personId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch RFM score');
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Error fetching RFM score:', error);
    throw error;
  }
}

/**
 * Get RFM scores for multiple people in batch
 * @param {string[]} personIds - Array of person UUIDs
 * @returns {Promise<Map<string, RFMScore>>} - Map of personId to RFM score
 */
export async function getBatchRFMScores(personIds) {
  const scores = new Map();

  // Fetch scores in batches (limit concurrent requests to avoid overwhelming the server)
  const batchSize = 5;
  for (let i = 0; i < personIds.length; i += batchSize) {
    const batch = personIds.slice(i, i + batchSize);
    const batchPromises = batch.map(async personId => {
      try {
        const score = await getRFMScore(personId);
        return { personId, score };
      } catch (error) {
        console.error(`Error fetching RFM for person ${personId}:`, error);
        return { personId, score: null };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(({ personId, score }) => {
      if (score) {
        scores.set(personId, score);
      }
    });
  }

  return scores;
}

/**
 * Get segment color for UI display
 * @param {string} segmentCode - The RFM segment code (e.g., "HHH")
 * @returns {string} - Radix UI color token
 */
export function getSegmentColor(segmentCode) {
  if (!segmentCode || segmentCode.length !== 3) return 'gray';

  const [recency, frequency, monetary] = segmentCode.split('');
  
  // Champions and high-value segments
  if (segmentCode === 'HHH') return 'purple';  // Champion
  if (recency === 'H' && (frequency === 'H' || monetary === 'H')) return 'blue';  // Active high-value
  
  // Medium engagement 
  if (recency === 'H' && frequency === 'M') return 'green';  // Recent medium engagement
  if (recency === 'M') return 'yellow';  // Medium recency - reactivation opportunity
  
  // At-risk and lost
  if (recency === 'L' && frequency === 'H') return 'orange';  // Past champions - high priority
  if (recency === 'L') return 'red';  // Lost customers
  
  return 'gray';
}

/**
 * Get tier information for a segment code
 * @param {string} segmentCode - The RFM segment code
 * @returns {object} - Tier information with number and description
 */
export function getSegmentTier(segmentCode) {
  if (!segmentCode || segmentCode.length !== 3) {
    return { tier: 0, description: 'Unknown' };
  }

  const [recency] = segmentCode.split('');
  
  switch (recency) {
    case 'H':
      return { tier: 1, description: 'Active Customers' };
    case 'M':
      return { tier: 2, description: 'Reactivation Opportunities' };
    case 'L':
      return { tier: 3, description: 'At-Risk Customers' };
    default:
      return { tier: 0, description: 'Unknown' };
  }
}

/**
 * Note: RFM scores are cached server-side in the database with 30-minute TTL.
 * No client-side cache clearing is needed.
 */