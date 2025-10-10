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

  // Placeholder photos with labels
  const eventPhotos = [
    { url: 'https://picsum.photos/400/300?random=10', label: 'Packed Venue' },
    { url: 'https://picsum.photos/400/300?random=11', label: 'Live Painting' },
    { url: 'https://picsum.photos/400/300?random=12', label: 'Audience Engagement' },
    { url: 'https://picsum.photos/400/300?random=13', label: 'Sponsor Visibility' }
  ];

  return (
    <Box py="9" style={{ position: 'relative', padding: '3rem 1rem', overflow: 'hidden' }}>
      {/* Background Image */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(https://picsum.photos/1920/1080?random=2)',
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
          {/* Main Headline */}
          <Box style={{ textAlign: 'center' }}>
            <Heading size="8" mb="2">
              {inviteData.event_city} art lovers will know your brand!
            </Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Connect with hundreds of engaged, culture-loving customers
            </Text>
          </Box>

          {/* Event Details Card */}
          <Card size="3" style={{ background: 'var(--accent-3)', border: '1px solid var(--accent-6)' }}>
            <Flex direction="column" gap="4">
              <Heading size="6">{inviteData.event_name}</Heading>

              <Grid columns="2" gap="4">
                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <CalendarIcon width="16" height="16" />
                    <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>Date & Time</Text>
                  </Flex>
                  <Text size="3">{eventDate}</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>7:00 PM - 10:00 PM</Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <ImageIcon width="16" height="16" />
                    <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>Venue</Text>
                  </Flex>
                  <Text size="3">{inviteData.event_venue || 'Premium Event Space'}</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>{inviteData.event_city}</Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <PersonIcon width="16" height="16" />
                    <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>Expected Audience</Text>
                  </Flex>
                  <Text size="3">350-400 in person</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>1,050-1,200 online viewers</Text>
                </Flex>

                <Flex direction="column" gap="1">
                  <Flex align="center" gap="2">
                    <PersonIcon width="16" height="16" />
                    <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>Featured Artists</Text>
                  </Flex>
                  <Text size="3">12 local artists</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>3 competitive rounds</Text>
                </Flex>
              </Grid>
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
            <Heading size="5" mb="4">What Our Sponsors Say</Heading>
            <Grid columns={{ initial: '1', md: '3' }} gap="4">
              <Card size="3" style={{ background: 'var(--gray-3)' }}>
                <Flex direction="column" gap="2">
                  <Flex gap="1" mb="2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Text key={i} style={{ color: '#FFD700', fontSize: '14px' }}>★</Text>
                    ))}
                  </Flex>
                  <Text size="3" weight="bold">"We've sponsored three Art Battle events now and the ROI has been outstanding. The crowd is engaged, the energy is infectious, and we've seen a genuine uptick in foot traffic to our shop."</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    — Sarah Chen, Berkeley Print Studio, Berkeley
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
                  <Text size="3" weight="bold">"As a craft brewery, we're always looking for ways to connect with the creative community. Art Battle gave us exactly that - our logo was everywhere and people loved the partnership. Already planning our next one."</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    — Mike Rodriguez, Raven's Nest Brewing, Portland
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
                  <Text size="3" weight="bold">"This was our first time sponsoring a live event and the Art Battle team made it so easy. The demographic was perfect for our boutique and we gained a ton of Instagram followers. Worth every penny."</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>
                    — Jennifer Lawson, Stitch & Thread Co., Toronto
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
