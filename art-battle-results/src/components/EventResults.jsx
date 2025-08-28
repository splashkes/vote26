import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heading, Text, Card, Box, Flex, Badge, Separator } from '@radix-ui/themes';
import { liveAPI } from '../lib/liveAPI';

function EventResults({ eventId }) {
  const [eventData, setEventData] = useState(null);
  const [mediaData, setMediaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!eventId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const [event, media] = await Promise.all([
          liveAPI.fetchEventData(eventId),
          liveAPI.fetchEventMedia(eventId)
        ]);
        
        setEventData(event);
        setMediaData(media);
      } catch (err) {
        console.error('Error fetching event data:', err);
        setError('Failed to load event data. Please check the event ID and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [eventId]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount, currencyCode = 'USD', currencySymbol = '$') => {
    return `${currencySymbol}${amount}`;
  };

  const getCurrentBid = (artworkId) => {
    if (!eventData?.current_bids) return null;
    return eventData.current_bids.find(bid => bid.art_id === artworkId);
  };

  const getArtworkMedia = (artworkId) => {
    if (!mediaData?.media) return null;
    const artworkMedia = mediaData.media.find(m => m.artwork_id === artworkId);
    if (!artworkMedia?.media?.length) return null;
    
    // Get the first (newest) image
    const firstMedia = artworkMedia.media[0];
    return firstMedia?.media_files;
  };

  const getImageUrl = (mediaFiles) => {
    if (!mediaFiles) return null;
    return mediaFiles.compressed_url || mediaFiles.thumbnail_url || mediaFiles.original_url;
  };

  const isWinner = (artworkId, round) => {
    if (!eventData?.round_winners || !round) return false;
    return eventData.round_winners[round]?.[artworkId] === 'winner';
  };

  if (loading) {
    return (
      <Box className="loading">
        <Text>Loading event results...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="error">
        <Text color="crimson">{error}</Text>
      </Box>
    );
  }

  if (!eventData?.event) {
    return (
      <Box className="error">
        <Text>No event data found</Text>
      </Box>
    );
  }

  const event = eventData.event;
  const artworks = eventData.artworks || [];

  return (
    <Box className="results-container">
      {/* Event Header */}
      <Box className="event-header">
        <Heading size="9" mb="2">{event.name}</Heading>
        <Text size="5" color="gray" mb="2">{event.eid}</Text>
        <Text size="4" mb="2">{formatDate(event.event_start_datetime)}</Text>
        {event.venue && <Text size="3" color="gray">{event.venue}</Text>}
        {event.description && (
          <Text size="3" style={{ maxWidth: '800px', margin: '1rem auto' }}>
            {event.description}
          </Text>
        )}
      </Box>

      <Separator size="4" mb="6" />

      {/* Artworks Grid */}
      <Box className="artwork-grid">
        {artworks.map((artwork) => {
          const currentBid = getCurrentBid(artwork.id);
          const mediaFiles = getArtworkMedia(artwork.id);
          const imageUrl = getImageUrl(mediaFiles);
          const winner = isWinner(artwork.id, artwork.round);

          return (
            <Card key={artwork.id} className="artwork-card" asChild>
              <Link to={`/${eventId}-${artwork.round}-${artwork.easel}`} style={{ textDecoration: 'none' }}>
                {imageUrl && (
                  <img 
                    src={imageUrl} 
                    alt={`Artwork ${artwork.art_code}`}
                    className="artwork-image"
                    loading="lazy"
                  />
                )}
                
                <Box className="artwork-info">
                  <Flex justify="between" align="center" mb="2">
                    <Heading size="5">{artwork.art_code}</Heading>
                    {winner && <Badge color="yellow">Winner</Badge>}
                  </Flex>
                  
                  <Text size="3" color="gray" mb="1">
                    Round {artwork.round} • Easel {artwork.easel}
                  </Text>
                  
                  {artwork.artist_profiles && (
                    <Text size="3" mb="2">
                      by {artwork.artist_profiles.name}
                    </Text>
                  )}
                  
                  <Separator mb="3" />
                  
                  <Flex className="bidding-info">
                    <Box>
                      <Text size="2" color="gray">Current Bid</Text>
                      <Text size="4" weight="bold">
                        {currentBid 
                          ? formatCurrency(currentBid.current_bid, event.currency_code, event.currency_symbol)
                          : formatCurrency(event.auction_start_bid, event.currency_code, event.currency_symbol)
                        }
                      </Text>
                    </Box>
                    {currentBid && (
                      <Box style={{ textAlign: 'right' }}>
                        <Text size="2" color="gray">Total Bids</Text>
                        <Text size="4">{currentBid.bid_count}</Text>
                      </Box>
                    )}
                  </Flex>
                </Box>
              </Link>
            </Card>
          );
        })}
      </Box>

      {artworks.length === 0 && (
        <Box style={{ textAlign: 'center', padding: '2rem' }}>
          <Text color="gray">No artworks found for this event</Text>
        </Box>
      )}
    </Box>
  );
}

export default EventResults;