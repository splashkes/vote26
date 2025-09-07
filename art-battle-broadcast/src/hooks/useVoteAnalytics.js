import { useEffect, useRef } from 'react';

/**
 * DEAD SIMPLE 10-second timer for vote analytics
 */
export const useVoteAnalytics = (eid, adminLevel, isActive, onArtworksUpdate, onTimestampUpdate) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    // Only run if admin and voting tab is active
    if (!eid || !isActive || !adminLevel || !['super', 'producer', 'photo', 'voting'].includes(adminLevel)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Dead simple fetch - no rate limiting, no fancy logic
    const fetchData = async () => {
      try {
        console.log('📊 [VOTE-ANALYTICS] Fetching data...');
        
        const response = await fetch(`https://artb.art/live/event/${eid}/vote-analytics`);
        
        if (!response.ok) {
          console.warn('📊 [VOTE-ANALYTICS] Failed:', response.status);
          return;
        }

        const data = await response.json();

        if (data.artworksByRound && onArtworksUpdate) {
          onArtworksUpdate(data.artworksByRound);
        }

        if (onTimestampUpdate && (data.generated_at || data.server_time)) {
          onTimestampUpdate({
            generated_at: data.generated_at,
            server_time: data.server_time,
            client_received_at: Date.now()
          });
        }
      } catch (error) {
        console.warn('📊 [VOTE-ANALYTICS] Error:', error.message);
      }
    };

    // Start immediately
    fetchData();

    // Simple 10-second interval
    intervalRef.current = setInterval(fetchData, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [eid, adminLevel, isActive]);

  return {
    isPolling: !!intervalRef.current
  };
};