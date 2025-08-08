import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Heading,
  Text,
  TextField,
  TextArea,
  Select,
  Switch,
  Button,
  Flex,
  Grid,
  Callout,
  Separator,
} from '@radix-ui/themes';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EventEditor = ({ eventId }) => {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [message, setMessage] = useState(null);
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [filteredCities, setFilteredCities] = useState([]);

  useEffect(() => {
    fetchEventData();
    fetchCountries();
    fetchCities();
  }, [eventId]);

  // Filter cities when cities list or country changes
  useEffect(() => {
    if (cities.length > 0 && formData.country_id) {
      const filtered = cities.filter(city => city.country_id === formData.country_id);
      setFilteredCities(filtered);
    } else {
      setFilteredCities([]);
    }
  }, [cities, formData.country_id]);

  const fetchEventData = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) throw error;

      // Process date and time fields
      const processedData = { ...data };
      
      // Handle event_start_datetime field
      if (data.event_start_datetime) {
        // Extract date and time from event_start_datetime
        const dateTime = new Date(data.event_start_datetime);
        processedData.date = dateTime.toISOString().split('T')[0];
        processedData.time = dateTime.toTimeString().substring(0, 5);
      }

      setEventData(processedData);
      setFormData(processedData);
    } catch (error) {
      console.error('Error fetching event data:', error);
      setMessage({ type: 'error', text: 'Failed to load event data' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCountries = async () => {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setCountries(data || []);
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  };

  const fetchCities = async () => {
    try {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, country_id')
        .order('name');
      
      if (error) throw error;
      setCities(data || []);
    } catch (error) {
      console.error('Error fetching cities:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Filter cities when country changes
    if (field === 'country_id') {
      const filtered = cities.filter(city => city.country_id === value);
      setFilteredCities(filtered);
      // Reset city if it's not in the new country
      if (formData.city_id && !filtered.find(c => c.id === formData.city_id)) {
        setFormData(prev => ({ ...prev, city_id: null }));
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Prepare data for saving - combine date and time if needed
      const dataToSave = { ...formData };
      
      // Update event_start_datetime from date and time fields
      if (formData.date && formData.time) {
        // Combine date and time into ISO format for event_start_datetime
        dataToSave.event_start_datetime = `${formData.date}T${formData.time}:00`;
        // Remove the separate date/time fields as they're not in the database
        delete dataToSave.date;
        delete dataToSave.time;
      }

      // Log what we're saving for debugging
      console.log('Saving event data:', dataToSave);
      
      const { error } = await supabase
        .from('events')
        .update(dataToSave)
        .eq('id', eventId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Event updated successfully!' });
      setEventData(formData);
    } catch (error) {
      console.error('Error saving event:', error);
      setMessage({ type: 'error', text: `Failed to save: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setFormData(eventData);
    setMessage(null);
  };

  if (loading) {
    return <Text>Loading event data...</Text>;
  }

  return (
    <Flex direction="column" gap="4">
      <Card size="3">
        <Heading size="4" mb="4">Event Details</Heading>
        
        {message && (
          <Callout.Root color={message.type === 'error' ? 'red' : 'green'} mb="4">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{message.text}</Callout.Text>
          </Callout.Root>
        )}

        <Grid columns="2" gap="4">
          {/* Basic Info */}
          <Box>
            <Text size="2" weight="medium" mb="1">Event Name</Text>
            <TextField.Root
              value={formData.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Event name"
            />
          </Box>

          <Box>
            <Text size="2" weight="medium" mb="1">EID (Event ID)</Text>
            <TextField.Root
              value={formData.eid || ''}
              onChange={(e) => handleChange('eid', e.target.value)}
              placeholder="AB3032"
            />
          </Box>


          {/* Event Type */}
          <Box>
            <Text size="2" weight="medium" mb="1">Event Type</Text>
            <Select.Root
              value={formData.eventtype || 'regular'}
              onValueChange={(value) => handleChange('eventtype', value)}
            >
              <Select.Trigger />
              <Select.Content position="popper" sideOffset={5}>
                <Select.Item value="regular">Regular</Select.Item>
                <Select.Item value="championship">Championship</Select.Item>
                <Select.Item value="allstars">All Stars</Select.Item>
                <Select.Item value="special">Special</Select.Item>
                <Select.Item value="private">Private</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>
        </Grid>

        {/* Date and Time Section */}
        <Box mt="4">
          <Heading size="3" mb="3">Date & Time</Heading>
          <Grid columns="2" gap="4">
            <Box>
              <Text size="2" weight="medium" mb="1">Date</Text>
              <input
                type="date"
                value={formData.date ? formData.date.split('T')[0] : ''}
                onChange={(e) => handleChange('date', e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Time</Text>
              <input
                type="time"
                value={formData.time || ''}
                onChange={(e) => handleChange('time', e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)'
                }}
              />
            </Box>
          </Grid>
        </Box>

        {/* Location Section */}
        <Box mt="4">
          <Heading size="3" mb="3">Location</Heading>
          <Flex direction="column" gap="3">
            <Box>
              <Text size="2" weight="medium" mb="1">Venue</Text>
              <TextField.Root
                value={formData.venue || ''}
                onChange={(e) => handleChange('venue', e.target.value)}
                placeholder="Venue name"
              />
            </Box>

            <Grid columns="2" gap="4">
              <Box>
                <Text size="2" weight="medium" mb="1">Country</Text>
                <Select.Root
                  value={formData.country_id || ''}
                  onValueChange={(value) => handleChange('country_id', value)}
                >
                  <Select.Trigger placeholder="Select a country" />
                  <Select.Content position="popper" sideOffset={5} style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {countries.map(country => (
                      <Select.Item key={country.id} value={country.id}>
                        {country.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="1">City</Text>
                <Select.Root
                  value={formData.city_id || ''}
                  onValueChange={(value) => handleChange('city_id', value)}
                  disabled={!formData.country_id}
                >
                  <Select.Trigger placeholder={formData.country_id ? "Select a city" : "Select country first"} />
                  <Select.Content position="popper" sideOffset={5} style={{ maxHeight: '200px', overflow: 'auto' }}>
                    {filteredCities.map(city => (
                      <Select.Item key={city.id} value={city.id}>
                        {city.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>
            </Grid>

            <Box>
              <Text size="2" weight="medium" mb="1">Tax Rate (%)</Text>
              <TextField.Root
                type="number"
                value={formData.tax || ''}
                onChange={(e) => handleChange('tax', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="13.00"
                step="0.01"
              />
            </Box>
          </Flex>
        </Box>

        <Separator size="4" my="4" />

        {/* Price and Ticket Section */}
        <Box mt="4">
          <Heading size="3" mb="3">Ticketing</Heading>
          <Grid columns="2" gap="4">
            <Box>
              <Text size="2" weight="medium" mb="1">Price</Text>
              <TextField.Root
                type="number"
                value={formData.price || ''}
                onChange={(e) => handleChange('price', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="25.00"
                step="0.01"
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Ticket Link</Text>
              <TextField.Root
                value={formData.ticket_link || ''}
                onChange={(e) => handleChange('ticket_link', e.target.value)}
                placeholder="https://example.com/tickets"
              />
            </Box>
          </Grid>
        </Box>

        {/* Description */}
        <Box mt="4">
          <Text size="2" weight="medium" mb="1">Description</Text>
          <TextArea
            value={formData.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Event description"
            rows={4}
          />
        </Box>

        <Separator size="4" my="4" />

        {/* Feature Flags */}
        <Heading size="3" mb="3">Features</Heading>
        <Grid columns="2" gap="4">
          <Flex align="center" gap="2">
            <Switch
              checked={formData.voting_enabled ?? true}
              onCheckedChange={(checked) => handleChange('voting_enabled', checked)}
            />
            <Text size="2">Voting Enabled</Text>
          </Flex>

          <Flex align="center" gap="2">
            <Switch
              checked={formData.enable_auction ?? true}
              onCheckedChange={(checked) => handleChange('enable_auction', checked)}
            />
            <Text size="2">Auction Enabled</Text>
          </Flex>

          <Flex align="center" gap="2">
            <Switch
              checked={formData.photo_upload_enabled ?? true}
              onCheckedChange={(checked) => handleChange('photo_upload_enabled', checked)}
            />
            <Text size="2">Photo Upload Enabled</Text>
          </Flex>

          <Flex align="center" gap="2">
            <Switch
              checked={formData.show_in_app ?? true}
              onCheckedChange={(checked) => handleChange('show_in_app', checked)}
            />
            <Text size="2">Show in App</Text>
          </Flex>

          <Flex align="center" gap="2">
            <Switch
              checked={formData.enabled ?? true}
              onCheckedChange={(checked) => handleChange('enabled', checked)}
            />
            <Text size="2">Event Enabled</Text>
          </Flex>
        </Grid>

        {/* Action Buttons */}
        <Flex gap="3" mt="6" justify="end">
          <Button 
            variant="soft" 
            color="gray"
            onClick={handleReset}
            disabled={saving}
          >
            Reset
          </Button>
          <Button 
            variant="solid"
            onClick={handleSave}
            disabled={saving || JSON.stringify(formData) === JSON.stringify(eventData)}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Flex>
      </Card>

      {/* Raw Data View */}
      <Card size="2">
        <details>
          <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
            <Text size="2" weight="medium">View Raw Event Data</Text>
          </summary>
          <Box style={{ 
            background: 'var(--gray-2)', 
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            overflow: 'auto'
          }}>
            <pre>{JSON.stringify(formData, null, 2)}</pre>
          </Box>
        </details>
      </Card>
    </Flex>
  );
};

export default EventEditor;