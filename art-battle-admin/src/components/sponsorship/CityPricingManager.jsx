import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Table,
  Button,
  Flex,
  Text,
  TextField,
  Select,
  Spinner,
  Callout,
  Heading,
  Badge,
  ScrollArea,
  Separator
} from '@radix-ui/themes';
import { MagnifyingGlassIcon, CheckIcon, Cross2Icon } from '@radix-ui/react-icons';
import {
  getAllPackageTemplates,
  getAllCities,
  getAllCityPricing,
  setCityPricing,
  deleteCityPricing
} from '../../lib/sponsorshipAPI';

const CityPricingManager = () => {
  const [templates, setTemplates] = useState([]);
  const [cities, setCities] = useState([]);
  const [allPricing, setAllPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Search & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);
  const [filteredCities, setFilteredCities] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // City pricing form
  const [cityPrices, setCityPrices] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  // Recently configured cities
  const [recentCities, setRecentCities] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Filter cities based on search
    if (searchQuery.length >= 2) {
      const filtered = cities.filter(city => {
        const searchLower = searchQuery.toLowerCase();
        return (
          city.name.toLowerCase().includes(searchLower) ||
          city.countries?.name.toLowerCase().includes(searchLower) ||
          city.countries?.code.toLowerCase().includes(searchLower)
        );
      }).slice(0, 20); // Limit to 20 results
      setFilteredCities(filtered);
      setShowDropdown(true);
    } else {
      setFilteredCities([]);
      setShowDropdown(false);
    }
  }, [searchQuery, cities]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [templatesResult, citiesResult, pricingResult] = await Promise.all([
        getAllPackageTemplates(),
        getAllCities(),
        getAllCityPricing()
      ]);

      if (templatesResult.error) throw new Error(templatesResult.error);
      if (citiesResult.error) throw new Error(citiesResult.error);
      if (pricingResult.error) throw new Error(pricingResult.error);

      setTemplates(templatesResult.data.filter(t => t.active));
      setCities(citiesResult.data);
      setAllPricing(pricingResult.data);

      // Calculate recently configured cities
      const cityPricingCounts = {};
      pricingResult.data.forEach(p => {
        const cityId = p.city_id;
        cityPricingCounts[cityId] = (cityPricingCounts[cityId] || 0) + 1;
      });

      const recent = Object.entries(cityPricingCounts)
        .map(([cityId, count]) => {
          const city = citiesResult.data.find(c => c.id === cityId);
          return { city, count, totalPackages: templatesResult.data.filter(t => t.active).length };
        })
        .filter(r => r.city)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setRecentCities(recent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCity = (city) => {
    setSelectedCity(city);
    setSearchQuery('');
    setShowDropdown(false);

    // Load existing pricing for this city
    const cityPricingData = {};
    templates.forEach(template => {
      const existingPrice = allPricing.find(
        p => p.city_id === city.id && p.package_template_id === template.id
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
          currency: city.countries?.currency_code || 'USD',
          pricingId: null
        };
      }
    });

    setCityPrices(cityPricingData);
    setHasChanges(false);
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

  const handleSaveAll = async () => {
    if (!selectedCity) return;

    setSaving(true);
    setError(null);

    try {
      const savePromises = [];

      for (const [templateId, data] of Object.entries(cityPrices)) {
        if (data.price && parseFloat(data.price) > 0) {
          // Save or update pricing
          savePromises.push(
            setCityPricing(templateId, selectedCity.id, parseFloat(data.price), data.currency)
          );
        } else if (data.pricingId) {
          // Delete pricing if price was cleared
          savePromises.push(deleteCityPricing(data.pricingId));
        }
      }

      await Promise.all(savePromises);
      await loadData();

      // Refresh the selected city data
      handleSelectCity(selectedCity);

      setHasChanges(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getPricedCount = () => {
    return Object.values(cityPrices).filter(p => p.price && parseFloat(p.price) > 0).length;
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '200px' }}>
        <Spinner size="3" />
      </Flex>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <Flex direction="column" align="center" gap="3" style={{ padding: '3rem' }}>
          <Text size="4" color="gray">No package templates available</Text>
          <Text size="2" color="gray">
            Create package templates first before setting city pricing
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Box>
      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Flex direction="column" gap="2" mb="4">
        <Heading size="5">City Pricing Management</Heading>
        <Text size="2" color="gray">
          Select a city to configure sponsorship package pricing. Prices set here will be used as defaults for events in that city.
        </Text>
      </Flex>

      {/* City Search */}
      <Card mb="4">
        <Box style={{ position: 'relative' }}>
          <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
            Search for a City
          </Text>
          <TextField.Root
            size="3"
            placeholder="Type city name or country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>

          {/* Dropdown */}
          {showDropdown && filteredCities.length > 0 && (
            <Card
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '0.5rem',
                zIndex: 10,
                maxHeight: '300px',
                overflow: 'auto'
              }}
            >
              {filteredCities.map(city => (
                <Box
                  key={city.id}
                  onClick={() => handleSelectCity(city)}
                  style={{
                    padding: '0.75rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--gray-4)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-3)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Text weight="bold">{city.name}</Text>
                  {city.countries && (
                    <Text size="1" color="gray" style={{ display: 'block' }}>
                      {city.countries.name} ({city.countries.code})
                    </Text>
                  )}
                </Box>
              ))}
            </Card>
          )}
        </Box>

        {selectedCity && (
          <Box mt="3">
            <Flex align="center" gap="2">
              <Badge color="blue" size="2">Selected</Badge>
              <Text weight="bold">{selectedCity.name}</Text>
              {selectedCity.countries && (
                <Text size="2" color="gray">
                  {selectedCity.countries.name} ({selectedCity.countries.code})
                </Text>
              )}
            </Flex>
          </Box>
        )}
      </Card>

      {/* Package Pricing Table */}
      {selectedCity ? (
        <Card>
          <Flex justify="between" align="center" mb="3">
            <Box>
              <Heading size="4">Package Pricing for {selectedCity.name}</Heading>
              <Text size="2" color="gray">
                {getPricedCount()} of {templates.length} packages priced
              </Text>
            </Box>
            <Button
              onClick={handleSaveAll}
              disabled={!hasChanges || saving}
              size="2"
            >
              {saving ? 'Saving...' : 'Save All Prices'}
            </Button>
          </Flex>

          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Package</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Category</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell width="150px">Price</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell width="120px">Currency</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell width="60px">Status</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {templates.map(template => {
                const priceData = cityPrices[template.id] || {};
                const hasPricing = priceData.price && parseFloat(priceData.price) > 0;

                return (
                  <Table.Row key={template.id}>
                    <Table.Cell>
                      <Box>
                        <Text weight="bold">{template.name}</Text>
                        {template.description && (
                          <Text size="1" color="gray" style={{ display: 'block' }}>
                            {template.description.substring(0, 60)}...
                          </Text>
                        )}
                      </Box>
                    </Table.Cell>

                    <Table.Cell>
                      <Badge color={template.category === 'main' ? 'blue' : 'orange'} size="1">
                        {template.category === 'main' ? 'Main Package' : 'Add-on'}
                      </Badge>
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
                          <Select.Item value="NZD">NZD</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    </Table.Cell>

                    <Table.Cell>
                      {hasPricing ? (
                        <CheckIcon color="green" />
                      ) : (
                        <Cross2Icon color="gray" />
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>

          {hasChanges && (
            <Callout.Root color="orange" mt="3">
              <Callout.Text>
                You have unsaved changes. Click "Save All Prices" to apply your changes.
              </Callout.Text>
            </Callout.Root>
          )}
        </Card>
      ) : (
        <Card>
          <Flex direction="column" align="center" gap="3" style={{ padding: '3rem' }}>
            <MagnifyingGlassIcon size="48" color="var(--gray-8)" />
            <Text size="4" color="gray">Search for a city to begin</Text>
            <Text size="2" color="gray">
              Type at least 2 characters in the search box above
            </Text>
          </Flex>
        </Card>
      )}

      {/* Recently Configured Cities */}
      {recentCities.length > 0 && (
        <Box mt="4">
          <Separator mb="4" />
          <Heading size="4" mb="3">Recently Configured Cities</Heading>
          <Flex gap="2" wrap="wrap">
            {recentCities.map(({ city, count, totalPackages }) => (
              <Card
                key={city.id}
                style={{ cursor: 'pointer' }}
                onClick={() => handleSelectCity(city)}
              >
                <Flex direction="column" gap="1" style={{ padding: '0.5rem' }}>
                  <Text weight="bold">{city.name}</Text>
                  <Text size="1" color="gray">
                    {city.countries?.name}
                  </Text>
                  <Badge color="green" size="1">
                    {count}/{totalPackages} packages
                  </Badge>
                </Flex>
              </Card>
            ))}
          </Flex>
        </Box>
      )}
    </Box>
  );
};

export default CityPricingManager;
