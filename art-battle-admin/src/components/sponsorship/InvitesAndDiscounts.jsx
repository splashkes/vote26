import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Button,
  Flex,
  Text,
  Dialog,
  Heading,
  Badge,
  Callout,
  Separator,
  TextField,
  Table,
  Select,
  Spinner,
  IconButton,
  Grid,
  Checkbox
} from '@radix-ui/themes';
import {
  ChevronRightIcon,
  CheckIcon,
  Cross2Icon,
  CopyIcon,
  ExternalLinkIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@radix-ui/react-icons';
import { supabase } from '../../lib/supabase';
import {
  getAllPackageTemplates,
  getAllCityPricing,
  setCityPricing,
  generateSponsorshipInvite,
  getEventSponsorshipSummary
} from '../../lib/sponsorshipAPI';

const InvitesAndDiscounts = () => {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data
  const [templates, setTemplates] = useState([]);
  const [cityPrices, setCityPrices] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [summary, setSummary] = useState(null);

  // Invite form
  const [inviteForm, setInviteForm] = useState({
    prospectName: '',
    prospectEmail: '',
    prospectCompany: '',
    discountPercent: 0,
    validUntil: '',
    notes: '',
    skipMultiEvent: false
  });
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);

  // Benefits expansion state
  const [expandedBenefits, setExpandedBenefits] = useState(null);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredEvents(events);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredEvents(
        events.filter(e =>
          e.name?.toLowerCase().includes(term) ||
          e.eid?.toLowerCase().includes(term) ||
          e.cities?.name?.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, events]);

  const loadEvents = async () => {
    try {
      setLoadingEvents(true);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          eid,
          name,
          event_start_datetime,
          city_id,
          cities(id, name, countries(name, code, currency_code))
        `)
        .gte('event_start_datetime', thirtyDaysAgo.toISOString())
        .order('event_start_datetime', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
      setFilteredEvents(data || []);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
    setModalOpen(true);
  };

  useEffect(() => {
    if (modalOpen && selectedEvent) {
      loadData();
    }
  }, [modalOpen, selectedEvent]);

  const loadData = async () => {
    if (!selectedEvent) return;

    setLoading(true);
    try {
      const [templatesResult, pricingResult, summaryResult] = await Promise.all([
        getAllPackageTemplates(),
        getAllCityPricing(),
        getEventSponsorshipSummary(selectedEvent.id)
      ]);

      if (templatesResult.error) throw new Error(templatesResult.error);
      if (pricingResult.error) throw new Error(pricingResult.error);

      setTemplates(templatesResult.data.filter(t => t.active));
      setSummary(summaryResult.data || {});

      // Load existing pricing for this city
      if (selectedEvent.cities) {
        const cityPricingData = {};
        templatesResult.data.forEach(template => {
          const existingPrice = pricingResult.data.find(
            p => p.city_id === selectedEvent.cities.id && p.package_template_id === template.id
          );
          if (existingPrice) {
            cityPricingData[template.id] = {
              price: existingPrice.price,
              currency: existingPrice.currency,
              pricingId: existingPrice.id
            };
          } else {
            cityPricingData[template.id] = {
              price: '',
              currency: selectedEvent.cities.countries?.currency_code || 'USD',
              pricingId: null
            };
          }
        });
        setCityPrices(cityPricingData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (templateId, field, value) => {
    setCityPrices(prev => ({
      ...prev,
      [templateId]: {
        ...prev[templateId],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSavePricing = async () => {
    if (!selectedEvent?.cities) return;

    setLoading(true);
    setError(null);

    try {
      const savePromises = [];

      for (const [templateId, data] of Object.entries(cityPrices)) {
        if (data.price && parseFloat(data.price) > 0) {
          savePromises.push(
            setCityPricing(templateId, selectedEvent.cities.id, parseFloat(data.price), data.currency)
          );
        }
      }

      await Promise.all(savePromises);
      setHasChanges(false);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    setError(null);

    try {
      const { data, error } = await generateSponsorshipInvite({
        eventId: selectedEvent.id,
        prospectName: inviteForm.prospectName,
        prospectEmail: inviteForm.prospectEmail,
        prospectCompany: inviteForm.prospectCompany,
        discountPercent: parseFloat(inviteForm.discountPercent) || 0,
        validUntil: inviteForm.validUntil ? new Date(inviteForm.validUntil).toISOString() : null,
        notes: inviteForm.notes,
        skipMultiEvent: inviteForm.skipMultiEvent
      });

      if (error) throw new Error(error);

      setGeneratedLink(data.full_url);

      // Reload summary
      const summaryResult = await getEventSponsorshipSummary(selectedEvent.id);
      setSummary(summaryResult.data || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingInvite(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const getPricedCount = () => {
    return Object.values(cityPrices).filter(p => p.price && parseFloat(p.price) > 0).length;
  };

  const isStep1Complete = () => {
    return getPricedCount() > 0 && !hasChanges;
  };

  const toggleBenefits = (templateId) => {
    setExpandedBenefits(expandedBenefits === templateId ? null : templateId);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentStep(1);
    setGeneratedLink(null);
    setInviteForm({
      prospectName: '',
      prospectEmail: '',
      prospectCompany: '',
      discountPercent: 0,
      validUntil: '',
      notes: '',
      skipMultiEvent: false
    });
  };

  return (
    <Box>
      <Flex direction="column" gap="4" mb="4">
        <Box>
          <Heading size="5" mb="2">Event Sponsorship Invites & Discounts</Heading>
          <Text size="2" color="gray">
            Set pricing for specific events and generate custom sponsorship invite links with discounts
          </Text>
        </Box>

        {/* Search Bar */}
        <Card>
          <Flex gap="3" align="center">
            <MagnifyingGlassIcon />
            <TextField.Root
              placeholder="Search events by name, EID, or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="3"
              style={{ flex: 1 }}
            />
          </Flex>
        </Card>
      </Flex>

      {/* Events List */}
      {loadingEvents ? (
        <Flex justify="center" align="center" style={{ minHeight: '200px' }}>
          <Spinner size="3" />
        </Flex>
      ) : filteredEvents.length > 0 ? (
        <Grid columns={{ initial: '1', md: '2' }} gap="4">
          {filteredEvents.map((event) => (
            <Card key={event.id}>
              <Flex direction="column" gap="3">
                <Flex justify="between" align="start">
                  <Box>
                    <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                      {event.eid}
                    </Text>
                    <Text size="2" color="gray">
                      {event.name || 'Unnamed Event'}
                    </Text>
                    <Text size="2" color="gray">
                      {event.cities?.name}, {event.cities?.countries?.name}
                    </Text>
                  </Box>
                  <Badge color="blue">
                    {new Date(event.event_start_datetime).toLocaleDateString()}
                  </Badge>
                </Flex>

                <Button onClick={() => handleSelectEvent(event)} variant="soft">
                  Setup Sponsorship
                </Button>
              </Flex>
            </Card>
          ))}
        </Grid>
      ) : (
        <Card>
          <Box p="6" style={{ textAlign: 'center' }}>
            <Text size="3" color="gray">
              {searchTerm ? `No events found matching "${searchTerm}"` : 'No upcoming or recent events found'}
            </Text>
          </Box>
        </Card>
      )}

      {/* Setup Modal */}
      <Dialog.Root open={modalOpen} onOpenChange={closeModal}>
        <Dialog.Content style={{ maxWidth: '800px', maxHeight: '90vh' }}>
          <Dialog.Title>
            Sponsorship Setup for {selectedEvent?.name || selectedEvent?.eid}
          </Dialog.Title>

          {error && (
            <Callout.Root color="red" mt="3">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {loading && currentStep === 1 ? (
            <Flex justify="center" align="center" style={{ minHeight: '300px' }}>
              <Spinner size="3" />
            </Flex>
          ) : (
            <Box mt="4">
              {/* Step Indicator */}
              <Flex gap="2" mb="4">
                <Badge color={currentStep === 1 ? 'blue' : isStep1Complete() ? 'green' : 'gray'}>
                  {isStep1Complete() ? <CheckIcon /> : '1'} Set Pricing
                </Badge>
                <ChevronRightIcon />
                <Badge color={currentStep === 2 ? 'blue' : 'gray'}>
                  2. Generate Invite Links
                </Badge>
              </Flex>

              <Separator mb="4" />

              {/* Step 1: Set City Pricing */}
              {currentStep === 1 && selectedEvent && (
                <Box>
                  <Heading size="4" mb="3">
                    Package Pricing for {selectedEvent.cities?.name}
                  </Heading>
                  <Text size="2" color="gray" mb="4">
                    Set prices for sponsorship packages in this city. These will be the default prices shown to prospects.
                  </Text>

                  <Flex justify="center" style={{ width: '100%' }}>
                    <Box style={{ width: '100%', maxWidth: '700px' }}>
                      {templates.map(template => {
                        const priceData = cityPrices[template.id] || {};
                        const hasPricing = priceData.price && parseFloat(priceData.price) > 0;
                        const isExpanded = expandedBenefits === template.id;
                        const benefits = template.benefits || [];
                        const benefitsCount = benefits.length;
                        const description = template.description || '';

                        return (
                          <Card key={template.id} mb="3">
                            <Flex direction="column" gap="3">
                              {/* Main Row */}
                              <Flex justify="between" align="start" gap="3">
                                {/* Package Info */}
                                <Box style={{ flex: 1 }}>
                                  <Flex align="center" gap="2" mb="1">
                                    <Text weight="bold" size="3">{template.name}</Text>
                                    <Badge size="1" color={template.category === 'addon' ? 'orange' : 'blue'}>
                                      {template.category === 'addon' ? 'Add-on' : template.category.charAt(0).toUpperCase() + template.category.slice(1)}
                                    </Badge>
                                    {hasPricing && <CheckIcon color="green" />}
                                  </Flex>

                                  {/* Description with justified text */}
                                  {description && (
                                    <Box mb="2">
                                      <Text
                                        size="2"
                                        color="gray"
                                        style={{
                                          textAlign: 'justify',
                                          textAlignLast: 'left',
                                          lineHeight: '1.5'
                                        }}
                                      >
                                        {description}
                                      </Text>
                                    </Box>
                                  )}

                                  {/* Benefits Summary */}
                                  {benefitsCount > 0 && (
                                    <Button
                                      variant="ghost"
                                      size="1"
                                      onClick={() => toggleBenefits(template.id)}
                                      style={{ padding: '4px 8px', height: 'auto' }}
                                    >
                                      <Flex align="center" gap="1">
                                        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                        <Text size="2" color="gray">
                                          {benefitsCount} benefit{benefitsCount !== 1 ? 's' : ''}
                                        </Text>
                                      </Flex>
                                    </Button>
                                  )}
                                </Box>

                                {/* Price Input */}
                                <Flex gap="2" align="center">
                                  <Box style={{ width: '150px' }}>
                                    <TextField.Root
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={priceData.price || ''}
                                      onChange={(e) => handlePriceChange(template.id, 'price', e.target.value)}
                                      placeholder="0.00"
                                      size="2"
                                    />
                                  </Box>

                                  {/* Currency Select */}
                                  <Box style={{ width: '120px' }}>
                                    <Select.Root
                                      value={priceData.currency || 'USD'}
                                      onValueChange={(value) => handlePriceChange(template.id, 'currency', value)}
                                      size="2"
                                    >
                                      <Select.Trigger style={{ width: '100%' }} />
                                      <Select.Content>
                                        <Select.Item value="USD">USD</Select.Item>
                                        <Select.Item value="CAD">CAD</Select.Item>
                                        <Select.Item value="EUR">EUR</Select.Item>
                                        <Select.Item value="GBP">GBP</Select.Item>
                                        <Select.Item value="AUD">AUD</Select.Item>
                                      </Select.Content>
                                    </Select.Root>
                                  </Box>
                                </Flex>
                              </Flex>

                              {/* Expanded Benefits List */}
                              {isExpanded && benefitsCount > 0 && (
                                <Box
                                  p="3"
                                  style={{
                                    backgroundColor: 'var(--gray-2)',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid var(--blue-9)'
                                  }}
                                >
                                  <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                                    Benefits:
                                  </Text>
                                  <Flex direction="column" gap="2">
                                    {benefits.map((benefit, idx) => (
                                      <Flex key={idx} align="start" gap="2">
                                        <CheckIcon
                                          style={{
                                            marginTop: '2px',
                                            flexShrink: 0,
                                            color: 'var(--green-9)'
                                          }}
                                        />
                                        <Text size="2">{benefit}</Text>
                                      </Flex>
                                    ))}
                                  </Flex>
                                </Box>
                              )}
                            </Flex>
                          </Card>
                        );
                      })}
                    </Box>
                  </Flex>

                  <Flex justify="between" align="center" mt="4">
                    <Text size="2" color="gray">
                      {getPricedCount()} of {templates.length} packages priced
                    </Text>
                    <Flex gap="2">
                      <Button
                        variant="soft"
                        onClick={() => window.open('/sponsorship-packages', '_blank')}
                      >
                        <ExternalLinkIcon /> Edit Global Packages
                      </Button>
                      <Button
                        onClick={handleSavePricing}
                        disabled={getPricedCount() === 0 || loading}
                      >
                        {loading ? 'Saving...' : hasChanges ? 'Save & Continue' : 'Continue'}
                      </Button>
                    </Flex>
                  </Flex>
                </Box>
              )}

              {/* Step 2: Generate Invite Links */}
              {currentStep === 2 && (
                <Box>
                  <Heading size="4" mb="3">Generate Invite Link</Heading>
                  <Text size="2" color="gray" mb="4">
                    Create a custom invite link for a sponsor prospect with optional discount.
                  </Text>

                  {/* Summary Stats */}
                  {summary && (
                    <Card mb="4">
                      <Flex gap="4">
                        <Box>
                          <Text size="1" color="gray">Invites Sent</Text>
                          <Text size="4" weight="bold">{summary.total_invites || 0}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray">Total Views</Text>
                          <Text size="4" weight="bold">{summary.total_views || 0}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray">Purchases</Text>
                          <Text size="4" weight="bold">{summary.total_purchases || 0}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray">Revenue</Text>
                          <Text size="4" weight="bold">
                            ${summary.total_revenue?.toFixed(2) || '0.00'}
                          </Text>
                        </Box>
                      </Flex>
                    </Card>
                  )}

                  <Flex direction="column" gap="3">
                    <Flex gap="3">
                      <Box style={{ flex: 1 }}>
                        <Text size="2" mb="1" weight="bold">Prospect Name *</Text>
                        <TextField.Root
                          value={inviteForm.prospectName}
                          onChange={(e) => setInviteForm({ ...inviteForm, prospectName: e.target.value })}
                          placeholder="John Smith"
                        />
                      </Box>
                      <Box style={{ flex: 1 }}>
                        <Text size="2" mb="1" weight="bold">Email</Text>
                        <TextField.Root
                          type="email"
                          value={inviteForm.prospectEmail}
                          onChange={(e) => setInviteForm({ ...inviteForm, prospectEmail: e.target.value })}
                          placeholder="john@company.com"
                        />
                      </Box>
                    </Flex>

                    <Flex gap="3">
                      <Box style={{ flex: 1 }}>
                        <Text size="2" mb="1" weight="bold">Company</Text>
                        <TextField.Root
                          value={inviteForm.prospectCompany}
                          onChange={(e) => setInviteForm({ ...inviteForm, prospectCompany: e.target.value })}
                          placeholder="Acme Corp"
                        />
                      </Box>
                      <Box style={{ flex: 1 }}>
                        <Text size="2" mb="1" weight="bold">Discount %</Text>
                        <TextField.Root
                          type="number"
                          min="0"
                          max="100"
                          value={inviteForm.discountPercent}
                          onChange={(e) => setInviteForm({ ...inviteForm, discountPercent: e.target.value })}
                          placeholder="0"
                        />
                      </Box>
                      <Box style={{ flex: 1 }}>
                        <Text size="2" mb="1" weight="bold">Valid Until</Text>
                        <TextField.Root
                          type="date"
                          value={inviteForm.validUntil}
                          onChange={(e) => setInviteForm({ ...inviteForm, validUntil: e.target.value })}
                        />
                      </Box>
                    </Flex>

                    <Box>
                      <Text size="2" mb="1" weight="bold">Notes (internal)</Text>
                      <TextField.Root
                        value={inviteForm.notes}
                        onChange={(e) => setInviteForm({ ...inviteForm, notes: e.target.value })}
                        placeholder="Internal notes about this prospect"
                      />
                    </Box>

                    {/* Skip Multi-Event Checkbox */}
                    <Card>
                      <Flex align="center" gap="2">
                        <Checkbox
                          checked={inviteForm.skipMultiEvent}
                          onCheckedChange={(checked) =>
                            setInviteForm({ ...inviteForm, skipMultiEvent: checked })
                          }
                        />
                        <Box>
                          <Text size="2" weight="bold">Hide multi-event discount stage</Text>
                          <Text size="1" color="gray" style={{ display: 'block' }}>
                            Hide the multi-event selection stage (for season packages)
                          </Text>
                        </Box>
                      </Flex>
                    </Card>

                    <Button
                      onClick={handleGenerateInvite}
                      disabled={!inviteForm.prospectName || generatingInvite}
                      size="3"
                    >
                      {generatingInvite ? 'Generating...' : 'Generate Invite Link'}
                    </Button>

                    {generatedLink && (
                      <Callout.Root color="green">
                        <Callout.Text>
                          <Flex direction="column" gap="2">
                            <Text weight="bold">Invite Link Generated!</Text>
                            <Flex gap="2" align="center">
                              <Text size="2" style={{ flex: 1, wordBreak: 'break-all' }}>
                                {generatedLink}
                              </Text>
                              <IconButton
                                size="1"
                                variant="soft"
                                onClick={() => copyToClipboard(generatedLink)}
                              >
                                <CopyIcon />
                              </IconButton>
                            </Flex>
                          </Flex>
                        </Callout.Text>
                      </Callout.Root>
                    )}
                  </Flex>

                  <Flex justify="between" mt="4">
                    <Button variant="soft" onClick={() => setCurrentStep(1)}>
                      Back to Pricing
                    </Button>
                    <Button variant="soft" onClick={closeModal}>
                      Done
                    </Button>
                  </Flex>
                </Box>
              )}
            </Box>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default InvitesAndDiscounts;
