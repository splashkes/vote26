import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Text,
  TextField,
  Card,
  Badge,
  Button,
  Separator,
  ScrollArea
} from '@radix-ui/themes';
import { 
  MagnifyingGlassIcon, 
  CalendarIcon, 
  PersonIcon,
  CrossCircledIcon,
  CheckCircledIcon,
  ClockIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const EventSearch = ({ onSelectEvent, selectedEventId }) => {
  const { adminEvents, user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeTags, setActiveTags] = useState(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [recentEvents, setRecentEvents] = useState([]);
  const searchInputRef = useRef(null);

  // Available smart tags
  const availableTags = [
    { id: 'live', label: 'Live', color: 'green', description: 'Currently active events' },
    { id: 'upcoming', label: 'Upcoming', color: 'blue', description: 'Future events' },
    { id: 'completed', label: 'Completed', color: 'gray', description: 'Past events' },
    { id: 'draft', label: 'Draft', color: 'orange', description: 'Events in preparation' },
    { id: 'my-events', label: 'My Events', color: 'crimson', description: 'Events you manage' },
    { id: 'high-priority', label: 'Priority', color: 'red', description: 'Important events' }
  ];

  // Load recent events from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`recent-events-${user?.id}`);
    if (stored) {
      try {
        setRecentEvents(JSON.parse(stored));
      } catch (e) {
        console.warn('Failed to parse recent events:', e);
      }
    }
  }, [user?.id]);

  // Save to recent events
  const addToRecentEvents = (event) => {
    const newRecent = [
      event,
      ...recentEvents.filter(e => e.id !== event.id)
    ].slice(0, 10);
    
    setRecentEvents(newRecent);
    localStorage.setItem(`recent-events-${user?.id}`, JSON.stringify(newRecent));
  };

  // Get event status
  const getEventStatus = (event) => {
    if (!event.enabled) return 'disabled';
    
    const now = new Date();
    const startTime = new Date(event.event_start_datetime);
    const endTime = new Date(event.event_end_datetime);
    
    if (now < startTime) return 'upcoming';
    if (now > endTime) return 'completed';
    return 'live';
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
        
        // Exact matches get highest score
        if (name.includes(searchLower)) score += 100;
        if (eid.includes(searchLower)) score += 80;
        if (venue.includes(searchLower)) score += 60;
        
        // Fuzzy matching - characters in order
        let nameIndex = 0;
        for (let char of searchLower) {
          const found = name.indexOf(char, nameIndex);
          if (found !== -1) {
            score += 10;
            nameIndex = found + 1;
          }
        }
        
        return { ...item, searchScore: score };
      })
      .filter(item => item.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore);
  };

  // Filter events based on active tags and search term
  const filteredEvents = useMemo(() => {
    let events = adminEvents || [];
    
    // Apply tag filters
    if (activeTags.size > 0) {
      events = events.filter(event => {
        const status = getEventStatus(event);
        
        return Array.from(activeTags).some(tag => {
          switch (tag) {
            case 'live': return status === 'live';
            case 'upcoming': return status === 'upcoming';
            case 'completed': return status === 'completed';
            case 'draft': return !event.enabled;
            case 'my-events': return true; // All admin events are "my events"
            case 'high-priority': 
              // Events starting within 7 days or currently live
              const startTime = new Date(event.event_start_datetime);
              const daysUntil = (startTime - new Date()) / (1000 * 60 * 60 * 24);
              return status === 'live' || (daysUntil >= 0 && daysUntil <= 7);
            default: return false;
          }
        });
      });
    }
    
    // Apply fuzzy search
    return fuzzySearch(events, searchTerm);
  }, [adminEvents, activeTags, searchTerm]);

  // Handle event selection
  const handleSelectEvent = (event) => {
    addToRecentEvents(event);
    onSelectEvent(event);
    setSearchTerm('');
  };

  // Handle tag toggle
  const toggleTag = (tagId) => {
    const newTags = new Set(activeTags);
    if (newTags.has(tagId)) {
      newTags.delete(tagId);
    } else {
      newTags.add(tagId);
    }
    setActiveTags(newTags);
  };

  // Clear all filters
  const clearFilters = () => {
    setActiveTags(new Set());
    setSearchTerm('');
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const configs = {
      live: { color: 'green', label: 'Live' },
      upcoming: { color: 'blue', label: 'Upcoming' },
      completed: { color: 'gray', label: 'Completed' },
      disabled: { color: 'red', label: 'Draft' }
    };
    
    const config = configs[status] || configs.disabled;
    return <Badge color={config.color} size="1">{config.label}</Badge>;
  };

  return (
    <Box>
      {/* Search Input */}
      <Box mb="3">
        <TextField.Root
          ref={searchInputRef}
          placeholder="Search events by name, EID, or venue..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="2"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon height="16" width="16" />
          </TextField.Slot>
          {searchTerm && (
            <TextField.Slot side="right">
              <Button
                variant="ghost"
                size="1"
                onClick={() => setSearchTerm('')}
              >
                <CrossCircledIcon height="14" width="14" />
              </Button>
            </TextField.Slot>
          )}
        </TextField.Root>
      </Box>

      {/* Smart Tags */}
      <Box mb="3">
        <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
          Quick Filters
        </Text>
        <Flex wrap="wrap" gap="1">
          {availableTags.map(tag => (
            <Button
              key={tag.id}
              variant={activeTags.has(tag.id) ? 'solid' : 'soft'}
              color={activeTags.has(tag.id) ? tag.color : 'gray'}
              size="1"
              onClick={() => toggleTag(tag.id)}
            >
              {tag.label}
            </Button>
          ))}
          {(activeTags.size > 0 || searchTerm) && (
            <Button
              variant="soft"
              color="gray"
              size="1"
              onClick={clearFilters}
            >
              <CrossCircledIcon height="12" width="12" />
              Clear
            </Button>
          )}
        </Flex>
      </Box>

      <Separator mb="3" />

      {/* Search Results / Recent Events */}
      <Box>
        {searchTerm || activeTags.size > 0 ? (
          <>
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} found
            </Text>
            <ScrollArea style={{ height: '300px' }}>
              <Flex direction="column" gap="1">
                {filteredEvents.map((event) => (
                  <Card
                    key={event.event_id}
                    style={{
                      cursor: 'pointer',
                      padding: '8px',
                      backgroundColor: selectedEventId === event.event_id ? 'var(--accent-3)' : undefined
                    }}
                    onClick={() => handleSelectEvent(event)}
                  >
                    <Flex justify="between" align="start">
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="2" weight="medium" style={{ 
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {event.event_name || event.name || 'Unnamed Event'}
                        </Text>
                        <Text size="1" color="gray">
                          {event.event_eid || event.eid} • {event.event_venue || event.venue}
                        </Text>
                        {event.event_start_datetime && (
                          <Text size="1" color="gray">
                            <CalendarIcon style={{ display: 'inline', marginRight: '4px' }} />
                            {new Date(event.event_start_datetime).toLocaleDateString()}
                          </Text>
                        )}
                      </Box>
                      <Box ml="2">
                        {getStatusBadge(getEventStatus(event))}
                      </Box>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            </ScrollArea>
          </>
        ) : recentEvents.length > 0 ? (
          <>
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              Recent Events
            </Text>
            <Flex direction="column" gap="1">
              {recentEvents.slice(0, 5).map((event) => (
                <Card
                  key={event.id}
                  style={{
                    cursor: 'pointer',
                    padding: '8px',
                    backgroundColor: selectedEventId === event.id ? 'var(--accent-3)' : undefined
                  }}
                  onClick={() => handleSelectEvent(event)}
                >
                  <Flex justify="between" align="start">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text size="2" weight="medium" style={{ 
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {event.name || 'Unnamed Event'}
                      </Text>
                      <Text size="1" color="gray">
                        {event.eid} • {event.venue}
                      </Text>
                    </Box>
                    <Box ml="2">
                      <ClockIcon height="12" width="12" color="var(--gray-11)" />
                    </Box>
                  </Flex>
                </Card>
              ))}
            </Flex>
          </>
        ) : (
          <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
            No events available. Check your permissions.
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default EventSearch;