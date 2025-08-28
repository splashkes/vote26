const BASE_URL = 'https://artb.art/live';

class LiveAPIClient {
  async fetchEventData(eventId) {
    try {
      const response = await fetch(`${BASE_URL}/event/${eventId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch event data: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching event data:', error);
      throw error;
    }
  }

  async fetchEventMedia(eventId) {
    try {
      const response = await fetch(`${BASE_URL}/event/${eventId}/media`);
      if (!response.ok) {
        throw new Error(`Failed to fetch event media: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching event media:', error);
      throw error;
    }
  }

  async fetchEventArtists(eventId) {
    try {
      const response = await fetch(`${BASE_URL}/event/${eventId}/artists`);
      if (!response.ok) {
        throw new Error(`Failed to fetch event artists: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching event artists:', error);
      throw error;
    }
  }

  async fetchArtworkBids(eventId, round, easel) {
    try {
      const response = await fetch(`${BASE_URL}/event/${eventId}-${round}-${easel}/bids`);
      if (!response.ok) {
        throw new Error(`Failed to fetch artwork bids: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching artwork bids:', error);
      throw error;
    }
  }

  async fetchEventBids(eventId) {
    try {
      const response = await fetch(`${BASE_URL}/bids/${eventId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch event bids: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching event bids:', error);
      throw error;
    }
  }
}

export const liveAPI = new LiveAPIClient();