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

  // Placeholder photos
  const eventPhotos = [
    'https://placehold.co/400x300/1a1a1a/white?text=Packed+Venue',
    'https://placehold.co/400x300/1a1a1a/white?text=Live+Painting',
    'https://placehold.co/400x300/1a1a1a/white?text=Audience+Engagement',
    'https://placehold.co/400x300/1a1a1a/white?text=Sponsor+Visibility'
  ];

  return (
    <Box py="9" style={{ background: 'var(--gray-1)' }}>
      <Container size="4">
        <Flex direction="column" gap="6">
          {/* Main Headline */}
          <Box style={{ textAlign: 'center' }}>
            <Heading size="8" mb="2">
              Showcase Your Business to Art Lovers in {inviteData.event_city}
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
                    <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>Expected Attendance</Text>
                  </Flex>
                  <Text size="3">350-400 guests</Text>
                  <Badge color="green" size="1">High Capacity Event</Badge>
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
              <Heading size="5">Your Target Audience</Heading>
              <Grid columns="3" gap="4">
                <Box>
                  <Text size="6" weight="bold">Ages 25-45</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Prime demographic</Text>
                </Box>
                <Box>
                  <Text size="6" weight="bold">$75K+</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Household income 60%</Text>
                </Box>
                <Box>
                  <Text size="6" weight="bold">Arts & Culture</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Enthusiasts & creators</Text>
                </Box>
              </Grid>
            </Flex>
          </Card>

          {/* Photo Grid */}
          <Box>
            <Heading size="5" mb="4">Art Battle in {inviteData.event_city}</Heading>
            <Grid columns="4" gap="3">
              {eventPhotos.map((photo, idx) => (
                <Box
                  key={idx}
                  style={{
                    aspectRatio: '4/3',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'var(--gray-3)',
                    border: '1px solid var(--gray-6)'
                  }}
                >
                  <img
                    src={photo}
                    alt={`Event photo ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              ))}
            </Grid>
          </Box>

          {/* Social Proof */}
          <Card size="3" style={{ background: 'var(--gray-3)' }}>
            <Flex direction="column" gap="2">
              <Text size="3" weight="bold">"Art Battle events create an electric atmosphere. Our brand visibility was incredible, and we connected with exactly the customers we wanted to reach."</Text>
              <Text size="2" style={{ color: 'var(--gray-11)' }}>
                — Local Business Owner, Previous {inviteData.event_city} Event
              </Text>
            </Flex>
          </Card>
        </Flex>
      </Container>
    </Box>
  );
};

export default LocalRelevanceSection;
