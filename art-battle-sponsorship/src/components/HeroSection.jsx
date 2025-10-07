import { Box, Container, Flex, Heading, Text, Badge, ScrollArea } from '@radix-ui/themes';
import { PlayIcon } from '@radix-ui/react-icons';

const HeroSection = () => {
  // Placeholder sponsor logos
  const sponsorLogos = [
    'Molson Canadian', 'Bacardi', 'Red Bull', 'Bombay Sapphire',
    'Corona', 'Grey Goose', 'Jameson', 'Stella Artois'
  ];

  return (
    <Box style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Hero Video Section */}
      <Box style={{
        background: 'linear-gradient(135deg, var(--accent-9) 0%, var(--accent-11) 100%)',
        position: 'relative',
        minHeight: '70vh',
        padding: '0 1rem'
      }}>
        <Container size="4" py="9" px="4">
          <Flex direction="column" align="center" gap="6" style={{ textAlign: 'center' }}>
            {/* Video Placeholder */}
            <Box style={{
              width: '100%',
              maxWidth: '800px',
              aspectRatio: '16/9',
              background: 'var(--gray-12)',
              borderRadius: '12px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
            }}>
              {/* Placeholder for video */}
              <Flex
                align="center"
                justify="center"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(45deg, rgba(0,0,0,0.8), rgba(0,0,0,0.4))'
                }}
              >
                <Box style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  ':hover': { transform: 'scale(1.1)' }
                }}>
                  <PlayIcon width="32" height="32" style={{ color: 'white', marginLeft: '4px' }} />
                </Box>
              </Flex>
              <video
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }}
                poster="https://placehold.co/800x450/1a1a1a/white?text=Art+Battle+Highlight+Reel"
                muted
                loop
              >
                {/* Placeholder - CloudFlare video URL goes here */}
              </video>
            </Box>

            {/* Global Stats */}
            <Flex gap="6" wrap="wrap" justify="center" mt="4">
              <Box style={{ textAlign: 'center' }}>
                <Heading size="8" style={{ color: 'white' }}>12,000+</Heading>
                <Text size="2" style={{ color: 'rgba(255,255,255,0.8)' }}>Events Worldwide</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Heading size="8" style={{ color: 'white' }}>85</Heading>
                <Text size="2" style={{ color: 'rgba(255,255,255,0.8)' }}>Cities</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Heading size="8" style={{ color: 'white' }}>2M+</Heading>
                <Text size="2" style={{ color: 'rgba(255,255,255,0.8)' }}>Total Attendees</Text>
              </Box>
            </Flex>

            {/* Scroll Indicator */}
            <Text size="2" style={{ color: 'rgba(255,255,255,0.6)', marginTop: '2rem' }}>
              ↓ Scroll to learn more
            </Text>
          </Flex>
        </Container>
      </Box>

      {/* Sponsor Logo Banner */}
      <Box style={{
        background: 'var(--gray-2)',
        borderTop: '1px solid var(--gray-6)',
        borderBottom: '1px solid var(--gray-6)',
        padding: '1.5rem 1rem'
      }}>
        <Container size="4" px="4">
          <Flex direction="column" gap="3" align="center">
            <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>
              TRUSTED BY LEADING BRANDS
            </Text>
            <Flex gap="6" wrap="wrap" justify="center" align="center">
              {sponsorLogos.map((logo, idx) => (
                <Box
                  key={idx}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'var(--gray-3)',
                    borderRadius: '6px',
                    border: '1px solid var(--gray-6)'
                  }}
                >
                  <Text size="2" weight="bold" style={{ color: 'var(--gray-11)' }}>
                    {logo}
                  </Text>
                </Box>
              ))}
            </Flex>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
};

export default HeroSection;
