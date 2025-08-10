import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  TextField,
  Spinner,
  Badge,
  Grid
} from '@radix-ui/themes';
import { MagnifyingGlassIcon, PersonIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { DebugField } from './DebugComponents';
import { debugObject } from '../lib/debugHelpers';

const ArtistManagement = () => {
  const { eventId } = useParams();
  const [artists, setArtists] = useState([]);
  const [contestants, setContestants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (eventId) {
      fetchArtistData();
    }
  }, [eventId]);

  const fetchArtistData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all artists
      const { data: artistData, error: artistError } = await supabase
        .from('artist_profiles')
        .select('*')
        .order('name');

      if (artistError) {
        console.error('Error fetching artists:', artistError);
        setError(artistError.message);
        return;
      }

      // Fetch contestants for this event
      const { data: contestantData, error: contestantError } = await supabase
        .from('round_contestants')
        .select(`
          *,
          artist_profiles(*)
        `)
        .eq('event_id', eventId);

      if (contestantError) {
        console.error('Error fetching contestants:', contestantError);
        setError(contestantError.message);
        return;
      }

      debugObject(artistData?.[0], 'Sample Artist Data');
      debugObject(contestantData?.[0], 'Sample Contestant Data');
      
      setArtists(artistData || []);
      setContestants(contestantData || []);
    } catch (err) {
      console.error('Error in fetchArtistData:', err);
      setError('Failed to load artist data');
    } finally {
      setLoading(false);
    }
  };

  const filteredArtists = artists.filter(artist => 
    !searchTerm || 
    artist.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    artist.instagram?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getContestantInfo = (artistId) => {
    return contestants.find(c => c.artist_id === artistId);
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ height: '200px' }}>
          <Spinner size="3" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="6" mb="1">Artist Management</Heading>
            <Text color="gray" size="2">
              Manage artists and contestants for this event
            </Text>
          </Box>
          <Button>
            Add Artist
          </Button>
        </Flex>

        {/* Search */}
        <Card>
          <Box p="3">
            <TextField.Root
              placeholder="Search artists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ maxWidth: '300px' }}
            >
              <TextField.Slot>
                <MagnifyingGlassIcon height="16" width="16" />
              </TextField.Slot>
            </TextField.Root>
          </Box>
        </Card>

        {/* Error Display */}
        {error && (
          <Card>
            <Box p="3">
              <Text color="red">Error: {error}</Text>
            </Box>
          </Card>
        )}

        {/* Statistics */}
        <Grid columns="3" gap="3">
          <Card>
            <Box p="3" style={{ textAlign: 'center' }}>
              <Text size="4" weight="bold" style={{ display: 'block' }}>
                {artists.length}
              </Text>
              <Text size="2" color="gray">Total Artists</Text>
            </Box>
          </Card>
          
          <Card>
            <Box p="3" style={{ textAlign: 'center' }}>
              <Text size="4" weight="bold" style={{ display: 'block' }}>
                {contestants.length}
              </Text>
              <Text size="2" color="gray">Event Contestants</Text>
            </Box>
          </Card>
          
          <Card>
            <Box p="3" style={{ textAlign: 'center' }}>
              <Text size="4" weight="bold" style={{ display: 'block' }}>
                {new Set(contestants.map(c => c.round_number)).size}
              </Text>
              <Text size="2" color="gray">Active Rounds</Text>
            </Box>
          </Card>
        </Grid>

        {/* Artists Grid */}
        <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
          {filteredArtists.map((artist) => {
            const contestantInfo = getContestantInfo(artist.id);
            
            return (
              <Card key={artist.id}>
                <Box p="4">
                  <Flex direction="column" gap="3">
                    {/* Artist Header */}
                    <Flex justify="between" align="start">
                      <Box>
                        <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                          <DebugField 
                            value={artist.name} 
                            fieldName="artist.name"
                            fallback="Unnamed Artist"
                          />
                        </Text>
                        <Text size="2" color="gray">
                          <DebugField 
                            value={artist.instagram} 
                            fieldName="artist.instagram"
                            fallback="No Instagram"
                            prefix="@"
                          />
                        </Text>
                      </Box>
                      {contestantInfo && (
                        <Badge color="green">Competing</Badge>
                      )}
                    </Flex>

                    {/* Artist Details */}
                    <Flex direction="column" gap="2">
                      <Flex align="center" gap="2">
                        <PersonIcon size={14} />
                        <Text size="2">
                          <DebugField 
                            value={artist.city} 
                            fieldName="artist.city"
                            fallback="No location"
                          />
                        </Text>
                      </Flex>
                      
                      {contestantInfo && (
                        <Text size="2" color="blue">
                          Round {contestantInfo.round_number} • Easel {contestantInfo.easel_number}
                        </Text>
                      )}
                      
                      <Text size="2" color="gray">
                        Experience: <DebugField 
                          value={artist.experience_level} 
                          fieldName="artist.experience_level"
                          fallback="Not specified"
                        />
                      </Text>
                    </Flex>

                    {/* Actions */}
                    <Flex gap="2">
                      <Button size="2" variant="soft" style={{ flex: 1 }}>
                        View Profile
                      </Button>
                      {contestantInfo ? (
                        <Button size="2" variant="outline" color="red">
                          Remove
                        </Button>
                      ) : (
                        <Button size="2" variant="outline" color="blue">
                          Add to Event
                        </Button>
                      )}
                    </Flex>
                  </Flex>
                </Box>
              </Card>
            );
          })}
        </Grid>

        {/* Empty State */}
        {!loading && filteredArtists.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray">
                {artists.length === 0 
                  ? "No artists found in the database."
                  : "No artists match your search criteria."
                }
              </Text>
            </Box>
          </Card>
        )}
      </Flex>
    </Box>
  );
};

export default ArtistManagement;