import { Box, Container, Flex, Heading, Text, Badge, ScrollArea, Callout } from '@radix-ui/themes';
import { ClockIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';

const HeroSection = ({ inviteData }) => {
  // Convert media array to map
  const mediaMap = {};
  inviteData?.media?.forEach(item => {
    mediaMap[item.media_type] = item.url;
  });

  const heroBg = mediaMap.hero_bg_desktop || 'https://picsum.photos/1920/1080?random=1';

  // Get sponsor logos from media - looking for sponsor_logo_1 through sponsor_logo_8
  const sponsorLogoUrls = [];
  for (let i = 1; i <= 8; i++) {
    const logoUrl = mediaMap[`sponsor_logo_${i}`];
    if (logoUrl) {
      sponsorLogoUrls.push(logoUrl);
    }
  }

  console.log('🎨 Sponsor logos found:', sponsorLogoUrls.length, sponsorLogoUrls);

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
              <Callout.Root color={expirationStatus.color} size="3" style={{ maxWidth: '600px', width: '100%' }}>
                <Flex align="center" justify="center" gap="2" style={{ width: '100%' }}>
                  <Callout.Icon>
                    <expirationStatus.icon width="20" height="20" />
                  </Callout.Icon>
                  <Callout.Text size="3" weight="bold">
                    {expirationStatus.message}
                  </Callout.Text>
                </Flex>
              </Callout.Root>
            )}

            {/* Video */}
            <Box style={{
              width: '100%',
              maxWidth: '800px',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
            }}>
              <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                <iframe
                  src="https://customer-pr5dtb4f2f67rmaa.cloudflarestream.com/2620fef0e55d3e71767afb4c610e14b9/iframe?preload=true&poster=https%3A%2F%2Fcustomer-pr5dtb4f2f67rmaa.cloudflarestream.com%2F2620fef0e55d3e71767afb4c610e14b9%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&primaryColor=%23ebebeb"
                  loading="lazy"
                  style={{ border: 'none', position: 'absolute', top: 0, left: 0, height: '100%', width: '100%' }}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen={true}
                  title="Art Battle Highlight Reel"
                ></iframe>
              </div>
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

            {/* Sponsor Logos - Clean Transparent Display */}
            {sponsorLogoUrls.length > 0 && (
              <>
                <Box style={{
                  width: '100%',
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  margin: '2rem 0 1.5rem 0'
                }} />

                <Flex direction="column" gap="4" align="center" style={{ width: '100%' }}>
                  <Text size="2" weight="medium" style={{
                    color: 'rgba(255,255,255,0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontSize: '11px'
                  }}>
                    Trusted by Leading Brands
                  </Text>

                  <Flex gap="6" wrap="wrap" justify="center" align="center" style={{ maxWidth: '900px' }}>
                    {sponsorLogoUrls.map((logoUrl, idx) => {
                      // Use CloudFlare flexible variants for optimized sizing
                      const optimizedUrl = logoUrl.replace('/public', '/w=280,h=120,fit=scale-down');

                      return (
                        <img
                          key={idx}
                          src={optimizedUrl}
                          alt={`Sponsor ${idx + 1}`}
                          style={{
                            maxHeight: '120px',
                            maxWidth: '280px',
                            width: 'auto',
                            height: 'auto',
                            objectFit: 'contain',
                            display: 'block',
                            opacity: 0.9,
                            transition: 'opacity 0.2s ease',
                            cursor: 'default'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.9';
                          }}
                        />
                      );
                    })}
                  </Flex>
                </Flex>

                <Box style={{
                  width: '100%',
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                  margin: '1.5rem 0 1rem 0'
                }} />
              </>
            )}
          </Flex>
        </Container>
      </Box>
    </Box>
  );
};

export default HeroSection;
