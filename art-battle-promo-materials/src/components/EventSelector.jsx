import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Container, 
  Heading, 
  Card, 
  Box, 
  Text, 
  TextField,
  Grid,
  Spinner,
  Button
} from '@radix-ui/themes';
import { MagnifyingGlassIcon, CalendarIcon } from '@radix-ui/react-icons';

const EventSelector = () => {
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = events.filter(event => 
        event.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.venue?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredEvents(filtered);
    } else {
      setFilteredEvents(events);
    }
  }, [searchTerm, events]);

  const fetchEvents = async () => {
    try {
      const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/promo-materials-data', {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setEvents(data.events || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date TBD';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Container size="4">
        <Box style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spinner size="3" />
          <Text size="2" color="gray" mt="4">Loading events...</Text>
        </Box>
      </Container>
    );
  }

  return (
    <Container size="4">
      <Box py="8">
        <Box mb="8" style={{ textAlign: 'center' }}>
          <Heading size="8" mb="4">
            Art Battle Promo Materials
          </Heading>
          <Text size="4" color="gray">
            Select an event to browse and download promotional materials
          </Text>
        </Box>

        <Box mb="6">
          <TextField.Root
            placeholder="Search events by title, city, or venue..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="3"
          >
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
          </TextField.Root>
        </Box>

        {filteredEvents.length === 0 ? (
          <Box style={{ textAlign: 'center', padding: '60px 0' }}>
            <Text size="3" color="gray">
              {searchTerm ? 'No events found matching your search.' : 'No events available.'}
            </Text>
          </Box>
        ) : (
          <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
            {filteredEvents.map((event) => (
              <Link 
                key={event.id} 
                to={`/e/${event.eid}`}
                style={{ textDecoration: 'none' }}
              >
                <Card 
                  size="2" 
                  style={{ 
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    ':hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 8px 25px rgba(0,0,0,0.2)'
                    }
                  }}
                >
                  <Box p="4">
                    <Heading size="4" mb="2" style={{ 
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {event.title || 'Untitled Event'}
                    </Heading>
                    
                    <Box mb="3">
                      <Text size="2" color="gray" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CalendarIcon width="12" height="12" />
                        {formatDate(event.event_date)}
                      </Text>
                    </Box>

                    {event.city && (
                      <Text size="2" color="gray" mb="1">
                        📍 {event.city}
                      </Text>
                    )}

                    {event.venue && (
                      <Text size="2" color="gray" mb="3">
                        🏢 {event.venue}
                      </Text>
                    )}

                    <Button variant="soft" size="1" style={{ width: '100%' }}>
                      View Promo Materials
                    </Button>
                  </Box>
                </Card>
              </Link>
            ))}
          </Grid>
        )}
      </Box>
    </Container>
  );
};

export default EventSelector;