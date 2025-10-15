import { Box, Container, Flex, Heading, Text, Card, Button, Grid } from '@radix-ui/themes';
import { StarFilledIcon, TargetIcon, PersonIcon, ArrowRightIcon } from '@radix-ui/react-icons';

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

  // Adjust max width based on number of tiers
  const gridMaxWidth = availableTiers === 2 ? '800px' : '1200px';

  return (
    <Box py="9" style={{ position: 'relative', padding: '6rem 1rem 3rem 1rem', overflow: 'visible' }}>
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

      <Container size="3" px="4" style={{ position: 'relative', zIndex: 2, overflow: 'visible' }}>
        <Flex direction="column" gap="6" align="center" style={{ overflow: 'visible' }}>
          <Box style={{ textAlign: 'center' }}>
            <Heading size="7" mb="2">Choose Your Level of Partnership</Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Select the sponsorship tier that matches your goals
            </Text>
          </Box>

          <Grid columns={gridColumns} gap="5" width="100%" style={{ alignItems: 'flex-start', maxWidth: gridMaxWidth, margin: '0 auto', overflow: 'visible' }}>
            {/* Personal Tier */}
            {hasPersonalPackages && (
              <Flex direction="column" align="center" gap="0" style={{ position: 'relative' }}>
                {/* Spacer for this column */}
                <Box style={{ height: '40px' }} />

                <Card
                size="4"
                style={{
                  background: 'var(--gray-3)',
                  border: '2px solid var(--gray-6)',
                  cursor: isExpired ? 'not-allowed' : 'pointer',
                  opacity: isExpired ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  height: 'fit-content',
                  padding: '2rem',
                  width: '100%'
                }}
                onClick={() => !isExpired && onSelect('personal')}
              >
              <Flex direction="column" gap="4" align="center" justify="center" style={{ textAlign: 'center', minHeight: '100%' }}>
                <Box
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    background: 'var(--indigo-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                >
                  <PersonIcon width="44" height="44" style={{ color: 'white' }} />
                </Box>

                <Heading size="6">Personal</Heading>

                <Text size="3" weight="bold" style={{ color: 'var(--accent-11)' }}>
                  {formatPriceRange(personalRange)}
                </Text>

                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  For people who want to make a splash or support {cityName} artists
                </Text>

                <Button
                  size="3"
                  style={{
                    width: '100%',
                    marginTop: '0.5rem',
                    background: 'var(--green-9)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    padding: '14px 28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  disabled={isExpired}
                >
                  View {personalPackages.length} Options
                  <ArrowRightIcon width="18" height="18" />
                </Button>
              </Flex>
            </Card>
            </Flex>
            )}

            {/* Brand Tier - Emphasized */}
            {hasBrandPackages && (
              <Flex direction="column" align="center" gap="0" style={{ position: 'relative' }}>
                {/* Spacer for this column */}
                <Box style={{ height: '40px' }} />

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
                  padding: '2rem',
                  width: '100%'
                }}
                onClick={() => !isExpired && onSelect('brand')}
              >

              <Flex direction="column" gap="4" align="center" justify="center" style={{ textAlign: 'center', minHeight: '100%' }}>
                <Box
                  style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: 'var(--accent-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.25)'
                  }}
                >
                  <TargetIcon width="50" height="50" style={{ color: 'white' }} />
                </Box>

                <Heading size="7">Brand</Heading>

                <Text size="4" weight="bold" style={{ color: 'white' }}>
                  {formatPriceRange(brandRange)}
                </Text>

                <Text size="2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                  Major event impact embedded into the competition experience
                </Text>

                <Button
                  size="3"
                  style={{
                    width: '100%',
                    marginTop: '0.5rem',
                    background: 'var(--green-9)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    padding: '14px 28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  disabled={isExpired}
                >
                  View {brandPackages.length} Options
                  <ArrowRightIcon width="18" height="18" />
                </Button>
              </Flex>
            </Card>
            </Flex>
            )}

            {/* Tactical Tier */}
            {hasBusinessPackages && (
              <Flex direction="column" align="center" gap="0" style={{ position: 'relative' }}>
                {/* Spacer for this column */}
                <Box style={{ height: '40px' }} />

                <Card
                size="4"
                style={{
                  background: 'var(--gray-3)',
                  border: '2px solid var(--gray-6)',
                  cursor: isExpired ? 'not-allowed' : 'pointer',
                  opacity: isExpired ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                  height: 'fit-content',
                  padding: '2rem',
                  width: '100%'
                }}
                onClick={() => !isExpired && onSelect('business')}
              >
              <Flex direction="column" gap="4" align="center" justify="center" style={{ textAlign: 'center', minHeight: '100%' }}>
                <Box
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    background: 'var(--green-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                >
                  <StarFilledIcon width="44" height="44" style={{ color: 'white' }} />
                </Box>

                <Heading size="6">Tactical</Heading>

                <Text size="3" weight="bold" style={{ color: 'var(--accent-11)' }}>
                  {formatPriceRange(businessRange)}
                </Text>

                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  Buy out specific event experiences like prizing or auction matching
                </Text>

                <Button
                  size="3"
                  style={{
                    width: '100%',
                    marginTop: '0.5rem',
                    background: 'var(--green-9)',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '16px',
                    padding: '14px 28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  disabled={isExpired}
                >
                  View {businessPackages.length} Options
                  <ArrowRightIcon width="18" height="18" />
                </Button>
              </Flex>
            </Card>
            </Flex>
            )}
          </Grid>
        </Flex>
      </Container>
    </Box>
  );
};

export default SelfSelectionCTA;
