import React, { useState, useEffect } from 'react';
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
  IconButton
} from '@radix-ui/themes';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  Cross2Icon,
  CopyIcon,
  ExternalLinkIcon
} from '@radix-ui/react-icons';
import {
  getAllPackageTemplates,
  getAllCityPricing,
  setCityPricing,
  deleteCityPricing,
  generateSponsorshipInvite,
  getEventSponsorshipSummary
} from '../../lib/sponsorshipAPI';

const EventSponsorshipSetup = ({ event }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Data
  const [templates, setTemplates] = useState([]);
  const [cityPrices, setCityPrices] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [summary, setSummary] = useState(null);
  const [expandedPackages, setExpandedPackages] = useState({});

  // Invite form
  const [inviteForm, setInviteForm] = useState({
    prospectName: '',
    prospectEmail: '',
    prospectCompany: '',
    discountPercent: 0,
    validUntil: '',
    notes: ''
  });
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);

  useEffect(() => {
    if (modalOpen) {
      loadData();
    }
  }, [modalOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesResult, pricingResult, summaryResult] = await Promise.all([
        getAllPackageTemplates(),
        getAllCityPricing(),
        getEventSponsorshipSummary(event.id)
      ]);

      if (templatesResult.error) throw new Error(templatesResult.error);
      if (pricingResult.error) throw new Error(pricingResult.error);

      setTemplates(templatesResult.data.filter(t => t.active));
      setSummary(summaryResult.data || {});

      // Load existing pricing for this city
      if (event.cities) {
        const cityPricingData = {};
        templatesResult.data.forEach(template => {
          const existingPrice = pricingResult.data.find(
            p => p.city_id === event.cities.id && p.package_template_id === template.id
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
              currency: event.cities.countries?.currency_code || 'USD',
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
    if (!event.cities) return;

    setLoading(true);
    setError(null);

    try {
      const savePromises = [];

      for (const [templateId, data] of Object.entries(cityPrices)) {
        if (data.price && parseFloat(data.price) > 0) {
          // Save or update pricing
          savePromises.push(
            setCityPricing(templateId, event.cities.id, parseFloat(data.price), data.currency)
          );
        } else if (data.pricingId && (!data.price || parseFloat(data.price) <= 0)) {
          // Delete pricing if price was set to zero or cleared
          savePromises.push(deleteCityPricing(data.pricingId));
        }
      }

      await Promise.all(savePromises);

      // Reload pricing to reflect changes
      await loadPricingData();

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
        eventId: event.id,
        prospectName: inviteForm.prospectName,
        prospectEmail: inviteForm.prospectEmail,
        prospectCompany: inviteForm.prospectCompany,
        discountPercent: parseFloat(inviteForm.discountPercent) || 0,
        validUntil: inviteForm.validUntil ? new Date(inviteForm.validUntil).toISOString() : null,
        notes: inviteForm.notes
      });

      if (error) throw new Error(error);

      setGeneratedLink(data.full_url);

      // Reload summary
      const summaryResult = await getEventSponsorshipSummary(event.id);
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

  const handleHidePackage = (templateId) => {
    handlePriceChange(templateId, 'price', '0');
  };

  const handleRestorePackage = (templateId) => {
    handlePriceChange(templateId, 'price', '100');
  };

  const getActiveTemplates = () => {
    return templates.filter(template => {
      const priceData = cityPrices[template.id];
      return priceData?.price && parseFloat(priceData.price) > 0;
    });
  };

  const getHiddenTemplates = () => {
    return templates.filter(template => {
      const priceData = cityPrices[template.id];
      return !priceData?.price || parseFloat(priceData.price) <= 0;
    });
  };

  const isStep1Complete = () => {
    return getPricedCount() > 0 && !hasChanges;
  };

  // Helper to capitalize first letter
  const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Group templates by category (ordered: Brand, Business, Personal, Add-ons)
  const groupedTemplates = {
    brand: templates.filter(t => t.category === 'brand'),
    business: templates.filter(t => t.category === 'business'),
    personal: templates.filter(t => t.category === 'personal'),
    addon: templates.filter(t => t.category === 'addon')
  };

  // Toggle benefits expansion
  const toggleBenefits = (templateId) => {
    setExpandedPackages(prev => ({
      ...prev,
      [templateId]: !prev[templateId]
    }));
  };

  if (!event.cities) {
    return (
      <Card>
        <Callout.Root color="orange">
          <Callout.Text>
            This event needs a city assigned before sponsorship packages can be configured.
          </Callout.Text>
        </Callout.Root>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Flex justify="between" align="center">
          <Box>
            <Heading size="4">Sponsorship Packages</Heading>
            <Text size="2" color="gray">
              Configure pricing and generate invite links for sponsors
            </Text>
          </Box>
          <Button onClick={() => setModalOpen(true)}>
            Setup Sponsorship
          </Button>
        </Flex>

        {summary && (
          <Box mt="3">
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
          </Box>
        )}
      </Card>

      {/* Setup Modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content style={{ maxWidth: '800px', maxHeight: '90vh' }}>
          <Dialog.Title>
            Sponsorship Setup for {event.name}
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
              {currentStep === 1 && (
                <Box>
                  <Heading size="4" mb="3">
                    Package Pricing for {event.cities.name}
                  </Heading>
                  <Callout.Root color="blue" size="1" mb="4">
                    <Callout.Text>
                      <strong>Note:</strong> These prices are shared across all sponsor prospects in {event.cities.name}. Set price to zero or click "Hide" to remove a package from sponsor invites.
                    </Callout.Text>
                  </Callout.Root>

                  <Heading size="3" mb="2">Active Packages</Heading>
                  <Table.Root variant="surface" size="2">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Package</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell width="150px">Price</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell width="120px">Currency</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell width="80px"></Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>

                    <Table.Body>
                      {/* Render active packages only */}
                      {[
                        { key: 'brand', title: 'BRAND TIER - Connect Art, Culture & Community', bgColor: 'var(--accent-2)', textColor: 'var(--accent-11)' },
                        { key: 'business', title: 'TACTICAL TIER - Buy Specific Impact Moments', bgColor: 'var(--accent-2)', textColor: 'var(--accent-11)' },
                        { key: 'personal', title: 'PERSONAL TIER - Art Battle Patrons Circle', bgColor: 'var(--accent-2)', textColor: 'var(--accent-11)' },
                        { key: 'addon', title: 'ADD-ONS - Enhance Any Package', bgColor: 'var(--orange-2)', textColor: 'var(--orange-11)' }
                      ].map(tier => {
                        const activeInTier = groupedTemplates[tier.key].filter(t => {
                          const priceData = cityPrices[t.id];
                          return priceData?.price && parseFloat(priceData.price) > 0;
                        });
                        return activeInTier.length > 0 && (
                        <React.Fragment key={tier.key}>
                          <Table.Row style={{ background: tier.bgColor }}>
                            <Table.Cell colSpan={4}>
                              <Text weight="bold" size="2" style={{ color: tier.textColor }}>
                                {tier.title}
                              </Text>
                            </Table.Cell>
                          </Table.Row>
                          {activeInTier.map(template => {
                            const priceData = cityPrices[template.id] || {};
                            const hasPricing = priceData.price && parseFloat(priceData.price) > 0;
                            const isExpanded = expandedPackages[template.id];

                            return (
                              <React.Fragment key={template.id}>
                                <Table.Row>
                                  <Table.Cell>
                                    <Flex direction="column" gap="2">
                                      <Flex align="center" gap="2">
                                        <Text weight="bold">{template.name}</Text>
                                        <IconButton
                                          size="1"
                                          variant="ghost"
                                          onClick={() => toggleBenefits(template.id)}
                                        >
                                          {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                        </IconButton>
                                      </Flex>
                                      {template.description && (
                                        <Text size="1" color="gray">{template.description}</Text>
                                      )}
                                    </Flex>
                                  </Table.Cell>

                                  <Table.Cell>
                                    <TextField.Root
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={priceData.price || ''}
                                      onChange={(e) => handlePriceChange(template.id, 'price', e.target.value)}
                                      placeholder="0.00"
                                      size="2"
                                    />
                                  </Table.Cell>

                                  <Table.Cell>
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
                                  </Table.Cell>

                                  <Table.Cell>
                                    <Button
                                      size="1"
                                      variant="soft"
                                      color="red"
                                      onClick={() => handleHidePackage(template.id)}
                                    >
                                      <Cross2Icon /> Hide
                                    </Button>
                                  </Table.Cell>
                                </Table.Row>

                                {/* Benefits Dropdown Row */}
                                {isExpanded && template.benefits && template.benefits.length > 0 && (
                                  <Table.Row style={{ background: 'var(--gray-2)' }}>
                                    <Table.Cell colSpan={4}>
                                      <Box p="3">
                                        <Text size="2" weight="bold" mb="2">Benefits:</Text>
                                        <Flex direction="column" gap="1">
                                          {template.benefits.map((benefit, idx) => (
                                            <Flex key={idx} gap="2" align="start">
                                              <Text size="2" style={{ color: 'var(--green-9)' }}>•</Text>
                                              <Text size="2">{benefit}</Text>
                                            </Flex>
                                          ))}
                                        </Flex>
                                      </Box>
                                    </Table.Cell>
                                  </Table.Row>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                        );
                      })}
                    </Table.Body>
                  </Table.Root>

                  {/* Hidden Packages Section */}
                  {getHiddenTemplates().length > 0 && (
                    <Box mt="6">
                      <Separator size="4" mb="4" />
                      <Heading size="3" mb="2">Hidden Packages</Heading>
                      <Callout.Root color="gray" size="1" mb="3">
                        <Callout.Text>
                          These packages are hidden from sponsor invites. Set a price or click "Restore" to make them available.
                        </Callout.Text>
                      </Callout.Root>

                      <Table.Root variant="surface" size="2">
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>Package</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell width="150px">Price</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell width="120px">Currency</Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell width="80px"></Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>

                        <Table.Body>
                          {[
                            { key: 'brand', title: 'BRAND TIER', bgColor: 'var(--gray-2)', textColor: 'var(--gray-11)' },
                            { key: 'business', title: 'TACTICAL TIER', bgColor: 'var(--gray-2)', textColor: 'var(--gray-11)' },
                            { key: 'personal', title: 'PERSONAL TIER', bgColor: 'var(--gray-2)', textColor: 'var(--gray-11)' },
                            { key: 'addon', title: 'ADD-ONS', bgColor: 'var(--gray-2)', textColor: 'var(--gray-11)' }
                          ].map(tier => {
                            const hiddenInTier = groupedTemplates[tier.key].filter(t => {
                              const priceData = cityPrices[t.id];
                              return !priceData?.price || parseFloat(priceData.price) <= 0;
                            });
                            return hiddenInTier.length > 0 && (
                              <React.Fragment key={tier.key}>
                                <Table.Row style={{ background: tier.bgColor }}>
                                  <Table.Cell colSpan={4}>
                                    <Text weight="bold" size="2" style={{ color: tier.textColor }}>
                                      {tier.title}
                                    </Text>
                                  </Table.Cell>
                                </Table.Row>
                                {hiddenInTier.map(template => {
                                  const priceData = cityPrices[template.id] || {};

                                  return (
                                    <Table.Row key={template.id} style={{ backgroundColor: 'var(--gray-2)', opacity: 0.8 }}>
                                      <Table.Cell>
                                        <Text weight="bold" color="gray">{template.name}</Text>
                                        {template.description && (
                                          <Text size="1" color="gray" style={{ display: 'block' }}>
                                            {template.description}
                                          </Text>
                                        )}
                                      </Table.Cell>

                                      <Table.Cell>
                                        <TextField.Root
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={priceData.price || ''}
                                          onChange={(e) => handlePriceChange(template.id, 'price', e.target.value)}
                                          placeholder="Set price to restore"
                                          size="2"
                                        />
                                      </Table.Cell>

                                      <Table.Cell>
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
                                      </Table.Cell>

                                      <Table.Cell>
                                        <Button
                                          size="1"
                                          variant="soft"
                                          color="green"
                                          onClick={() => handleRestorePackage(template.id)}
                                        >
                                          + Restore
                                        </Button>
                                      </Table.Cell>
                                    </Table.Row>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </Table.Body>
                      </Table.Root>
                    </Box>
                  )}

                  <Flex justify="between" align="center" mt="4">
                    <Text size="2" color="gray">
                      {getPricedCount()} of {templates.length} packages priced
                    </Text>
                    <Flex gap="2">
                      <Button
                        variant="soft"
                        onClick={() => window.open('/admin/sponsorship-packages', '_blank')}
                      >
                        <ExternalLinkIcon /> Edit Global Packages
                      </Button>
                      {isStep1Complete() && (
                        <Button
                          variant="outline"
                          onClick={() => setCurrentStep(2)}
                        >
                          Skip to Generate Invites
                        </Button>
                      )}
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
                    <Button variant="soft" onClick={() => setModalOpen(false)}>
                      Done
                    </Button>
                  </Flex>
                </Box>
              )}
            </Box>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};

export default EventSponsorshipSetup;
