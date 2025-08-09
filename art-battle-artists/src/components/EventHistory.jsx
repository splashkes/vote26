import { useState, useEffect } from 'react';
import {
  Heading,
  Text,
  Card,
  Flex,
  Badge,
  Box,
  Skeleton,
  Callout,
  Button,
  Grid,
} from '@radix-ui/themes';
import { 
  CalendarIcon,
  PersonIcon,
  InfoCircledIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getArtworkImageUrls } from '../lib/imageHelpers';
import AuthModal from './AuthModal';

const EventHistory = () => {
  const { user, person, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [eventHistory, setEventHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user && person) {
      loadEventHistory();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, person, authLoading]);

  const loadEventHistory = async () => {
    try {
      // Get artist profile first
      const { data: profileData, error: profileError } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('person_id', person.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (!profileData) {
        setEventHistory([]);
        setLoading(false);
        return;
      }

      // Get events with artworks where this artist participated
      const { data: historyData, error: historyError } = await supabase
        .from('art')
        .select(`
          id,
          event_id,
          easel,
          round,
          winner_id,
          created_at,
          event:events(
            name,
            event_start_datetime,
            venue,
            city:cities(name)
          ),
          art_media(
            media_files!art_media_media_id_fkey(
              id,
              cloudflare_id,
              thumbnail_url,
              compressed_url
            )
          )
        `)
        .eq('artist_id', profileData.id)
        .order('created_at', { ascending: false });

      if (historyError) throw historyError;

      // Group by event but keep artworks
      const eventGroups = {};
      historyData?.forEach(art => {
        const eventId = art.event_id;
        if (!eventGroups[eventId]) {
          eventGroups[eventId] = {
            ...art.event,
            eventId,
            participated_at: art.created_at,
            artworks: []
          };
        }
        eventGroups[eventId].artworks.push({
          id: art.id,
          easel: art.easel,
          round: art.round,
          winner_id: art.winner_id,
          art_media: art.art_media
        });
      });

      setEventHistory(Object.values(eventGroups));
    } catch (err) {
      setError('Failed to load event history: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date unknown';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return 'Date error';
    }
  };

  if (authLoading || loading) {
    return (
      <Box>
        <Heading size="6" mb="4">Event History</Heading>
        <Flex direction="column" gap="4">
          {[1, 2, 3].map((i) => (
            <Card key={i} size="3">
              <Skeleton height="60px" />
            </Card>
          ))}
        </Flex>
      </Box>
    );
  }

  if (!user) {
    return (
      <>
        <Card size="3">
          <Flex direction="column" gap="4" align="center">
            <PersonIcon width="48" height="48" />
            <Heading size="6">Event History</Heading>
            <Text size="3" color="gray" align="center">
              Sign in to view your Art Battle participation history
            </Text>
            <Button size="3" onClick={() => setShowAuthModal(true)}>
              Sign In / Sign Up
            </Button>
          </Flex>
        </Card>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  return (
    <Flex direction="column" gap="6">
      <Flex direction="column" gap="2">
        <Heading size="6">Event History</Heading>
        <Text size="3" color="gray">
          Art Battle events you have participated in
        </Text>
      </Flex>

      {error && (
        <Callout.Root color="red">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {eventHistory.length === 0 ? (
        <Card size="3">
          <Flex direction="column" align="center" gap="3" py="6">
            <CalendarIcon width="48" height="48" />
            <Text size="4" weight="bold">No Event History</Text>
            <Text size="3" color="gray" align="center">
              You haven't participated in any Art Battle events yet
            </Text>
          </Flex>
        </Card>
      ) : (
        <Flex direction="column" gap="4">
          {eventHistory.map((event, index) => (
            <Card key={index} size="3">
              <Flex direction="column" gap="4">
                <Flex justify="between" align="center">
                  <Flex direction="column" gap="1">
                    <Text size="4" weight="bold">
                      {event.name}
                    </Text>
                    <Text size="2" color="gray">
                      📅 {formatDate(event.event_start_datetime)}
                      {event.venue && ` • 📍 ${event.venue}`}
                      {event.city?.name && ` • ${event.city.name}`}
                    </Text>
                  </Flex>
                  
                  <Badge color="green" variant="soft">
                    Participated
                  </Badge>
                </Flex>

                {/* Artwork Thumbnails */}
                {event.artworks && event.artworks.length > 0 && (
                  <Flex direction="column" gap="2">
                    <Text size="2" weight="medium" color="gray">
                      Your Artwork{event.artworks.length > 1 ? 's' : ''}
                    </Text>
                    <Grid columns={event.artworks.length > 5 ? "6" : "5"} gap="2">
                      {event.artworks.map((artwork) => {
                        // Get the latest media for this artwork
                        const latestMedia = artwork.art_media?.[0]?.media_files;
                        const imageUrls = getArtworkImageUrls(artwork, latestMedia);
                        const isWinner = artwork.winner_id !== null;

                        return (
                          <Box 
                            key={artwork.id} 
                            style={{ 
                              position: 'relative', 
                              aspectRatio: '1',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              // Winner glow effect
                              boxShadow: isWinner 
                                ? '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 215, 0, 0.4)' 
                                : 'none',
                              border: isWinner ? '2px solid gold' : 'none'
                            }}
                          >
                            {imageUrls.thumbnail || imageUrls.compressed || imageUrls.original ? (
                              <img
                                src={imageUrls.thumbnail || imageUrls.compressed || imageUrls.original}
                                alt={`Round ${artwork.round} - Easel ${artwork.easel}`}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover'
                                }}
                              />
                            ) : (
                              <Flex
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundColor: 'var(--gray-3)',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Text size="1" color="gray">No Image</Text>
                              </Flex>
                            )}

                            {/* Winner Badge */}
                            {isWinner && (
                              <Box
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  left: '4px',
                                  background: 'gold',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Text size="1" weight="bold" style={{ color: 'black' }}>
                                  WINNER
                                </Text>
                              </Box>
                            )}

                            {/* Round/Easel Info */}
                            <Box
                              style={{
                                position: 'absolute',
                                bottom: '4px',
                                right: '4px',
                                background: 'rgba(0, 0, 0, 0.7)',
                                borderRadius: '3px',
                                padding: '2px 4px'
                              }}
                            >
                              <Text size="1" style={{ color: 'white' }}>
                                R{artwork.round} E{artwork.easel}
                              </Text>
                            </Box>
                          </Box>
                        );
                      })}
                    </Grid>
                  </Flex>
                )}
              </Flex>
            </Card>
          ))}
        </Flex>
      )}
    </Flex>
  );
};

export default EventHistory;