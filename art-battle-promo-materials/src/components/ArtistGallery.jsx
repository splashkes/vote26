import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import TemplateCard from './TemplateCard';
import { 
  Container, 
  Heading, 
  Box, 
  Text, 
  Grid,
  Spinner,
  Button,
  Section
} from '@radix-ui/themes';
import { ArrowLeftIcon } from '@radix-ui/react-icons';

const ArtistGallery = () => {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [artists, setArtists] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    loadEventData();
    loadTemplates();
  }, [eventId]);

  const loadEventData = async () => {
    try {
      console.log('Loading event data for:', eventId);
      
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/promo-materials-data/${eventId}`);
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const responseText = await response.text();
      console.log('Raw response:', responseText);
      
      const data = JSON.parse(responseText);
      console.log('Event data loaded:', data);
      
      setEvent(data.event);
      setArtists(data.artists || []);
    } catch (err) {
      console.error('Failed to load event data:', err);
      alert('Failed to load event data. Please check the event ID.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      console.log('Loading templates...');
      
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/promo-materials-data/templates`);
      
      console.log('Templates response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Templates error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const responseText = await response.text();
      console.log('Templates raw response:', responseText);
      
      const data = JSON.parse(responseText);
      console.log('Templates loaded:', data);
      
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  if (loading) {
    return (
      <Container size="4">
        <Box style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spinner size="3" />
          <Text size="2" color="gray" mt="4">Loading event materials...</Text>
        </Box>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container size="4">
        <Box style={{ textAlign: 'center', padding: '100px 0' }}>
          <Heading size="6" mb="4">Event Not Found</Heading>
          <Text size="3" color="gray" mb="6">
            Could not find event with ID: {eventId}
          </Text>
          <Button asChild>
            <Link to="/">Go Home</Link>
          </Button>
        </Box>
      </Container>
    );
  }

  // Separate templates by kind
  const eventWideTemplates = templates.filter(t => t.kind === 'eventWide');
  const perArtistTemplates = templates.filter(t => t.kind === 'perArtist');

  return (
    <Container size="4">
      {/* Navigation */}
      <Box mb="6">
        <Button variant="ghost" size="2" asChild>
          <Link to="/">
            <ArrowLeftIcon />
            Back to Events
          </Link>
        </Button>
      </Box>

      {/* Event Header */}
      <Box mb="8">
        <Heading size="8" mb="2">{event.title}</Heading>
        <Text size="4" color="gray">
          {event.city} • {event.venue} • {new Date(event.event_date).toLocaleDateString()}
        </Text>
      </Box>

      {/* Event-wide Templates */}
      {eventWideTemplates.length > 0 && (
        <Section size="3" mb="8">
          <Heading size="6" mb="4">Event Promotional Materials</Heading>
          <Text size="3" color="gray" mb="6">
            These materials promote the entire event and include all confirmed artists.
          </Text>
          
          <Grid columns={{ initial: '1', md: '2' }} gap="6">
            {eventWideTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                eventData={event}
                artistData={null}
                allArtists={artists}
              />
            ))}
          </Grid>
        </Section>
      )}

      {/* Per-artist Templates */}
      {perArtistTemplates.length > 0 && artists.length > 0 && (
        <Section size="3">
          <Heading size="6" mb="4">Artist Promotional Materials</Heading>
          <Text size="3" color="gray" mb="6">
            Individual promotional materials for each confirmed artist ({artists.length} artists).
          </Text>
          
          {artists.map((artist) => (
            <Box key={artist.id} mb="8">
              <Heading size="5" mb="4">{artist.display_name}</Heading>
              <Grid columns={{ initial: '1', md: '2' }} gap="6">
                {perArtistTemplates.map((template) => (
                  <TemplateCard
                    key={`${template.id}-${artist.id}`}
                    template={template}
                    eventData={event}
                    artistData={artist}
                    allArtists={artists}
                  />
                ))}
              </Grid>
            </Box>
          ))}
        </Section>
      )}

      {/* No artists message */}
      {artists.length === 0 && (
        <Box style={{ textAlign: 'center', padding: '60px 0' }}>
          <Text size="3" color="gray">
            No confirmed artists found for this event.
          </Text>
        </Box>
      )}

      {/* No templates message */}
      {templates.length === 0 && (
        <Box style={{ textAlign: 'center', padding: '60px 0' }}>
          <Text size="3" color="gray">
            No promotional templates available yet.
          </Text>
        </Box>
      )}
    </Container>
  );
};

export default ArtistGallery;