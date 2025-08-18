import { useState, useEffect } from 'react';
import { Box, Text, Flex, Spinner } from '@radix-ui/themes';
import { supabase } from '../lib/supabase';

const ArtistsList = ({ eventId }) => {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEventArtists();
  }, [eventId]);

  const fetchEventArtists = async () => {
    try {
      const { data, error } = await supabase
        .from('event_artists')
        .select(`
          artist_id,
          artist_profiles!inner (
            id,
            name,
            city_text,
            instagram
          )
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('artist_profiles(name)');

      if (error) throw error;

      // Extract artist profiles and sort alphabetically
      const artistProfiles = data
        ?.map(item => item.artist_profiles)
        .sort((a, b) => a.name.localeCompare(b.name)) || [];

      setArtists(artistProfiles);
    } catch (error) {
      console.error('Error fetching event artists:', error);
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
        <Box key={artist.id} mb="2">
          <Text size="3" weight="medium">{artist.name}</Text>
        </Box>
      ))}
    </Box>
  );
};

export default ArtistsList;