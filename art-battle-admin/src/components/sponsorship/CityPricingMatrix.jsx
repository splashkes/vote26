import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Table,
  Button,
  Flex,
  Text,
  Dialog,
  TextField,
  Select,
  Spinner,
  Callout,
  Heading,
  Badge
} from '@radix-ui/themes';
import { Pencil1Icon, Cross2Icon } from '@radix-ui/react-icons';
import {
  getAllPackageTemplates,
  getAllCities,
  getAllCityPricing,
  setCityPricing,
  deleteCityPricing
} from '../../lib/sponsorshipAPI';

const CityPricingMatrix = () => {
  const [templates, setTemplates] = useState([]);
  const [cities, setCities] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingCell, setEditingCell] = useState(null);
  const [priceInput, setPriceInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState('USD');

  useEffect(() => {
    loadData();
  }, []);

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
      setPricing(pricingResult.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getPriceForCell = (templateId, cityId) => {
    return pricing.find(
      p => p.package_template_id === templateId && p.city_id === cityId
    );
  };

  const handleEditCell = (templateId, cityId) => {
    const existingPrice = getPriceForCell(templateId, cityId);
    setEditingCell({ templateId, cityId });
    setPriceInput(existingPrice?.price?.toString() || '');
    setCurrencyInput(existingPrice?.currency || 'USD');
    setDialogOpen(true);
  };

  const handleSavePrice = async () => {
    if (!editingCell || !priceInput) return;

    setSaving(true);
    setError(null);

    try {
      const { error } = await setCityPricing(
        editingCell.templateId,
        editingCell.cityId,
        parseFloat(priceInput),
        currencyInput
      );

      if (error) throw new Error(error);

      await loadData();
      setDialogOpen(false);
      setEditingCell(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePrice = async (priceId) => {
    if (!confirm('Remove this pricing?')) return;

    const { error } = await deleteCityPricing(priceId);
    if (error) {
      setError(error);
    } else {
      await loadData();
    }
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
        <Heading size="5">City Pricing Matrix</Heading>
        <Text size="2" color="gray">
          Set default prices for each package by city. Events will inherit these prices unless overridden.
        </Text>
      </Flex>

      <Box style={{ overflowX: 'auto' }}>
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Package</Table.ColumnHeaderCell>
              {cities.slice(0, 10).map(city => (
                <Table.ColumnHeaderCell key={city.id}>
                  <Box>
                    <Text size="2" weight="bold">{city.name}</Text>
                    <Text size="1" color="gray">{city.countries?.name}</Text>
                  </Box>
                </Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {templates.map(template => (
              <Table.Row key={template.id}>
                <Table.Cell>
                  <Box>
                    <Text weight="bold">{template.name}</Text>
                    <Badge size="1" color={template.category === 'main' ? 'blue' : 'orange'}>
                      {template.category}
                    </Badge>
                  </Box>
                </Table.Cell>
                {cities.slice(0, 10).map(city => {
                  const priceData = getPriceForCell(template.id, city.id);
                  return (
                    <Table.Cell key={city.id}>
                      {priceData ? (
                        <Flex gap="2" align="center">
                          <Box>
                            <Text size="2" weight="bold">
                              {priceData.currency} ${priceData.price}
                            </Text>
                          </Box>
                          <Button
                            size="1"
                            variant="ghost"
                            onClick={() => handleEditCell(template.id, city.id)}
                          >
                            <Pencil1Icon />
                          </Button>
                        </Flex>
                      ) : (
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => handleEditCell(template.id, city.id)}
                        >
                          Set Price
                        </Button>
                      )}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>

        {cities.length > 10 && (
          <Text size="1" color="gray" mt="2">
            Showing first 10 cities. {cities.length - 10} more cities available.
          </Text>
        )}
      </Box>

      {/* Edit Price Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content style={{ maxWidth: '400px' }}>
          <Dialog.Title>Set Price</Dialog.Title>

          <Flex direction="column" gap="4" mt="4">
            <Box>
              <Text size="2" mb="1" weight="bold">Price *</Text>
              <TextField.Root
                type="number"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00"
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Currency</Text>
              <Select.Root value={currencyInput} onValueChange={setCurrencyInput}>
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

            <Flex gap="3" justify="end">
              <Button variant="soft" color="gray" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSavePrice} disabled={!priceInput || saving}>
                {saving ? 'Saving...' : 'Save Price'}
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default CityPricingMatrix;
