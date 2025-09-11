import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { exportToPNG, exportToMP4, generatePreview, createRenderRoot, substituteTemplateData } from '../lib/templateRenderer';
import { 
  Container, 
  Heading, 
  Card, 
  Box, 
  Text, 
  Grid,
  Spinner,
  Button,
  Section,
  Badge
} from '@radix-ui/themes';
import { ArrowLeftIcon, DownloadIcon, PlayIcon } from '@radix-ui/react-icons';

// Simple inline template preview component
const TemplatePreview = ({ template, variant, eventData, artistData, allArtists = [] }) => {
  const [previewId] = useState(`preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  useEffect(() => {
    if (!template || !eventData) return;
    
    try {
      // Handle both string and object spec formats
      const spec = typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
      const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
      
      if (!variantSpec) return;
      
      // Create a scaled-down container for preview
      const container = document.getElementById(previewId);
      if (!container) return;
      
      // Clear any existing content
      container.innerHTML = '';
      
      // Create preview content directly in the container
      const scale = 0.3; // Scale down to 30% for preview
      const scaledW = variantSpec.w * scale;
      const scaledH = variantSpec.h * scale;
      
      container.style.cssText = `
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      `;
      
      // Create scaled content
      const content = document.createElement('div');
      content.style.cssText = `
        width: ${variantSpec.w}px;
        height: ${variantSpec.h}px;
        transform: scale(${scale});
        transform-origin: top left;
        position: absolute;
        top: 50%;
        left: 50%;
        margin-top: -${scaledH/2}px;
        margin-left: -${scaledW/2}px;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        overflow: hidden;
      `;
      
      // Create underlay
      if (spec.layers?.underlay) {
        const underlay = document.createElement('div');
        underlay.style.cssText = `
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, rgba(220, 38, 127, 0.8), rgba(255, 107, 157, 0.8));
          background-size: cover;
          background-position: center;
          z-index: 1;
        `;
        content.appendChild(underlay);
      }
      
      // Create text layer
      if (spec.layers?.textHtml) {
        const textLayer = document.createElement('div');
        textLayer.style.cssText = `
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
        `;
        
        let processedHtml = substituteTemplateData(spec.layers.textHtml, eventData, artistData, allArtists);
        
        // Handle dynamic content for preview
        if (spec.dynamicContent?.allArtistsNames && allArtists?.length > 0) {
          const artistNames = allArtists.map(artist => 
            `<div class="artist-name">${artist.display_name || artist.name}</div>`
          ).join('');
          processedHtml = processedHtml.replace(
            '<div class="all-artists" id="artist-list"></div>', 
            `<div class="all-artists" id="artist-list">${artistNames}</div>`
          );
        }
        
        if (spec.dynamicContent?.featuredWithAll && artistData && allArtists?.length > 0) {
          const featuredName = `<div class="featured-artist">${artistData.display_name}</div>`;
          const otherArtists = allArtists
            .filter(artist => artist.id !== artistData.id)
            .map(artist => `<div class="other-artist">${artist.display_name || artist.name}</div>`)
            .join('');
          
          processedHtml = processedHtml.replace(
            '<div class="featured-list" id="featured-artist-list"></div>',
            `<div class="featured-list" id="featured-artist-list">${featuredName}<div class="other-artists">${otherArtists}</div></div>`
          );
        }
        
        textLayer.innerHTML = processedHtml;
        content.appendChild(textLayer);
      }
      
      // Apply scoped CSS
      if (spec.css) {
        const style = document.createElement('style');
        const scopedCSS = spec.css.replace(/(^|[,}]\s*)(\.[\w-]+)/g, `$1#${previewId} $2`);
        style.textContent = `
          #${previewId} .template-content {
            font-family: system-ui, -apple-system, sans-serif;
          }
          ${scopedCSS}
        `;
        document.head.appendChild(style);
        content._styleElement = style;
      }
      
      content.className = 'template-content';
      container.appendChild(content);
      
      // Cleanup function
      return () => {
        if (content._styleElement) {
          document.head.removeChild(content._styleElement);
        }
      };
      
    } catch (error) {
      console.error('Preview render error:', error);
    }
  }, [template, variant, eventData, artistData, previewId]);
  
  return <div id={previewId} style={{ width: '100%', height: '100%' }} />;
};

