import { Box, Container, Flex, Heading, Text, Card, Badge, Grid } from '@radix-ui/themes';
import { CalendarIcon, PersonIcon, ImageIcon } from '@radix-ui/react-icons';

const LocalRelevanceSection = ({ inviteData }) => {
  if (!inviteData) return null;

  const eventDate = new Date(inviteData.event_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const eventTime = new Date(inviteData.event_start_datetime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Convert media array to map
  const mediaMap = {};
  inviteData?.media?.forEach(item => {
    mediaMap[item.media_type] = item.url;
  });

  const sectionBg = mediaMap.section_bg || 'https://picsum.photos/1920/1080?random=2';

  // Get prospect name or company for display above headline
  const prospectDisplay = inviteData?.prospect_company || inviteData?.prospect_name || '';

  // Event photos with labels
  const eventPhotos = [
    { url: mediaMap.event_photo_packed_venue || 'https://picsum.photos/400/300?random=10', label: 'Packed Venue' },
    { url: mediaMap.event_photo_live_painting || 'https://picsum.photos/400/300?random=11', label: 'Live Painting' },
    { url: mediaMap.event_photo_audience_engagement || 'https://picsum.photos/400/300?random=12', label: 'Audience Engagement' },
    { url: mediaMap.event_photo_sponsor_visibility || 'https://picsum.photos/400/300?random=13', label: 'Sponsor Visibility' }
  ];

  return (
    <Box style={{ position: 'relative', padding: '3rem 1rem', overflow: 'hidden' }}>
      {/* Responsive styles for event card */}
      <style>{`
        @media (min-width: 768px) {
          .event-details-card {
            width: 50% !important;
          }
        }
      `}</style>
      {/* Background Image */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url(${sectionBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(0.3)',
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
        zIndex: 0
      }} />

      {/* Combined Overlay Gradients (single layer) */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(to bottom, black 0%, rgba(0,0,0,0.7) 15%, rgba(0,0,0,0.7) 85%, black 100%)',
        transform: 'translate3d(0,0,0)',
        zIndex: 1
      }} />

      <Container size="4" px="4" style={{ position: 'relative', zIndex: 2 }}>
        <Flex direction="column" gap="6">
          {/* Main Headline with Personalized Company Name */}
          <Box style={{ textAlign: 'center' }}>
            <Heading size="8" mb="2">
              {prospectDisplay && <>{prospectDisplay},<br /></>}
              {inviteData.event_city} art lovers will know your brand!
            </Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Connect with hundreds of engaged, culture-loving customers
            </Text>
          </Box>

          {/* Event Details Card */}
          <Card size="3" style={{
            background: 'var(--accent-3)',
            border: '1px solid var(--accent-6)',
            width: '85%',
            maxWidth: 'none',
            margin: '0 auto'
          }}
          className="event-details-card"
          >
            <Flex direction="column" gap="3" align="center" style={{ textAlign: 'center' }}>
              <Text size="1" weight="bold" style={{ color: 'var(--gray-11)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Upcoming Event
              </Text>

              <Heading size="6">{inviteData.event_name}</Heading>

              <Flex direction="column" gap="1">
                <Text size="3">{eventDate}</Text>
                <Text size="3">{eventTime}</Text>
                <Text size="3">{inviteData.event_venue || 'Premium Event Space'}</Text>
                <Text size="3">{inviteData.event_city}</Text>
              </Flex>

              <Box style={{ width: '100%', height: '1px', background: 'var(--accent-6)', margin: '0.5rem 0' }} />

              {inviteData.artists && inviteData.artists.length > 0 && (
                <>
                  <Flex direction="column" gap="1">
                    <Text size="3" weight="bold">Featured Artists at this show</Text>
                    <Flex direction="column" gap="0">
                      {inviteData.artists.map((artist, idx) => (
                        artist.instagram ? (
                          <a
                            key={artist.id}
                            href={`https://instagram.com/${artist.instagram.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            <Text size="2" style={{ color: 'var(--accent-11)', textDecoration: 'underline' }}>
                              {artist.name}
                            </Text>
                          </a>
                        ) : (
                          <Text key={artist.id} size="2" style={{ color: 'var(--gray-11)' }}>
                            {artist.name}
                          </Text>
                        )
                      ))}
                    </Flex>
                  </Flex>

                  <Box style={{ width: '100%', height: '1px', background: 'var(--accent-6)', margin: '0.5rem 0' }} />
                </>
              )}

              <Flex direction="column" gap="1">
                <Text size="3" weight="bold">Audience</Text>
                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  {inviteData.event_capacity ? `${Math.round(inviteData.event_capacity + 50).toLocaleString()} at venue` : '400 at venue'}
                </Text>
                {inviteData.event_capacity && (
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    {Math.round(inviteData.event_capacity * 3).toLocaleString()} online
                  </Text>
                )}
                {inviteData.city_audience_count != null && inviteData.event_capacity && (
                  <Flex direction="column" gap="0">
                    <Text size="5" weight="bold" style={{ color: 'var(--gray-12)', lineHeight: '1.2' }}>
                      {(
                        Math.round(inviteData.event_capacity + 50) +
                        Math.round(inviteData.event_capacity * 3) +
                        inviteData.city_audience_count
                      ).toLocaleString()} total
                    </Text>
                    <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>
                      Art Battle {inviteData.event_city} audience
                    </Text>
                  </Flex>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Demographics Section */}
          <Card size="3">
            <Flex direction="column" gap="3">
              <Heading size="5">Our Community</Heading>
              <Grid columns="3" gap="4">
                <Flex direction="column" gap="1">
                  <Text size="6" weight="bold">Ages 25-45</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Prime demographic</Text>
                </Flex>
                <Flex direction="column" gap="1">
                  <Text size="6" weight="bold">$75K+</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Household income 60%</Text>
                </Flex>
                <Flex direction="column" gap="1">
                  <Text size="6" weight="bold">Arts & Culture</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Enthusiasts & creators</Text>
                </Flex>
              </Grid>
            </Flex>
          </Card>

          {/* Photo Grid */}
          <Box>
            <Heading size="5" mb="4">Art Battle in {inviteData.event_city}</Heading>
            <Grid columns={{ initial: '2', md: '4' }} gap="3">
              {eventPhotos.map((photo, idx) => (
                <Box
                  key={idx}
                  style={{
                    position: 'relative',
                    aspectRatio: '4/3',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid var(--gray-6)',
                    backgroundImage: `url(${photo.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  {/* Gradient Overlay for Text Readability */}
                  <Box style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: '1rem'
                  }}>
                    <Text size="3" weight="bold" style={{ color: 'white' }}>
                      {photo.label}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Grid>
          </Box>

          {/* Social Proof - Testimonials */}
          <Box>
            <Heading size="5" mb="4">What Our Partners Say</Heading>
            <Grid columns={{ initial: '1', md: '3' }} gap="4">
              <Card size="3" style={{ background: 'var(--gray-3)' }}>
                <Flex direction="column" gap="2">
                  <Flex gap="1" mb="2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Text key={i} style={{ color: '#FFD700', fontSize: '14px' }}>★</Text>
                    ))}
                  </Flex>
                  <Text size="3" weight="bold">"Thanks for the great event and allowing us to join in on the fun!"</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    — Alex King, Brand Manager, Sharpie, Newell Brands
                  </Text>
                </Flex>
              </Card>

              <Card size="3" style={{ background: 'var(--gray-3)' }}>
                <Flex direction="column" gap="2">
                  <Flex gap="1" mb="2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Text key={i} style={{ color: '#FFD700', fontSize: '14px' }}>★</Text>
                    ))}
                  </Flex>
                  <Text size="3" weight="bold">"We really enjoyed working with Art Battle on our 4th annual event! Our guests had a great time watching the artists and bidding on their work, and we heard wonderful feedback from those who got to meet the artists as well. Thank you for your continued partnership — we love Art Battle!"</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    — Kim Tran, Help For Children
                  </Text>
                </Flex>
              </Card>

              <Card size="3" style={{ background: 'var(--gray-3)' }}>
                <Flex direction="column" gap="2">
                  <Flex gap="1" mb="2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Text key={i} style={{ color: '#FFD700', fontSize: '14px' }}>★</Text>
                    ))}
                  </Flex>
                  <Text size="3" weight="bold">"Participating with Art Battle is a fantastic experience for our guests. We are pleased to be supporters of emerging artists in the area."</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    — Springline, Menlo Park
                  </Text>
                </Flex>
              </Card>
            </Grid>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
};

export default LocalRelevanceSection;
