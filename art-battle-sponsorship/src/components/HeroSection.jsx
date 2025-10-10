import { Box, Container, Flex, Heading, Text, Badge, ScrollArea, Callout } from '@radix-ui/themes';
import { PlayIcon, ClockIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';

const HeroSection = ({ inviteData }) => {
  // Convert media array to map
  const mediaMap = {};
  inviteData?.media?.forEach(item => {
    mediaMap[item.media_type] = item.url;
  });

  const heroBg = mediaMap.hero_bg_desktop || 'https://picsum.photos/1920/1080?random=1';
  const videoPoster = mediaMap.video_poster || 'https://placehold.co/800x450/1a1a1a/white?text=Art+Battle+Highlight+Reel';

  // Get sponsor logos from media - looking for sponsor_logo_1 through sponsor_logo_8
  const sponsorLogoUrls = [];
  for (let i = 1; i <= 8; i++) {
    const logoUrl = mediaMap[`sponsor_logo_${i}`];
    if (logoUrl) {
      sponsorLogoUrls.push(logoUrl);
    }
  }

  // Get prospect name or company
  const prospectDisplay = inviteData?.prospect_company || inviteData?.prospect_name || '';

  // Calculate expiration status
  const getExpirationStatus = () => {
    if (!inviteData?.valid_until) return null;

    const validUntil = new Date(inviteData.valid_until);
    const now = new Date();
    const diffTime = validUntil - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      // Expired
      return {
        type: 'expired',
        color: 'red',
        message: `Personal offer${prospectDisplay ? ` for ${prospectDisplay}` : ''} expired ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago!`,
        icon: ExclamationTriangleIcon
      };
    } else if (diffDays <= 8) {
      // Expires soon
      return {
        type: 'expires_soon',
        color: 'amber',
        message: `Offer${prospectDisplay ? ` for ${prospectDisplay}` : ''} expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}!`,
        icon: ClockIcon
      };
    }

    return null;
  };

  const expirationStatus = getExpirationStatus();

  return (
    <Box style={{ position: 'relative', overflow: 'hidden', minHeight: 0 }}>
      {/* Background Image with Combined Overlays */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url(${heroBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        filter: 'brightness(0.4)',
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
        zIndex: 0,
        pointerEvents: 'none'
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
        <Container size="4" py="6" px="4" style={{ paddingBottom: 0 }}>
          <Flex direction="column" align="center" gap="4" style={{ textAlign: 'center' }}>
            {/* Art Battle Logo */}
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
              alt="Art Battle"
              style={{
                height: '80px',
                maxWidth: '100%',
                marginBottom: '1rem',
                objectFit: 'contain'
              }}
            />

            {/* Expiration Warning */}
            {expirationStatus && (
              <Callout.Root color={expirationStatus.color} size="3" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
                <Callout.Icon>
                  <expirationStatus.icon width="20" height="20" />
                </Callout.Icon>
                <Callout.Text size="3" weight="bold">
                  {expirationStatus.message}
                </Callout.Text>
              </Callout.Root>
            )}

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
                poster={videoPoster}
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
          </Flex>
        </Container>
      </Box>

      {/* Sponsor Logo Banner */}
      {sponsorLogoUrls.length > 0 && (
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
                {sponsorLogoUrls.map((logoUrl, idx) => (
                  <Box
                    key={idx}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: 'var(--gray-3)',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <img
                      src={logoUrl}
                      alt={`Sponsor ${idx + 1}`}
                      style={{
                        maxHeight: '40px',
                        maxWidth: '120px',
                        objectFit: 'contain'
                      }}
                    />
                  </Box>
                ))}
              </Flex>
            </Flex>
          </Container>
        </Box>
      )}
    </Box>
  );
};

export default HeroSection;
