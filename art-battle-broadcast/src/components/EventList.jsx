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
import publicDataManager from '../lib/PublicDataManager';
import AuthModal from './AuthModal';
import LoadingScreen from './LoadingScreen';
import { getImageUrl } from '../lib/imageHelpers';

const EventList = () => {
  const [events, setEvents] = useState({ active: [], recent: [], future: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState(null);
  // V2 BROADCAST VERSION - Artwork preview state removed
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authRedirectTo, setAuthRedirectTo] = useState(null);
  const [visibleCounts, setVisibleCounts] = useState({
    active: 5,
    recent: 5,
    future: 5
  });
  const navigate = useNavigate();
  const { user, person, signOut, loading: authLoading, isRefreshing, sessionWarning, refreshSessionIfNeeded } = useAuth();

  useEffect(() => {
    fetchEvents();
    
    // Subscribe to events data updates
    const unsubscribe = publicDataManager.subscribe('events', (data) => {
      console.log('📡 [V2-BROADCAST] Received events update from cache');
      processEventsData(data);
    });
    
    // No loading timeout needed with stable caching
    // The loading state will be properly managed by the fetch completion
    
    return () => {
      unsubscribe();
    };
  }, []); // Remove loading dependency to prevent infinite loop

  // Process events data from any source (PublicDataManager or fallback)
  const processEventsData = (data) => {
    if (!data || !Array.isArray(data)) {
      setEvents({ active: [], recent: [], future: [] });
      return;
    }

    const now = new Date();
    const eighteenHoursAgo = new Date(now.getTime() - 18 * 60 * 60 * 1000);
    const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    // Categorize events
    const categorized = {
      active: [],
      recent: [],
      future: [],
    };

    data.forEach((event) => {
      const eventStart = new Date(event.event_start_datetime);
      
      // Debug AB3019 specifically
      if (event.eid === 'AB3019') {
        console.log('🔍 AB3019 Debug:', {
          eid: event.eid,
          name: event.name,
          eventStart: eventStart.toISOString(),
          now: now.toISOString(),
          eighteenHoursFromNow: eighteenHoursFromNow.toISOString(),
          isAfter18Hours: eventStart > eighteenHoursFromNow,
          category: eventStart > eighteenHoursFromNow ? 'future' : 
                   eventStart >= eighteenHoursAgo && eventStart <= eighteenHoursFromNow ? 'active' : 'recent'
        });
      }
      
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

    // Sort each category since endpoint ordering isn't reliable
    categorized.future.sort((a, b) => 
      new Date(a.event_start_datetime) - new Date(b.event_start_datetime)
    );
    categorized.recent.sort((a, b) => 
      new Date(b.event_start_datetime) - new Date(a.event_start_datetime)
    );

    console.log('📊 Event categorization results:', {
      active: categorized.active.length,
      recent: categorized.recent.length,
      future: categorized.future.length,
      futureEvents: categorized.future.map(e => ({ eid: e.eid, name: e.name }))
    });
    
    setEvents(categorized);
    setError(null);
    setLoading(false);
  };

  const fetchEvents = async () => {
    try {
      console.log('🚀 [V2-BROADCAST] Starting to fetch events using cached endpoints...');
      console.log('Network status:', navigator.onLine ? 'online' : 'offline');
      
      // REMOVED: Manual session refresh to prevent loading loops
      // Session will be handled automatically or user can refresh page if needed
      console.log('Skipping manual token refresh to prevent loading loops');
      
      // Use PublicDataManager for cached endpoint data
      const data = await publicDataManager.getEvents();
      console.log('✅ [V2-BROADCAST] Events loaded from cached endpoint:', data?.length, 'events');
      
      processEventsData(data);
    } catch (error) {
      console.error('❌ [V2-BROADCAST] Error fetching events from cached endpoint:', error);
      console.log('🔄 [V2-BROADCAST] Falling back to direct Supabase query...');
      
      // Fallback to direct Supabase query if cached endpoint fails
      try {
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
        
        console.log('📡 [V2-BROADCAST] Fallback: Loaded events from Supabase directly:', data?.length, 'events');
        processEventsData(data);
      } catch (fallbackError) {
        console.error('❌ [V2-BROADCAST] Fallback also failed:', fallbackError);
        setError(fallbackError.message);
        
        // Auto-retry up to 3 times with geometric progression: 4s, 8s, 16s
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount + 2) * 1000; // 4s, 8s, 16s
          console.log(`🔄 [V2-BROADCAST] Retrying in ${delay}ms (attempt ${retryCount + 1}/3)...`);
          
          setIsRetrying(true);
          setRetryCountdown(Math.floor(delay / 1000));
          
          // Start countdown
          const countdownInterval = setInterval(() => {
            setRetryCountdown(prev => {
              if (prev <= 1) {
                clearInterval(countdownInterval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          
          setTimeout(() => {
            setIsRetrying(false);
            setRetryCount(prev => prev + 1);
            fetchEvents();
          }, delay);
        } else {
          // Set empty state after all retries failed
          setEvents({ active: [], recent: [], future: [] });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const retryFetch = () => {
    setRetryCount(0);
    setError(null);
    setLoading(true);
    fetchEvents();
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
      
      // V2 BROADCAST VERSION - Artwork previews disabled to avoid direct Supabase queries
      console.log('🚀 [V2-BROADCAST] Event expansion - artwork previews disabled in broadcast version');
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
              {/* V2 BROADCAST VERSION - Simple expanded view without artwork previews */}
              <Text size="2" color="gray" mb="3">
                Click "Enter Event" to see artwork details, voting, and bidding
              </Text>
              
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
      <Container size="2" style={{ maxWidth: '600px', paddingTop: '60px' }}>
        <Box p="4">
          {/* Header content now in scrollable area */}
          <Box mb="6">
            <Box style={{ textAlign: 'center' }} mb="4">
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
                  fallback.style.cssText = 'color: var(--gray-12); font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; font-size: 2rem;';
                  e.target.parentNode.appendChild(fallback);
                }}
              />
            </Box>
            
            {/* User Info */}
            {user && (
              <Flex direction="column" align="center" gap="1">
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
                {sessionWarning && (
                  <Text size="1" color="orange" style={{ textAlign: 'center' }}>
                    ⚠️ {sessionWarning}
                  </Text>
                )}
              </Flex>
            )}
          </Box>
          
          {loading || isRefreshing ? (
            <LoadingScreen message={isRefreshing ? "Refreshing session..." : "Loading events..."} />
          ) : error ? (
            <Flex direction="column" align="center" gap="4" style={{ minHeight: '50vh', justifyContent: 'center' }}>
              <Text size="4" color="red" weight="bold" style={{ textAlign: 'center' }}>
                Failed to load events
              </Text>
              <Text size="2" color="gray" style={{ textAlign: 'center' }}>
                {error.includes('timeout') ? 'Network connection is slow or unavailable' : 
                 error.includes('fetch') ? 'Unable to connect to server' : 
                 'An unexpected error occurred'}
              </Text>
              {isRetrying ? (
                <Button disabled size="3" variant="soft">
                  <Spinner loading size="1" />
                  Retrying in {retryCountdown}s...
                </Button>
              ) : (
                <Button onClick={retryFetch} size="3">
                  Try Again
                </Button>
              )}
              {retryCount > 0 && !isRetrying && (
                <Text size="1" color="gray">
                  Attempted {retryCount} time{retryCount !== 1 ? 's' : ''}
                </Text>
              )}
            </Flex>
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