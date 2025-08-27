import { useEffect, useRef } from 'react';

/**
 * Hook for polling vote analytics and updating existing artworksByRound data
 * Only polls when user has admin permissions
 * Uses 10-second polling interval to leverage server-side caching
 */
export const useVoteAnalytics = (eid, adminLevel, isActive, onArtworksUpdate, onTimestampUpdate) => {
  const intervalRef = useRef(null);

  // Only poll if user has admin permissions and callback provided
  const shouldPoll = adminLevel && ['super', 'producer', 'photo', 'voting'].includes(adminLevel) && onArtworksUpdate;
  

  const fetchVoteAnalytics = async () => {
    if (!eid || !shouldPoll) {
      return;
    }
    
    console.log('📊 [VOTE-ANALYTICS] Fetching data...');

    try {
      const url = `https://artb.art/live/event/${eid}/vote-analytics`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      

      // Update the existing artworksByRound data with fresh vote analytics
      if (data.artworksByRound && onArtworksUpdate) {
        onArtworksUpdate(data.artworksByRound);
      }

      // Update timestamp info for age display
      if (onTimestampUpdate && (data.generated_at || data.server_time)) {
        onTimestampUpdate({
          generated_at: data.generated_at,
          server_time: data.server_time,
          client_received_at: Date.now()
        });
      }

    } catch (err) {
      // Silent fail
    }
  };

  // Initial fetch and polling setup
  useEffect(() => {
    if (!shouldPoll || !isActive) {
      // Clear polling if no admin permissions or inactive
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchVoteAnalytics();

    // Setup 10-second polling to match server cache TTL
    intervalRef.current = setInterval(fetchVoteAnalytics, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [eid, shouldPoll, isActive, onArtworksUpdate, onTimestampUpdate]);

  return {
    isPolling: !!intervalRef.current && shouldPoll
  };
};