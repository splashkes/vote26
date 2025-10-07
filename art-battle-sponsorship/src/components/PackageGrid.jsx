import { Box, Container, Flex, Heading, Text, Card, Button, Badge, Grid } from '@radix-ui/themes';
import { ChevronLeftIcon, CheckIcon } from '@radix-ui/react-icons';

const PackageGrid = ({ packages, tier, discountPercent, onSelect, onBack }) => {
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
    <Box py="6">
      <Container size="4">
        <Flex direction="column" gap="6">
          {/* Header */}
          <Flex justify="between" align="center">
            <Button variant="ghost" onClick={onBack}>
              <ChevronLeftIcon width="20" height="20" />
              Back
            </Button>
            <Box style={{ textAlign: 'center', flex: 1 }}>
              <Heading size="7">
                {tier === 'premium' ? 'Premium Sponsorship Packages' : 'Targeted Sponsorship Packages'}
              </Heading>
              {discountPercent > 0 && (
                <Badge size="2" color="green" style={{ marginTop: '0.5rem' }}>
                  {discountPercent}% Exclusive Discount Applied
                </Badge>
              )}
            </Box>
            <Box style={{ width: '80px' }} /> {/* Spacer for centering */}
          </Flex>

          {/* Package Cards */}
          <Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="4">
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
                    position: 'relative'
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
                          top: '-12px',
                          right: '16px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                        }}
                      >
                        🔥 {limitedBadge}
                      </Badge>
                    )}

                    {/* Package Header */}
                    <Box>
                      <Heading size="5" mb="2">{pkg.name}</Heading>
                      <Text size="2" style={{ color: 'var(--gray-11)' }}>
                        {pkg.description}
                      </Text>
                    </Box>

                    {/* Pricing */}
                    <Box>
                      {hasDiscount ? (
                        <Flex align="baseline" gap="2">
                          <Heading size="7">${discountedPrice.toFixed(0)}</Heading>
                          <Text
                            size="4"
                            style={{
                              color: 'var(--gray-10)',
                              textDecoration: 'line-through'
                            }}
                          >
                            ${originalPrice}
                          </Text>
                        </Flex>
                      ) : (
                        <Heading size="7">${originalPrice}</Heading>
                      )}
                      <Text size="2" style={{ color: 'var(--gray-11)' }}>
                        {pkg.currency || 'USD'}
                      </Text>
                    </Box>

                    {/* Benefits */}
                    <Flex direction="column" gap="2" style={{ flex: 1 }}>
                      {pkg.benefits && pkg.benefits.map((benefit, idx) => (
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

                    {/* CTA */}
                    <Button
                      size="3"
                      style={{ width: '100%' }}
                      color={limitedBadge ? 'amber' : undefined}
                      onClick={() => onSelect(pkg)}
                    >
                      Select {pkg.name}
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
