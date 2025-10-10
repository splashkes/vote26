import { Box, Container, Flex, Heading, Text, Card, Button, Grid } from '@radix-ui/themes';
import { StarFilledIcon, TargetIcon, PersonIcon } from '@radix-ui/react-icons';

const SelfSelectionCTA = ({ packages, onSelect, isExpired = false, inviteData }) => {
  // Check which tiers have available packages and calculate price ranges
  const personalPackages = packages?.filter(pkg => pkg.category === 'personal' && !pkg.is_addon) || [];
  const brandPackages = packages?.filter(pkg => pkg.category === 'brand' && !pkg.is_addon) || [];
  const businessPackages = packages?.filter(pkg => pkg.category === 'business' && !pkg.is_addon) || [];

  const hasPersonalPackages = personalPackages.length > 0;
  const hasBrandPackages = brandPackages.length > 0;
  const hasBusinessPackages = businessPackages.length > 0;

  // Calculate price ranges with $100 buffer and aggressive rounding
  const getPriceRange = (pkgs) => {
    if (!pkgs || pkgs.length === 0) return null;
    const prices = pkgs.map(p => p.base_price);
    const rawMin = Math.min(...prices) - 100;
    const rawMax = Math.max(...prices) + 100;
    // Round to nearest $100
    const min = Math.round(rawMin / 100) * 100;
    const max = Math.round(rawMax / 100) * 100;
    return { min: Math.max(0, min), max }; // Ensure min doesn't go below 0
  };

  const personalRange = getPriceRange(personalPackages);
  const brandRange = getPriceRange(brandPackages);
  const businessRange = getPriceRange(businessPackages);

  const cityName = inviteData?.event_city || '';
  const currencySymbol = inviteData?.currency_symbol || '$';

  // Format price range
  const formatPriceRange = (range) => {
    if (!range) return '';
    return `${currencySymbol}${range.min.toLocaleString()} - ${currencySymbol}${range.max.toLocaleString()}`;
  };

  // Count available tiers
  const availableTiers = [hasPersonalPackages, hasBrandPackages, hasBusinessPackages].filter(Boolean).length;

  // Don't render if no tiers available
  if (availableTiers === 0) {
    return null;
  }

  // Determine grid columns based on available tiers
  const gridColumns = availableTiers === 1 ? '1' : availableTiers === 2 ? { initial: '1', sm: '2' } : { initial: '1', sm: '3' };

  return (
    <Box py="9" style={{ position: 'relative', padding: '3rem 1rem', overflow: 'hidden' }}>
      {/* Background Image */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(https://picsum.photos/1920/1080?random=3)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(0.25)',
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
        background: 'linear-gradient(to bottom, black 0%, rgba(30,60,120,0.6) 15%, rgba(10,20,40,0.8) 85%, black 100%)',
        transform: 'translate3d(0,0,0)',
        zIndex: 1
      }} />

      <Container size="3" px="4" style={{ position: 'relative', zIndex: 2 }}>
        <Flex direction="column" gap="6" align="center">
          <Box style={{ textAlign: 'center' }}>
            <Heading size="7" mb="2">Choose Your Level of Partnership</Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Select the sponsorship tier that matches your goals
            </Text>
          </Box>

          <Grid columns={gridColumns} gap="4" width="100%" style={{ alignItems: 'end', maxWidth: '600px', margin: '0 auto' }}>
            {/* Personal Tier */}
            {hasPersonalPackages && (
              <Card
              size="4"
              style={{
                background: 'var(--gray-3)',
                border: '2px solid var(--gray-6)',
                cursor: isExpired ? 'not-allowed' : 'pointer',
                opacity: isExpired ? 0.5 : 1,
                transition: 'all 0.3s ease',
                height: 'fit-content'
              }}
              onClick={() => !isExpired && onSelect('personal')}
            >
              <Flex direction="column" gap="3" align="center" justify="center" style={{ textAlign: 'center', minHeight: '100%' }}>
                <Box
                  style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    background: 'var(--indigo-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <PersonIcon width="36" height="36" style={{ color: 'white' }} />
                </Box>

                <Heading size="5">Personal</Heading>

                <Text size="3" weight="bold" style={{ color: 'var(--accent-11)' }}>
                  {formatPriceRange(personalRange)}
                </Text>

                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  For people who want to make a splash or support {cityName} artists
                </Text>

                <Flex direction="column" gap="1" style={{ width: '100%' }}>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Auction credits</Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Large groups</Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Merchandise</Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Benefactor support</Text>
                </Flex>

                <Button size="3" variant="outline" style={{ width: '100%', marginTop: '0.5rem' }} disabled={isExpired}>
                  View Options
                </Button>
              </Flex>
            </Card>
            )}

            {/* Brand Tier - Emphasized */}
            {hasBrandPackages && (
              <Card
              size="4"
              style={{
                background: 'linear-gradient(135deg, var(--accent-3) 0%, var(--accent-4) 100%)',
                border: '3px solid var(--accent-8)',
                cursor: isExpired ? 'not-allowed' : 'pointer',
                opacity: isExpired ? 0.5 : 1,
                transition: 'all 0.3s ease',
                height: 'fit-content',
                transform: 'scale(1.05)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                position: 'relative'
              }}
              onClick={() => !isExpired && onSelect('brand')}
            >
              {/* Popular badge */}
              <Box style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--accent-9)',
                color: 'white',
                padding: '4px 16px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}>
                Most Popular
              </Box>

              <Flex direction="column" gap="3" align="center" justify="center" style={{ textAlign: 'center', minHeight: '100%', paddingTop: '0.5rem' }}>
                <Box
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'var(--accent-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  <TargetIcon width="40" height="40" style={{ color: 'white' }} />
                </Box>

                <Heading size="6">Brand</Heading>

                <Text size="4" weight="bold" style={{ color: 'white' }}>
                  {formatPriceRange(brandRange)}
                </Text>

                <Text size="2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Major event impact embedded into the competition experience
                </Text>

                <Flex direction="column" gap="1" style={{ width: '100%' }}>
                  <Text size="1" style={{ color: 'rgba(255,255,255,0.85)' }}>• Custom executions</Text>
                  <Text size="1" style={{ color: 'rgba(255,255,255,0.85)' }}>• Large client or company groups</Text>
                  <Text size="1" style={{ color: 'rgba(255,255,255,0.85)' }}>• Seasonal sponsorship</Text>
                  <Text size="1" style={{ color: 'rgba(255,255,255,0.85)' }}>• Multi-event sponsorship</Text>
                </Flex>

                <Button size="3" style={{ width: '100%', marginTop: '0.5rem', background: 'white', color: 'var(--accent-11)' }} disabled={isExpired}>
                  View Options
                </Button>
              </Flex>
            </Card>
            )}

            {/* Tactical Tier */}
            {hasBusinessPackages && (
              <Card
              size="4"
              style={{
                background: 'var(--gray-3)',
                border: '2px solid var(--gray-6)',
                cursor: isExpired ? 'not-allowed' : 'pointer',
                opacity: isExpired ? 0.5 : 1,
                transition: 'all 0.3s ease',
                height: 'fit-content'
              }}
              onClick={() => !isExpired && onSelect('business')}
            >
              <Flex direction="column" gap="3" align="center" justify="center" style={{ textAlign: 'center', minHeight: '100%' }}>
                <Box
                  style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    background: 'var(--green-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <StarFilledIcon width="36" height="36" style={{ color: 'white' }} />
                </Box>

                <Heading size="5">Tactical</Heading>

                <Text size="3" weight="bold" style={{ color: 'var(--accent-11)' }}>
                  {formatPriceRange(businessRange)}
                </Text>

                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  Buy out specific event experiences like prizing or auction matching
                </Text>

                <Flex direction="column" gap="1" style={{ width: '100%' }}>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Opportunity for sampling</Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Selling opportunities</Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Info table placement</Text>
                  <Text size="1" style={{ color: 'var(--gray-11)' }}>• Specific activations</Text>
                </Flex>

                <Button size="3" variant="outline" style={{ width: '100%', marginTop: '0.5rem' }} disabled={isExpired}>
                  View Options
                </Button>
              </Flex>
            </Card>
            )}
          </Grid>
        </Flex>
      </Container>
    </Box>
  );
};

export default SelfSelectionCTA;
