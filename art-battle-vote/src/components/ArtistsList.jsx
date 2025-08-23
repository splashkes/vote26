import { useState, useEffect } from 'react';
import { Box, Text, Flex, Spinner } from '@radix-ui/themes';
import { useBroadcastCache } from '../hooks/useBroadcastCache';

const ArtistsList = ({ eventId, eventEid }) => {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Set up broadcast cache for artists endpoint
  const { } = useBroadcastCache(
    eventEid, // Use EID for broadcast subscription
    async (notificationData) => {
      console.log(`🎨 [ARTISTS] Refreshing artists data after cache invalidation:`, notificationData);
      // Only refresh if artists endpoint is affected
      if (notificationData.endpoints && notificationData.endpoints.some(ep => ep.includes('/artists'))) {
        await fetchEventArtists();
      }
    },
    {
      autoRefresh: true,
      refreshDelay: 1000,
      debugMode: false
    }
  );

  useEffect(() => {
    fetchEventArtists();
  }, [eventEid]);

  const fetchEventArtists = async () => {
    if (!eventEid) return;
    
    try {
      console.log(`🎨 [ARTISTS] Fetching artists data from /live/event/${eventEid}/artists`);
      
      const cacheVersion = Date.now();
      const response = await fetch(`https://artb.art/live/event/${eventEid}/artists?v=${cacheVersion}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`🎨 [ARTISTS] Successfully loaded ${data.artists?.length || 0} artists`);
      
      setArtists(data.artists || []);
    } catch (error) {
      console.error('🎨 [ARTISTS] Error fetching event artists:', error);
      setArtists([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" py="4">
        <Spinner />
      </Flex>
    );
  }

  if (artists.length === 0) {
    return (
      <Text size="2" color="gray">No artists confirmed for this event yet.</Text>
    );
  }

  return (
    <Box>
      {artists.map(artist => (
        <Box key={artist.id} mb="4" style={{ borderBottom: '1px solid var(--gray-6)', paddingBottom: '12px' }}>
          <Text size="3" weight="medium" style={{ display: 'block', marginBottom: '4px' }}>
            {artist.name}
          </Text>
          
          {artist.city && (
            <Text size="2" color="gray" style={{ display: 'block', marginBottom: '4px' }}>
              📍 {artist.city}
            </Text>
          )}
          
          {(artist.instagram || artist.facebook || artist.website) && (
            <Flex gap="3" mb="2">
              {artist.instagram && (
                <Text size="2" asChild>
                  <a 
                    href={`https://instagram.com/${artist.instagram.replace('@', '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-9)', textDecoration: 'none' }}
                  >
                    📷 Instagram
                  </a>
                </Text>
              )}
              
              {artist.facebook && (
                <Text size="2" asChild>
                  <a 
                    href={artist.facebook} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-9)', textDecoration: 'none' }}
                  >
                    👥 Facebook
                  </a>
                </Text>
              )}
              
              {artist.website && (
                <Text size="2" asChild>
                  <a 
                    href={artist.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-9)', textDecoration: 'none' }}
                  >
                    🌐 Website
                  </a>
                </Text>
              )}
            </Flex>
          )}
          
          {artist.bio && (
            <Text size="2" style={{ lineHeight: '1.5', color: 'var(--gray-11)' }}>
              {artist.bio}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
};

export default ArtistsList;