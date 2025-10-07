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
import { CheckIcon } from '@radix-ui/react-icons';

const AddonsModal = ({ open, packages, selectedPackage, discountPercent, onConfirm, onClose }) => {
  const [selectedAddons, setSelectedAddons] = useState([]);

  if (!packages || !selectedPackage) return null;

  // Filter addon packages
  const addonPackages = packages.filter(pkg => pkg.is_addon);

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
            <Flex justify="between" align="center">
              <Box>
                <Text size="2" style={{ color: 'var(--gray-11)' }}>Selected Package</Text>
                <Heading size="4">{selectedPackage.name}</Heading>
              </Box>
              <Heading size="5">
                ${calculateDiscountedPrice(selectedPackage.base_price).toFixed(0)}
              </Heading>
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
                          <Text size="4" weight="bold" style={{ marginLeft: '1rem' }}>
                            +${price.toFixed(0)}
                          </Text>
                        </Flex>

                        {/* Benefits */}
                        {addon.benefits && addon.benefits.length > 0 && (
                          <Flex direction="column" gap="1" mt="1">
                            {addon.benefits.slice(0, 3).map((benefit, idx) => (
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
          <Flex justify="between" align="center">
            <Box>
              <Text size="2" style={{ color: 'var(--gray-11)' }}>Current Total</Text>
              <Text size="1" style={{ color: 'var(--gray-11)' }}>
                {selectedAddons.length} add-on{selectedAddons.length !== 1 ? 's' : ''} selected
              </Text>
            </Box>
            <Heading size="6">
              ${calculateTotal().toFixed(0)} {selectedPackage.currency || 'USD'}
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
            <Button onClick={() => onConfirm(selectedAddons)}>
              Continue
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default AddonsModal;
