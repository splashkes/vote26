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
import { publicDataManager } from '../utils/publicDataManager';
import AuthModal from './AuthModal';
import LoadingScreen from './LoadingScreen';
import { getImageUrl } from '../lib/imageHelpers';

const EventListV2Fixed = () => {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [redirectTo, setRedirectTo] = useState(null);
  const [expandedEvents, setExpandedEvents] = useState({});

  const { user, person, signOut, refreshSessionIfNeeded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchEvents();
    
    // Set loading to false after 3 seconds regardless
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.log('🔄 Loading timeout reached, setting loading to false');
        setLoading(false);
      }
    }, 3000);
    
    return () => clearTimeout(loadingTimeout);
  }, []); // Remove loading dependency to prevent infinite loop

  const fetchEvents = async () => {
    try {
      console.log('🔄 [V2] Starting to fetch events using cached endpoints...');
      
      const result = await publicDataManager.fetchEventsList();
      const data = result.events || [];
      console.log('✅ [V2] Events fetch completed using cached endpoint:', { dataLength: data?.length });

      // Process the events data
      if (data && Array.isArray(data)) {
        const now = new Date();
        const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000);
        const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);

        // Categorize and sort events
        const processedEvents = data.map(event => ({
          ...event,
          eventDate: new Date(event.event_start_datetime),
          isActive: now >= new Date(event.event_start_datetime) && now <= new Date(event.event_end_datetime),
          isRecent: new Date(event.event_start_datetime) >= eighteenHoursAgo && new Date(event.event_start_datetime) <= now,
          isUpcoming: new Date(event.event_start_datetime) > now && new Date(event.event_start_datetime) <= eighteenHoursFromNow,
          isFuture: new Date(event.event_start_datetime) > eighteenHoursFromNow,
          isPast: new Date(event.event_start_datetime) < eighteenHoursAgo
        }));

        setEvents(processedEvents);
        setError(null);
        console.log('✅ [V2] Events processed and cached successfully');
      } else {
        setEvents([]);
        setError('No events data received from cached endpoint');
      }
    } catch (error) {
      console.error('❌ [V2] Error fetching events from cached endpoint:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleExpanded = (eventId) => {
    setExpandedEvents(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  const getStatusBadge = (event) => {
    if (event.isActive) {
      return <Badge color="green" size="2">🔴 LIVE</Badge>;
    } else if (event.isRecent) {
      return <Badge color="orange" size="2">📺 Recent</Badge>;
    } else if (event.isUpcoming) {
      return <Badge color="blue" size="2">⏰ Soon</Badge>;
    } else if (event.isFuture) {
      return <Badge color="gray" size="2">📅 Future</Badge>;
    } else if (event.isPast) {
      return <Badge color="gray" size="2" variant="soft">📜 Past</Badge>;
    }
    return null;
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error && events.length === 0) {
    return (
      <Container size="2" py="6">
        <Box style={{ textAlign: 'center' }}>
          <Text color="red" size="4" weight="medium">
            {error}
          </Text>
          <Box mt="4">
            <Button onClick={fetchEvents} variant="soft">
              Try Again
            </Button>
          </Box>
        </Box>
      </Container>
    );
  }

  // Group events by status
  const liveEvents = events.filter(e => e.isActive);
  const upcomingEvents = events.filter(e => e.isUpcoming || e.isFuture);
  const pastEvents = events.filter(e => e.isPast || e.isRecent);

  return (
    <Container size="4" py="4">
      <Box mb="6">
        <Flex justify="between" align="center" mb="4">
          <Heading size="8" weight="bold">
            🎨 Art Battle Events (V2 Cached)
          </Heading>
          
          {user ? (
            <Flex align="center" gap="3">
              <Flex align="center" gap="2">
                <PersonIcon />
                <Text size="2" weight="medium">
                  {person?.display_name || user.phone || user.email}
                </Text>
              </Flex>
              <Button variant="ghost" size="2" onClick={handleSignOut}>
                <ExitIcon />
                Sign Out
              </Button>
            </Flex>
          ) : (
            <Button 
              onClick={() => setIsAuthModalOpen(true)}
              variant="solid"
              size="3"
            >
              <PersonIcon />
              Login to Vote
            </Button>
          )}
        </Flex>

        {error && (
          <Box mb="4">
            <Text color="red" size="2">
              ⚠️ {error} (Showing cached data)
            </Text>
          </Box>
        )}
      </Box>

      {/* Live Events */}
      {liveEvents.length > 0 && (
        <Box mb="6">
          <Heading size="5" mb="3" color="red">
            🔴 Live Events
          </Heading>
          <Grid columns="1" gap="3">
            {liveEvents.map(event => (
              <Card key={event.eid} size="3" variant="classic" style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/event/${event.eid}`)}>
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start">
                    <Box flex="1">
                      <Heading size="4" weight="bold" mb="1">
                        {event.name}
                      </Heading>
                      <Text size="2" color="gray">
                        {formatDate(event.event_start_datetime)}
                      </Text>
                    </Box>
                    {getStatusBadge(event)}
                  </Flex>
                  
                  {event.venue && (
                    <Text size="2" color="gray">
                      📍 {event.venue}
                    </Text>
                  )}
                </Flex>
              </Card>
            ))}
          </Grid>
        </Box>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <Box mb="6">
          <Heading size="5" mb="3">
            📅 Upcoming Events
          </Heading>
          <Grid columns="1" gap="3">
            {upcomingEvents.map(event => (
              <Card key={event.eid} size="3" variant="surface" style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/event/${event.eid}`)}>
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start">
                    <Box flex="1">
                      <Heading size="4" weight="bold" mb="1">
                        {event.name}
                      </Heading>
                      <Text size="2" color="gray">
                        {formatDate(event.event_start_datetime)}
                      </Text>
                    </Box>
                    {getStatusBadge(event)}
                  </Flex>
                  
                  {event.venue && (
                    <Text size="2" color="gray">
                      📍 {event.venue}
                    </Text>
                  )}
                </Flex>
              </Card>
            ))}
          </Grid>
        </Box>
      )}

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <Box mb="6">
          <Heading size="5" mb="3">
            📜 Past Events
          </Heading>
          <Grid columns="1" gap="3">
            {pastEvents.slice(0, 5).map(event => (
              <Card key={event.eid} size="2" variant="ghost" style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/event/${event.eid}`)}>
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="start">
                    <Box flex="1">
                      <Heading size="3" weight="medium" mb="1">
                        {event.name}
                      </Heading>
                      <Text size="1" color="gray">
                        {formatDate(event.event_start_datetime)}
                      </Text>
                    </Box>
                    {getStatusBadge(event)}
                  </Flex>
                  
                  {event.venue && (
                    <Text size="1" color="gray">
                      📍 {event.venue}
                    </Text>
                  )}
                </Flex>
              </Card>
            ))}
          </Grid>
          
          {pastEvents.length > 5 && (
            <Box mt="3" style={{ textAlign: 'center' }}>
              <Text size="2" color="gray">
                ... and {pastEvents.length - 5} more past events
              </Text>
            </Box>
          )}
        </Box>
      )}

      {events.length === 0 && (
        <Box style={{ textAlign: 'center' }} py="8">
          <Text size="5" weight="medium" mb="2">
            No events found
          </Text>
          <Text size="3" color="gray" mb="4">
            Check back soon for upcoming Art Battle events!
          </Text>
          <Button onClick={fetchEvents} variant="soft">
            Refresh Events
          </Button>
        </Box>
      )}

      <AuthModal 
        open={isAuthModalOpen} 
        onOpenChange={setIsAuthModalOpen}
        redirectTo={redirectTo}
      />
    </Container>
  );
};

export default EventListV2Fixed;