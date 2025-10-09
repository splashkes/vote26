import { Box, Container, Flex, Heading, Text, Badge, ScrollArea } from '@radix-ui/themes';
import { PlayIcon } from '@radix-ui/react-icons';

const HeroSection = ({ inviteData }) => {
  // Placeholder sponsor logos
  const sponsorLogos = [
    'Molson Canadian', 'Bacardi', 'Red Bull', 'Bombay Sapphire',
    'Corona', 'Grey Goose', 'Jameson', 'Stella Artois'
  ];

  // Get prospect name or company
  const prospectDisplay = inviteData?.prospect_company || inviteData?.prospect_name || '';

  return (
    <Box style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Background Image with Combined Overlays */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(https://picsum.photos/1920/1080?random=1)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(0.4)',
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
        zIndex: 0
      }} />

      {/* Combined Gradient Overlays (single layer for performance) */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, rgba(100,50,200,0.5) 0%, rgba(50,20,100,0.4) 70%, rgba(0,0,0,0.9) 100%)',
        transform: 'translate3d(0,0,0)',
        zIndex: 1
      }} />

      {/* Hero Video Section */}
      <Box style={{
        position: 'relative',
        padding: '0 1rem',
        zIndex: 2
      }}>
        <Container size="4" py="6" px="4">
          <Flex direction="column" align="center" gap="4" style={{ textAlign: 'center' }}>
            {/* Art Battle Logo */}
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
              alt="Art Battle"
              style={{
                height: '80px',
                marginBottom: '1rem',
                objectFit: 'contain'
              }}
            />

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
            <Flex gap="6" wrap="wrap" justify="center">
              <Box style={{ textAlign: 'center' }}>
                <Heading size="8" style={{ color: 'white' }}>3,500+</Heading>
                <Text size="2" style={{ color: 'rgba(255,255,255,0.8)' }}>Events Since 2001</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Heading size="8" style={{ color: 'white' }}>85</Heading>
                <Text size="2" style={{ color: 'rgba(255,255,255,0.8)' }}>Cities Worldwide</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Heading size="8" style={{ color: 'white' }}>88,000+</Heading>
                <Text size="2" style={{ color: 'rgba(255,255,255,0.8)' }}>Attendees Each Year</Text>
              </Box>
            </Flex>

            {/* Scroll Indicator */}
            <Text size="2" style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.5rem' }}>
              ↓ Scroll to learn more
            </Text>

            {/* Personalized Prospect/Company Name */}
            {prospectDisplay && (
              <Heading size="6" style={{ color: 'white', marginTop: '0.25rem', textAlign: 'center' }}>
                {prospectDisplay}
              </Heading>
            )}
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
