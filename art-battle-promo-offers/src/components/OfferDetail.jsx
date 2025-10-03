import { useState, useEffect } from 'react'
import {
  Box, Heading, Flex, Button, Text, TextField, TextArea, Select, Switch,
  ScrollArea, Separator, Badge, Card, Spinner, Dialog
} from '@radix-ui/themes'
import { Cross2Icon, TrashIcon } from '@radix-ui/react-icons'
import { createOffer, updateOffer, deleteOffer, fetchCities, getOfferAnalytics } from '../lib/api'
import RFMSliders from './RFMSliders'

export default function OfferDetail({ offer, onUpdate, onDelete, onClose }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [editMode, setEditMode] = useState(offer.id === 'new')
  const [cities, setCities] = useState([])
  const [analytics, setAnalytics] = useState(null)

  const [formData, setFormData] = useState({
    name: offer.name || '',
    description: offer.description || '',
    terms: offer.terms || '',
    type: offer.type || 'ticket',
    value: offer.value || 0,
    currency: offer.currency || 'CAD',
    geographyScope: offer.geographyScope || [],
    minRecencyScore: offer.minRecencyScore || 0,
    maxRecencyScore: offer.maxRecencyScore || 5,
    minFrequencyScore: offer.minFrequencyScore || 0,
    maxFrequencyScore: offer.maxFrequencyScore || 5,
    minMonetaryScore: offer.minMonetaryScore || 0,
    maxMonetaryScore: offer.maxMonetaryScore || 5,
    totalInventory: offer.totalInventory || 0,
    startDate: offer.startDate ? new Date(offer.startDate).toISOString().split('T')[0] : '',
    endDate: offer.endDate ? new Date(offer.endDate).toISOString().split('T')[0] : '',
    active: offer.active !== false,
    imageUrl: offer.imageUrl || '',
    displayOrder: offer.displayOrder || 0,
    tileColor: offer.tileColor || '#1e40af',
    redemptionLink: offer.redemptionLink || '',
    redemptionMessage: offer.redemptionMessage || 'Your offer has been redeemed'
  })

  const offerTypes = [
    { value: 'ticket', label: 'Free Ticket' },
    { value: 'merchandise', label: 'Merchandise' },
    { value: 'auction_credit', label: 'Auction Credit' },
    { value: 'discount', label: 'Discount' },
    { value: 'experience', label: 'Experience' },
    { value: 'other', label: 'Other' }
  ]

  useEffect(() => {
    loadCities()
    if (offer.id && offer.id !== 'new') {
      loadAnalytics()
    }
  }, [offer.id])

  async function loadCities() {
    try {
      const data = await fetchCities()
      setCities(data)
    } catch (error) {
      console.error('Error loading cities:', error)
    }
  }

  async function loadAnalytics() {
    try {
      const data = await getOfferAnalytics(offer.id)
      setAnalytics(data)
    } catch (error) {
      console.error('Error loading analytics:', error)
    }
  }

  function handleChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  function handleRFMChange(scores) {
    setFormData(prev => ({ ...prev, ...scores }))
  }

  function toggleCity(cityName) {
    const cities = [...(formData.geographyScope || [])]
    const index = cities.indexOf(cityName)
    if (index === -1) {
      cities.push(cityName)
    } else {
      cities.splice(index, 1)
    }
    handleChange('geographyScope', cities)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      const payload = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        value: parseFloat(formData.value) || 0,
        minRecencyScore: parseInt(formData.minRecencyScore) || 0,
        maxRecencyScore: parseInt(formData.maxRecencyScore) || 5,
        minFrequencyScore: parseInt(formData.minFrequencyScore) || 0,
        maxFrequencyScore: parseInt(formData.maxFrequencyScore) || 5,
        minMonetaryScore: parseInt(formData.minMonetaryScore) || 0,
        maxMonetaryScore: parseInt(formData.maxMonetaryScore) || 5,
        totalInventory: parseInt(formData.totalInventory) || 0,
        displayOrder: parseInt(formData.displayOrder) || 0
      }

      let result
      if (offer.id === 'new') {
        result = await createOffer(payload)
      } else {
        result = await updateOffer(offer.id, payload)
      }

      onUpdate(result)
      setEditMode(false)
    } catch (err) {
      console.error('Error saving offer:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this offer? This action cannot be undone.')) {
      return
    }

    setSaving(true)
    try {
      await deleteOffer(offer.id)
      onDelete(offer.id)
    } catch (err) {
      console.error('Error deleting offer:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollArea style={{ height: '85vh' }}>
      <Box p="4">
        {/* Header */}
        <Flex justify="between" align="center" mb="4">
          <Heading size="6">
            {offer.id === 'new' ? 'Create New Offer' : formData.name}
          </Heading>

          <Flex gap="2">
            {!editMode && offer.id !== 'new' && (
              <Button variant="soft" onClick={() => setEditMode(true)}>
                Edit
              </Button>
            )}
            {editMode && (
              <>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                {offer.id !== 'new' && (
                  <Button variant="soft" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                )}
              </>
            )}
            {offer.id !== 'new' && (
              <Button color="red" variant="soft" onClick={handleDelete}>
                <TrashIcon />
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              <Cross2Icon />
            </Button>
          </Flex>
        </Flex>

        {error && (
          <Box mb="4" p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-3)' }}>
            <Text color="red">{error}</Text>
          </Box>
        )}

        {/* Analytics (if not editing) */}
        {analytics && !editMode && (
          <Card mb="4">
            <Heading size="4" mb="3">Performance Analytics</Heading>
            <Flex gap="4">
              <Box>
                <Text size="2" color="gray">Total Views</Text>
                <Heading size="6">{analytics.totalViews}</Heading>
              </Box>
              <Box>
                <Text size="2" color="gray">Redemptions</Text>
                <Heading size="6">{analytics.totalRedemptions}</Heading>
              </Box>
              {analytics.totalViews > 0 && (
                <Box>
                  <Text size="2" color="gray">Conversion Rate</Text>
                  <Heading size="6">
                    {((analytics.totalRedemptions / analytics.totalViews) * 100).toFixed(1)}%
                  </Heading>
                </Box>
              )}
            </Flex>
          </Card>
        )}

        {/* Basic Information */}
        <Box mb="4">
          <Heading size="4" mb="3">Basic Information</Heading>

          <Flex direction="column" gap="3">
            <Box>
              <Text size="2" mb="1" weight="bold">Offer Name *</Text>
              <TextField.Root
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                disabled={!editMode}
                placeholder="e.g., Free Pair of Tickets"
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Description *</Text>
              <TextArea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                disabled={!editMode}
                placeholder="Brief description of the offer"
                rows={3}
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Terms & Conditions</Text>
              <TextArea
                value={formData.terms}
                onChange={(e) => handleChange('terms', e.target.value)}
                disabled={!editMode}
                placeholder="Legal terms and conditions"
                rows={4}
              />
            </Box>

            <Flex gap="3">
              <Box style={{ flex: 1 }}>
                <Text size="2" mb="1" weight="bold">Type</Text>
                <Select.Root
                  value={formData.type}
                  onValueChange={(value) => handleChange('type', value)}
                  disabled={!editMode}
                >
                  <Select.Trigger style={{ width: '100%' }} />
                  <Select.Content>
                    {offerTypes.map(type => (
                      <Select.Item key={type.value} value={type.value}>
                        {type.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>

              <Box style={{ flex: 1 }}>
                <Text size="2" mb="1" weight="bold">Value</Text>
                <TextField.Root
                  type="number"
                  value={formData.value}
                  onChange={(e) => handleChange('value', e.target.value)}
                  disabled={!editMode}
                  placeholder="0"
                />
              </Box>

              <Box style={{ flex: 1 }}>
                <Text size="2" mb="1" weight="bold">Currency</Text>
                <Select.Root
                  value={formData.currency}
                  onValueChange={(value) => handleChange('currency', value)}
                  disabled={!editMode}
                >
                  <Select.Trigger style={{ width: '100%' }} />
                  <Select.Content>
                    <Select.Item value="CAD">CAD</Select.Item>
                    <Select.Item value="USD">USD</Select.Item>
                    <Select.Item value="EUR">EUR</Select.Item>
                    <Select.Item value="GBP">GBP</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
            </Flex>
          </Flex>
        </Box>

        <Separator size="4" mb="4" />

        {/* RFM Targeting */}
        <Box mb="4">
          <Heading size="4" mb="3">RFM Targeting</Heading>
          <Text size="2" color="gray" mb="4">
            Target users based on their Recency, Frequency, and Monetary scores (1-5 scale).
            Set min and max values to define your audience.
          </Text>

          <RFMSliders
            values={{
              minRecencyScore: formData.minRecencyScore,
              maxRecencyScore: formData.maxRecencyScore,
              minFrequencyScore: formData.minFrequencyScore,
              maxFrequencyScore: formData.maxFrequencyScore,
              minMonetaryScore: formData.minMonetaryScore,
              maxMonetaryScore: formData.maxMonetaryScore,
            }}
            onChange={handleRFMChange}
            disabled={!editMode}
          />
        </Box>

        <Separator size="4" mb="4" />

        {/* Geography */}
        <Box mb="4">
          <Heading size="4" mb="3">Geography</Heading>
          <Text size="2" color="gray" mb="3">
            Select cities where this offer is valid. Leave empty for all locations.
          </Text>

          {editMode ? (
            <Flex wrap="wrap" gap="2">
              {cities.map((city) => (
                <Badge
                  key={city.name}
                  size="2"
                  color={formData.geographyScope?.includes(city.name) ? 'blue' : 'gray'}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleCity(city.name)}
                >
                  {city.name}
                  {city.region && `, ${city.region}`}
                </Badge>
              ))}
            </Flex>
          ) : (
            <Flex wrap="wrap" gap="2">
              {formData.geographyScope?.length > 0 ? (
                formData.geographyScope.map((city) => (
                  <Badge key={city} size="2" color="blue">{city}</Badge>
                ))
              ) : (
                <Text color="gray">All locations</Text>
              )}
            </Flex>
          )}
        </Box>

        <Separator size="4" mb="4" />

        {/* Inventory & Validity */}
        <Box mb="4">
          <Heading size="4" mb="3">Inventory & Validity</Heading>

          <Flex direction="column" gap="3">
            <Box>
              <Text size="2" mb="1" weight="bold">Total Inventory</Text>
              <TextField.Root
                type="number"
                value={formData.totalInventory}
                onChange={(e) => handleChange('totalInventory', e.target.value)}
                disabled={!editMode}
                placeholder="0 for unlimited"
              />
              {offer.redeemedCount > 0 && (
                <Text size="1" color="gray" mt="1">
                  {offer.redeemedCount} redeemed
                </Text>
              )}
            </Box>

            <Flex gap="3">
              <Box style={{ flex: 1 }}>
                <Text size="2" mb="1" weight="bold">Start Date</Text>
                <TextField.Root
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  disabled={!editMode}
                />
              </Box>

              <Box style={{ flex: 1 }}>
                <Text size="2" mb="1" weight="bold">End Date</Text>
                <TextField.Root
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  disabled={!editMode}
                />
              </Box>
            </Flex>
          </Flex>
        </Box>

        <Separator size="4" mb="4" />

        {/* Display Settings */}
        <Box mb="4">
          <Heading size="4" mb="3">Display Settings</Heading>

          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              <Box>
                <Text size="2" weight="bold">Active</Text>
                <Text size="1" color="gray">Show this offer to users</Text>
              </Box>
              <Switch
                checked={formData.active}
                onCheckedChange={(checked) => handleChange('active', checked)}
                disabled={!editMode}
              />
            </Flex>

            <Box>
              <Text size="2" mb="1" weight="bold">Tile Color</Text>
              <TextField.Root
                type="color"
                value={formData.tileColor}
                onChange={(e) => handleChange('tileColor', e.target.value)}
                disabled={!editMode}
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Display Order</Text>
              <TextField.Root
                type="number"
                value={formData.displayOrder}
                onChange={(e) => handleChange('displayOrder', e.target.value)}
                disabled={!editMode}
                placeholder="0"
              />
              <Text size="1" color="gray">Lower numbers appear first</Text>
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Redemption Message</Text>
              <TextField.Root
                value={formData.redemptionMessage}
                onChange={(e) => handleChange('redemptionMessage', e.target.value)}
                disabled={!editMode}
                placeholder="Your offer has been redeemed"
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Redemption Link (optional)</Text>
              <TextField.Root
                value={formData.redemptionLink}
                onChange={(e) => handleChange('redemptionLink', e.target.value)}
                disabled={!editMode}
                placeholder="https://..."
              />
              <Text size="1" color="gray">URL to redirect users after redemption</Text>
            </Box>
          </Flex>
        </Box>
      </Box>
    </ScrollArea>
  )
}
