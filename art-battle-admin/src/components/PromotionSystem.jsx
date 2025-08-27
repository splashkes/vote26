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
  Callout
} from '@radix-ui/themes';
import { 
  InfoCircledIcon, 
  ReloadIcon, 
  CheckCircledIcon, 
  CrossCircledIcon,
  PaperPlaneIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const PromotionSystem = () => {
  const { user } = useAuth();
  
  // Audience targeting state
  const [selectedCities, setSelectedCities] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  
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

  // Load initial data
  useEffect(() => {
    loadCitiesAndEvents();
  }, []);

  // Calculate audience when filters change
  useEffect(() => {
    const delayedUpdate = setTimeout(() => {
      if (selectedCities.length > 0 || selectedEvents.length > 0) {
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
  }, [selectedCities, selectedEvents, rfmFilters, recentMessageHours]);

  // Calculate message segments when message changes
  useEffect(() => {
    calculateMessageSegments();
  }, [message]);

  const loadCitiesAndEvents = async () => {
    try {
      // Get cities with event counts (only cities that have events)
      const { data: citiesData, error: citiesError } = await supabase
        .from('cities')
        .select(`
          id,
          name,
          events!fk_events_city(id)
        `)
        .not('events', 'is', null);

      if (citiesError) throw citiesError;

      // Filter and sort cities by those that actually have events
      const citiesWithEvents = citiesData
        .filter(city => city.events && city.events.length > 0)
        .sort((a, b) => b.events.length - a.events.length) // Sort by event count, desc
        .map(city => ({
          value: city.id,
          label: `${city.name} (${city.events.length} events)`
        }));

      setCities(citiesWithEvents);

      // Get recent events with their city names
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          id, 
          name, 
          event_start_datetime,
          cities!fk_events_city(name)
        `)
        .order('event_start_datetime', { ascending: false })
        .limit(50);

      if (eventsError) throw eventsError;

      setEvents(eventsData.map(event => ({
        value: event.id,
        label: `${event.name} - ${event.cities?.name || 'Unknown City'} (${new Date(event.event_start_datetime).toLocaleDateString()})`
      })));

    } catch (error) {
      console.error('Error loading cities and events:', error);
    }
  };

  const calculateAudience = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      const requestBody = {
        city_ids: selectedCities,
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

      const { data, error } = await supabase.functions.invoke('admin-sms-promotion-audience', {
        body: requestBody
      });

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
    } catch (error) {
      console.error('Error calculating audience:', error);
    } finally {
      setLoading(false);
    }
  };

  const processRfmBatch = async () => {
    if (rfmProcessing) return;

    setRfmProcessing(true);
    setRfmProgress({ processed: 0, total: audienceData.available_count, progress_percent: 0 });

    try {
      // Get current audience person IDs
      const audienceResponse = await supabase.functions.invoke('admin-sms-promotion-audience', {
        body: {
          city_ids: selectedCities,
          event_ids: selectedEvents,
          rfm_filters: null // Get all people first
        }
      });

      if (!audienceResponse.data.success) {
        throw new Error(audienceResponse.data.error);
      }

      const personIds = audienceResponse.data.people.map(p => p.id);
      
      if (personIds.length === 0) {
        throw new Error('No people found in audience to process RFM scores');
      }
      
      console.log(`Starting RFM processing for ${personIds.length} people`);
      
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

      // Process Server-Sent Events
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
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
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError);
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
      const audienceResponse = await supabase.functions.invoke('admin-sms-promotion-audience', {
        body: {
          city_ids: selectedCities,
          event_ids: selectedEvents,
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
      
      // Create campaign
      const { data, error } = await supabase.functions.invoke('admin-sms-create-campaign', {
        body: {
          campaign_name: campaignName,
          message: message,
          person_ids: finalAudience.map(p => p.id),
          targeting_criteria: {
            cities: selectedCities,
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
    <Flex direction="column" gap="6" p="6">
      <Heading size="8">SMS Marketing</Heading>
      
      {/* Audience Targeting Section */}
      <Card>
        <Flex direction="column" gap="4">
          <Heading size="6">Audience Targeting</Heading>
          
          {/* City Selection */}
          <Box>
            <Text size="3" weight="bold" mb="2">Cities</Text>
            <Select.Root 
              value={selectedCities[0] || ''} 
              onValueChange={(value) => setSelectedCities(value ? [value] : [])}
            >
              <Select.Trigger placeholder="Select cities..." />
              <Select.Content>
                {cities.map(city => (
                  <Select.Item key={city.value} value={city.value}>
                    {city.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>

          {/* Event Selection */}
          <Box>
            <Text size="3" weight="bold" mb="2">Events</Text>
            <Select.Root 
              value={selectedEvents[0] || ''} 
              onValueChange={(value) => setSelectedEvents(value ? [value] : [])}
            >
              <Select.Trigger placeholder="Select events..." />
              <Select.Content>
                {events.map(event => (
                  <Select.Item key={event.value} value={event.value}>
                    {event.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>

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
          <Card variant="surface">
            <Flex align="center" gap="2">
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
  );
};

export default PromotionSystem;