const ArtistGallery = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [artists, setArtists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
      fetchEventData();
    }
  }, [eventId]);

  const fetchEventData = async () => {
    try {
      // Fetch event and artists data
      const eventResponse = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/promo-materials-data/${eventId}`, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!eventResponse.ok) {
        throw new Error(`HTTP error! status: ${eventResponse.status}`);
      }

      const eventData = await eventResponse.json();
      
      if (eventData.error) {
        throw new Error(eventData.error);
      }

      setEvent(eventData.event);
      setArtists(eventData.artists || []);

      // Fetch published templates
      const templatesResponse = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/promo-materials-data/templates', {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!templatesResponse.ok) {
        throw new Error(`Templates HTTP error! status: ${templatesResponse.status}`);
      }

      const templatesData = await templatesResponse.json();
      
      if (templatesData.error) {
        throw new Error(templatesData.error);
      }

      setTemplates(templatesData.templates || []);

    } catch (err) {
      console.error('Error fetching event data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date TBD';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDownloadPNG = async (templateId, artistId = null, variant = 'square') => {
    try {
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        alert('Template not found');
        return;
      }

      const artistData = artistId ? artists.find(a => a.id === artistId) : null;
      
      await exportToPNG(template.spec, variant, event, artistData, artists);
    } catch (err) {
      console.error('Error downloading PNG:', err);
      alert('Error generating PNG: ' + err.message);
    }
  };

  const handleDownloadMP4 = async (templateId, artistId = null, variant = 'square') => {
    try {
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        alert('Template not found');
        return;
      }

      const artistData = artistId ? artists.find(a => a.id === artistId) : null;
      
      await exportToMP4(template.spec, variant, event, artistData, artists);
    } catch (err) {
      console.error('Error downloading MP4:', err);
      alert('Error generating MP4: ' + err.message);
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
          <Text size="3" color="red">Event not found</Text>
          <Box mt="4">
            <Link to="/">
              <Button variant="soft">
                <ArrowLeftIcon /> Back to Events
              </Button>
            </Link>
          </Box>
        </Box>
      </Container>
    );
  }

  const eventWideTemplates = templates.filter(t => t.kind === 'eventWide');
  const perArtistTemplates = templates.filter(t => t.kind === 'perArtist');

  return (
    <Container size="4">
      <Box py="6">
        {/* Header */}
        <Box mb="8">
          <Link to="/">
            <Button variant="ghost" size="2" mb="4">
              <ArrowLeftIcon /> Back to Events
            </Button>
          </Link>
          
          <Heading size="7" mb="2">
            {event.title}
          </Heading>
          
          <Text size="4" color="gray" mb="2">
            {formatDate(event.event_date)}
          </Text>
          
          {event.city && (
            <Text size="3" color="gray">
              📍 {event.city} {event.venue && `• ${event.venue}`}
            </Text>
          )}
        </Box>

        {/* Event-wide Materials */}
        {eventWideTemplates.length > 0 && (
          <Section mb="8">
            <Heading size="5" mb="4">
              Event Promotional Materials
            </Heading>
            <Text size="2" color="gray" mb="6">
              General event promotion with all artist information
            </Text>
            
            <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
              {eventWideTemplates.map((template) => (
                <Card key={template.id} size="2">
                  <Box p="4">
                    {/* Live template preview */}
                    <Box 
                      mb="4"
                      style={{
                        aspectRatio: '1/1',
                        backgroundColor: 'var(--gray-3)',
                        borderRadius: 'var(--radius-2)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <TemplatePreview 
                        template={template} 
                        variant="square" 
                        eventData={event} 
                        artistData={null}
                        allArtists={artists}
                      />
                      <Box 
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px'
                        }}
                      >
                        <Badge variant="soft" size="1">Event-wide</Badge>
                      </Box>
                    </Box>
                    
                    <Heading size="3" mb="3">{template.name}</Heading>
                    
                    <Grid columns="2" gap="2">
                      <Button 
                        variant="soft" 
                        size="1"
                        onClick={() => handleDownloadPNG(template.id)}
                      >
                        <DownloadIcon /> PNG
                      </Button>
                      <Button 
                        variant="soft" 
                        size="1"
                        onClick={() => handleDownloadMP4(template.id)}
                      >
                        <PlayIcon /> MP4
                      </Button>
                    </Grid>
                  </Box>
                </Card>
              ))}
            </Grid>
          </Section>
        )}

        {/* Per-Artist Materials */}
        {perArtistTemplates.length > 0 && artists.length > 0 && (
          <Section>
            <Heading size="5" mb="4">
              Artist Promotional Materials
            </Heading>
            <Text size="2" color="gray" mb="6">
              Individual artist promotion materials
            </Text>
            
            {artists.map((artist) => (
              <Box key={artist.id} mb="8">
                <Heading size="4" mb="4">
                  {artist.display_name || 'Unknown Artist'}
                </Heading>
                
                <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
                  {perArtistTemplates.map((template) => (
                    <Card key={`${artist.id}-${template.id}`} size="2">
                      <Box p="4">
                        {/* Live template preview */}
                        <Box 
                          mb="4"
                          style={{
                            aspectRatio: '1/1',
                            backgroundColor: 'var(--gray-3)',
                            borderRadius: 'var(--radius-2)',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <TemplatePreview 
                            template={template} 
                            variant="square" 
                            eventData={event} 
                            artistData={artist}
                            allArtists={artists}
                          />
                          <Box 
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px'
                            }}
                          >
                            <Badge variant="soft" size="1">Per-artist</Badge>
                          </Box>
                        </Box>
                        
                        <Heading size="3" mb="3">{template.name}</Heading>
                        
                        <Grid columns="2" gap="2">
                          <Button 
                            variant="soft" 
                            size="1"
                            onClick={() => handleDownloadPNG(template.id, artist.id)}
                          >
                            <DownloadIcon /> PNG
                          </Button>
                          <Button 
                            variant="soft" 
                            size="1"
                            onClick={() => handleDownloadMP4(template.id, artist.id)}
                          >
                            <PlayIcon /> MP4
                          </Button>
                        </Grid>
                      </Box>
                    </Card>
                  ))}
                </Grid>
              </Box>
            ))}
          </Section>
        )}

        {/* No templates message */}
        {templates.length === 0 && (
          <Box style={{ textAlign: 'center', padding: '60px 0' }}>
            <Text size="3" color="gray">
              No promotional templates available for this event yet.
            </Text>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default ArtistGallery;