import { useState } from 'react';
import {
  Dialog,
  Box,
  Flex,
  Heading,
  Text,
  Button,
  Card,
  Checkbox,
  Separator
} from '@radix-ui/themes';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';

const AddonsModal = ({ open, packages, selectedPackage, discountPercent, inviteData, onConfirm, onClose }) => {
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [expandedAddons, setExpandedAddons] = useState({});
  const [showPackageBenefits, setShowPackageBenefits] = useState(false);

  if (!packages || !selectedPackage) return null;

  // Filter addon packages
  const addonPackages = packages.filter(pkg => pkg.is_addon);

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

  const toggleAddon = (addon) => {
    setSelectedAddons(prev => {
      const exists = prev.find(a => a.id === addon.id);
      if (exists) {
        return prev.filter(a => a.id !== addon.id);
      } else {
        return [...prev, addon];
      }
    });
  };

  const toggleBenefits = (addonId) => {
    setExpandedAddons(prev => ({
      ...prev,
      [addonId]: !prev[addonId]
    }));
  };

  const calculateTotal = () => {
    const packagePrice = calculateDiscountedPrice(selectedPackage.base_price);
    const addonsTotal = selectedAddons.reduce(
      (sum, addon) => sum + calculateDiscountedPrice(addon.base_price),
      0
    );
    return packagePrice + addonsTotal;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: '700px', maxHeight: '90vh' }}>
        <Dialog.Title>
          Enhance Your Sponsorship
        </Dialog.Title>
        <Dialog.Description size="2" mb="4">
          Add optional features to maximize your brand impact
        </Dialog.Description>

        <Flex direction="column" gap="4" style={{ marginTop: '1rem' }}>
          {/* Selected Package Summary */}
          <Card size="2" style={{ background: 'var(--accent-3)' }}>
            <Flex direction="column" gap="2">
              <Flex justify="between" align="center">
                <Heading size="4">{selectedPackage.name}</Heading>
                <Flex direction="column" align="end" gap="1">
                  {discountPercent > 0 && (
                    <Text size="2" style={{ textDecoration: 'line-through', color: 'var(--gray-11)' }}>
                      ${formatCurrency(selectedPackage.base_price)}
                    </Text>
                  )}
                  <Heading size="5">
                    ${formatCurrency(calculateDiscountedPrice(selectedPackage.base_price))}
                  </Heading>
                </Flex>
              </Flex>

              {/* Toggle Benefits Button */}
              <Button
                variant="ghost"
                size="1"
                onClick={() => setShowPackageBenefits(!showPackageBenefits)}
                style={{ padding: '0.25rem 0.5rem', justifyContent: 'flex-start' }}
              >
                <Flex align="center" gap="1">
                  {showPackageBenefits ? (
                    <>
                      <ChevronUpIcon width="14" height="14" />
                      <Text size="1">Hide benefits</Text>
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon width="14" height="14" />
                      <Text size="1">{selectedPackage.benefits?.length || 0} benefits</Text>
                    </>
                  )}
                </Flex>
              </Button>

              {/* Expandable Benefits */}
              {showPackageBenefits && (
                <Box
                  p="3"
                  style={{
                    background: 'var(--gray-3)',
                    borderRadius: '6px',
                    border: '1px solid var(--gray-6)'
                  }}
                >
                  <Flex direction="column" gap="2">
                    {selectedPackage.benefits && selectedPackage.benefits.map((benefit, idx) => (
                      <Flex key={idx} gap="2" align="start">
                        <CheckIcon
                          width="14"
                          height="14"
                          style={{ color: 'var(--green-9)', marginTop: '2px', flexShrink: 0 }}
                        />
                        <Text size="2">{benefit}</Text>
                      </Flex>
                    ))}
                  </Flex>
                </Box>
              )}
            </Flex>
          </Card>

          {/* Addon Options */}
          <Box>
            <Heading size="4" mb="3">Available Add-ons</Heading>
            <Flex direction="column" gap="3">
              {addonPackages.map(addon => {
                const isSelected = selectedAddons.find(a => a.id === addon.id);
                const price = calculateDiscountedPrice(addon.base_price);

                return (
                  <Card
                    key={addon.id}
                    size="2"
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent-2)' : 'var(--gray-2)',
                      border: isSelected ? '2px solid var(--accent-8)' : '1px solid var(--gray-6)'
                    }}
                    onClick={() => toggleAddon(addon)}
                  >
                    <Flex gap="3" align="start">
                      <Checkbox
                        checked={!!isSelected}
                        onCheckedChange={() => toggleAddon(addon)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginTop: '2px' }}
                      />
                      <Flex direction="column" gap="2" style={{ flex: 1 }}>
                        <Flex justify="between" align="start">
                          <Box>
                            <Text size="3" weight="bold">{addon.name}</Text>
                            <Text size="2" style={{ color: 'var(--gray-11)', display: 'block' }}>
                              {addon.description}
                            </Text>
                          </Box>
                          <Flex direction="column" align="end" gap="1" style={{ marginLeft: '1rem' }}>
                            {discountPercent > 0 && (
                              <Text size="2" style={{ textDecoration: 'line-through', color: 'var(--gray-11)' }}>
                                +${formatCurrency(addon.base_price)}
                              </Text>
                            )}
                            <Text size="4" weight="bold">
                              +${formatCurrency(price)}
                            </Text>
                          </Flex>
                        </Flex>

                        {/* Expandable Benefits Toggle */}
                        <Button
                          variant="ghost"
                          size="1"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBenefits(addon.id);
                          }}
                          style={{ padding: '0.25rem 0.5rem', justifyContent: 'flex-start' }}
                        >
                          <Flex align="center" gap="1">
                            {expandedAddons[addon.id] ? (
                              <>
                                <ChevronUpIcon width="14" height="14" />
                                <Text size="1">Hide benefits</Text>
                              </>
                            ) : (
                              <>
                                <ChevronDownIcon width="14" height="14" />
                                <Text size="1">{addon.benefits?.length || 0} benefits</Text>
                              </>
                            )}
                          </Flex>
                        </Button>

                        {/* Expandable Benefits List */}
                        {expandedAddons[addon.id] && addon.benefits && addon.benefits.length > 0 && (
                          <Box
                            mt="1"
                            p="2"
                            style={{
                              background: 'var(--gray-3)',
                              borderRadius: '6px',
                              border: '1px solid var(--gray-6)'
                            }}
                          >
                            <Flex direction="column" gap="1">
                              {addon.benefits.map((benefit, idx) => (
                                <Flex key={idx} gap="2" align="start">
                                  <CheckIcon
                                    width="14"
                                    height="14"
                                    style={{ color: 'var(--green-9)', marginTop: '2px', flexShrink: 0 }}
                                  />
                                  <Text size="1" style={{ color: 'var(--gray-11)' }}>{benefit}</Text>
                                </Flex>
                              ))}
                            </Flex>
                          </Box>
                        )}
                      </Flex>
                    </Flex>
                  </Card>
                );
              })}
            </Flex>
          </Box>

          {/* Empty State */}
          {addonPackages.length === 0 && (
            <Card size="2">
              <Text size="2" style={{ color: 'var(--gray-11)' }}>
                No add-ons available for this event
              </Text>
            </Card>
          )}

          <Separator />

          {/* Total */}
          <Flex justify="end" align="center">
            <Heading size="6">
              ${formatCurrency(calculateTotal())} {selectedPackage.currency || 'USD'}
            </Heading>
          </Flex>

          {/* Actions */}
          <Flex gap="3" justify="end">
            <Button variant="soft" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => onConfirm([])}>
              Skip Add-ons
            </Button>
            <Button
              onClick={() => onConfirm(selectedAddons)}
              disabled={selectedAddons.length === 0}
            >
              Continue
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default AddonsModal;
