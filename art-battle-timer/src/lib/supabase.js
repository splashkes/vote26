export const FUNCTIONS_URL = 'https://db.artb.art/functions/v1'

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