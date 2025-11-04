import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Flex,
  Text,
  Button,
  TextArea,
  Select,
  Slider,
  Badge,
  Box,
  Heading,
  Separator,
  TextField,
  Progress,
  Callout,
  Dialog,
  Checkbox,
  ScrollArea
} from '@radix-ui/themes';
import {
  InfoCircledIcon,
  ReloadIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  PaperPlaneIcon,
  PersonIcon,
  Cross2Icon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const PromotionSystem = () => {
  const { user } = useAuth();
  
  // Audience targeting state
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [selectedEventForAdd, setSelectedEventForAdd] = useState('');
  
  // RFM filtering state
  const [rfmFilters, setRfmFilters] = useState({
    enabled: false,
    recency: [1, 5],
    frequency: [1, 5], 
    monetary: [1, 5]
  });
  
  // Recent message filtering
  const [recentMessageHours, setRecentMessageHours] = useState(72);
  
  // Audience data
  const [audienceData, setAudienceData] = useState({
    total_count: 0,
    blocked_count: 0,
    recent_message_count: 0,
    available_count: 0,
    rfm_ready_count: 0,
    filtered_count: 0,
    needs_rfm_generation: false
  });
  
  // Data loading states
  const [cities, setCities] = useState([]);
  const [events, setEvents] = useState([]);
  const [allEventsCache, setAllEventsCache] = useState({}); // Cache all loaded events by ID
  const [loading, setLoading] = useState(false);
  const [rfmProcessing, setRfmProcessing] = useState(false);
  const [rfmProgress, setRfmProgress] = useState(null);
  
  // Message composition
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const [messageSegments, setMessageSegments] = useState(1);
  const [characterCount, setCharacterCount] = useState(0);
  
  // Campaign execution
  const [campaignResult, setCampaignResult] = useState(null);
  const [sending, setSending] = useState(false);

  // Error state
  const [audienceError, setAudienceError] = useState(null);

  // Modal state
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [audiencePeople, setAudiencePeople] = useState([]);
  const [audienceSearchFilter, setAudienceSearchFilter] = useState('');

  // Temporary event selection state
  const [tempSelectedEvents, setTempSelectedEvents] = useState([]);

  // Event association state (for tracking which event this campaign is for)
  const [associatedEventId, setAssociatedEventId] = useState('');
  const [futureEvents, setFutureEvents] = useState([]);

  // Load initial data
  useEffect(() => {
    loadCitiesAndEvents();
    loadFutureEvents();
  }, []);

  // Reload events when city changes
  useEffect(() => {
    if (selectedCity) {
      loadEventsForCity(selectedCity);
      setTempSelectedEvents([]); // Clear temp selection when city changes
    } else {
      setEvents([]);
    }
  }, [selectedCity]);

  // Calculate audience when filters change
  useEffect(() => {
    const delayedUpdate = setTimeout(() => {
      if (selectedEvents.length > 0) {
        calculateAudience();
      } else {
        setAudienceData({
          total_count: 0,
          blocked_count: 0,
          available_count: 0,
          rfm_ready_count: 0,
          filtered_count: 0,
          needs_rfm_generation: false
        });
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(delayedUpdate);
  }, [selectedEvents, rfmFilters, recentMessageHours]);

  // Calculate message segments when message changes
  useEffect(() => {
    calculateMessageSegments();
  }, [message]);

  const loadCitiesAndEvents = async () => {
    try {
      // Get all cities with accurate event counts (only events with people)
      const { data: citiesResult, error: citiesError } = await supabase.functions.invoke(
        'admin-get-events-for-sms',
        { body: { city_id: 'GET_ALL_CITIES', min_registrations: 1 } }
      );

      if (citiesError) throw citiesError;

      const citiesWithEvents = (citiesResult?.cities || []).map(city => ({
        value: city.city_id,
        label: `${city.city_name} (${city.event_count} events)`
      }));

      // Count events without city via edge function
      const { data: noCityResult, error: noCityError } = await supabase.functions.invoke(
        'admin-get-events-for-sms',
        { body: { city_id: 'COUNT_NO_CITY', min_registrations: 1 } }
      );

      const noCityCount = noCityResult?.count || 0;

      if (noCityError) {
        console.error('Error counting events without city:', noCityError);
      }

      // Add "No City Set" option at the top if there are events without cities
      const allCities = noCityCount > 0
        ? [
            { value: 'NO_CITY', label: `No City Set (${noCityCount} events)` },
            ...citiesWithEvents
          ]
        : citiesWithEvents;

      setCities(allCities);
      console.log('Cities loaded:', allCities.length, 'No city events:', noCityCount);

    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const loadEventsForCity = async (cityId) => {
    try {
      setEvents([]); // Clear events immediately when changing city

      // Use edge function for all queries
      const { data: result, error: eventsError } = await supabase.functions.invoke(
        'admin-get-events-for-sms',
        { body: { city_id: cityId, min_registrations: 1 } }
      );

      if (eventsError) throw eventsError;

      const eventsData = result?.events || [];

      const formattedEvents = eventsData.map(event => ({
        value: event.id,
        label: cityId === 'NO_CITY'
          ? `${event.name} (${event.registration_count || event.people_count} people, ${new Date(event.event_start_datetime).toLocaleDateString()})`
          : `${event.name} (${event.people_count} people, ${new Date(event.event_start_datetime).toLocaleDateString()})`
      }));

      setEvents(formattedEvents);

      // Cache these events by ID for later label lookup
      const newCache = { ...allEventsCache };
      formattedEvents.forEach(event => {
        newCache[event.value] = event.label;
      });
      setAllEventsCache(newCache);

    } catch (error) {
      console.error('Error loading events for city:', error);
      setEvents([]); // Ensure events are cleared on error
    }
  };

  const loadFutureEvents = async () => {
    try {
      // Get upcoming events (future only, enabled)
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, name, event_start_datetime, city:cities(name)')
        .gte('event_start_datetime', new Date().toISOString())
        .or('enabled.is.null,enabled.eq.true')
        .order('event_start_datetime', { ascending: true })
        .limit(100);

      if (eventsError) throw eventsError;

      const formatted = eventsData.map(event => ({
        value: event.id,
        label: `${event.name} - ${new Date(event.event_start_datetime).toLocaleDateString()} ${event.city?.name ? `(${event.city.name})` : ''}`
      }));

      setFutureEvents(formatted);
    } catch (error) {
      console.error('Error loading future events:', error);
      setFutureEvents([]);
    }
  };

  const calculateAudience = async () => {
    if (loading) return;

    setLoading(true);
    setAudienceError(null);
    try {
      const requestBody = {
        city_ids: [], // Don't use city filter, only use selected events
        event_ids: selectedEvents,
        recent_message_hours: recentMessageHours,
        rfm_filters: rfmFilters.enabled ? {
          recency_min: rfmFilters.recency[0],
          recency_max: rfmFilters.recency[1],
          frequency_min: rfmFilters.frequency[0],
          frequency_max: rfmFilters.frequency[1],
          monetary_min: rfmFilters.monetary[0],
          monetary_max: rfmFilters.monetary[1]
        } : null
      };

      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000)
      );
      
      const apiPromise = supabase.functions.invoke('admin-sms-promotion-audience', {
        body: requestBody
      });
      
      const { data, error } = await Promise.race([apiPromise, timeoutPromise]);

      if (error) {
        // Get detailed error response from the Response object
        if (error.context && typeof error.context.text === 'function') {
          try {
            const errorBody = await error.context.text();
            console.error('Edge Function error response:', errorBody);
            try {
              const parsedError = JSON.parse(errorBody);
              if (parsedError.debug) {
                console.error('Edge Function debug info:', parsedError.debug);
              }
            } catch (parseError) {
              console.error('Could not parse JSON error response:', parseError);
            }
          } catch (textError) {
            console.error('Could not read response text:', textError);
          }
        }
        throw error;
      }
      if (!data.success) throw new Error(data.error);

      setAudienceData(data);
      setAudiencePeople(data.people || []);
    } catch (error) {
      console.error('Error calculating audience:', error);
      setAudienceError(error.message || 'Failed to calculate audience');
      setAudienceData({
        total_count: 0,
        blocked_count: 0,
        recent_message_count: 0,
        available_count: 0,
        rfm_ready_count: 0,
        filtered_count: 0,
        needs_rfm_generation: false
      });
    } finally {
      setLoading(false);
    }
  };

  const processRfmBatch = async () => {
    if (rfmProcessing) return;

    setRfmProcessing(true);
    setRfmProgress({ processed: 0, total: 0, progress_percent: 0 }); // Will be updated with actual total

    try {
      // Get ALL person IDs efficiently for RFM processing (not limited to UI sample)
      const idsResponse = await supabase.functions.invoke('admin-sms-get-all-person-ids', {
        body: {
          city_ids: [],
          event_ids: selectedEvents,
          recent_message_hours: recentMessageHours
        }
      });

      if (idsResponse.error) {
        console.error('Person IDs API error:', idsResponse.error);
        throw new Error(`Failed to fetch person IDs: ${idsResponse.error.message}`);
      }

      if (!idsResponse.data || !idsResponse.data.success) {
        throw new Error(idsResponse.data?.error || 'Unknown error from person IDs API');
      }

      const personIds = idsResponse.data.person_ids;
      
      // Update progress with actual total from person IDs response
      setRfmProgress({ processed: 0, total: personIds.length, progress_percent: 0 });
      
      if (personIds.length === 0) {
        throw new Error('No people found in audience to process RFM scores');
      }
      
      console.log(`Starting RFM processing for ${personIds.length} people`);
      console.log(`Person IDs response details:`, {
        total_from_api: idsResponse.data.total_count,
        person_ids_length: personIds.length,
        selected_events: selectedEvents,
        first_few_ids: personIds.slice(0, 5)
      });
      
      // Setup streaming RFM processing
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/admin-sms-rfm-batch-stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ person_ids: personIds })
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorBody = await response.text();
          console.error('RFM Batch Stream error response:', errorBody);
          if (errorBody) {
            try {
              const parsedError = JSON.parse(errorBody);
              errorMessage += ` - ${parsedError.error || parsedError.message || ''}`;
              if (parsedError.debug) {
                console.error('Debug info:', parsedError.debug);
              }
            } catch (parseError) {
              errorMessage += ` - ${errorBody}`;
            }
          }
        } catch (textError) {
          console.error('Could not read error response:', textError);
        }
        throw new Error(errorMessage);
      }

      // Process Server-Sent Events with better error handling
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        // Keep incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (jsonStr) {
                const data = JSON.parse(jsonStr);
                
                if (data.type === 'progress') {
                  setRfmProgress({
                    processed: data.processed,
                    total: data.needed_updates,
                    progress_percent: data.progress_percent,
                    errors: data.errors,
                    status: data.status
                  });
                } else if (data.type === 'complete') {
                  setRfmProgress({
                    processed: data.processed,
                    total: data.needed_updates,
                    completion_rate: data.completion_rate,
                    progress_percent: 100,
                    errors: data.errors,
                    status: 'completed'
                  });
                  
                  // Refresh audience calculation with RFM filters after completion
                  await calculateAudience();
                  break;
                } else if (data.type === 'error') {
                  throw new Error(data.error);
                }
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError, 'Line:', line);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error processing RFM batch:', error);
      setRfmProgress({ error: error.message });
    } finally {
      setRfmProcessing(false);
    }
  };

  const calculateMessageSegments = () => {
    if (!message) {
      setCharacterCount(0);
      setMessageSegments(1);
      return;
    }

    const length = message.length;
    setCharacterCount(length);

    // SMS segment calculation
    // GSM-7 encoding: 160 chars per segment, 153 for multi-part
    // Unicode: 70 chars per segment, 67 for multi-part
    const hasUnicode = /[^\x00-\x7F]/.test(message);
    
    let segments;
    if (hasUnicode) {
      segments = length <= 70 ? 1 : Math.ceil(length / 67);
    } else {
      segments = length <= 160 ? 1 : Math.ceil(length / 153);
    }
    
    setMessageSegments(segments);
  };

  const createCampaign = async () => {
    if (!campaignName || !message || audienceData.filtered_count === 0) {
      return;
    }

    setSending(true);
    setCampaignResult(null);

    try {
      // Get final audience with all filters applied
      // Use ids_only=true to fetch ALL person IDs (not just 10k sample)
      const audienceResponse = await supabase.functions.invoke('admin-sms-promotion-audience', {
        body: {
          city_ids: [],
          event_ids: selectedEvents,
          ids_only: true, // Critical: fetch all IDs for campaign, not just sample
          rfm_filters: rfmFilters.enabled ? {
            recency_min: rfmFilters.recency[0],
            recency_max: rfmFilters.recency[1],
            frequency_min: rfmFilters.frequency[0],
            frequency_max: rfmFilters.frequency[1],
            monetary_min: rfmFilters.monetary[0],
            monetary_max: rfmFilters.monetary[1]
          } : null
        }
      });

      if (!audienceResponse.data.success) {
        throw new Error(audienceResponse.data.error);
      }

      const finalAudience = audienceResponse.data.people.filter(p => !p.blocked);

      console.log('Campaign creation:', {
        total_from_api: audienceResponse.data.total_count,
        people_returned: audienceResponse.data.people.length,
        final_audience_size: finalAudience.length
      });
      
      // Create campaign
      const { data, error } = await supabase.functions.invoke('admin-sms-create-campaign', {
        body: {
          campaign_name: campaignName,
          message: message,
          person_ids: finalAudience.map(p => p.id),
          event_id: associatedEventId || null,
          targeting_criteria: {
            cities: [],
            events: selectedEvents,
            rfm_filters: rfmFilters.enabled ? rfmFilters : null
          },
          estimated_segments: messageSegments
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setCampaignResult(data);

      // Reset form
      setCampaignName('');
      setMessage('');
      setAssociatedEventId('');
      
    } catch (error) {
      console.error('Error creating campaign:', error);
      setCampaignResult({ error: error.message });
    } finally {
      setSending(false);
    }
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(num);
  const formatCurrency = (cents) => new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(cents / 100);

  return (
    <>
      <Flex direction="column" gap="6" p="6">
        <Heading size="8">SMS Marketing</Heading>
      
      {/* Audience Targeting Section */}
      <Card>
        <Flex direction="column" gap="4">
          <Heading size="6">Audience Targeting</Heading>
          
          {/* City Selection */}
          <Box>
            <Text size="3" weight="bold" mb="2">City (to load events)</Text>
            <Select.Root
              value={selectedCity}
              onValueChange={(value) => {
                setSelectedCity(value);
                setSelectedEventForAdd('');
              }}
            >
              <Select.Trigger placeholder="Select a city..." />
              <Select.Content>
                {cities.map(city => (
                  <Select.Item key={city.value} value={city.value}>
                    {city.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>

          {/* Event Multi-Selection */}
          {selectedCity && events.length > 0 && (
            <Box>
              <Flex justify="between" align="center" mb="2">
                <Text size="3" weight="bold">Select Events from {cities.find(c => c.value === selectedCity)?.label}</Text>
                <Flex gap="2">
                  <Button
                    size="1"
                    variant="soft"
                    onClick={() => setTempSelectedEvents(events.map(e => e.value))}
                  >
                    Select All
                  </Button>
                  <Button
                    size="1"
                    variant="soft"
                    color="gray"
                    onClick={() => setTempSelectedEvents([])}
                  >
                    Clear All
                  </Button>
                </Flex>
              </Flex>
              <Card variant="surface">
                <ScrollArea style={{ maxHeight: '300px' }}>
                  <Flex direction="column" gap="2" p="2">
                    {events.map(event => (
                      <Flex key={event.value} align="center" gap="2" style={{ padding: '4px' }}>
                        <Checkbox
                          checked={tempSelectedEvents.includes(event.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setTempSelectedEvents([...tempSelectedEvents, event.value]);
                            } else {
                              setTempSelectedEvents(tempSelectedEvents.filter(id => id !== event.value));
                            }
                          }}
                        />
                        <Text size="2" style={{ cursor: 'pointer' }} onClick={() => {
                          if (tempSelectedEvents.includes(event.value)) {
                            setTempSelectedEvents(tempSelectedEvents.filter(id => id !== event.value));
                          } else {
                            setTempSelectedEvents([...tempSelectedEvents, event.value]);
                          }
                        }}>
                          {event.label}
                        </Text>
                      </Flex>
                    ))}
                  </Flex>
                </ScrollArea>
              </Card>
              <Flex justify="end" mt="2">
                <Button
                  onClick={() => {
                    // Add temp selected events to main list (avoiding duplicates)
                    const newEvents = tempSelectedEvents.filter(id => !selectedEvents.includes(id));
                    setSelectedEvents([...selectedEvents, ...newEvents]);
                    setTempSelectedEvents([]);
                    setSelectedCity(''); // Clear city selection
                  }}
                  disabled={tempSelectedEvents.length === 0}
                >
                  Done - Add {tempSelectedEvents.length} Event{tempSelectedEvents.length !== 1 ? 's' : ''}
                </Button>
              </Flex>
            </Box>
          )}

          {/* Selected Events as Tags */}
          {selectedEvents.length > 0 && (
            <Box>
              <Text size="3" weight="bold" mb="2">Selected Events ({selectedEvents.length})</Text>
              <Flex gap="2" wrap="wrap">
                {selectedEvents.map(eventId => {
                  // Try cache first, then current events list
                  const label = allEventsCache[eventId] || events.find(e => e.value === eventId)?.label || eventId.substring(0, 8) + '...';
                  return (
                    <Badge
                      key={eventId}
                      size="2"
                      color="blue"
                      style={{ cursor: 'pointer', paddingRight: '8px' }}
                    >
                      <Flex align="center" gap="1">
                        <Text>{label}</Text>
                        <Text
                          style={{ cursor: 'pointer', fontWeight: 'bold', marginLeft: '4px' }}
                          onClick={() => setSelectedEvents(selectedEvents.filter(id => id !== eventId))}
                        >
                          ×
                        </Text>
                      </Flex>
                    </Badge>
                  );
                })}
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={() => setSelectedEvents([])}
                >
                  Clear All
                </Button>
              </Flex>
            </Box>
          )}

          {/* Recent Message Filter */}
          <Box>
            <Text size="3" weight="bold" mb="2">Anti-Spam Filter</Text>
            <Flex align="center" gap="3">
              <Text size="2">Exclude people who received messages in the last</Text>
              <TextField.Root 
                type="number"
                value={recentMessageHours}
                onChange={(e) => setRecentMessageHours(Number(e.target.value))}
                style={{ width: '80px' }}
                min="1"
                max="720"
              />
              <Text size="2">hours (default: 72h / 3 days)</Text>
            </Flex>
          </Box>

          {/* Audience Summary */}
          {audienceError && (
            <Callout.Root color="red" style={{ marginBottom: '1rem' }}>
              <Callout.Icon>
                <CrossCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                {audienceError}
              </Callout.Text>
            </Callout.Root>
          )}

          <Card variant="surface">
            <Flex align="center" gap="2" wrap="wrap">
              <Text size="2" weight="bold">Audience:</Text>
              <Badge color="blue">{formatNumber(audienceData.total_count)} total</Badge>
              <Badge color="red">{formatNumber(audienceData.blocked_count)} blocked</Badge>
              <Badge color="orange">{formatNumber(audienceData.recent_message_count)} recent msgs</Badge>
              <Badge color="green">{formatNumber(audienceData.available_count)} available</Badge>
              {loading && <ReloadIcon className="animate-spin" />}
              <Button size="1" variant="soft" onClick={calculateAudience} disabled={loading}>
                <ReloadIcon />
                Refresh
              </Button>
              {audienceData.total_count > 0 && (
                <Button
                  size="1"
                  variant="soft"
                  color="blue"
                  onClick={() => setShowAudienceModal(true)}
                >
                  <PersonIcon />
                  View People ({formatNumber(audienceData.total_count)})
                </Button>
              )}
            </Flex>
          </Card>
        </Flex>
      </Card>

      {/* RFM Filtering Section */}
      <Card>
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between">
            <Heading size="6">RFM Score Filtering</Heading>
            <Flex align="center" gap="2">
              <input 
                type="checkbox" 
                checked={rfmFilters.enabled}
                onChange={(e) => setRfmFilters(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              <Text size="2">Enable RFM filtering</Text>
            </Flex>
          </Flex>

          {rfmFilters.enabled && (
            <>
              {/* Recency Slider */}
              <Box>
                <Flex align="center" justify="between" mb="2">
                  <Text size="3" weight="bold">Recency</Text>
                  <Text size="2">
                    {rfmFilters.recency[0]} - {rfmFilters.recency[1]}
                  </Text>
                </Flex>
                <Slider 
                  value={rfmFilters.recency}
                  onValueChange={(value) => setRfmFilters(prev => ({ ...prev, recency: value }))}
                  min={1}
                  max={5}
                  step={1}
                />
              </Box>

              {/* Frequency Slider */}
              <Box>
                <Flex align="center" justify="between" mb="2">
                  <Text size="3" weight="bold">Frequency</Text>
                  <Text size="2">
                    {rfmFilters.frequency[0]} - {rfmFilters.frequency[1]}
                  </Text>
                </Flex>
                <Slider 
                  value={rfmFilters.frequency}
                  onValueChange={(value) => setRfmFilters(prev => ({ ...prev, frequency: value }))}
                  min={1}
                  max={5}
                  step={1}
                />
              </Box>

              {/* Monetary Slider */}
              <Box>
                <Flex align="center" justify="between" mb="2">
                  <Text size="3" weight="bold">Monetary</Text>
                  <Text size="2">
                    {rfmFilters.monetary[0]} - {rfmFilters.monetary[1]}
                  </Text>
                </Flex>
                <Slider 
                  value={rfmFilters.monetary}
                  onValueChange={(value) => setRfmFilters(prev => ({ ...prev, monetary: value }))}
                  min={1}
                  max={5}
                  step={1}
                />
              </Box>

              {/* RFM Processing */}
              {audienceData.needs_rfm_generation && (
                <Card variant="surface">
                  <Flex direction="column" gap="2">
                    <Text size="2" weight="bold">RFM scores needed for filtering</Text>
                    <Button 
                      onClick={processRfmBatch} 
                      disabled={rfmProcessing}
                      size="2"
                    >
                      {rfmProcessing ? (
                        <><ReloadIcon className="animate-spin" /> Processing RFM...</>
                      ) : (
                        <>Generate RFM for {formatNumber(audienceData.available_count)} people</>
                      )}
                    </Button>
                    
                    {rfmProgress && (
                      <Box>
                        <Text size="2" weight="bold" mb="2">RFM Generation Progress:</Text>
                        {rfmProgress.error ? (
                          <Text size="2" color="red">{rfmProgress.error}</Text>
                        ) : (
                          <>
                            <Box mb="2">
                              <Flex justify="between" mb="1">
                                <Text size="2">
                                  Processed: {rfmProgress.processed} / {rfmProgress.total}
                                </Text>
                                <Text size="2" color="blue">
                                  {rfmProgress.progress_percent || 0}%
                                </Text>
                              </Flex>
                              {/* Progress Bar */}
                              <Box style={{ 
                                height: '8px', 
                                backgroundColor: '#e0e0e0', 
                                borderRadius: '4px',
                                overflow: 'hidden'
                              }}>
                                <Box style={{
                                  height: '100%',
                                  backgroundColor: '#2563eb',
                                  width: `${rfmProgress.progress_percent || 0}%`,
                                  transition: 'width 0.3s ease-in-out'
                                }} />
                              </Box>
                            </Box>
                            
                            {rfmProgress.status && (
                              <Text size="2" color="blue" mb="1">
                                Status: {rfmProgress.status}
                              </Text>
                            )}
                            
                            {rfmProgress.completion_rate && (
                              <Text size="2" color="green" mb="1">
                                Completion Rate: {rfmProgress.completion_rate}%
                              </Text>
                            )}
                            
                            {rfmProgress.errors > 0 && (
                              <Text size="2" color="orange">Errors: {rfmProgress.errors}</Text>
                            )}
                          </>
                        )}
                      </Box>
                    )}
                  </Flex>
                </Card>
              )}

              {/* RFM Filtered Results */}
              {rfmFilters.enabled && (
                <Card variant="surface">
                  <Flex align="center" gap="2">
                    <Text size="2" weight="bold">RFM Filtered:</Text>
                    <Badge color="purple">{formatNumber(audienceData.filtered_count)} people</Badge>
                    <Badge color="blue">{formatNumber(audienceData.rfm_ready_count)} with RFM scores</Badge>
                  </Flex>
                </Card>
              )}
            </>
          )}
        </Flex>
      </Card>

      {/* Message Composition Section */}
      <Card>
        <Flex direction="column" gap="4">
          <Heading size="6">Message Composition</Heading>
          
          <Box>
            <Text size="3" weight="bold" mb="2">Campaign Name</Text>
            <TextField.Root
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Enter campaign name..."
            />
          </Box>

          <Box>
            <Text size="3" weight="bold" mb="2">Associated Event (for tracking)</Text>
            <Select.Root
              value={associatedEventId}
              onValueChange={setAssociatedEventId}
            >
              <Select.Trigger placeholder="Select an upcoming event..." />
              <Select.Content>
                {futureEvents.map(event => (
                  <Select.Item key={event.value} value={event.value}>
                    {event.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <Text size="1" color="gray" mt="1">
              This allows you to lookup messages later by event
            </Text>
          </Box>

          <Box>
            <Flex align="center" justify="between" mb="2">
              <Text size="3" weight="bold">Message</Text>
              <Flex align="center" gap="2">
                <Text size="2">{characterCount} chars</Text>
                <Badge color={messageSegments > 1 ? 'orange' : 'green'}>
                  {messageSegments} segment{messageSegments !== 1 ? 's' : ''}
                </Badge>
              </Flex>
            </Flex>
            <TextArea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={4}
            />
          </Box>

          {/* From Number Display */}
          <Card variant="surface">
            <Flex align="center" gap="2">
              <Text size="2" weight="bold">From:</Text>
              <Badge color="blue">+1-877-278-1022</Badge>
              <Text size="2">Rate limit: 500 messages/minute</Text>
            </Flex>
          </Card>

          {/* Cost Estimate */}
          {audienceData.filtered_count > 0 && messageSegments > 0 && (
            <Card variant="surface">
              <Flex align="center" gap="2">
                <Text size="2" weight="bold">Estimated Cost:</Text>
                <Badge color="green">
                  {formatCurrency(audienceData.filtered_count * messageSegments)}
                </Badge>
                <Text size="2">
                  ({formatNumber(audienceData.filtered_count)} recipients × {messageSegments} segments)
                </Text>
              </Flex>
            </Card>
          )}
        </Flex>
      </Card>

      {/* Send Campaign Section */}
      <Card>
        <Flex direction="column" gap="4">
          <Heading size="6">Send Campaign</Heading>
          
          <Button 
            size="3"
            onClick={createCampaign}
            disabled={!campaignName || !message || audienceData.filtered_count === 0 || sending}
          >
            {sending ? (
              <><ReloadIcon className="animate-spin" /> Creating Campaign...</>
            ) : (
              <><PaperPlaneIcon /> Send to {formatNumber(audienceData.filtered_count)} people</>
            )}
          </Button>

          {/* Campaign Result */}
          {campaignResult && (
            <Callout.Root color={campaignResult.error ? 'red' : 'green'}>
              <Callout.Icon>
                {campaignResult.error ? <CrossCircledIcon /> : <CheckCircledIcon />}
              </Callout.Icon>
              <Callout.Text>
                {campaignResult.error ? (
                  `Error: ${campaignResult.error}`
                ) : (
                  `Campaign "${campaignResult.campaign_name}" created successfully! 
                   ${formatNumber(campaignResult.messages_queued)} messages queued. 
                   Estimated cost: ${formatCurrency(campaignResult.estimated_cost_cents)}`
                )}
              </Callout.Text>
            </Callout.Root>
          )}
        </Flex>
      </Card>
    </Flex>

    {/* Audience List Modal */}
    <Dialog.Root open={showAudienceModal} onOpenChange={(open) => {
      setShowAudienceModal(open);
      if (!open) setAudienceSearchFilter(''); // Clear search when closing
    }}>
      <Dialog.Content style={{ maxWidth: '600px', maxHeight: '80vh' }}>
        <Flex direction="column" style={{ height: '100%' }}>
          <Flex justify="between" align="center" mb="4">
            <Dialog.Title>
              <Heading size="5">Audience Members ({audiencePeople.length})</Heading>
            </Dialog.Title>
            <Dialog.Close>
              <Button variant="ghost" size="1">
                <Cross2Icon />
              </Button>
            </Dialog.Close>
          </Flex>

          {/* Search Filter */}
          <Box mb="3">
            <TextField.Root
              placeholder="Search by name or phone..."
              value={audienceSearchFilter}
              onChange={(e) => setAudienceSearchFilter(e.target.value)}
            />
          </Box>

          <Flex gap="2" mb="3">
            <Badge color="green">
              {formatNumber(audiencePeople.filter(p => !p.blocked).length)} available
            </Badge>
            <Badge color="red">
              {formatNumber(audiencePeople.filter(p => p.blocked).length)} blocked
            </Badge>
          </Flex>

          <Separator mb="3" />

          <ScrollArea style={{ flex: 1 }}>
            <Flex direction="column" gap="2">
              {audiencePeople
                .filter(person => {
                  if (!audienceSearchFilter) return true;
                  const search = audienceSearchFilter.toLowerCase();
                  const name = (person.name || '').toLowerCase();
                  const phone = (person.phone || '').toLowerCase();
                  return name.includes(search) || phone.includes(search);
                })
                .sort((a, b) => {
                  // Sort: non-blocked first, then alphabetically by name
                  if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
                  return (a.name || '').localeCompare(b.name || '');
                })
                .map((person, index) => (
                  <Card
                    key={person.id}
                    variant="surface"
                    style={{
                      padding: '12px',
                      backgroundColor: person.blocked ? 'var(--red-2)' : 'var(--gray-2)',
                      opacity: person.blocked ? 0.6 : 1
                    }}
                  >
                    <Flex align="center" gap="3">
                      <PersonIcon color={person.blocked ? 'var(--red-9)' : 'var(--blue-9)'} />
                      <Box style={{ flex: 1 }}>
                        <Text
                          size="3"
                          weight="medium"
                          style={{
                            textDecoration: person.blocked ? 'line-through' : 'none',
                            color: person.blocked ? 'var(--red-11)' : 'inherit'
                          }}
                        >
                          {person.name || 'Unknown'}
                        </Text>
                        <Text
                          size="2"
                          color="gray"
                          style={{
                            display: 'block',
                            textDecoration: person.blocked ? 'line-through' : 'none'
                          }}
                        >
                          {person.phone || 'No phone'}
                        </Text>
                      </Box>
                      {person.blocked && (
                        <Badge color="red" size="1">
                          BLOCKED
                        </Badge>
                      )}
                    </Flex>
                  </Card>
                ))}
            </Flex>
          </ScrollArea>

          <Separator mt="3" mb="3" />

          <Flex justify="end">
            <Dialog.Close>
              <Button>Close</Button>
            </Dialog.Close>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  </>
  );
};

export default PromotionSystem;