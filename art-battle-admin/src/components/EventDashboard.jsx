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
  const [cityGroups, setCityGroups] = useState([]);
  const [userCityAccess, setUserCityAccess] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [healthScores, setHealthScores] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTags, setActiveTags] = useState(new Set());
  const [error, setError] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, [user]);

  // Search effect for all events (including older than 120 days)
  useEffect(() => {
    const searchEvents = async () => {
      if (!searchTerm || searchTerm.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        // Check admin user's city access restrictions for search
        let cityFilter = null;
        if (user?.email) {
          const { data: adminUser } = await supabase
            .from('abhq_admin_users')
            .select('cities_access')
            .eq('email', user.email)
            .eq('active', true)
            .single();
          
          // If admin has specific cities_access (not empty array), apply filter
          if (adminUser?.cities_access && adminUser.cities_access.length > 0) {
            cityFilter = adminUser.cities_access;
          }
        }
        
        // Search ALL events in database, not just the ones we've loaded
        const searchTermLower = searchTerm.toLowerCase().trim();
        
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
            eventbrite_id,
            city_id,
            cities(name, country_id, countries(name, code))
          `)
          .or(`name.ilike.%${searchTerm}%,eid.ilike.%${searchTerm}%,venue.ilike.%${searchTerm}%`)
          .order('event_start_datetime', { ascending: false });

        // Apply city filter if admin has restricted access
        if (cityFilter) {
          query = query.in('city_id', cityFilter);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Search error:', error);
          return;
        }

        setSearchResults(data || []);
      } catch (err) {
        console.error('Error searching events:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchEvents, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check admin user's city access restrictions and level
      let cityFilter = null;
      if (user?.email) {
        const { data: adminUser } = await supabase
          .from('abhq_admin_users')
          .select('cities_access, level')
          .eq('email', user.email)
          .eq('active', true)
          .single();

        // Check if user is super admin (producer level)
        const isSuperAdmin = adminUser?.level === 'producer';
        setIsSuperAdmin(isSuperAdmin);

        // If admin has specific cities_access (not empty array), apply filter
        if (adminUser?.cities_access && adminUser.cities_access.length > 0) {
          cityFilter = adminUser.cities_access;
          setUserCityAccess(adminUser.cities_access);
        } else {
          setUserCityAccess(null);
        }
      }
      
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
          eventbrite_id,
          city_id,
          cities(name, country_id, countries(name, code))
        `)
        .order('event_start_datetime', { ascending: false });

      // Apply city filter if admin has restricted access
      if (cityFilter) {
        query = query.in('city_id', cityFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        console.error('Error fetching events:', fetchError);
        setError(fetchError.message);
        return;
      }

      // Event fetching logged for monitoring
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

    // Group events by city
    groupEventsByCity(allEvents);
  };

  const groupEventsByCity = (allEvents) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Filter events to recent (past 30 days) or upcoming (next 30 days)
    const relevantEvents = allEvents.filter(event => {
      const eventDate = new Date(event.event_start_datetime);
      return eventDate >= thirtyDaysAgo && eventDate <= thirtyDaysFromNow;
    });

    // Group by city
    const cityMap = new Map();

    relevantEvents.forEach(event => {
      if (!event.city_id || !event.cities) return;

      const cityId = event.city_id;
      const cityName = event.cities.name;
      const countryName = event.cities.countries?.name || '';
      const countryCode = event.cities.countries?.code || '';

      if (!cityMap.has(cityId)) {
        cityMap.set(cityId, {
          cityId,
          cityName,
          countryName,
          countryCode,
          events: []
        });
      }

      cityMap.get(cityId).events.push(event);
    });

    // Convert to array and sort by city name
    const cityArray = Array.from(cityMap.values())
      .sort((a, b) => a.cityName.localeCompare(b.cityName));

    // Filter by user's city access if applicable
    let filteredCities = cityArray;
    if (userCityAccess && userCityAccess.length > 0) {
      filteredCities = cityArray.filter(city => userCityAccess.includes(city.cityId));
    }

    setCityGroups(filteredCities);
  };

  const loadHealthScores = async (upcomingEvents) => {
    if (upcomingEvents.length === 0) return;
    
    setLoadingHealth(true);
    const scores = new Map();
    
    try {
      // Get health scores from ai_analysis_cache for all upcoming events
      const eids = upcomingEvents.map(event => event.eid);
      
      const { data: healthData, error } = await supabase
        .from('ai_analysis_cache')
        .select('event_id, result, created_at')
        .in('event_id', eids)
        .eq('analysis_type', 'health_scores')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading health scores:', error);
        return;
      }

      // Process health data and extract the 4 key scores
      if (healthData) {
        const processedData = new Map();
        const now = new Date();
        const thirtysixHoursAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000);
        
        // Group by event_id and get the most recent
        const latestHealthData = healthData.reduce((acc, item) => {
          if (!acc[item.event_id] || acc[item.event_id].created_at < item.created_at) {
            acc[item.event_id] = item;
          }
          return acc;
        }, {});

        Object.values(latestHealthData).forEach(item => {
          // Check if the health data is fresh (less than 36 hours old)
          const createdAt = new Date(item.created_at);
          const isFresh = createdAt > thirtysixHoursAgo;
          
          if (isFresh && item.result?.scores && Array.isArray(item.result.scores)) {
            // Extract the 4 scores with their colors
            const fourScores = item.result.scores.map(scoreItem => ({
              value: scoreItem.score,
              status: scoreItem.status,
              area: scoreItem.area
            }));
            processedData.set(item.event_id, fourScores);
          }
        });

        setHealthScores(processedData);
      }
    } catch (error) {
      console.error('Error loading health scores:', error);
    } finally {
      setLoadingHealth(false);
    }
  };

  const getHealthColor = (status) => {
    switch (status) {
      case 'good': return 'green';
      case 'needs-attention': return 'yellow';
      case 'critical': return 'red';
      default: return 'gray';
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

  // Calculate total events for display
  const totalVisibleEvents = eventGroups.upcoming30.length + 
                             eventGroups.past30.length + 
                             eventGroups.future.length + 
                             eventGroups.past30to120.length;

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
                  {totalVisibleEvents} showing
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
              {totalVisibleEvents > 0 && (
                <Box>
                  <Text size="2" color="blue">
                    {totalVisibleEvents} event{totalVisibleEvents !== 1 ? 's' : ''} in visible date ranges
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

        {/* Search Results */}
        {searchTerm && searchTerm.length >= 2 && (
          <Box>
            <Flex align="center" gap="3" mb="4">
              <Heading size="4">Search Results</Heading>
              {isSearching && <Spinner size="1" />}
              {!isSearching && (
                <Badge color="blue">{searchResults.length}</Badge>
              )}
              <Text size="2" color="gray">for "{searchTerm}"</Text>
            </Flex>
            {searchResults.length > 0 ? (
              <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
                {searchResults.map((event) => {
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
            ) : !isSearching ? (
              <Card>
                <Box p="6" style={{ textAlign: 'center' }}>
                  <Text size="3" color="gray">No events found matching "{searchTerm}"</Text>
                </Box>
              </Card>
            ) : null}
          </Box>
        )}

        {/* City Activity Cards */}
        {!searchTerm && cityGroups.length > 0 && (
          <Box>
            <Flex align="center" gap="3" mb="4">
              <Heading size="4">Active Cities</Heading>
              <Badge color="purple">{cityGroups.length}</Badge>
              <Text size="2" color="gray">With recent or upcoming events</Text>
            </Flex>
            <Grid columns={{ initial: '1', sm: '2', md: '3', lg: '4' }} gap="4">
              {cityGroups.map((cityGroup) => {
                // Count upcoming vs past events
                const now = new Date();
                const upcomingCount = cityGroup.events.filter(e =>
                  new Date(e.event_start_datetime) >= now
                ).length;
                const pastCount = cityGroup.events.length - upcomingCount;

                // Get most recent/upcoming event
                const sortedEvents = [...cityGroup.events].sort((a, b) =>
                  new Date(b.event_start_datetime) - new Date(a.event_start_datetime)
                );
                const nextEvent = sortedEvents.find(e => new Date(e.event_start_datetime) >= now);
                const latestEvent = sortedEvents[0];
                const featuredEvent = nextEvent || latestEvent;

                return (
                  <Card
                    key={cityGroup.cityId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/cities/${cityGroup.cityId}`)}
                  >
                    <Box p="4">
                      <Flex direction="column" gap="3">
                        {/* City Header */}
                        <Box>
                          <Text size="4" weight="bold" mb="1" style={{ display: 'block' }}>
                            {cityGroup.cityName}
                          </Text>
                          <Text size="2" color="gray">
                            {cityGroup.countryName} ({cityGroup.countryCode})
                          </Text>
                        </Box>

                        {/* Event Counts */}
                        <Flex gap="2" wrap="wrap">
                          {upcomingCount > 0 && (
                            <Badge color="blue" size="2">
                              {upcomingCount} Upcoming
                            </Badge>
                          )}
                          {pastCount > 0 && (
                            <Badge color="green" size="2">
                              {pastCount} Recent
                            </Badge>
                          )}
                        </Flex>

                        {/* Featured Event */}
                        {featuredEvent && (
                          <Box
                            p="3"
                            style={{
                              backgroundColor: 'var(--gray-2)',
                              borderRadius: '6px',
                              borderLeft: nextEvent ? '3px solid var(--blue-9)' : '3px solid var(--green-9)'
                            }}
                          >
                            <Flex direction="column" gap="2">
                              <Text size="2" weight="medium">
                                {nextEvent ? 'Next Event:' : 'Latest Event:'}
                              </Text>
                              <Text size="2" weight="bold">
                                {featuredEvent.eid}
                              </Text>
                              <Flex align="center" gap="2">
                                <CalendarIcon size={12} />
                                <Text size="1" color="gray">
                                  {new Date(featuredEvent.event_start_datetime).toLocaleDateString()}
                                </Text>
                              </Flex>
                            </Flex>
                          </Box>
                        )}

                        {/* Total Events Badge */}
                        <Text size="1" color="gray">
                          {cityGroup.events.length} event{cityGroup.events.length !== 1 ? 's' : ''} in last 30 days
                        </Text>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Upcoming Events (Next 30 Days) */}
        {!searchTerm && eventGroups.upcoming30.length > 0 && (
          <Box>
            <Flex align="center" gap="3" mb="4">
              <Heading size="4">Upcoming Events</Heading>
              <Badge color="blue">{eventGroups.upcoming30.length}</Badge>
              <Text size="2" color="gray">Next 30 days</Text>
              {loadingHealth && <Spinner size="1" />}
            </Flex>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {eventGroups.upcoming30.map((event) => {
                const status = getEventStatus(event);
                const startDate = event.event_start_datetime 
                  ? new Date(event.event_start_datetime).toLocaleDateString()
                  : null;
                const healthScoreData = healthScores.get(event.eid);
                
                return (
                  <Card 
                    key={event.id} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <Box p="4">
                      <Flex direction="column" gap="3">
                        {/* Event Header with Health Scores */}
                        <Flex justify="between" align="start">
                          <Box>
                            <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                              <DebugField 
                                value={event.eid} 
                                fieldName="event.eid"
                                fallback="No EID"
                              />
                            </Text>
                            <Text size="2" color="gray">
                              <DebugField 
                                value={event.name} 
                                fieldName="event.name"
                                fallback="Unnamed Event"
                              />
                            </Text>
                          </Box>
                          <Flex direction="column" align="end" gap="1">
                            {getStatusBadge(status)}
                            {healthScoreData && healthScoreData.length > 0 && (
                              <Grid columns="2" gap="1" width="auto">
                                {healthScoreData.slice(0, 4).map((score, idx) => (
                                  <Badge 
                                    key={idx}
                                    color={getHealthColor(score.status)}
                                    size="1"
                                    style={{ textAlign: 'center', minWidth: '24px' }}
                                  >
                                    {score.value}
                                  </Badge>
                                ))}
                                {/* Fill empty slots if less than 4 scores */}
                                {Array.from({ length: Math.max(0, 4 - healthScoreData.length) }, (_, idx) => (
                                  <Badge 
                                    key={`empty-${idx}`}
                                    color="gray"
                                    size="1"
                                    style={{ textAlign: 'center', minWidth: '24px', opacity: 0.3 }}
                                  >
                                    --
                                  </Badge>
                                ))}
                              </Grid>
                            )}
                          </Flex>
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

                        {/* Eventbrite ID Badge */}
                        <Flex align="center" gap="2" mt="1">
                          <Badge 
                            color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                            size="1"
                          >
                            EB
                          </Badge>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Recent Events (Last 30 Days) */}
        {!searchTerm && eventGroups.past30.length > 0 && (
          <Box>
            <Flex align="center" gap="3" mb="4">
              <Heading size="4">Recent Events</Heading>
              <Badge color="green">{eventGroups.past30.length}</Badge>
              <Text size="2" color="gray">Last 30 days</Text>
            </Flex>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {eventGroups.past30.map((event) => {
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
                                value={event.eid} 
                                fieldName="event.eid"
                                fallback="No EID"
                              />
                            </Text>
                            <Text size="2" color="gray">
                              <DebugField 
                                value={event.name} 
                                fieldName="event.name"
                                fallback="Unnamed Event"
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

                        {/* Eventbrite ID Badge */}
                        <Flex align="center" gap="2" mt="1">
                          <Badge 
                            color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                            size="1"
                          >
                            EB
                          </Badge>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Future Events (Beyond 30 Days) */}
        {!searchTerm && eventGroups.future.length > 0 && (
          <Box>
            <Flex align="center" gap="3" mb="4">
              <Heading size="4">Future Events</Heading>
              <Badge color="purple">{eventGroups.future.length}</Badge>
              <Text size="2" color="gray">Beyond next 30 days</Text>
            </Flex>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {eventGroups.future.map((event) => {
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
                                value={event.eid} 
                                fieldName="event.eid"
                                fallback="No EID"
                              />
                            </Text>
                            <Text size="2" color="gray">
                              <DebugField 
                                value={event.name} 
                                fieldName="event.name"
                                fallback="Unnamed Event"
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

                        {/* Eventbrite ID Badge */}
                        <Flex align="center" gap="2" mt="1">
                          <Badge 
                            color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                            size="1"
                          >
                            EB
                          </Badge>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Past Events (30-120 Days Ago) */}
        {!searchTerm && eventGroups.past30to120.length > 0 && (
          <Box>
            <Flex align="center" gap="3" mb="4">
              <Heading size="4">Past Events</Heading>
              <Badge color="gray">{eventGroups.past30to120.length}</Badge>
              <Text size="2" color="gray">30-120 days ago</Text>
            </Flex>
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {eventGroups.past30to120.map((event) => {
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
                                value={event.eid} 
                                fieldName="event.eid"
                                fallback="No EID"
                              />
                            </Text>
                            <Text size="2" color="gray">
                              <DebugField 
                                value={event.name} 
                                fieldName="event.name"
                                fallback="Unnamed Event"
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

                        {/* Eventbrite ID Badge */}
                        <Flex align="center" gap="2" mt="1">
                          <Badge 
                            color={event.eventbrite_id && event.eventbrite_id.trim() !== '' ? 'green' : 'red'}
                            size="1"
                          >
                            EB
                          </Badge>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                );
              })}
            </Grid>
          </Box>
        )}

        {/* Empty State */}
        {!loading && events.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                No events found
              </Text>
              <Text size="2" color="gray">
                You may need admin permissions to view events.
              </Text>
            </Box>
          </Card>
        )}

        {/* No Events in Any Group */}
        {!loading && events.length > 0 && 
         eventGroups.upcoming30.length === 0 && 
         eventGroups.past30.length === 0 && 
         eventGroups.future.length === 0 && 
         eventGroups.past30to120.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                All events are outside the display range
              </Text>
              <Text size="2" color="gray">
                Events older than 120 days are not shown in the dashboard.
              </Text>
            </Box>
          </Card>
        )}
      </Flex>
    </Box>
  );
};

export default EventDashboard;