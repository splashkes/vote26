import { Box, Container, Flex, Heading, Text, Card, Button, Badge, Grid } from '@radix-ui/themes';
import { ChevronLeftIcon, CheckIcon } from '@radix-ui/react-icons';

const PackageGrid = ({ packages, tier, discountPercent, onSelect, onBack, inviteData }) => {
  if (!packages) return null;

  // Filter packages based on tier
  const filteredPackages = packages.filter(pkg => {
    const price = pkg.base_price;
    if (tier === 'premium') {
      return price >= 300 && !pkg.is_addon;
    } else {
      return price < 300 && !pkg.is_addon;
    }
  });

  // Get prospect name for personalization
  const prospectDisplay = inviteData?.prospect_company || inviteData?.prospect_name || '';

  // Get locale from country code
  const getLocale = () => {
    const countryCode = inviteData?.country_code || 'US';
    // Map country codes to locales
    const localeMap = {
      'US': 'en-US',
      'CA': 'en-CA',
      'GB': 'en-GB',
      'AU': 'en-AU',
      'NZ': 'en-NZ',
      'FR': 'fr-FR',
      'DE': 'de-DE',
      'ES': 'es-ES',
      'IT': 'it-IT',
      'JP': 'ja-JP',
      'CN': 'zh-CN',
      'BR': 'pt-BR',
      'MX': 'es-MX',
      'IN': 'en-IN'
    };
    return localeMap[countryCode] || 'en-US';
  };

  const formatCurrency = (amount) => {
    return Math.round(amount).toLocaleString(getLocale());
  };

  const calculateDiscountedPrice = (price) => {
    if (!discountPercent || discountPercent === 0) return price;
    return price * (1 - discountPercent / 100);
  };

  // Check if any packages are marked as limited
  const getLimitedBadge = (index) => {
    // Placeholder logic - in real implementation, check inventory
    return index === 0 ? 'Only 2 left' : null;
  };

  return (
    <Box py="6" style={{ width: '100%' }}>
      <Container size="4">
        <Flex direction="column" gap="6">
          {/* Header */}
          <Flex direction="column" align="center" gap="3">
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
              alt="Art Battle"
              style={{
                height: '50px',
                maxWidth: '100%',
                objectFit: 'contain'
              }}
            />
            <Box style={{ textAlign: 'center' }}>
              <Heading size="7">
                {tier === 'premium' ? 'Premium Sponsorship Packages' : 'Targeted Sponsorship Packages'}
              </Heading>
              {discountPercent > 0 && (
                <Badge size="2" color="green" style={{ marginTop: '0.5rem' }}>
                  {discountPercent}% Exclusive Discount Applied{prospectDisplay && ` for ${prospectDisplay}`}
                </Badge>
              )}
            </Box>
          </Flex>

          {/* Package Cards */}
          <Grid
            columns={{ initial: '1', sm: '2', md: '3' }}
            gap="4"
            style={{
              paddingTop: '1.5rem',
              overflow: 'visible'
            }}
          >
            {filteredPackages.map((pkg, index) => {
              const originalPrice = pkg.base_price;
              const discountedPrice = calculateDiscountedPrice(originalPrice);
              const hasDiscount = discountPercent > 0;
              const limitedBadge = getLimitedBadge(index);

              return (
                <Card
                  key={pkg.id}
                  size="3"
                  style={{
                    background: 'var(--gray-2)',
                    border: limitedBadge ? '2px solid var(--amber-8)' : '1px solid var(--gray-6)',
                    position: 'relative',
                    overflow: 'visible',
                    width: '100%'
                  }}
                >
                  <Flex direction="column" gap="4" style={{ height: '100%' }}>
                    {/* Limited Badge */}
                    {limitedBadge && (
                      <Badge
                        color="amber"
                        size="2"
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          zIndex: 10
                        }}
                      >
                        🔥 {limitedBadge}
                      </Badge>
                    )}

                    {/* Package Header */}
                    <Box>
                      <Heading
                        size="5"
                        mb="2"
                        style={{
                          wordWrap: 'break-word',
                          lineHeight: '1.3',
                          paddingRight: limitedBadge ? '90px' : '0'
                        }}
                      >
                        {pkg.name}
                      </Heading>
                      <Text size="2" style={{ color: 'var(--gray-11)' }}>
                        {pkg.description}
                      </Text>

                      {/* Benefits List - Always Expanded */}
                      {pkg.benefits && pkg.benefits.length > 0 && (
                        <Box
                          mt="3"
                          p="3"
                          style={{
                            background: 'var(--gray-3)',
                            borderRadius: '6px',
                            border: '1px solid var(--gray-6)'
                          }}
                        >
                          <Flex direction="column" gap="2">
                            {pkg.benefits.map((benefit, idx) => (
                              <Flex key={idx} gap="2" align="start">
                                <CheckIcon
                                  width="16"
                                  height="16"
                                  style={{ color: 'var(--green-9)', marginTop: '2px', flexShrink: 0 }}
                                />
                                <Text size="2">{benefit}</Text>
                              </Flex>
                            ))}
                          </Flex>
                        </Box>
                      )}
                    </Box>

                    {/* Pricing */}
                    <Box>
                      {hasDiscount ? (
                        <Flex align="baseline" gap="2">
                          <Heading size="7">${formatCurrency(discountedPrice)}</Heading>
                          <Text
                            size="4"
                            style={{
                              color: 'var(--gray-10)',
                              textDecoration: 'line-through'
                            }}
                          >
                            ${formatCurrency(originalPrice)}
                          </Text>
                        </Flex>
                      ) : (
                        <Heading size="7">${formatCurrency(originalPrice)}</Heading>
                      )}
                      <Text size="2" style={{ color: 'var(--gray-11)' }}>
                        {pkg.currency || 'USD'}
                      </Text>
                    </Box>

                    {/* Spacer */}
                    <Box style={{ flex: 1 }} />

                    {/* CTA */}
                    <Button
                      size="3"
                      style={{ width: '100%' }}
                      color={limitedBadge ? 'amber' : undefined}
                      onClick={() => onSelect(pkg)}
                    >
                      Select Package
                    </Button>
                  </Flex>
                </Card>
              );
            })}
          </Grid>

          {/* Empty State */}
          {filteredPackages.length === 0 && (
            <Card size="3">
              <Flex direction="column" align="center" gap="3" py="6">
                <Text size="4" style={{ color: 'var(--gray-11)' }}>
                  No packages available in this tier
                </Text>
                <Button variant="soft" onClick={onBack}>
                  View All Packages
                </Button>
              </Flex>
            </Card>
          )}
        </Flex>
      </Container>
    </Box>
  );
};

export default PackageGrid;
