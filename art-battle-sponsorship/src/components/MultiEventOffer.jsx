import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  Card,
  Button,
  Badge,
  Grid,
  Checkbox,
  Separator,
  Dialog
} from '@radix-ui/themes';
import { CalendarIcon, RocketIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, QuestionMarkCircledIcon, MobileIcon } from '@radix-ui/react-icons';
import { trackInteraction } from '../lib/api';
import InternationalPhoneInput from './InternationalPhoneInput';

const MultiEventOffer = ({ inviteData, selectedPackage, selectedAddons, onConfirm, onSkip, discountPercent }) => {
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [showBenefits, setShowBenefits] = useState(false);
  const [showDiscountBreakdown, setShowDiscountBreakdown] = useState(false);
  const [requestingCall, setRequestingCall] = useState(false);
  const [callRequested, setCallRequested] = useState(false);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [phoneData, setPhoneData] = useState(null);
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    loadUpcomingEvents();
  }, []);

  const loadUpcomingEvents = () => {
    if (!inviteData.event_city) {
      return;
    }

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const cityName = inviteData.event_city;

    // Use placeholder events for multi-event sponsorship selection
    const events = [
      {
        id: `placeholder-${currentYear}`,
        name: `${currentYear} Art Battle ${cityName} Regular Season Event`,
        event_start_datetime: `${currentYear}-12-31T19:00:00`,
        venues: null,
        isPlaceholder: true
      },
      {
        id: `placeholder-${nextYear}`,
        name: `${nextYear} Art Battle ${cityName} Regular Season Event`,
        event_start_datetime: `${nextYear}-12-31T19:00:00`,
        venues: null,
        isPlaceholder: true
      },
      // Championship event
      {
        id: `championship-${nextYear}`,
        name: `${nextYear} ${cityName} Championship`,
        event_start_datetime: `${nextYear}-12-31T20:00:00`,
        venues: null,
        isChampionship: true
      }
    ];

    setUpcomingEvents(events);
  };

  const toggleEvent = (event) => {
    // If this is a championship event, check if all other events are selected first
    if (event.isChampionship) {
      const nonChampionshipEvents = upcomingEvents.filter(e => !e.isChampionship);
      const allOthersSelected = nonChampionshipEvents.every(e =>
        selectedEvents.find(se => se.id === e.id)
      );

      if (!allOthersSelected) {
        return; // Don't allow championship selection until all other events are selected
      }
    }

    setSelectedEvents(prev => {
      const exists = prev.find(e => e.id === event.id);
      if (exists) {
        return prev.filter(e => e.id !== event.id);
      } else {
        return [...prev, event];
      }
    });
  };

  const getDiscount = (eventCount) => {
    if (eventCount >= 4) return 50;
    if (eventCount === 3) return 40;
    if (eventCount === 2) return 25;
    return 0;
  };

  const calculateBasePrice = () => {
    let total = selectedPackage.base_price;
    selectedAddons.forEach(addon => {
      total += addon.base_price;
    });
    return total;
  };

  const applyRecipientDiscount = (price) => {
    if (!discountPercent || discountPercent === 0) return price;
    return price * (1 - discountPercent / 100);
  };

  const calculateDiscountedTotal = () => {
    const basePrice = calculateBasePrice();
    // First apply recipient discount
    const priceAfterRecipientDiscount = applyRecipientDiscount(basePrice);

    // Then apply multi-event discount
    const totalEvents = selectedEvents.length + 1; // +1 for original event
    const multiEventDiscount = getDiscount(totalEvents);
    const pricePerEvent = priceAfterRecipientDiscount * (1 - multiEventDiscount / 100);

    return pricePerEvent * totalEvents;
  };

  const calculateTotalValue = () => {
    const basePrice = calculateBasePrice();
    const totalEvents = selectedEvents.length + 1;
    return basePrice * totalEvents;
  };

  const calculateSavings = () => {
    return calculateTotalValue() - calculateDiscountedTotal();
  };

  const calculateRecipientDiscountAmount = () => {
    if (!discountPercent || discountPercent === 0) return 0;
    const basePrice = calculateBasePrice();
    const totalEvents = selectedEvents.length + 1;
    return (basePrice * totalEvents) * (discountPercent / 100);
  };

  const calculateMultiEventDiscountAmount = () => {
    const basePrice = calculateBasePrice();
    const totalEvents = selectedEvents.length + 1;
    const multiEventDiscount = getDiscount(totalEvents);

    if (multiEventDiscount === 0) return 0;

    // Multi-event discount applies after recipient discount
    const priceAfterRecipientDiscount = applyRecipientDiscount(basePrice);
    return (priceAfterRecipientDiscount * totalEvents) * (multiEventDiscount / 100);
  };

  const calculateTotalDiscountPercent = () => {
    const totalValue = calculateTotalValue();
    const savings = calculateSavings();
    if (totalValue === 0) return 0;
    return Math.round((savings / totalValue) * 100);
  };

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

  const handleSubmitCallRequest = async () => {
    // Check if phone is validated
    if (!phoneData || !phoneData.isValid) {
      setPhoneError('Please enter a valid phone number');
      return;
    }

    setRequestingCall(true);
    setPhoneError('');

    try {
      // Get the invite hash from URL
      const urlParams = new URLSearchParams(window.location.search);
      const hash = urlParams.get('i') || window.location.pathname.split('/').pop();

      const totalPrice = calculateDiscountedTotal();
      const pricePerEvent = totalPrice / totalEvents;

      // Track the interaction with full metadata including phone
      await trackInteraction(hash, 'request_call', selectedPackage.id, {
        inviteData,
        selectedPackage,
        selectedAddons,
        selectedEvents,
        totalPrice,
        pricePerEvent,
        totalEvents,
        discount,
        phoneNumber: phoneData.e164Format,
        phoneNationalFormat: phoneData.nationalFormat
      });

      setCallRequested(true);
      setShowPhoneDialog(false);
    } catch (error) {
      console.error('Error requesting call:', error);
      setPhoneError('Failed to submit call request. Please try again or contact us directly.');
    } finally {
      setRequestingCall(false);
    }
  };

  const totalEvents = selectedEvents.length + 1;
  const discount = getDiscount(totalEvents);
  const prospectDisplay = inviteData?.prospect_company || inviteData?.prospect_name || 'Recipient';

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--gray-1)', padding: '3rem 1rem' }}>
      <Container size="3" py="8" px="4">
        <Flex direction="column" gap="6">
          {/* Header */}
          <Flex direction="column" align="center" gap="3" style={{ textAlign: 'center' }}>
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
              alt="Art Battle"
              style={{
                height: '80px',
                maxWidth: '100%',
                objectFit: 'contain'
              }}
            />
            <Badge color="green" size="3">
              <RocketIcon width="16" height="16" /> Exclusive Opportunity
            </Badge>
            <Heading size="8" mb="2">Sponsor Multiple Events & Save Big</Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Lock in discounts by sponsoring more events in {inviteData.event_city}
            </Text>
          </Flex>

          {/* Discount Tiers */}
          <Card size="3" style={{ background: 'var(--accent-2)', border: '1px solid var(--accent-6)' }}>
            <Flex direction="column" gap="3">
              <Heading size="5">Multi-Event Discounts</Heading>
              <Grid columns={{ initial: '1', sm: '3' }} gap="3">
                <Box
                  style={{
                    padding: '1rem',
                    background: totalEvents === 2 ? 'var(--accent-9)' : 'var(--gray-3)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    transition: 'all 0.3s'
                  }}
                >
                  <Heading size="6" style={{ color: totalEvents === 2 ? 'white' : 'inherit' }}>
                    25% OFF
                  </Heading>
                  <Text size="2" style={{ color: totalEvents === 2 ? 'rgba(255,255,255,0.9)' : 'var(--gray-11)' }}>
                    2 Events
                  </Text>
                </Box>
                <Box
                  style={{
                    padding: '1rem',
                    background: totalEvents === 3 ? 'var(--accent-9)' : 'var(--gray-3)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    transition: 'all 0.3s'
                  }}
                >
                  <Heading size="6" style={{ color: totalEvents === 3 ? 'white' : 'inherit' }}>
                    40% OFF
                  </Heading>
                  <Text size="2" style={{ color: totalEvents === 3 ? 'rgba(255,255,255,0.9)' : 'var(--gray-11)' }}>
                    3 Events
                  </Text>
                </Box>
                <Box
                  style={{
                    padding: '1rem',
                    background: totalEvents >= 4 ? 'var(--accent-9)' : 'var(--gray-3)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    transition: 'all 0.3s'
                  }}
                >
                  <Heading size="6" style={{ color: totalEvents >= 4 ? 'white' : 'inherit' }}>
                    50% OFF
                  </Heading>
                  <Text size="2" style={{ color: totalEvents >= 4 ? 'rgba(255,255,255,0.9)' : 'var(--gray-11)' }}>
                    4+ Events
                  </Text>
                </Box>
              </Grid>
            </Flex>
          </Card>

          {/* Current Selection Summary */}
          <Card size="3" style={{ background: 'var(--blue-2)', border: '2px solid var(--blue-8)' }}>
            <Flex direction="column" gap="3">
              <Flex justify="between" align="start">
                <Box>
                  <Badge color="blue" size="2" mb="2">Primary Event - Included</Badge>
                  <Heading size="6" mb="2">{inviteData.event_name || `Art Battle ${inviteData.event_city}`}</Heading>
                  <Flex direction="column" gap="1" mb="3">
                    {inviteData.event_start_datetime && (
                      <Flex align="center" gap="2">
                        <CalendarIcon width="16" height="16" style={{ color: 'var(--blue-11)' }} />
                        <Text size="2" weight="medium" style={{ color: 'var(--blue-11)' }}>
                          {new Date(inviteData.event_start_datetime).toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                          {' at '}
                          {new Date(inviteData.event_start_datetime).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </Text>
                      </Flex>
                    )}
                    {inviteData.event_venue && (
                      <Text size="2" weight="medium" style={{ color: 'var(--blue-11)', marginLeft: '24px' }}>
                        {inviteData.event_venue}
                      </Text>
                    )}
                  </Flex>
                  <Separator mb="3" />
                  <Text size="2" weight="bold" mb="1" style={{ color: 'var(--gray-12)' }}>Sponsorship Package:</Text>
                  <Heading size="5" mb="1">{selectedPackage.name}</Heading>
                  {selectedAddons.length > 0 && (
                    <Text size="2" style={{ color: 'var(--gray-11)' }}>
                      + {selectedAddons.map(a => a.name).join(', ')}
                    </Text>
                  )}
                </Box>
              </Flex>

              {/* Toggle Benefits Button */}
              <Button
                variant="ghost"
                size="1"
                onClick={() => setShowBenefits(!showBenefits)}
                style={{ padding: '0.25rem 0.5rem', justifyContent: 'flex-start' }}
              >
                <Flex align="center" gap="1">
                  {showBenefits ? (
                    <>
                      <ChevronUpIcon width="14" height="14" />
                      <Text size="1">Hide benefits</Text>
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon width="14" height="14" />
                      <Text size="1">{(selectedPackage.benefits?.length || 0) + selectedAddons.reduce((sum, addon) => sum + (addon.benefits?.length || 0), 0)} benefits</Text>
                    </>
                  )}
                </Flex>
              </Button>

              {/* Expandable Benefits */}
              {showBenefits && (
                <Box
                  p="3"
                  style={{
                    background: 'var(--gray-3)',
                    borderRadius: '6px',
                    border: '1px solid var(--gray-6)'
                  }}
                >
                  <Flex direction="column" gap="3">
                    {/* Package Benefits */}
                    <Box>
                      <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                        {selectedPackage.name}
                      </Text>
                      <Flex direction="column" gap="1">
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

                    {/* Addon Benefits */}
                    {selectedAddons.map((addon, addonIdx) => (
                      <Box key={addonIdx}>
                        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                          {addon.name}
                        </Text>
                        <Flex direction="column" gap="1">
                          {addon.benefits && addon.benefits.map((benefit, idx) => (
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
                    ))}
                  </Flex>
                </Box>
              )}
            </Flex>
          </Card>

          {/* Upcoming Events */}
          <Box>
            <Heading size="5" mb="3">Add More Events</Heading>
            <Flex direction="column" gap="3">
              {upcomingEvents.map(event => {
                const isSelected = selectedEvents.find(e => e.id === event.id);
                const isChampionship = event.isChampionship;

                // Check if championship is selectable
                const nonChampionshipEvents = upcomingEvents.filter(e => !e.isChampionship);
                const allOthersSelected = nonChampionshipEvents.every(e =>
                  selectedEvents.find(se => se.id === e.id)
                );
                const isChampionshipSelectable = !isChampionship || allOthersSelected;

                const formattedDate = new Date(event.event_start_datetime).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });
                const eventDate = (event.isPlaceholder || event.isChampionship) ? `Before ${formattedDate}` : formattedDate;

                // Gold styling for championship
                const getBackground = () => {
                  if (isChampionship) {
                    return isSelected
                      ? 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'
                      : 'linear-gradient(135deg, rgba(246, 211, 101, 0.15) 0%, rgba(253, 160, 133, 0.15) 100%)';
                  }
                  return isSelected ? 'var(--accent-2)' : 'var(--gray-2)';
                };

                const getBorder = () => {
                  if (isChampionship) {
                    return isSelected ? '2px solid #f6d365' : '1px solid rgba(246, 211, 101, 0.6)';
                  }
                  return isSelected ? '2px solid var(--accent-8)' : '1px solid var(--gray-6)';
                };

                const isDisabled = !isChampionshipSelectable;

                return (
                  <Card
                    key={event.id}
                    size="2"
                    style={{
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      background: getBackground(),
                      border: getBorder(),
                      opacity: isDisabled ? 0.6 : 1,
                      transition: 'all 0.3s'
                    }}
                    onClick={() => !isDisabled && toggleEvent(event)}
                  >
                    <Flex gap="3" align="center">
                      <Checkbox
                        checked={!!isSelected}
                        disabled={isDisabled}
                        onCheckedChange={() => !isDisabled && toggleEvent(event)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Flex direction="column" gap="1" style={{ flex: 1 }}>
                        <Flex align="center" gap="2">
                          <Text
                            size="3"
                            weight="bold"
                            style={{ color: isChampionship && isSelected ? '#1a1a1a' : 'inherit' }}
                          >
                            {event.name}
                          </Text>
                          {isChampionship && (
                            <Badge
                              color="amber"
                              size="1"
                              style={isSelected ? {
                                backgroundColor: '#1a1a1a',
                                color: '#f6d365'
                              } : undefined}
                            >
                              Championship
                            </Badge>
                          )}
                        </Flex>
                        <Flex gap="3" align="center">
                          <Flex align="center" gap="1">
                            <CalendarIcon
                              width="14"
                              height="14"
                              style={{ color: isChampionship && isSelected ? '#4a4a4a' : undefined }}
                            />
                            <Text
                              size="2"
                              style={{ color: isChampionship && isSelected ? '#4a4a4a' : 'var(--gray-11)' }}
                            >
                              {eventDate}
                            </Text>
                          </Flex>
                          {event.venues && (
                            <Text
                              size="2"
                              style={{ color: isChampionship && isSelected ? '#4a4a4a' : 'var(--gray-11)' }}
                            >
                              {event.venues.name}
                            </Text>
                          )}
                        </Flex>
                        {isChampionship && !isChampionshipSelectable && (
                          <Text size="1" style={{ color: 'var(--amber-11)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                            Select all other events to unlock
                          </Text>
                        )}
                      </Flex>
                    </Flex>
                  </Card>
                );
              })}
            </Flex>
          </Box>

          <Separator />

          {/* Pricing Summary */}
          <Card size="3" style={{ background: 'var(--green-2)', border: '1px solid var(--green-6)' }}>
            <Flex direction="column" gap="3">
              <Flex justify="between" align="center">
                <Text size="3" weight="bold">Events</Text>
                <Text size="3" weight="bold">{totalEvents} event{totalEvents !== 1 ? 's' : ''}</Text>
              </Flex>

              <Flex justify="between" align="center">
                <Heading size="5">Total Value</Heading>
                <Heading size="6">
                  ${formatCurrency(calculateTotalValue())} {selectedPackage.currency || 'USD'}
                </Heading>
              </Flex>

              {(discount > 0 || discountPercent > 0) && (
                <Box>
                  <Flex justify="between" align="center">
                    <Flex align="center" gap="1">
                      <Text size="3">Total Discount</Text>
                      <QuestionMarkCircledIcon
                        width="16"
                        height="16"
                        style={{
                          color: 'var(--gray-11)',
                          cursor: 'pointer',
                          opacity: 0.7
                        }}
                        onClick={() => setShowDiscountBreakdown(!showDiscountBreakdown)}
                      />
                    </Flex>
                    <Flex gap="2" align="center">
                      <Badge color="green" size="2">{calculateTotalDiscountPercent()}% OFF</Badge>
                      <Text size="3" weight="bold" style={{ color: 'var(--green-11)' }}>
                        ${formatCurrency(calculateSavings())}
                      </Text>
                    </Flex>
                  </Flex>

                  {/* Expandable Breakdown */}
                  {showDiscountBreakdown && (
                    <Box
                      mt="2"
                      p="3"
                      style={{
                        background: 'var(--gray-3)',
                        borderRadius: '6px',
                        border: '1px solid var(--gray-6)'
                      }}
                    >
                      <Flex direction="column" gap="2">
                        {discountPercent > 0 && (
                          <Flex justify="between" align="center">
                            <Text size="2" style={{ color: 'var(--gray-11)' }}>{prospectDisplay} Discount</Text>
                            <Flex gap="2" align="center">
                              <Badge color="blue" size="1">{discountPercent}% OFF</Badge>
                              <Text size="2" weight="bold">
                                ${formatCurrency(calculateRecipientDiscountAmount())}
                              </Text>
                            </Flex>
                          </Flex>
                        )}

                        {discount > 0 && (
                          <Flex justify="between" align="center">
                            <Text size="2" style={{ color: 'var(--gray-11)' }}>{totalEvents} Event Discount</Text>
                            <Flex gap="2" align="center">
                              <Badge color="green" size="1">{discount}% OFF</Badge>
                              <Text size="2" weight="bold">
                                ${formatCurrency(calculateMultiEventDiscountAmount())}
                              </Text>
                            </Flex>
                          </Flex>
                        )}
                      </Flex>
                    </Box>
                  )}
                </Box>
              )}

              <Separator />

              <Flex direction="column" gap="1">
                <Flex justify="between" align="center">
                  <Heading size="5" style={{ color: 'var(--green-11)' }}>Final Price</Heading>
                  <Heading size="6" style={{ color: 'var(--green-11)' }}>
                    ${formatCurrency(calculateDiscountedTotal())} {selectedPackage.currency || 'USD'}
                  </Heading>
                </Flex>
                {totalEvents > 1 && (
                  <Flex justify="end">
                    <Text size="2" style={{ color: 'var(--green-11)', fontStyle: 'italic' }}>
                      only ${formatCurrency(calculateDiscountedTotal() / totalEvents)} per event!
                    </Text>
                  </Flex>
                )}
              </Flex>
            </Flex>
          </Card>

          {/* Actions */}
          <Flex direction="column" gap="3" align="center">
            <Button size="3" onClick={() => onConfirm(selectedEvents)}>
              Proceed to Checkout
            </Button>

            <Button
              size="3"
              variant="outline"
              onClick={() => setShowPhoneDialog(true)}
              disabled={callRequested}
            >
              <MobileIcon />
              {callRequested ? 'Call Requested - We\'ll Contact You Soon!' : 'Request a Call'}
            </Button>

            {callRequested && (
              <Text size="2" weight="bold" style={{ color: 'var(--green-11)' }}>
                ✓ We've received your request and will contact you shortly!
              </Text>
            )}

            <Text size="2" style={{ fontStyle: 'italic', color: 'var(--gray-11)' }}>
              Customize your brand name and media files after payment!
            </Text>
          </Flex>
        </Flex>
      </Container>

      {/* Phone Number Dialog */}
      <Dialog.Root open={showPhoneDialog} onOpenChange={setShowPhoneDialog}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Request a Call</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Please provide your phone number so we can contact you about this sponsorship opportunity.
          </Dialog.Description>

          <Flex direction="column" gap="3">
            <Box>
              <Text size="2" mb="2" weight="bold">Phone Number *</Text>
              <InternationalPhoneInput
                value=""
                onChange={setPhoneData}
                placeholder="Enter phone number"
                defaultCountry={inviteData?.country_code || 'US'}
                error={phoneError}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phoneData?.isValid) {
                    handleSubmitCallRequest();
                  }
                }}
              />
            </Box>

            <Flex gap="3" justify="end" mt="2">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleSubmitCallRequest}
                disabled={requestingCall || !phoneData?.isValid}
              >
                {requestingCall ? 'Submitting...' : 'Submit Request'}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default MultiEventOffer;
