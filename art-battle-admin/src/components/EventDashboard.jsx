import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Badge,
  Grid,
  Button,
  TextField,
  Select,
  Spinner
} from '@radix-ui/themes';
import { MagnifyingGlassIcon, CalendarIcon, PersonIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { DebugField } from './DebugComponents';
import { debugObject } from '../lib/debugHelpers';
import EventSearch from './EventSearch';

const EventDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [eventGroups, setEventGroups] = useState({
    upcoming30: [],
    past30: [],
    future: [],
    past30to120: []
  });
  const [healthScores, setHealthScores] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTags, setActiveTags] = useState(new Set());
  const [error, setError] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, [user]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          description,
          venue,
          event_start_datetime,
          event_end_datetime,
          enabled,
          show_in_app,
          timezone_icann,
          cities(name, country_id, countries(name, code))
        `)
        .order('event_start_datetime', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('Error fetching events:', fetchError);
        setError(fetchError.message);
        return;
      }

      console.log('EventDashboard: Fetched', data?.length, 'events from database');
      debugObject(data?.[0], 'Sample Event Data');
      setEvents(data || []);

      // Group events by time periods
      groupEventsByTime(data || []);
    } catch (err) {
      console.error('Error in fetchEvents:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const groupEventsByTime = (allEvents) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneHundredTwentyDaysAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

    const groups = {
      upcoming30: [],
      past30: [],
      future: [],
      past30to120: []
    };

    allEvents.forEach(event => {
      const eventDate = new Date(event.event_start_datetime);
      
      if (eventDate >= now && eventDate <= thirtyDaysFromNow) {
        // Upcoming events in next 30 days
        groups.upcoming30.push(event);
      } else if (eventDate >= thirtyDaysAgo && eventDate < now) {
        // Events in last 30 days
        groups.past30.push(event);
      } else if (eventDate > thirtyDaysFromNow) {
        // Future events beyond 30 days
        groups.future.push(event);
      } else if (eventDate >= oneHundredTwentyDaysAgo && eventDate < thirtyDaysAgo) {
        // Past events from -30 to -120 days
        groups.past30to120.push(event);
      }
    });

    // Sort each group appropriately
    groups.upcoming30.sort((a, b) => new Date(a.event_start_datetime) - new Date(b.event_start_datetime)); // Oldest first
    groups.past30.sort((a, b) => new Date(b.event_start_datetime) - new Date(a.event_start_datetime)); // Newest first
    groups.future.sort((a, b) => new Date(a.event_start_datetime) - new Date(b.event_start_datetime)); // Oldest first
    groups.past30to120.sort((a, b) => new Date(b.event_start_datetime) - new Date(a.event_start_datetime)); // Newest first

    setEventGroups(groups);

    // Load health scores for upcoming events
    loadHealthScores(groups.upcoming30);
  };

  const loadHealthScores = async (upcomingEvents) => {
    if (upcomingEvents.length === 0) return;
    
    setLoadingHealth(true);
    const scores = new Map();
    
    try {
      // Load health scores in parallel for all upcoming events
      const healthPromises = upcomingEvents.map(async (event) => {
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-report-public/${event.eid}?format=json`);
          if (response.ok) {
            const healthData = await response.json();
            return { eid: event.eid, score: healthData.health_score };
          }
        } catch (error) {
          console.warn(`Failed to load health score for ${event.eid}:`, error);
        }
        return { eid: event.eid, score: null };
      });

      const results = await Promise.all(healthPromises);
      results.forEach(({ eid, score }) => {
        if (score !== null) {
          scores.set(eid, score);
        }
      });

      setHealthScores(scores);
    } catch (error) {
      console.error('Error loading health scores:', error);
    } finally {
      setLoadingHealth(false);
    }
  };

  const getEventStatus = (event) => {
    // Active = enabled AND show_in_app
    if (!event.enabled || !event.show_in_app) return 'disabled';
    
    const now = new Date();
    const startTime = new Date(event.event_start_datetime);
    const endTime = new Date(event.event_end_datetime);
    
    if (now < startTime) return 'upcoming';
    if (now > endTime) return 'completed';
    return 'active';
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { color: 'green', label: 'Active' },
      upcoming: { color: 'blue', label: 'Upcoming' },
      completed: { color: 'gray', label: 'Completed' },
      disabled: { color: 'red', label: 'Disabled' }
    };
    
    const config = statusConfig[status] || statusConfig.disabled;
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  // Fuzzy search implementation
  const fuzzySearch = (items, term) => {
    if (!term) return items;
    
    const searchLower = term.toLowerCase();
    
    return items
      .map(item => {
        let score = 0;
        const name = (item.name || '').toLowerCase();
        const eid = (item.eid || '').toLowerCase();
        const venue = (item.venue || '').toLowerCase();
        const cityName = (item.cities?.name || '').toLowerCase();
        const countryName = (item.cities?.countries?.name || '').toLowerCase();
        
        // Exact matches get highest score
        if (name.includes(searchLower)) score += 100;
        if (eid.includes(searchLower)) score += 90;
        if (venue.includes(searchLower)) score += 70;
        if (cityName.includes(searchLower)) score += 50;
        if (countryName.includes(searchLower)) score += 40;
        
        // Fuzzy matching - characters in order for name
        if (searchLower.length >= 2) {
          let nameIndex = 0;
          let matches = 0;
          for (let char of searchLower) {
            const found = name.indexOf(char, nameIndex);
            if (found !== -1) {
              matches++;
              nameIndex = found + 1;
            }
          }
          if (matches >= Math.ceil(searchLower.length * 0.6)) {
            score += 20;
          }
        }
        
        return { ...item, searchScore: score };
      })
      .filter(item => item.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore);
  };

  // Filter events based on search and active tags
  const filteredEvents = () => {
    let filtered = events;
    
    // Apply tag filters
    if (activeTags.size > 0) {
      filtered = filtered.filter(event => {
        const status = getEventStatus(event);
        
        return Array.from(activeTags).some(tag => {
          switch (tag) {
            case 'live': return status === 'active';
            case 'upcoming': return status === 'upcoming';
            case 'completed': return status === 'completed';
            case 'disabled': return status === 'disabled';
            case 'high-priority': 
              // Events starting within 7 days or currently live
              const startTime = new Date(event.event_start_datetime);
              const daysUntil = (startTime - new Date()) / (1000 * 60 * 60 * 24);
              return status === 'active' || (daysUntil >= 0 && daysUntil <= 7);
            default: return false;
          }
        });
      });
    }
    
    // Apply fuzzy search
    filtered = fuzzySearch(filtered, searchTerm);
    
    return filtered;
  };

  const allFilteredEvents = filteredEvents();
  const displayedEventsList = allFilteredEvents.slice(0, displayedEvents);

  // Infinite scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop 
          >= document.documentElement.offsetHeight - 1000) {
        if (displayedEvents < allFilteredEvents.length) {
          setDisplayedEvents(prev => Math.min(prev + 20, allFilteredEvents.length));
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [displayedEvents, allFilteredEvents.length]);

  // Update hasMore when filtered events change
  useEffect(() => {
    setHasMore(displayedEvents < allFilteredEvents.length);
  }, [displayedEvents, allFilteredEvents.length]);

  // Reset displayed events when filters change
  useEffect(() => {
    setDisplayedEvents(20);
  }, [searchTerm, activeTags]);

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
            <Heading size="6" mb="1">
              Event Dashboard
              {events.length > 0 && (
                <Badge color="blue" size="2" ml="2">
                  {events.length} total
                </Badge>
              )}
            </Heading>
            <Text color="gray" size="2">
              Manage and monitor Art Battle events
            </Text>
          </Box>
          <Button onClick={() => navigate('/events/create')}>
            Create Event
          </Button>
        </Flex>

        {/* Search and Filters */}
        <Card>
          <Box p="4">
            <Flex direction="column" gap="4">
              {/* Search Input */}
              <Box>
                <TextField.Root
                  placeholder="Search events by name, EID, or venue..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  size="3"
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon height="16" width="16" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>

              {/* Quick Filter Tags */}
              <Box>
                <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
                  Quick Filters
                </Text>
                <Flex wrap="wrap" gap="2">
                  {[
                    { id: 'live', label: 'Live', color: 'green' },
                    { id: 'upcoming', label: 'Upcoming', color: 'blue' },
                    { id: 'completed', label: 'Completed', color: 'gray' },
                    { id: 'disabled', label: 'Disabled', color: 'red' },
                    { id: 'high-priority', label: 'Priority', color: 'orange' }
                  ].map(tag => (
                    <Button
                      key={tag.id}
                      variant={activeTags.has(tag.id) ? 'solid' : 'soft'}
                      color={activeTags.has(tag.id) ? tag.color : 'gray'}
                      size="2"
                      onClick={() => {
                        const newTags = new Set(activeTags);
                        if (newTags.has(tag.id)) {
                          newTags.delete(tag.id);
                        } else {
                          newTags.add(tag.id);
                        }
                        setActiveTags(newTags);
                      }}
                    >
                      {tag.label}
                    </Button>
                  ))}
                  {(activeTags.size > 0 || searchTerm) && (
                    <Button
                      variant="soft"
                      color="gray"
                      size="2"
                      onClick={() => {
                        setActiveTags(new Set());
                        setSearchTerm('');
                      }}
                    >
                      Clear All
                    </Button>
                  )}
                </Flex>
              </Box>

              {/* Results Summary */}
              {(searchTerm || activeTags.size > 0) && (
                <Box>
                  <Text size="2" color="blue">
                    {allFilteredEvents.length} event{allFilteredEvents.length !== 1 ? 's' : ''} found
                    {displayedEventsList.length < allFilteredEvents.length && 
                      ` (showing first ${displayedEventsList.length})`
                    }
                  </Text>
                </Box>
              )}
            </Flex>
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

        {/* Events Grid */}
        <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
          {displayedEventsList.map((event) => {
            const status = getEventStatus(event);
            const startDate = event.event_start_datetime 
              ? new Date(event.event_start_datetime).toLocaleDateString()
              : null;
            
            return (
              <Card 
                key={event.id} 
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <Box p="4">
                  <Flex direction="column" gap="3">
                    {/* Event Header */}
                    <Flex justify="between" align="start">
                      <Box>
                        <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                          <DebugField 
                            value={event.name} 
                            fieldName="event.name"
                            fallback="Unnamed Event"
                          />
                        </Text>
                        <Text size="2" color="gray">
                          <DebugField 
                            value={event.eid} 
                            fieldName="event.eid"
                            fallback="No EID"
                          />
                        </Text>
                      </Box>
                      {getStatusBadge(status)}
                    </Flex>

                    {/* Event Details */}
                    <Flex direction="column" gap="2">
                      <Flex align="center" gap="2">
                        <CalendarIcon size={14} />
                        <Text size="2">
                          <DebugField 
                            value={startDate} 
                            fieldName="event.event_start_datetime"
                            fallback="No date set"
                          />
                        </Text>
                      </Flex>
                      
                      <Flex align="center" gap="2">
                        <PersonIcon size={14} />
                        <Text size="2">
                          <DebugField 
                            value={event.venue} 
                            fieldName="event.venue"
                            fallback="No venue set"
                          />
                        </Text>
                      </Flex>

                    </Flex>

                    {/* Location */}
                    <Text size="2" color="gray">
                      <DebugField 
                        value={event.cities?.name} 
                        fieldName="cities.name"
                        fallback="Unknown city"
                      />
                      {event.cities?.countries?.name && (
                        <>
                          , <DebugField 
                            value={event.cities.countries.name} 
                            fieldName="cities.countries.name"
                          />
                        </>
                      )}
                    </Text>
                  </Flex>
                </Box>
              </Card>
            );
          })}
        </Grid>

        {/* Infinite Scroll Loading Indicator */}
        {hasMore && displayedEventsList.length > 0 && (
          <Box style={{ textAlign: 'center', padding: '2rem' }}>
            <Text size="2" color="gray">
              Showing {displayedEventsList.length} of {allFilteredEvents.length} events
            </Text>
            <Text size="1" color="gray" style={{ display: 'block', marginTop: '0.5rem' }}>
              Scroll down to load more...
            </Text>
          </Box>
        )}

        {/* Empty State */}
        {!loading && allFilteredEvents.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                {events.length === 0 
                  ? "No events found"
                  : "No events match your search criteria"
                }
              </Text>
              {events.length === 0 ? (
                <Text size="2" color="gray">
                  You may need admin permissions to view events.
                </Text>
              ) : (
                <Text size="2" color="gray">
                  Try adjusting your search term or filters.
                </Text>
              )}
            </Box>
          </Card>
        )}
      </Flex>
    </Box>
  );
};

export default EventDashboard;