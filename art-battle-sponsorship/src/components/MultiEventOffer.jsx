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
  Separator
} from '@radix-ui/themes';
import { CalendarIcon, RocketIcon } from '@radix-ui/react-icons';
import { getUpcomingEventsInCity } from '../lib/api';

const MultiEventOffer = ({ inviteData, selectedPackage, selectedAddons, onConfirm, onSkip }) => {
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpcomingEvents();
  }, []);

  const loadUpcomingEvents = async () => {
    if (!inviteData.event_city) {
      setLoading(false);
      return;
    }

    // In real implementation, we'd get city_id from inviteData
    // For now, using placeholder data
    setUpcomingEvents([
      {
        id: 'evt-1',
        name: `Art Battle ${inviteData.event_city} - Spring Edition`,
        event_start_datetime: '2025-11-15T19:00:00',
        venues: { name: 'Downtown Gallery' }
      },
      {
        id: 'evt-2',
        name: `Art Battle ${inviteData.event_city} - Winter Special`,
        event_start_datetime: '2025-12-20T19:00:00',
        venues: { name: 'Cultural Center' }
      },
      {
        id: 'evt-3',
        name: `Art Battle ${inviteData.event_city} - New Year Gala`,
        event_start_datetime: '2026-01-10T20:00:00',
        venues: { name: 'Grand Ballroom' }
      }
    ]);
    setLoading(false);
  };

  const toggleEvent = (event) => {
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

  const calculateDiscountedTotal = () => {
    const basePrice = calculateBasePrice();
    const totalEvents = selectedEvents.length + 1; // +1 for original event
    const discount = getDiscount(totalEvents);
    const pricePerEvent = basePrice * (1 - discount / 100);
    return pricePerEvent * totalEvents;
  };

  const calculateSavings = () => {
    const basePrice = calculateBasePrice();
    const totalEvents = selectedEvents.length + 1;
    const fullPrice = basePrice * totalEvents;
    return fullPrice - calculateDiscountedTotal();
  };

  const totalEvents = selectedEvents.length + 1;
  const discount = getDiscount(totalEvents);

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--gray-1)', padding: '3rem 1rem' }}>
      <Container size="3" py="8" px="4">
        <Flex direction="column" gap="6">
          {/* Header */}
          <Box style={{ textAlign: 'center' }}>
            <Badge color="green" size="3" mb="3">
              <RocketIcon width="16" height="16" /> Exclusive Opportunity
            </Badge>
            <Heading size="8" mb="2">Sponsor Multiple Events & Save Big</Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Lock in discounts by sponsoring more events in {inviteData.event_city}
            </Text>
          </Box>

          {/* Discount Tiers */}
          <Card size="3" style={{ background: 'var(--accent-2)', border: '1px solid var(--accent-6)' }}>
            <Flex direction="column" gap="3">
              <Heading size="5">Multi-Event Discounts</Heading>
              <Grid columns="3" gap="3">
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
          <Card size="3">
            <Flex direction="column" gap="3">
              <Flex justify="between" align="center">
                <Box>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Your Current Selection</Text>
                  <Heading size="5">{selectedPackage.name}</Heading>
                </Box>
                <Badge color="blue">Included</Badge>
              </Flex>
              {selectedAddons.length > 0 && (
                <Text size="2" style={{ color: 'var(--gray-11)' }}>
                  + {selectedAddons.length} add-on{selectedAddons.length !== 1 ? 's' : ''}
                </Text>
              )}
            </Flex>
          </Card>

          {/* Upcoming Events */}
          <Box>
            <Heading size="5" mb="3">Add More Events</Heading>
            <Flex direction="column" gap="3">
              {upcomingEvents.map(event => {
                const isSelected = selectedEvents.find(e => e.id === event.id);
                const eventDate = new Date(event.event_start_datetime).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });

                return (
                  <Card
                    key={event.id}
                    size="2"
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent-2)' : 'var(--gray-2)',
                      border: isSelected ? '2px solid var(--accent-8)' : '1px solid var(--gray-6)'
                    }}
                    onClick={() => toggleEvent(event)}
                  >
                    <Flex gap="3" align="center">
                      <Checkbox
                        checked={!!isSelected}
                        onCheckedChange={() => toggleEvent(event)}
                      />
                      <Flex direction="column" gap="1" style={{ flex: 1 }}>
                        <Text size="3" weight="bold">{event.name}</Text>
                        <Flex gap="3" align="center">
                          <Flex align="center" gap="1">
                            <CalendarIcon width="14" height="14" />
                            <Text size="2" style={{ color: 'var(--gray-11)' }}>{eventDate}</Text>
                          </Flex>
                          {event.venues && (
                            <Text size="2" style={{ color: 'var(--gray-11)' }}>
                              {event.venues.name}
                            </Text>
                          )}
                        </Flex>
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
                <Text size="3" weight="bold">Total Events</Text>
                <Text size="3" weight="bold">{totalEvents} event{totalEvents !== 1 ? 's' : ''}</Text>
              </Flex>

              {discount > 0 && (
                <>
                  <Flex justify="between" align="center">
                    <Text size="3">Multi-Event Discount</Text>
                    <Badge color="green" size="2">{discount}% OFF</Badge>
                  </Flex>
                  <Flex justify="between" align="center">
                    <Text size="2" style={{ color: 'var(--gray-11)' }}>You save</Text>
                    <Text size="3" weight="bold" style={{ color: 'var(--green-11)' }}>
                      ${calculateSavings().toFixed(0)}
                    </Text>
                  </Flex>
                </>
              )}

              <Separator />

              <Flex justify="between" align="center">
                <Heading size="5">Total Investment</Heading>
                <Heading size="6">
                  ${calculateDiscountedTotal().toFixed(0)} {selectedPackage.currency || 'USD'}
                </Heading>
              </Flex>
            </Flex>
          </Card>

          {/* Actions */}
          <Flex gap="3" justify="center">
            <Button variant="soft" size="3" onClick={onSkip}>
              Continue with Single Event
            </Button>
            <Button size="3" onClick={() => onConfirm(selectedEvents)}>
              Proceed to Checkout
            </Button>
          </Flex>
        </Flex>
      </Container>
    </Box>
  );
};

export default MultiEventOffer;
