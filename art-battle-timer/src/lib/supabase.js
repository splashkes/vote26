import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjEzNDczNDcsImV4cCI6MjAzNjkyMzM0N30.bCOjsJJJ4Vy1TCCdDl0TcJnM3gu9hI-iFwOGTq20Unc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`

export async function fetchTimerData(eid) {
  try {
    const response = await fetch(`${FUNCTIONS_URL}/timer-data/${eid}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error fetching timer data:', error)
    throw error
  }
}