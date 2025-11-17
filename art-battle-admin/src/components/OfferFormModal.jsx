import { useState, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Text,
  Button,
  Card,
  Callout,
  Badge,
  Heading,
  Box,
  TextField,
  TextArea,
  Tabs,
  Checkbox,
  Slider,
  ScrollArea,
  Separator
} from '@radix-ui/themes';
import {
  CrossCircledIcon,
  CheckIcon,
  Cross2Icon,
  InfoCircledIcon
} from '@radix-ui/react-icons';
import { createOffer, updateOffer, getAllCities, validateOffer } from '../lib/OffersAPI';
import OfferImageUpload from './OfferImageUpload';

const OfferFormModal = ({
  isOpen,
  onClose,
  offer = null, // null for create, object for edit
  onSave
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cities, setCities] = useState([]);
  const [citySearchFilter, setCitySearchFilter] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    terms: '',
    type: '',
    value: '',
    currency: 'CAD',
    geography_scope: [],
    min_recency_score: 0,
    max_recency_score: 5,
    min_frequency_score: 0,
    max_frequency_score: 5,
    min_monetary_score: 0,
    max_monetary_score: 5,
    display_order: 0,
    tile_color: '#3a88fe',
    image_url: '',
    redemption_link: '',
    redemption_message: '',
    total_inventory: 0,
    redeemed_count: 0,
    start_date: '',
    end_date: '',
    active: true
  });

  const [useManualRedemptionCount, setUseManualRedemptionCount] = useState(false);
  const [manualRedemptionCount, setManualRedemptionCount] = useState(0);
  const [actualRedemptions, setActualRedemptions] = useState(0);

  // Load cities on mount
  useEffect(() => {
    loadCities();
  }, []);

  // Populate form when editing existing offer
  useEffect(() => {
    if (offer) {
      setFormData({
        name: offer.name || '',
        description: offer.description || '',
        terms: offer.terms || '',
        type: offer.type || '',
        value: offer.value || '',
        currency: offer.currency || 'CAD',
        geography_scope: offer.geography_scope || [],
        min_recency_score: offer.min_recency_score ?? 0,
        max_recency_score: offer.max_recency_score ?? 5,
        min_frequency_score: offer.min_frequency_score ?? 0,
        max_frequency_score: offer.max_frequency_score ?? 5,
        min_monetary_score: offer.min_monetary_score ?? 0,
        max_monetary_score: offer.max_monetary_score ?? 5,
        display_order: offer.display_order || 0,
        tile_color: offer.tile_color || '#3a88fe',
        image_url: offer.image_url || '',
        redemption_link: offer.redemption_link || '',
        redemption_message: offer.redemption_message || '',
        total_inventory: offer.total_inventory || 0,
        redeemed_count: offer.redeemed_count || 0,
        start_date: offer.start_date ? new Date(offer.start_date).toISOString().slice(0, 16) : '',
        end_date: offer.end_date ? new Date(offer.end_date).toISOString().slice(0, 16) : '',
        active: offer.active ?? true
      });
      setActualRedemptions(offer.actual_redemptions || 0);
      setUseManualRedemptionCount(false);
      setManualRedemptionCount(offer.redeemed_count || 0);
    } else {
      // Reset for create
      resetForm();
    }
  }, [offer, isOpen]);

  const loadCities = async () => {
    const { data, error } = await getAllCities();
    if (!error && data) {
      setCities(data);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      terms: '',
      type: '',
      value: '',
      currency: 'CAD',
      geography_scope: [],
      min_recency_score: 0,
      max_recency_score: 5,
      min_frequency_score: 0,
      max_frequency_score: 5,
      min_monetary_score: 0,
      max_monetary_score: 5,
      display_order: 0,
      tile_color: '#3a88fe',
      image_url: '',
      redemption_link: '',
      redemption_message: '',
      total_inventory: 0,
      redeemed_count: 0,
      start_date: '',
      end_date: '',
      active: true
    });
    setUseManualRedemptionCount(false);
    setManualRedemptionCount(0);
    setActualRedemptions(0);
    setError('');
    setValidationErrors({});
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error for this field
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const handleCityToggle = (cityId) => {
    setFormData(prev => ({
      ...prev,
      geography_scope: prev.geography_scope.includes(cityId)
        ? prev.geography_scope.filter(id => id !== cityId)
        : [...prev.geography_scope, cityId]
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setValidationErrors({});

    try {
      // Prepare data for save
      const dataToSave = {
        ...formData,
        // Use manual redemption count if override is enabled
        redeemed_count: useManualRedemptionCount ? manualRedemptionCount : actualRedemptions,
        // Convert empty strings to null for dates
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        // Convert empty strings to null for optional fields
        value: formData.value || null,
        type: formData.type || null,
        redemption_link: formData.redemption_link || null,
        redemption_message: formData.redemption_message || null,
        image_url: formData.image_url || null,
        // If RFM scores are 0, set to null (ignore them)
        min_recency_score: formData.min_recency_score === 0 ? null : formData.min_recency_score,
        max_recency_score: formData.max_recency_score === 0 ? null : formData.max_recency_score,
        min_frequency_score: formData.min_frequency_score === 0 ? null : formData.min_frequency_score,
        max_frequency_score: formData.max_frequency_score === 0 ? null : formData.max_frequency_score,
        min_monetary_score: formData.min_monetary_score === 0 ? null : formData.min_monetary_score,
        max_monetary_score: formData.max_monetary_score === 0 ? null : formData.max_monetary_score,
      };

      // Validate
      const validation = validateOffer(dataToSave);
      if (!validation.isValid) {
        setValidationErrors(validation.errors);
        setError('Please fix validation errors before saving');
        return;
      }

      // Create or update
      let result;
      if (offer) {
        result = await updateOffer(offer.id, dataToSave);
      } else {
        result = await createOffer(dataToSave);
      }

      if (result.error) {
        setError(result.error);
        return;
      }

      // Success
      onSave?.(result.data);
      onClose();
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filteredCities = cities.filter(city =>
    city.name.toLowerCase().includes(citySearchFilter.toLowerCase())
  );

  const allCitiesSelected = formData.geography_scope.length === 0;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <Dialog.Content size="4" style={{ maxWidth: '800px', maxHeight: '90vh' }}>
        <Dialog.Title>
          <Flex align="center" justify="between">
            <Heading size="5">{offer ? 'Edit Offer' : 'Create New Offer'}</Heading>
            <Dialog.Close asChild>
              <Button variant="ghost" size="1" disabled={loading}>
                <Cross2Icon />
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Title>

        <Tabs.Root defaultValue="basic">
          <Tabs.List>
            <Tabs.Trigger value="basic">Basic Info</Tabs.Trigger>
            <Tabs.Trigger value="targeting">Targeting</Tabs.Trigger>
            <Tabs.Trigger value="display">Display</Tabs.Trigger>
            <Tabs.Trigger value="redemption">Redemption</Tabs.Trigger>
          </Tabs.List>

          <Box style={{ marginTop: '1rem' }}>
            <ScrollArea style={{ maxHeight: '500px' }}>
              {/* TAB 1: Basic Info */}
              <Tabs.Content value="basic">
                <Flex direction="column" gap="4" p="3">
                  <Box>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Offer Name *
                    </Text>
                    <TextField.Root
                      placeholder="e.g., Free Pair of Tickets"
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      disabled={loading}
                    />
                    {validationErrors.name && (
                      <Text size="1" color="red" mt="1">{validationErrors.name}</Text>
                    )}
                  </Box>

                  <Box>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Description
                    </Text>
                    <TextArea
                      placeholder="Brief description shown to users..."
                      value={formData.description}
                      onChange={(e) => handleChange('description', e.target.value)}
                      rows={3}
                      disabled={loading}
                    />
                  </Box>

                  <Box>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Terms & Conditions
                    </Text>
                    <TextArea
                      placeholder="Full terms and conditions..."
                      value={formData.terms}
                      onChange={(e) => handleChange('terms', e.target.value)}
                      rows={4}
                      disabled={loading}
                    />
                  </Box>

                  <Flex gap="3">
                    <Box style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Offer Type
                      </Text>
                      <TextField.Root
                        placeholder="e.g., ticket, discount, auction_credit"
                        value={formData.type}
                        onChange={(e) => handleChange('type', e.target.value)}
                        disabled={loading}
                      />
                      <Text size="1" color="gray" mt="1">
                        Free-form text (e.g., ticket, offer, experience, discount, merchandise)
                      </Text>
                    </Box>

                    <Box style={{ width: '150px' }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Value
                      </Text>
                      <TextField.Root
                        type="number"
                        step="0.01"
                        placeholder="50.00"
                        value={formData.value}
                        onChange={(e) => handleChange('value', e.target.value)}
                        disabled={loading}
                      />
                    </Box>

                    <Box style={{ width: '100px' }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Currency
                      </Text>
                      <TextField.Root
                        value={formData.currency}
                        onChange={(e) => handleChange('currency', e.target.value)}
                        disabled={loading}
                      />
                    </Box>
                  </Flex>
                </Flex>
              </Tabs.Content>

              {/* TAB 2: Targeting */}
              <Tabs.Content value="targeting">
                <Flex direction="column" gap="4" p="3">
                  <Box>
                    <Text size="3" weight="bold" mb="2">Geography Scope</Text>
                    <Flex align="center" gap="2" mb="3">
                      <Checkbox
                        checked={allCitiesSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleChange('geography_scope', []);
                          }
                        }}
                      />
                      <Text size="2">Available in all cities (no restrictions)</Text>
                    </Flex>

                    {!allCitiesSelected && (
                      <>
                        <TextField.Root
                          placeholder="Search cities..."
                          value={citySearchFilter}
                          onChange={(e) => setCitySearchFilter(e.target.value)}
                          mb="2"
                        />
                        <Card variant="surface" style={{ maxHeight: '200px', overflow: 'auto' }}>
                          <Flex direction="column" gap="2" p="2">
                            {filteredCities.map(city => (
                              <Flex key={city.id} align="center" gap="2">
                                <Checkbox
                                  checked={formData.geography_scope.includes(city.id)}
                                  onCheckedChange={() => handleCityToggle(city.id)}
                                />
                                <Text size="2">{city.name}</Text>
                              </Flex>
                            ))}
                          </Flex>
                        </Card>
                        {formData.geography_scope.length > 0 && (
                          <Text size="1" color="gray" mt="2">
                            Selected: {formData.geography_scope.length} cities
                          </Text>
                        )}
                      </>
                    )}
                  </Box>

                  <Separator />

                  <Box>
                    <Text size="3" weight="bold" mb="2">RFM Score Filters</Text>
                    <Text size="1" color="gray" mb="3">
                      Set to 0-5 to target all users. Set specific ranges to target user segments.
                      If min=0, that filter is ignored.
                    </Text>

                    {/* Recency */}
                    <Box mb="4">
                      <Flex justify="between" mb="2">
                        <Text size="2" weight="medium">Recency Score</Text>
                        <Badge>
                          Min: {formData.min_recency_score} | Max: {formData.max_recency_score}
                        </Badge>
                      </Flex>
                      <Slider
                        min={0}
                        max={5}
                        step={1}
                        value={[formData.min_recency_score, formData.max_recency_score]}
                        onValueChange={([min, max]) => {
                          handleChange('min_recency_score', min);
                          handleChange('max_recency_score', max);
                        }}
                      />
                      {validationErrors.Recency_range && (
                        <Text size="1" color="red" mt="1">{validationErrors.Recency_range}</Text>
                      )}
                    </Box>

                    {/* Frequency */}
                    <Box mb="4">
                      <Flex justify="between" mb="2">
                        <Text size="2" weight="medium">Frequency Score</Text>
                        <Badge>
                          Min: {formData.min_frequency_score} | Max: {formData.max_frequency_score}
                        </Badge>
                      </Flex>
                      <Slider
                        min={0}
                        max={5}
                        step={1}
                        value={[formData.min_frequency_score, formData.max_frequency_score]}
                        onValueChange={([min, max]) => {
                          handleChange('min_frequency_score', min);
                          handleChange('max_frequency_score', max);
                        }}
                      />
                      {validationErrors.Frequency_range && (
                        <Text size="1" color="red" mt="1">{validationErrors.Frequency_range}</Text>
                      )}
                    </Box>

                    {/* Monetary */}
                    <Box mb="4">
                      <Flex justify="between" mb="2">
                        <Text size="2" weight="medium">Monetary Score</Text>
                        <Badge>
                          Min: {formData.min_monetary_score} | Max: {formData.max_monetary_score}
                        </Badge>
                      </Flex>
                      <Slider
                        min={0}
                        max={5}
                        step={1}
                        value={[formData.min_monetary_score, formData.max_monetary_score]}
                        onValueChange={([min, max]) => {
                          handleChange('min_monetary_score', min);
                          handleChange('max_monetary_score', max);
                        }}
                      />
                      {validationErrors.Monetary_range && (
                        <Text size="1" color="red" mt="1">{validationErrors.Monetary_range}</Text>
                      )}
                    </Box>
                  </Box>
                </Flex>
              </Tabs.Content>

              {/* TAB 3: Display */}
              <Tabs.Content value="display">
                <Flex direction="column" gap="4" p="3">
                  <Flex gap="3">
                    <Box style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Display Order
                      </Text>
                      <TextField.Root
                        type="number"
                        value={formData.display_order}
                        onChange={(e) => handleChange('display_order', parseInt(e.target.value) || 0)}
                        disabled={loading}
                      />
                      <Text size="1" color="gray" mt="1">
                        Lower numbers appear first (e.g., 1, 2, 3...)
                      </Text>
                    </Box>

                    <Box style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Tile Color (Hex)
                      </Text>
                      <Flex gap="2">
                        <TextField.Root
                          placeholder="#3a88fe"
                          value={formData.tile_color}
                          onChange={(e) => handleChange('tile_color', e.target.value)}
                          disabled={loading}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="color"
                          value={formData.tile_color || '#3a88fe'}
                          onChange={(e) => handleChange('tile_color', e.target.value)}
                          style={{
                            width: '60px',
                            height: '40px',
                            border: '1px solid var(--gray-6)',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        />
                      </Flex>
                      {validationErrors.tile_color && (
                        <Text size="1" color="red" mt="1">{validationErrors.tile_color}</Text>
                      )}
                    </Box>
                  </Flex>

                  <Separator />

                  <Box>
                    <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                      Offer Image
                    </Text>
                    <OfferImageUpload
                      currentImageUrl={formData.image_url}
                      offerId={offer?.id}
                      onImageChange={(url) => handleChange('image_url', url)}
                      disabled={loading}
                    />
                  </Box>
                </Flex>
              </Tabs.Content>

              {/* TAB 4: Redemption */}
              <Tabs.Content value="redemption">
                <Flex direction="column" gap="4" p="3">
                  <Box>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Redemption Link
                    </Text>
                    <TextField.Root
                      placeholder="https://www.eventbrite.com/..."
                      value={formData.redemption_link}
                      onChange={(e) => handleChange('redemption_link', e.target.value)}
                      disabled={loading}
                    />
                    <Text size="1" color="gray" mt="1">
                      URL where users can redeem this offer
                    </Text>
                    {validationErrors.redemption_link && (
                      <Text size="1" color="red" mt="1">{validationErrors.redemption_link}</Text>
                    )}
                  </Box>

                  <Box>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Redemption Message
                    </Text>
                    <TextArea
                      placeholder="Optional custom message shown when user redeems..."
                      value={formData.redemption_message}
                      onChange={(e) => handleChange('redemption_message', e.target.value)}
                      rows={4}
                      disabled={loading}
                    />
                  </Box>
                </Flex>
              </Tabs.Content>
            </ScrollArea>

            {/* Bottom Section: Inventory & Dates (shown on all tabs) */}
            <Box p="3" style={{ borderTop: '1px solid var(--gray-6)', marginTop: '1rem' }}>
              <Heading size="4" mb="3">Inventory & Schedule</Heading>

              <Flex direction="column" gap="3">
                <Flex gap="3">
                  <Box style={{ flex: 1 }}>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Total Inventory
                    </Text>
                    <TextField.Root
                      type="number"
                      value={formData.total_inventory}
                      onChange={(e) => handleChange('total_inventory', parseInt(e.target.value) || 0)}
                      disabled={loading}
                    />
                  </Box>

                  <Box style={{ flex: 1 }}>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Redeemed Count
                    </Text>
                    <Flex align="center" gap="2">
                      <Badge color="blue">{actualRedemptions} (actual)</Badge>
                      <Checkbox
                        checked={useManualRedemptionCount}
                        onCheckedChange={setUseManualRedemptionCount}
                      />
                      <Text size="1">Override</Text>
                    </Flex>
                    {useManualRedemptionCount && (
                      <TextField.Root
                        type="number"
                        value={manualRedemptionCount}
                        onChange={(e) => setManualRedemptionCount(parseInt(e.target.value) || 0)}
                        disabled={loading}
                        style={{ marginTop: '0.5rem' }}
                      />
                    )}
                    <Text size="1" color="gray" mt="1">
                      Available: {formData.total_inventory - (useManualRedemptionCount ? manualRedemptionCount : actualRedemptions)} remaining
                    </Text>
                  </Box>
                </Flex>

                <Flex gap="3">
                  <Box style={{ flex: 1 }}>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      Start Date (optional)
                    </Text>
                    <TextField.Root
                      type="datetime-local"
                      value={formData.start_date}
                      onChange={(e) => handleChange('start_date', e.target.value)}
                      disabled={loading}
                    />
                  </Box>

                  <Box style={{ flex: 1 }}>
                    <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                      End Date (optional)
                    </Text>
                    <TextField.Root
                      type="datetime-local"
                      value={formData.end_date}
                      onChange={(e) => handleChange('end_date', e.target.value)}
                      disabled={loading}
                    />
                    {validationErrors.end_date && (
                      <Text size="1" color="red" mt="1">{validationErrors.end_date}</Text>
                    )}
                  </Box>
                </Flex>

                <Flex align="center" gap="2">
                  <Checkbox
                    checked={formData.active}
                    onCheckedChange={(checked) => handleChange('active', checked)}
                  />
                  <Text size="2" weight="medium">Active (visible to users)</Text>
                </Flex>
              </Flex>
            </Box>
          </Box>
        </Tabs.Root>

        {/* Error Display */}
        {error && (
          <Callout.Root color="red" style={{ marginTop: '1rem' }}>
            <Callout.Icon>
              <CrossCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Action Buttons */}
        <Flex justify="end" gap="3" style={{ marginTop: '1rem' }}>
          <Button
            variant="soft"
            color="gray"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={loading}
          >
            <CheckIcon />
            {loading ? 'Saving...' : (offer ? 'Update Offer' : 'Create Offer')}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default OfferFormModal;
