import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heading, Text, Card, Box, Flex, Badge, Button, Separator } from '@radix-ui/themes';
import { ArrowLeftIcon } from '@radix-ui/react-icons';
import { liveAPI } from '../lib/liveAPI';

function ArtworkDisplay({ eventId, round, easel }) {
  const [eventData, setEventData] = useState(null);
  const [mediaData, setMediaData] = useState(null);
  const [bidsData, setBidsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!eventId || !round || !easel) return;
      
      setLoading(true);
      setError(null);
      
      try {
        
        const [event, media, bids] = await Promise.all([
          liveAPI.fetchEventData(eventId),
          liveAPI.fetchEventMedia(eventId),
          liveAPI.fetchArtworkBids(eventId, round, easel)
        ]);
        
        setEventData(event);
        setMediaData(media);
        setBidsData(bids);
      } catch (err) {
        console.error('Error fetching artwork data:', err);
        setError('Failed to load artwork data. Please check the URL and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [eventId, round, easel]);

  const formatCurrency = (amount, currencyCode = 'USD', currencySymbol = '$') => {
    return `${currencySymbol}${amount}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getArtwork = () => {
    if (!eventData?.artworks) return null;
    return eventData.artworks.find(artwork => 
      artwork.round == round && artwork.easel == easel
    );
  };

  const getArtworkMedia = (artworkId) => {
    if (!mediaData?.media) return [];
    const artworkMedia = mediaData.media.find(m => m.artwork_id === artworkId);
    return artworkMedia?.media || [];
  };

  const getImageUrl = (mediaFiles, type = 'compressed') => {
    if (!mediaFiles) return null;
    if (type === 'compressed') {
      return mediaFiles.compressed_url || mediaFiles.original_url || mediaFiles.thumbnail_url;
    }
    return mediaFiles.original_url || mediaFiles.compressed_url || mediaFiles.thumbnail_url;
  };

  const isWinner = (artworkId) => {
    if (!eventData?.round_winners || !round) return false;
    return eventData.round_winners[round]?.[artworkId] === 'winner';
  };

  if (loading) {
    return (
      <Box className="loading">
        <Text>Loading artwork details...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="error">
        <Text color="crimson">{error}</Text>
        <Button asChild mt="4">
          <Link to={`/${eventId}`}>
            <ArrowLeftIcon /> Back to Event
          </Link>
        </Button>
      </Box>
    );
  }

  const artwork = getArtwork();
  if (!artwork) {
    return (
      <Box className="error">
        <Text>Artwork not found</Text>
        <Button asChild mt="4">
          <Link to={`/${eventId}`}>
            <ArrowLeftIcon /> Back to Event
          </Link>
        </Button>
      </Box>
    );
  }

  const media = getArtworkMedia(artwork.id);
  const winner = isWinner(artwork.id);
  const event = eventData.event;
  const bids = bidsData?.bids || [];

  // Update page title and meta
  useEffect(() => {
    if (artwork && event) {
      document.title = `${artwork.art_code} - ${event.name} - Art Battle Results`;
      
      // Update meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.content = `View ${artwork.art_code} by ${artwork.artist_profiles?.name || 'Unknown Artist'} from ${event.name}`;
      }
      
      // Update og meta tags
      const ogTitle = document.querySelector('meta[property="og:title"]');
      const ogDesc = document.querySelector('meta[property="og:description"]');
      
      if (ogTitle) ogTitle.content = `${artwork.art_code} - ${event.name}`;
      if (ogDesc) ogDesc.content = `Artwork by ${artwork.artist_profiles?.name || 'Unknown Artist'} from Art Battle event ${event.name}`;
    }
  }, [artwork?.art_code, event?.name, artwork?.artist_profiles?.name]);

  return (
    <Box className="results-container">
      {/* Navigation */}
      <Flex align="center" gap="3" mb="4">
        <Button variant="ghost" asChild>
          <Link to={`/${eventId}`}>
            <ArrowLeftIcon /> Back to {event?.name}
          </Link>
        </Button>
      </Flex>

      <Box style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Artwork Header */}
        <Flex justify="between" align="start" mb="4">
          <Box>
            <Flex align="center" gap="3" mb="2">
              <Heading size="8">{artwork.art_code}</Heading>
              {winner && <Badge color="yellow" size="3">Winner</Badge>}
            </Flex>
            <Text size="4" color="gray" mb="2">
              Round {round} • Easel {easel}
            </Text>
            {artwork.artist_profiles && (
              <Text size="5">
                by {artwork.artist_profiles.name}
              </Text>
            )}
          </Box>
          <Box style={{ textAlign: 'right' }}>
            <Text size="3" color="gray">Event</Text>
            <Text size="4">{event?.name}</Text>
            <Text size="3" color="gray">{formatDate(event?.event_start_datetime)}</Text>
          </Box>
        </Flex>

        <Separator size="4" mb="6" />

        {/* Artwork Images */}
        {media.length > 0 && (
          <Box mb="6">
            <Heading size="6" mb="4">Artwork Images</Heading>
            <Box style={{ display: 'grid', gap: '1rem' }}>
              {media.map((mediaItem, index) => {
                const imageUrl = getImageUrl(mediaItem.media_files, 'original');
                if (!imageUrl) return null;
                
                return (
                  <Card key={index}>
                    <img 
                      src={imageUrl}
                      alt={`${artwork.art_code} - Image ${index + 1}`}
                      style={{ 
                        width: '100%', 
                        height: 'auto',
                        maxHeight: '600px',
                        objectFit: 'contain'
                      }}
                    />
                  </Card>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Bidding Information */}
        <Card mb="6" p="4">
          <Heading size="6" mb="4">Bidding Results</Heading>
          <Flex justify="between" mb="4">
            <Box>
              <Text size="3" color="gray">Highest Bid</Text>
              <Text size="7" weight="bold">
                {bidsData?.highest_bid 
                  ? formatCurrency(bidsData.highest_bid, event?.currency_code, event?.currency_symbol)
                  : formatCurrency(event?.auction_start_bid || 0, event?.currency_code, event?.currency_symbol)
                }
              </Text>
            </Box>
            <Box style={{ textAlign: 'right' }}>
              <Text size="3" color="gray">Total Bids</Text>
              <Text size="6">{bidsData?.bid_count || 0}</Text>
            </Box>
          </Flex>
          
          {bids.length > 0 && (
            <>
              <Separator mb="4" />
              <Heading size="5" mb="3">Bid History</Heading>
              <Box style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {bids.map((bid, index) => (
                  <Flex key={bid.id || index} justify="between" align="center" p="2" 
                        style={{ borderBottom: index < bids.length - 1 ? '1px solid var(--gray-6)' : 'none' }}>
                    <Box>
                      <Text weight="medium">
                        {formatCurrency(bid.amount, event?.currency_code, event?.currency_symbol)}
                      </Text>
                      <Text size="2" color="gray">by {bid.display_name}</Text>
                    </Box>
                    <Text size="2" color="gray">
                      {formatTime(bid.created_at)}
                    </Text>
                  </Flex>
                ))}
              </Box>
            </>
          )}
        </Card>

        {/* Artist Information */}
        {artwork.artist_profiles && (
          <Card p="4">
            <Heading size="6" mb="3">About the Artist</Heading>
            <Box>
              <Text size="5" weight="medium" mb="2">{artwork.artist_profiles.name}</Text>
              {artwork.artist_profiles.bio && (
                <Text size="3" style={{ lineHeight: '1.6' }}>
                  {artwork.artist_profiles.bio}
                </Text>
              )}
              <Flex gap="4" mt="3">
                {artwork.artist_profiles.instagram && (
                  <Text size="2" color="gray">
                    Instagram: @{artwork.artist_profiles.instagram}
                  </Text>
                )}
                {artwork.artist_profiles.website && (
                  <Text size="2" color="gray">
                    Website: {artwork.artist_profiles.website}
                  </Text>
                )}
              </Flex>
            </Box>
          </Card>
        )}
      </Box>
    </Box>
  );
}

export default ArtworkDisplay;