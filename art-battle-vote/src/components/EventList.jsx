import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Badge,
  ScrollArea,
  Separator,
  Skeleton,
  Spinner,
  Grid,
} from '@radix-ui/themes';
import { ChevronDownIcon, ChevronUpIcon, PersonIcon, ExitIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AuthModal from './AuthModal';
import LoadingScreen from './LoadingScreen';
import { getImageUrl } from '../lib/imageHelpers';

const EventList = () => {
  const [events, setEvents] = useState({ active: [], recent: [], future: [] });
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [topArtworks, setTopArtworks] = useState({});
  const [loadingArtworks, setLoadingArtworks] = useState({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirectTo, setAuthRedirectTo] = useState(null);
  const [visibleCounts, setVisibleCounts] = useState({
    active: 5,
    recent: 5,
    future: 5
  });
  const navigate = useNavigate();
  const { user, person, signOut, loading: authLoading } = useAuth();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const now = new Date();
      console.log('Current date:', now);
      const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000);
      const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);

      // Fetch all events within our time range
      // Get events from 2 months ago to ALL future events (no limit)
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
      
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          event_start_datetime,
          event_end_datetime,
          venue,
          enable_auction,
          vote_by_link
        `)
        .eq('enabled', true)
        .eq('show_in_app', true)
        .gte('event_start_datetime', twoMonthsAgo.toISOString())
        .order('event_start_datetime', { ascending: true });

      if (error) throw error;
      
      console.log('Events received:', data?.length || 0, 'events');

      // Check for actual duplicates by ID
      const uniqueIds = new Set();
      const duplicates = [];
      data?.forEach(event => {
        if (uniqueIds.has(event.id)) {
          duplicates.push(event);
        }
        uniqueIds.add(event.id);
      });
      
      if (duplicates.length > 0) {
        console.log('DUPLICATE EVENTS FOUND:', duplicates);
      }

      // Categorize events
      const categorized = {
        active: [],
        recent: [],
        future: [],
      };

      data.forEach((event) => {
        const eventStart = new Date(event.event_start_datetime);
        
        // Active: 18 hours before to 18 hours after now
        if (eventStart >= eighteenHoursAgo && eventStart <= eighteenHoursFromNow) {
          categorized.active.push(event);
        } 
        // Recent: 18 hours ago to 2 months ago
        else if (eventStart < eighteenHoursAgo && eventStart >= twoMonthsAgo) {
          categorized.recent.push(event);
        } 
        // Future/Upcoming: 18 hours from now onwards (all future events)
        else if (eventStart > eighteenHoursFromNow) {
          categorized.future.push(event);
        }
      });

      // Sort recent events newest first (descending)
      categorized.recent.sort((a, b) => 
        new Date(b.event_start_datetime) - new Date(a.event_start_datetime)
      );
      
      // Active and future are already sorted ascending from the query

      console.log('Categorized events:', {
        active: categorized.active.length,
        recent: categorized.recent.length,
        future: categorized.future.length,
        total: categorized.active.length + categorized.recent.length + categorized.future.length
      });

      setEvents(categorized);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEventExpanded = async (eventId) => {
    if (!user) {
      setAuthRedirectTo(`/event/${eventId}`);
      setShowAuthModal(true);
      return;
    }
    
    if (expandedEvent === eventId) {
      setExpandedEvent(null);
    } else {
      setExpandedEvent(eventId);
      
      // Fetch top voted artworks if not already loaded
      if (!topArtworks[eventId] && !loadingArtworks[eventId]) {
        setLoadingArtworks(prev => ({ ...prev, [eventId]: true }));
        
        try {
          // First get artworks with vote counts using art_uuid
          const { data: voteCounts, error: voteError } = await supabase
            .from('votes')
            .select('art_uuid')
            .eq('event_id', eventId)
            .not('art_uuid', 'is', null);
            
          if (voteError) throw voteError;
          
          // Count votes per artwork
          const votesByArt = {};
          voteCounts?.forEach(vote => {
            if (vote.art_uuid) {
              votesByArt[vote.art_uuid] = (votesByArt[vote.art_uuid] || 0) + 1;
            }
          });
          
          // Get top 4 most voted art IDs
          const topArtIds = Object.entries(votesByArt)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 4)
            .map(([artId]) => artId);
            
          if (topArtIds.length === 0) {
            setTopArtworks(prev => ({ ...prev, [eventId]: [] }));
            return;
          }
          
          // Fetch artwork details with media
          const { data: artworksData, error } = await supabase
            .from('art')
            .select(`
              id,
              easel,
              round,
              artist_profiles!art_artist_id_fkey (
                name
              ),
              art_media (
                media_files!art_media_media_id_fkey (
                  thumbnail_url,
                  compressed_url,
                  created_at
                )
              )
            `)
            .in('id', topArtIds);
            
          if (error) throw error;
          
          // Process the data to get vote counts and images
          const processedArtworks = artworksData?.map(artwork => {
            // Sort media by created_at to get latest first
            const sortedMedia = artwork.art_media?.sort((a, b) => {
              const dateA = new Date(a.media_files?.created_at || 0);
              const dateB = new Date(b.media_files?.created_at || 0);
              return dateB - dateA;
            }) || [];
            
            const latestMedia = sortedMedia[0];
            
            return {
              id: artwork.id,
              easel: artwork.easel,
              round: artwork.round,
              artistName: artwork.artist_profiles?.name || 'Unknown Artist',
              voteCount: votesByArt[artwork.id] || 0,
              thumbnail: getImageUrl(artwork, latestMedia?.media_files, 'thumbnail') || '/placeholder.jpg',
              mediaFile: latestMedia?.media_files // Keep reference for potential future use
            };
          }) || [];
          
          // Sort by vote count to maintain order
          processedArtworks.sort((a, b) => b.voteCount - a.voteCount);
          
          setTopArtworks(prev => ({ ...prev, [eventId]: processedArtworks }));
        } catch (error) {
          console.error('Error fetching top artworks:', error);
        } finally {
          setLoadingArtworks(prev => ({ ...prev, [eventId]: false }));
        }
      }
    }
  };

  const loadMoreEvents = (category) => {
    setVisibleCounts(prev => ({
      ...prev,
      [category]: prev[category] + 5
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const EventCard = ({ event, category }) => {
    const isExpanded = expandedEvent === event.id;
    const isActive = category === 'active';
    const isPast = category === 'recent';

    return (
      <Card
        size="3"
        style={{
          marginBottom: '16px',
          backgroundColor: isActive ? 'var(--accent-3)' : 'var(--gray-3)',
          border: isActive ? '2px solid var(--accent-8)' : '1px solid var(--gray-6)',
          opacity: isPast ? 0.7 : 1,
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
      >
        <Box
          onClick={() => toggleEventExpanded(event.id)}
          style={{ cursor: 'pointer' }}
        >
          <Flex justify="between" align="center">
            <Box style={{ flex: 1 }}>
              <Flex align="center" gap="2" mb="1">
                <Text size="4" weight="bold">
                  {event.name}
                </Text>
                {isActive && (
                  <Badge color="red" variant="solid" size="2">
                    🔴 LIVE
                  </Badge>
                )}
              </Flex>
              <Text size="2" color="gray">
                {formatDate(event.event_start_datetime)}
                {event.venue && ` • ${event.venue}`}
              </Text>
            </Box>
            <Box>
              {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </Box>
          </Flex>
        </Box>

        {isExpanded && (
          <>
            <Separator size="4" my="3" />
            <Box>
              <Flex direction="column" gap="3">
                
                {/* Top Voted Artworks */}
                <Box>
                  {loadingArtworks[event.id] ? (
                    <Flex justify="center" py="3">
                      <Spinner size="2" />
                    </Flex>
                  ) : topArtworks[event.id]?.length > 0 ? (
                    (() => {
                      // Calculate total votes in the event
                      const totalVotes = topArtworks[event.id].reduce((sum, artwork) => sum + artwork.voteCount, 0);
                      
                      // Only show thumbnails if there are at least 10 votes total
                      if (totalVotes >= 10) {
                        return (
                          <Grid columns="4" gap="2">
                            {topArtworks[event.id].map((artwork) => (
                              <Flex
                                key={artwork.id}
                                direction="column"
                                gap="1"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/event/${event.id}`);
                                }}
                              >
                                <Box 
                                  style={{ 
                                    position: 'relative',
                                    paddingBottom: '100%',
                                    backgroundColor: 'var(--gray-3)',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                  }}
                                >
                                  <img
                                    src={artwork.thumbnail}
                                    alt={artwork.artistName}
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                </Box>
                                <Text size="1" color="gray" style={{ textAlign: 'center' }}>
                                  {artwork.artistName}
                                </Text>
                              </Flex>
                            ))}
                          </Grid>
                        );
                      } else {
                        return null; // Show nothing if less than 10 votes
                      }
                    })()
                  ) : (
                    <Text size="2" color="gray">No votes yet</Text>
                  )}
                </Box>
              </Flex>
              
              <Button
                size="3"
                variant="solid"
                color="crimson"
                style={{ 
                  width: '100%', 
                  marginTop: '16px',
                  height: '48px',
                  fontSize: '16px',
                  fontWeight: '600'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!user) {
                    setAuthRedirectTo(`/event/${event.id}`);
                    setShowAuthModal(true);
                  } else {
                    navigate(`/event/${event.id}`);
                  }
                }}
              >
                Enter Event →
              </Button>
            </Box>
          </>
        )}
      </Card>
    );
  };

  return (
    <Box style={{ minHeight: '100vh', backgroundColor: 'var(--gray-1)' }}>
      <Box
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--gray-2)',
          backdropFilter: 'blur(10px)',
          zIndex: 100,
          borderBottom: '1px solid var(--gray-6)',
          padding: '20px',
        }}
      >
        <Container size="2" style={{ maxWidth: '600px' }}>
          <Flex direction="column" gap="2">
            <Box style={{ textAlign: 'center' }}>
              <img
                src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public"
                alt="Art Battle Vote"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  maxHeight: '60px',
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  // Fallback to text if image fails to load
                  e.target.style.display = 'none';
                  const fallback = document.createElement('h1');
                  fallback.innerText = 'ART BATTLE VOTE';
                  fallback.style.cssText = 'color: white; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; font-size: 2rem;';
                  e.target.parentNode.appendChild(fallback);
                }}
              />
            </Box>
            
            {/* User Info */}
            {user && (
              <Flex align="center" justify="center" gap="2">
                <PersonIcon />
                <Text size="2" color="gray">
                  {person?.name || person?.first_name || person?.nickname || 
                   (user.phone ? `User ${user.phone.slice(-4)}` : 'Logged in')}
                </Text>
                <Button 
                  size="1" 
                  variant="ghost" 
                  onClick={() => signOut()}
                  style={{ padding: '2px 8px' }}
                >
                  <ExitIcon />
                </Button>
              </Flex>
            )}
          </Flex>
        </Container>
      </Box>

      <Container size="2" style={{ maxWidth: '600px', paddingTop: user ? '120px' : '100px' }}>
        <Box p="4">
          {loading ? (
            <LoadingScreen message="Loading events..." />
          ) : (
            <>
              {/* Active Events */}
              {events.active.length > 0 && (
                <Box mb="5">
                  <Heading size="5" mb="3" style={{ color: 'var(--accent-11)' }}>
                    🔥 Active Events
                  </Heading>
                  {events.active.slice(0, visibleCounts.active).map((event) => (
                    <EventCard key={event.id} event={event} category="active" />
                  ))}
                  {events.active.length > visibleCounts.active && (
                    <Button
                      size="3"
                      variant="outline"
                      onClick={() => loadMoreEvents('active')}
                      style={{ width: '100%', marginTop: '12px' }}
                    >
                      Load more ({events.active.length - visibleCounts.active})
                    </Button>
                  )}
                </Box>
              )}

              {/* Future Events */}
              {events.future.length > 0 && (
                <Box mb="5">
                  <Heading size="5" mb="3" style={{ color: 'var(--gray-12)' }}>
                    🎯 Upcoming Events
                  </Heading>
                  {events.future.slice(0, visibleCounts.future).map((event) => (
                    <EventCard key={event.id} event={event} category="future" />
                  ))}
                  {events.future.length > visibleCounts.future && (
                    <Button
                      size="3"
                      variant="outline"
                      onClick={() => loadMoreEvents('future')}
                      style={{ width: '100%', marginTop: '12px' }}
                    >
                      Load more ({events.future.length - visibleCounts.future})
                    </Button>
                  )}
                </Box>
              )}

              {/* Recent Events */}
              {events.recent.length > 0 && (
                <Box mb="5">
                  <Heading size="5" mb="3" style={{ color: 'var(--gray-11)' }}>
                    📅 Recent Events
                  </Heading>
                  {events.recent.slice(0, visibleCounts.recent).map((event) => (
                    <EventCard key={event.id} event={event} category="recent" />
                  ))}
                  {events.recent.length > visibleCounts.recent && (
                    <Button
                      size="3"
                      variant="outline"
                      onClick={() => loadMoreEvents('recent')}
                      style={{ width: '100%', marginTop: '12px' }}
                    >
                      Load more ({events.recent.length - visibleCounts.recent})
                    </Button>
                  )}
                </Box>
              )}

              {/* No events message */}
              {events.active.length === 0 &&
                events.recent.length === 0 &&
                events.future.length === 0 && (
                  <Text size="3" color="gray" align="center">
                    No events found
                  </Text>
                )}

              {/* Footer Buttons */}
              <Box mt="8" mb="4">
                <Separator size="4" mb="6" />
                <Flex direction="column" gap="3">
                  <Button
                    size="3"
                    variant="outline"
                    onClick={() => window.open('https://artbattle.com/artists', '_blank')}
                    style={{ width: '100%' }}
                  >
                    Apply to Compete
                  </Button>
                  <Button
                    size="3"
                    variant="outline"
                    onClick={() => window.open('https://artbattle.com/contact', '_blank')}
                    style={{ width: '100%' }}
                  >
                    Contact Art Battle
                  </Button>
                  <Button
                    size="3"
                    variant="outline"
                    onClick={() => window.open('https://artbattle.com/contact', '_blank')}
                    style={{ width: '100%' }}
                  >
                    Start a New Series
                  </Button>
                </Flex>
              </Box>
            </>
          )}
        </Box>
      </Container>
      
      {/* Auth Modal */}
      <AuthModal 
        open={showAuthModal} 
        onOpenChange={(open) => {
          setShowAuthModal(open);
          if (!open) {
            setAuthRedirectTo(null); // Clear redirect when modal closes
          }
        }}
        redirectTo={authRedirectTo}
      />
    </Box>
  );
};

export default EventList;