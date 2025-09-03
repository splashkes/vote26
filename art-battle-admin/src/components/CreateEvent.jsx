import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  TextField,
  TextArea,
  Select,
  Switch,
  Spinner,
  Callout
} from '@radix-ui/themes';
import { ArrowLeftIcon, CalendarIcon, GlobeIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const CreateEvent = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editEventId = searchParams.get('edit');
  const isEditMode = !!editEventId;
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [nextEid, setNextEid] = useState('');
  const [loadingEid, setLoadingEid] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    venue: '',
    city_id: 'none',
    country_id: 'none',
    event_start_datetime: '',
    event_end_datetime: '',
    timezone_icann: 'America/Toronto',
    enabled: false,
    show_in_app: false,
    current_round: 0,
    capacity: 200,
    eid: '',
    eventbrite_id: ''
  });

  useEffect(() => {
    fetchLocations();
    if (!isEditMode) {
      fetchNextEid();
    }
  }, []);

  // Load existing event data when in edit mode
  useEffect(() => {
    if (isEditMode && editEventId) {
      loadEventForEdit(editEventId);
    }
  }, [isEditMode, editEventId]);

  const fetchLocations = async () => {
    try {
      setLoadingLocations(true);
      
      // Fetch countries and cities
      const [countriesResponse, citiesResponse] = await Promise.all([
        supabase.from('countries').select('*').order('name'),
        supabase.from('cities').select('*, countries(name, code)').order('name')
      ]);

      if (countriesResponse.error) {
        console.error('Error fetching countries:', countriesResponse.error);
      } else {
        setCountries(countriesResponse.data || []);
      }

      if (citiesResponse.error) {
        console.error('Error fetching cities:', citiesResponse.error);
      } else {
        setCities(citiesResponse.data || []);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchNextEid = async () => {
    try {
      setLoadingEid(true);
      
      // Get the latest event to determine next EID
      const { data: latestEvent, error } = await supabase
        .from('events')
        .select('eid')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching latest event:', error);
        setNextEid('AB0001'); // Default if we can't fetch
        return;
      }

      let nextEidNumber = 2900; // Minimum starting number (changed to 2900)
      if (latestEvent && latestEvent[0]?.eid) {
        const match = latestEvent[0].eid.match(/AB(\d+)/);
        if (match) {
          nextEidNumber = Math.max(parseInt(match[1]) + 1, 2900); // Ensure minimum of 2900
        }
      }

      const eid = `AB${nextEidNumber.toString().padStart(4, '0')}`;
      setNextEid(eid);
      // Also set it in the form data as the initial value
      setFormData(prev => ({ ...prev, eid }));
    } catch (err) {
      console.error('Error fetching next EID:', err);
      const fallbackEid = 'AB2900'; // Default fallback with minimum 2900
      setNextEid(fallbackEid);
      setFormData(prev => ({ ...prev, eid: fallbackEid }));
    } finally {
      setLoadingEid(false);
    }
  };

  const loadEventForEdit = async (eventId) => {
    try {
      setLoadingEid(true);
      
      const { data: eventData, error } = await supabase
        .from('events')
        .select(`
          *,
          cities(id, name, country_id, countries(id, name, code))
        `)
        .eq('id', eventId)
        .single();

      if (error) {
        console.error('Error fetching event:', error);
        setError('Failed to load event data');
        return;
      }

      if (eventData) {
        // Format datetime for inputs (HTML datetime-local requires YYYY-MM-DDTHH:MM format)
        // Convert UTC database time to event's timezone for editing
        const formatDateTimeForInput = (datetime, timezone) => {
          if (!datetime) return '';
          
          // Parse the UTC datetime and convert to event's timezone
          const date = new Date(datetime);
          const formatter = new Intl.DateTimeFormat('sv-SE', {
            timeZone: timezone || 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
          
          const parts = formatter.formatToParts(date);
          const year = parts.find(p => p.type === 'year').value;
          const month = parts.find(p => p.type === 'month').value;
          const day = parts.find(p => p.type === 'day').value;
          const hour = parts.find(p => p.type === 'hour').value;
          const minute = parts.find(p => p.type === 'minute').value;
          
          return `${year}-${month}-${day}T${hour}:${minute}`;
        };

        setFormData({
          name: eventData.name || '',
          description: eventData.description || '',
          venue: eventData.venue || '',
          city_id: eventData.city_id || 'none',
          country_id: eventData.cities?.country_id || 'none',
          event_start_datetime: formatDateTimeForInput(eventData.event_start_datetime, eventData.timezone_icann),
          event_end_datetime: formatDateTimeForInput(eventData.event_end_datetime, eventData.timezone_icann),
          timezone_icann: eventData.timezone_icann || 'America/Toronto',
          enabled: eventData.enabled || false,
          show_in_app: eventData.show_in_app || false,
          current_round: eventData.current_round || 0,
          capacity: eventData.capacity || 200,
          eid: eventData.eid || '',
          eventbrite_id: eventData.eventbrite_id || ''
        });
      }
    } catch (err) {
      console.error('Error loading event:', err);
      setError('Failed to load event data');
    } finally {
      setLoadingEid(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      // Validate required fields
      if (!formData.name || !formData.eid || !formData.event_start_datetime || !formData.event_end_datetime || !formData.timezone_icann) {
        setError('Please fill in all required fields: Event Name, EID, Start Time, End Time, and Timezone');
        return;
      }

      // Validate EID format
      if (!formData.eid.match(/^AB\d{4,}$/)) {
        setError('Event Number (EID) must be in format AB#### with minimum AB2900');
        return;
      }

      // Validate minimum EID number
      const eidNumber = parseInt(formData.eid.slice(2));
      if (eidNumber < 2900) {
        setError('Event Number (EID) must be AB2900 or higher');
        return;
      }

      // Prepare the data, converting "none" values to null for optional fields
      const requestData = {
        ...formData,
        city_id: formData.city_id === 'none' ? null : formData.city_id,
        country_id: formData.country_id === 'none' ? null : formData.country_id,
        description: formData.description || null,
        venue: formData.venue || null
      };

      // Call appropriate function based on mode
      const functionName = isEditMode ? 'admin-update-event' : 'admin-create-event';
      const requestBody = isEditMode ? { ...requestData, id: editEventId } : requestData;
      
      const response = await supabase.functions.invoke(functionName, {
        body: requestBody,
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      console.log('Full response:', response);

      if (response.error) {
        console.error('Supabase function error:', response.error);
        
        // Try to get detailed debug info from response body (Edge Function Debugging Secret technique)
        try {
          if (response.error.context && typeof response.error.context.text === 'function') {
            const responseText = await response.error.context.text();
            console.log('Raw edge function response:', responseText);
            const parsed = JSON.parse(responseText);
            
            if (parsed.debug) {
              console.log('Edge function debug info:', parsed.debug);
              setError(`Function error: ${parsed.error}\n\nDebug: ${JSON.stringify(parsed.debug, null, 2)}`);
              return;
            }
          }
        } catch (e) {
          console.log('Could not parse error response:', e);
        }
        
        setError(`Function error: ${response.error.message || 'Unknown error'}`);
        return;
      }

      if (response.data?.error) {
        console.error('Function returned error:', response.data.error);
        const errorMsg = response.data.error;
        const details = response.data.details ? ` Details: ${response.data.details}` : '';
        const stack = response.data.stack ? ` Stack: ${response.data.stack}` : '';
        setError(`${errorMsg}${details}${stack}`);
        return;
      }

      // Check for non-2xx status
      if (!response.data?.success && !response.data?.event) {
        console.error('Unexpected response:', response.data);
        setError('Failed to create event. Please check the browser console for details.');
        return;
      }

      const successMessage = isEditMode ? 'Event updated successfully!' : 'Event created successfully!';
      setSuccess(response.data?.message || successMessage);
      
      // Navigate back to the event after a short delay
      setTimeout(() => {
        if (isEditMode) {
          navigate(`/events/${editEventId}`);
        } else if (response.data?.event?.id) {
          navigate(`/events/${response.data.event.id}`);
        } else {
          navigate('/events');
        }
      }, 2000);

    } catch (err) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} event:`, err);
      setError(`Failed to ${isEditMode ? 'update' : 'create'} event. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredCities = () => {
    if (!formData.country_id || formData.country_id === 'none') return cities;
    return cities.filter(city => city.country_id === formData.country_id);
  };

  const commonTimezones = [
    'America/Toronto',
    'America/New_York',
    'America/Chicago', 
    'America/Denver',
    'America/Los_Angeles',
    'America/Vancouver',
    'Europe/London',
    'Europe/Paris',
    'Australia/Sydney',
    'Asia/Tokyo'
  ];

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex align="center" gap="3">
          <Button
            variant="ghost"
            onClick={() => navigate('/events')}
            size="2"
          >
            <ArrowLeftIcon />
          </Button>
          <Box>
            <Heading size="6">{isEditMode ? 'Edit Event' : 'Create New Event'}</Heading>
            <Text color="gray" size="2">
              {isEditMode ? 'Edit an existing Art Battle event' : 'Create a new Art Battle event'}
            </Text>
          </Box>
        </Flex>

        {/* Success Message */}
        {success && (
          <Callout.Root color="green">
            <Callout.Text>{success}</Callout.Text>
          </Callout.Root>
        )}

        {/* Error Message */}
        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Event Number (EID) Input */}
        <Card>
          <Box p="4">
            <Flex direction="column" gap="3">
              <Text as="label" size="3" weight="bold" color="blue">
                Event Number (EID) *
              </Text>
              {loadingEid ? (
                <Flex align="center" gap="2">
                  <Spinner size="1" />
                  <Text size="2" color="gray">Loading next available event number...</Text>
                </Flex>
              ) : (
                <Box>
                  <TextField.Root
                    placeholder="AB2900"
                    value={formData.eid}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      // Allow AB followed by numbers, and auto-format if user just types numbers
                      if (value.match(/^\d+$/)) {
                        handleInputChange('eid', `AB${value}`);
                      } else if (value.match(/^AB\d*$/)) {
                        handleInputChange('eid', value);
                      } else if (value === '') {
                        handleInputChange('eid', '');
                      }
                    }}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                    required
                  />
                  <Text size="2" color="gray" mt="1" style={{ display: 'block' }}>
                    Format: AB#### (minimum AB2900). You can edit this if needed.
                  </Text>
                </Box>
              )}
            </Flex>
          </Box>
        </Card>

        {/* Form */}
        <Card>
          <Box p="6">
            <form onSubmit={handleSubmit}>
              <Flex direction="column" gap="4">
                {/* Basic Information */}
                <Box>
                  <Heading size="4" mb="3">Basic Information</Heading>
                  
                  <Flex direction="column" gap="3">
                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Event Name *
                      </Text>
                      <TextField.Root
                        placeholder="e.g., Art Battle Toronto - Winter Classic"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        required
                      />
                    </Box>

                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Description
                      </Text>
                      <TextArea
                        placeholder="Brief description of the event..."
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        rows={3}
                      />
                    </Box>

                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Venue
                      </Text>
                      <TextField.Root
                        placeholder="e.g., Phoenix Concert Theatre"
                        value={formData.venue}
                        onChange={(e) => handleInputChange('venue', e.target.value)}
                      />
                    </Box>

                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Eventbrite Event ID
                      </Text>
                      <TextField.Root
                        placeholder="e.g., 123456789012"
                        value={formData.eventbrite_id}
                        onChange={(e) => handleInputChange('eventbrite_id', e.target.value)}
                      />
                      <Text size="2" color="gray" mt="1" style={{ display: 'block' }}>
                        Optional. Enter the numeric ID from your Eventbrite event URL.
                      </Text>
                    </Box>
                  </Flex>
                </Box>

                {/* Location */}
                <Box>
                  <Heading size="4" mb="3">Location</Heading>
                  
                  {loadingLocations ? (
                    <Flex align="center" gap="2">
                      <Spinner size="1" />
                      <Text size="2" color="gray">Loading locations...</Text>
                    </Flex>
                  ) : (
                    <Flex direction="column" gap="3">
                      <Box>
                        <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                          Country
                        </Text>
                        <Select.Root
                          value={formData.country_id}
                          onValueChange={(value) => {
                            handleInputChange('country_id', value);
                            // Reset city when country changes
                            handleInputChange('city_id', 'none');
                          }}
                        >
                          <Select.Trigger placeholder="Select a country" />
                          <Select.Content>
                            <Select.Item value="none">No country</Select.Item>
                            {countries.map((country) => (
                              <Select.Item key={country.id} value={country.id}>
                                {country.name}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                      </Box>

                      <Box>
                        <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                          City
                        </Text>
                        <Select.Root
                          value={formData.city_id}
                          onValueChange={(value) => handleInputChange('city_id', value)}
                          disabled={!formData.country_id || formData.country_id === 'none'}
                        >
                          <Select.Trigger 
                            placeholder={
                              formData.country_id && formData.country_id !== 'none' ? "Select a city" : "Select a country first"
                            } 
                          />
                          <Select.Content>
                            <Select.Item value="none">No city</Select.Item>
                            {getFilteredCities().map((city) => (
                              <Select.Item key={city.id} value={city.id}>
                                {city.name}
                                {city.countries?.name && ` (${city.countries.name})`}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                      </Box>
                    </Flex>
                  )}
                </Box>

                {/* Date & Time */}
                <Box>
                  <Heading size="4" mb="3">Date & Time</Heading>
                  
                  <Flex direction="column" gap="3">
                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Start Date & Time *
                      </Text>
                      <TextField.Root
                        type="datetime-local"
                        value={formData.event_start_datetime}
                        onChange={(e) => handleInputChange('event_start_datetime', e.target.value)}
                        required
                      />
                    </Box>

                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        End Date & Time *
                      </Text>
                      <TextField.Root
                        type="datetime-local"
                        value={formData.event_end_datetime}
                        onChange={(e) => handleInputChange('event_end_datetime', e.target.value)}
                        required
                      />
                    </Box>

                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Timezone *
                      </Text>
                      <Select.Root
                        value={formData.timezone_icann}
                        onValueChange={(value) => handleInputChange('timezone_icann', value)}
                      >
                        <Select.Trigger />
                        <Select.Content>
                          {commonTimezones.map((timezone) => (
                            <Select.Item key={timezone} value={timezone}>
                              {timezone}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                    </Box>
                  </Flex>
                </Box>

                {/* Settings */}
                <Box>
                  <Heading size="4" mb="3">Settings</Heading>
                  
                  <Flex direction="column" gap="3">
                    <Box>
                      <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Capacity
                      </Text>
                      <TextField.Root
                        type="number"
                        placeholder="200"
                        value={formData.capacity}
                        onChange={(e) => handleInputChange('capacity', parseInt(e.target.value) || 200)}
                        min="1"
                      />
                    </Box>

                    <Flex direction="column" gap="3">
                      <Text as="label" size="3" weight="medium">Status</Text>
                      
                      <Flex align="center" gap="2">
                        <Switch
                          checked={formData.enabled}
                          onCheckedChange={(checked) => handleInputChange('enabled', checked)}
                        />
                        <Text size="2">Enabled (allows event functionality)</Text>
                      </Flex>

                      <Flex align="center" gap="2">
                        <Switch
                          checked={formData.show_in_app}
                          onCheckedChange={(checked) => handleInputChange('show_in_app', checked)}
                        />
                        <Text size="2">Show in App (visible to public)</Text>
                      </Flex>
                    </Flex>
                  </Flex>
                </Box>

                {/* Submit Buttons */}
                <Flex gap="3" mt="4">
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    onClick={() => navigate('/events')}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading || !formData.name || !formData.eid || !formData.event_start_datetime || !formData.event_end_datetime}
                  >
                    {loading ? (
                      <>
                        <Spinner size="1" />
                        {isEditMode ? 'Updating Event...' : 'Creating Event...'}
                      </>
                    ) : (
                      isEditMode ? 'Update Event' : 'Create Event'
                    )}
                  </Button>
                </Flex>
              </Flex>
            </form>
          </Box>
        </Card>
      </Flex>
    </Box>
  );
};

export default CreateEvent;