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
  ScrollArea,
  Spinner
} from '@radix-ui/themes';
import {
  InfoCircledIcon,
  ReloadIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  PaperPlaneIcon,
  PersonIcon,
  Cross2Icon,
  CalendarIcon
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

  // Scheduling state
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleTimezone, setScheduleTimezone] = useState('America/Toronto'); // Default to Toronto
  const [dryRunMode, setDryRunMode] = useState(false);

  // Scheduled campaigns
  const [scheduledCampaigns, setScheduledCampaigns] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);

  // Modal state
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [audiencePeople, setAudiencePeople] = useState([]);
  const [audienceSearchFilter, setAudienceSearchFilter] = useState('');

  // Telnyx balance state
  const [telnyxBalance, setTelnyxBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState(null);

  // Temporary event selection state
  const [tempSelectedEvents, setTempSelectedEvents] = useState([]);
  const [eventSearchFilter, setEventSearchFilter] = useState('');

  // Event association state (for tracking which event this campaign is for)
  const [associatedEventId, setAssociatedEventId] = useState('');
  const [futureEvents, setFutureEvents] = useState([]);

  // Campaign details modal state
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);
  const [selectedCampaignForDetails, setSelectedCampaignForDetails] = useState(null);

  // Load initial data
  useEffect(() => {
    loadCitiesAndEvents();
    loadFutureEvents();
    loadScheduledCampaigns();
    loadTelnyxBalance();
  }, []);

  // Reload events when city changes
  useEffect(() => {
    if (selectedCity) {
      loadEventsForCity(selectedCity);
      setTempSelectedEvents([]); // Clear temp selection when city changes
      setEventSearchFilter(''); // Clear search filter when city changes
    } else {
      setEvents([]);
      setEventSearchFilter(''); // Clear search filter when no city
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

  // Subscribe to realtime campaign progress updates for active campaigns
  useEffect(() => {
    const activeCampaigns = scheduledCampaigns.filter(c =>
      c.status === 'in_progress' || c.status === 'queued'
    );

    if (activeCampaigns.length === 0) return;

    const channel = supabase
      .channel('active-campaigns')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sms_marketing_campaigns'
        },
        (payload) => {
          const updated = payload.new;

          // Update the campaign in the list
          setScheduledCampaigns(prev =>
            prev.map(campaign =>
              campaign.id === updated.id
                ? { ...campaign, ...updated }
                : campaign
            )
          );
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduledCampaigns.length > 0]);

  const loadTelnyxBalance = async () => {
    try {
      setBalanceLoading(true);
      setBalanceError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-telnyx-get-balance',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch balance');
      }

      setTelnyxBalance(result.balance);
    } catch (error) {
      console.error('Error loading Telnyx balance:', error);
      setBalanceError(error.message);
    } finally {
      setBalanceLoading(false);
    }
  };

  const loadCitiesAndEvents = async () => {
    try {
      // Get all cities with event counts (ALL events, not filtered)
      const { data: citiesResult, error: citiesError } = await supabase.functions.invoke(
        'admin-get-events-for-sms',
        { body: { city_id: 'GET_ALL_CITIES' } }
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
        { body: { city_id: cityId, min_registrations: cityId === 'NO_CITY' ? 1 : undefined } }
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

  const loadScheduledCampaigns = async () => {
    setLoadingScheduled(true);
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      console.log('Loading scheduled campaigns, cutoff time:', twentyFourHoursAgo);

      // Fetch scheduled/draft campaigns (all of them)
      const { data: scheduledData, error: scheduledError } = await supabase
        .from('sms_marketing_campaigns')
        .select('*, events(name, event_start_datetime)')
        .in('status', ['draft', 'scheduled', 'queued', 'in_progress'])
        .order('created_at', { ascending: false });

      if (scheduledError) throw scheduledError;

      // Fetch recently completed campaigns (last 24 hours)
      const { data: completedData, error: completedError } = await supabase
        .from('sms_marketing_campaigns')
        .select('*, events(name, event_start_datetime)')
        .eq('status', 'completed')
        .gte('completed_at', twentyFourHoursAgo)
        .order('completed_at', { ascending: false });

      if (completedError) throw completedError;

      // Combine and sort by created_at
      const combined = [...(scheduledData || []), ...(completedData || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setScheduledCampaigns(combined);
    } catch (error) {
      console.error('Error loading scheduled campaigns:', error);
      setScheduledCampaigns([]);
    } finally {
      setLoadingScheduled(false);
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

      if (personIds.length === 0) {
        throw new Error('No people found in audience to process RFM scores');
      }

      // Initial progress - checking cache first
      console.log(`Starting RFM processing for ${personIds.length} people`);
      setRfmProgress({
        processed: 0,
        total: 0, // Will be updated with needed_updates from edge function
        progress_percent: 0,
        status: 'Checking existing RFM scores...',
        totalPeople: personIds.length
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
                  console.log('RFM Progress received:', {
                    needed_updates: data.needed_updates,
                    total_requested: data.total_requested,
                    processed: data.processed,
                    prev_total: rfmProgress?.total
                  });
                  setRfmProgress(prev => ({
                    processed: data.processed,
                    total: data.needed_updates !== undefined ? data.needed_updates : prev.total,
                    progress_percent: data.progress_percent,
                    errors: data.errors,
                    status: data.status,
                    totalPeople: prev.totalPeople // Preserve original total
                  }));
                } else if (data.type === 'complete') {
                  setRfmProgress(prev => ({
                    processed: data.processed,
                    total: data.needed_updates || prev.total,
                    completion_rate: data.completion_rate,
                    progress_percent: 100,
                    errors: data.errors,
                    status: 'completed',
                    totalPeople: prev.totalPeople // Preserve original total
                  }));
                  
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
      // Preserve progress info if we have it
      setRfmProgress(prev => {
        if (prev && prev.processed > 0) {
          return {
            ...prev,
            error: `Processing stopped: ${error.message}`,
            status: 'stopped'
          };
        }
        return { error: error.message };
      });
    } finally {
      setRfmProcessing(false);
      // After processing stops, refresh audience to update the counts
      if (rfmProgress && rfmProgress.processed > 0) {
        await calculateAudience();
      }
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
          recent_message_hours: recentMessageHours, // Add this to match the normal audience call
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

      // Convert scheduled datetime from local timezone to UTC if provided
      let scheduledAtUTC = null;
      if (scheduledAt) {
        // Parse the input: "2024-11-14T22:55"
        const [year, month, day, hour, minute] = scheduledAt.split(/[T:-]/).map(Number);

        // Strategy: Find the UTC timestamp that, when displayed in the target timezone,
        // shows our desired local time. We'll use a binary search.

        // Create initial guess - treat input as UTC
        const initialGuess = Date.UTC(year, month - 1, day, hour, minute, 0);

        // Binary search range: +/- 15 hours from initial guess (covers all timezones)
        let low = initialGuess - 15 * 60 * 60 * 1000;
        let high = initialGuess + 15 * 60 * 60 * 1000;

        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: scheduleTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        // Binary search for the correct UTC time
        while (high - low > 60000) { // Stop when we're within 1 minute
          const mid = Math.floor((low + high) / 2);
          const midDate = new Date(mid);
          const formatted = formatter.format(midDate);

          // Parse formatted string: "MM/DD/YYYY, HH:MM"
          const [datePart, timePart] = formatted.split(', ');
          const [fMonth, fDay, fYear] = datePart.split('/').map(Number);
          const [fHour, fMinute] = timePart.split(':').map(Number);

          // Compare with our target
          if (fYear < year ||
              (fYear === year && fMonth < month) ||
              (fYear === year && fMonth === month && fDay < day) ||
              (fYear === year && fMonth === month && fDay === day && fHour < hour) ||
              (fYear === year && fMonth === month && fDay === day && fHour === hour && fMinute < minute)) {
            low = mid;
          } else {
            high = mid;
          }
        }

        // Use the midpoint of our final range
        const finalUTC = Math.floor((low + high) / 2);
        scheduledAtUTC = new Date(finalUTC).toISOString();

        // Verify our conversion
        const verification = formatter.format(new Date(finalUTC));

        console.log('Timezone conversion:', {
          input: scheduledAt,
          timezone: scheduleTimezone,
          utc_result: scheduledAtUTC,
          verification: `Should show as ${month}/${day}/${year}, ${hour}:${minute.toString().padStart(2, '0')} -> Got: ${verification}`
        });
      }

      console.log('Campaign creation:', {
        total_from_api: audienceResponse.data.total_count,
        people_returned: audienceResponse.data.people.length,
        final_audience_size: finalAudience.length,
        final_audience_ids: finalAudience.slice(0, 5).map(p => p.id),
        dry_run: dryRunMode,
        scheduled_at_local: scheduledAt || 'immediate',
        scheduled_at_utc: scheduledAtUTC || 'immediate',
        timezone: scheduleTimezone
      });

      // Check if we have valid recipients
      if (finalAudience.length === 0) {
        throw new Error('No valid recipients found after filtering blocked users');
      }

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Session check:', { hasSession: !!session, token: session?.access_token ? 'present' : 'missing' });

      if (!session) {
        throw new Error('Not authenticated - no session found');
      }

      console.log('Calling edge function with token:', session.access_token.substring(0, 30) + '...');

      // Extract person IDs
      const personIds = finalAudience.map(p => p.id).filter(id => id != null);

      console.log('Person IDs extraction:', {
        final_audience_length: finalAudience.length,
        person_ids_length: personIds.length,
        sample_ids: personIds.slice(0, 5)
      });

      if (personIds.length === 0) {
        throw new Error('Failed to extract person IDs from audience data');
      }

      // Call edge function directly for better error handling
      const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-create-campaign', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaign_name: campaignName,
          message: message,
          person_ids: personIds,
          event_id: associatedEventId || null,
          targeting_criteria: {
            cities: [],
            events: selectedEvents,
            rfm_filters: rfmFilters.enabled ? rfmFilters : null
          },
          estimated_segments: messageSegments,
          scheduled_at: scheduledAtUTC,
          scheduled_timezone: scheduleTimezone,
          scheduled_local_time: scheduledAt,
          dry_run_mode: dryRunMode,
          dry_run_phone: dryRunMode ? '+14163025959' : null,
          recent_message_hours: recentMessageHours // Pass anti-spam filter value
        })
      });

      const data = await response.json();
      console.log('Edge function response:', data);

      if (!response.ok) {
        console.log('Edge function error response:', data);
        if (data.headers_received) {
          console.log('Headers received by edge function:', data.headers_received);
        }
        if (data.auth_error) {
          console.log('Authentication error:', data.auth_error);
        }
        if (data.details) {
          console.log('Error details:', data.details);
        }
        if (data.person_ids_count !== undefined) {
          console.log('Person IDs count:', data.person_ids_count);
          console.log('Person IDs sample:', data.person_ids_sample);
        }
        throw new Error(data.error || 'Failed to create campaign');
      }

      if (!data.success) throw new Error(data.error);

      setCampaignResult(data);

      // Reload campaigns list to show the new campaign
      loadScheduledCampaigns();

      // Reset form
      setCampaignName('');
      setMessage('');
      setAssociatedEventId('');
      setScheduledAt('');
      setDryRunMode(false);

      // Reload scheduled campaigns if this was scheduled
      if (scheduledAt) {
        loadScheduledCampaigns();
      }

    } catch (error) {
      console.error('Error creating campaign:', error);

      // Try to extract debug info from edge function response
      if (error.context) {
        try {
          const responseText = await error.context.text();
          console.log('Raw edge function response:', responseText);
          const parsed = JSON.parse(responseText);

          if (parsed.debug) {
            console.log('Edge function debug info:', parsed.debug);
          }

          setCampaignResult({ error: parsed.error || error.message, debug: parsed.debug });
        } catch (e) {
          console.log('Could not parse error response:', e);
          setCampaignResult({ error: error.message });
        }
      } else {
        setCampaignResult({ error: error.message });
      }
    } finally {
      setSending(false);
    }
  };

  const loadCampaignForEdit = (campaign) => {
    setEditingCampaign(campaign);
    setCampaignName(campaign.name);
    setMessage(campaign.metadata?.message_template || '');
    setAssociatedEventId(campaign.event_id || '');
    setScheduledAt(campaign.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : '');

    // Load targeting criteria if available
    if (campaign.targeting_criteria?.events) {
      setSelectedEvents(campaign.targeting_criteria.events);
    }
    if (campaign.targeting_criteria?.rfm_filters) {
      setRfmFilters({
        enabled: true,
        ...campaign.targeting_criteria.rfm_filters
      });
    }

    // Scroll to form
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const deleteCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this scheduled campaign?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('sms_marketing_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      loadScheduledCampaigns();
      setCampaignResult({ success: true, message: 'Campaign deleted successfully' });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      setCampaignResult({ error: error.message });
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
        <Flex justify="between" align="center">
          <Heading size="8">SMS Marketing</Heading>
          <Flex align="center" gap="2">
            {balanceLoading ? (
              <Flex align="center" gap="2">
                <Spinner size="1" />
                <Text size="2" color="gray">Loading balance...</Text>
              </Flex>
            ) : balanceError ? (
              <Text size="2" color="red">Error loading balance</Text>
            ) : telnyxBalance ? (
              <Flex direction="column" align="end">
                <Text size="1" color="gray">Telnyx Balance</Text>
                <Text size="4" weight="bold" color="green">
                  ${parseFloat(telnyxBalance.balance).toFixed(2)} {telnyxBalance.currency}
                </Text>
              </Flex>
            ) : null}
          </Flex>
        </Flex>

      {/* Scheduled Campaigns Section */}
      <Card>
        <Flex direction="column" gap="4">
          <Flex justify="between" align="center">
            <Box>
              <Heading size="6">Scheduled & Recent Campaigns</Heading>
              <Text size="1" color="gray">Upcoming scheduled, completed, and failed in last 24 hours</Text>
            </Box>
            <Button size="1" variant="soft" onClick={loadScheduledCampaigns} disabled={loadingScheduled}>
              <ReloadIcon />
              Refresh
            </Button>
          </Flex>

          {loadingScheduled ? (
            <Flex justify="center" p="4">
              <Spinner />
            </Flex>
          ) : scheduledCampaigns.length === 0 ? (
            <Text size="2" color="gray">No scheduled or recent campaigns</Text>
          ) : (
            <Flex direction="column" gap="2">
              {scheduledCampaigns.map(campaign => (
                <Card key={campaign.id} variant="surface" style={{ padding: '8px 12px' }}>
                  <Flex direction="column" gap="1">
                    <Flex align="center" gap="2">
                      <Badge color={
                        campaign.status === 'scheduled' ? 'orange' :
                        campaign.status === 'queued' ? 'blue' :
                        campaign.status === 'in_progress' ? 'blue' :
                        campaign.status === 'failed' ? 'red' :
                        campaign.status === 'completed' ? 'green' : 'gray'
                      } size="1">
                        {campaign.status}
                      </Badge>
                      <Text size="2" weight="bold">
                        {campaign.name}
                        {campaign.events && <Text color="gray"> for {campaign.events.name}</Text>}
                      </Text>
                      {(campaign.status === 'in_progress' || campaign.status === 'queued') && (
                        <ReloadIcon className="animate-spin" style={{ color: 'var(--blue-9)' }} />
                      )}
                    </Flex>

                    <Text size="1" color="gray" style={{ fontStyle: 'italic', lineHeight: '1.3' }}>
                      {campaign.metadata?.message_template || 'No message'}
                    </Text>

                    {campaign.status === 'in_progress' && campaign.total_recipients > 0 && (
                      <Box mt="2" mb="2">
                        <Progress
                          value={(campaign.messages_sent / campaign.total_recipients) * 100}
                          max={100}
                          size="1"
                        />
                        <Text size="1" color="gray" mt="1">
                          {Math.round((campaign.messages_sent / campaign.total_recipients) * 100)}% complete
                        </Text>
                      </Box>
                    )}

                    <Flex align="center" gap="3" wrap="wrap">
                      <Text size="1" color="gray">
                        {campaign.status === 'in_progress' || campaign.status === 'completed'
                          ? `${formatNumber(campaign.messages_sent || 0)} / ${formatNumber(campaign.total_recipients || 0)} sent${campaign.messages_failed > 0 ? `, ${formatNumber(campaign.messages_failed)} failed` : ''}`
                          : `${formatNumber(campaign.total_recipients || 0)} recipients`
                        }
                      </Text>
                      {campaign.scheduled_at && (() => {
                        const scheduledTime = new Date(campaign.scheduled_at);
                        const now = new Date();
                        const diffMs = scheduledTime - now;
                        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                        // Get display time in the original timezone if available
                        const timezone = campaign.metadata?.scheduled_timezone || 'UTC';
                        const localTime = campaign.metadata?.scheduled_local_time;

                        let timeDisplay;
                        if (localTime) {
                          // Parse and format the local time nicely: MM/DD HH:MM AM/PM TZ
                          const [date, time] = localTime.split('T');
                          const [year, month, day] = date.split('-');
                          const [hour, min] = time.split(':');
                          const ampm = parseInt(hour) >= 12 ? 'PM' : 'AM';
                          const hour12 = parseInt(hour) % 12 || 12;
                          const tzShort = timezone.split('/')[1] || timezone;
                          timeDisplay = `${month}/${day} ${hour12}:${min} ${ampm} ${tzShort}`;
                        } else {
                          // Fallback: format as MM/DD HH:MM AM/PM
                          const date = scheduledTime.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                          const time = scheduledTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                          timeDisplay = `${date} ${time}`;
                        }

                        const countdown = diffMs > 0
                          ? `in ${diffHours}h ${diffMinutes}m`
                          : diffMs > -3600000
                          ? 'processing'
                          : 'past';

                        return (
                          <Text size="1" color="gray">
                            {timeDisplay} ({countdown})
                          </Text>
                        );
                      })()}
                      {campaign.total_cost_cents > 0 && (
                        <Text size="1" color="gray">
                          {formatCurrency(campaign.total_cost_cents)}
                        </Text>
                      )}
                    </Flex>

                    <Flex gap="2" justify="end">
                      <Button
                        size="1"
                        variant="soft"
                        onClick={() => {
                          setSelectedCampaignForDetails(campaign);
                          setShowCampaignDetails(true);
                        }}
                      >
                        <InfoCircledIcon />
                        Details
                      </Button>
                      <Button
                        size="1"
                        variant="soft"
                        onClick={() => loadCampaignForEdit(campaign)}
                      >
                        Edit & Resubmit
                      </Button>
                      <Button
                        size="1"
                        variant="soft"
                        color="red"
                        onClick={() => deleteCampaign(campaign.id)}
                      >
                        <Cross2Icon />
                        Delete
                      </Button>
                    </Flex>
                  </Flex>
                </Card>
              ))}
            </Flex>
          )}
        </Flex>
      </Card>
      
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
                    onClick={() => {
                      const filteredEvents = events.filter(event => {
                        if (!eventSearchFilter) return true;
                        const search = eventSearchFilter.toLowerCase();
                        return event.label.toLowerCase().includes(search);
                      });
                      setTempSelectedEvents(filteredEvents.map(e => e.value));
                    }}
                  >
                    Select All{eventSearchFilter ? ' Visible' : ''}
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

              {/* Search Filter for Events */}
              <Box mb="2">
                <TextField.Root
                  placeholder="Type to filter events..."
                  value={eventSearchFilter}
                  onChange={(e) => setEventSearchFilter(e.target.value)}
                />
                {eventSearchFilter && (
                  <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                    Showing {events.filter(e => e.label.toLowerCase().includes(eventSearchFilter.toLowerCase())).length} of {events.length} events
                  </Text>
                )}
              </Box>

              <Card variant="surface">
                <ScrollArea style={{ maxHeight: '300px' }}>
                  <Flex direction="column" gap="2" p="2">
                    {events
                      .filter(event => {
                        if (!eventSearchFilter) return true;
                        const search = eventSearchFilter.toLowerCase();
                        return event.label.toLowerCase().includes(search);
                      })
                      .map(event => (
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
                    setEventSearchFilter(''); // Clear search filter
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
                value={recentMessageHours || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setRecentMessageHours(val === '' ? 0 : Number(val));
                }}
                placeholder="0 = disabled"
                style={{ width: '100px' }}
                min="0"
                max="720"
              />
              <Text size="2">hours (0 = disabled, default: 72h)</Text>
            </Flex>
            <Text size="1" color="gray" mt="1">
              Set to 0 to disable anti-spam filtering and allow sending to same people repeatedly
            </Text>
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
                          <>
                            <Text size="2" color="red">{rfmProgress.error}</Text>
                            <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                              Click "Generate RFM" again to retry. Already processed scores are cached.
                            </Text>
                          </>
                        ) : (
                          <>
                            <Box mb="2">
                              <Flex justify="between" mb="1">
                                <Text size="2">
                                  {rfmProgress.total > 0 ? (
                                    <>
                                      Updating: {rfmProgress.processed} / {rfmProgress.total}
                                      {rfmProgress.totalPeople && rfmProgress.total < rfmProgress.totalPeople && (
                                        <Text size="1" color="gray">
                                          {' '}({rfmProgress.totalPeople - rfmProgress.total} already cached)
                                        </Text>
                                      )}
                                    </>
                                  ) : (
                                    <>{rfmProgress.status || 'Initializing...'}</>
                                  )}
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

                            {rfmProgress.processed > 0 && rfmProgress.processed < rfmProgress.total && !rfmProcessing && (
                              <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                                Processing stopped. Click "Generate RFM" to continue from where it left off.
                              </Text>
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

          {/* Schedule Date/Time */}
          <Box>
            <Text size="3" weight="bold" mb="2">Schedule (optional)</Text>

            {/* Timezone Selector */}
            <Box mb="2">
              <Text size="2" weight="medium" mb="1">Timezone</Text>
              <Select.Root value={scheduleTimezone} onValueChange={setScheduleTimezone}>
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="America/Toronto">Eastern (Toronto)</Select.Item>
                  <Select.Item value="America/New_York">Eastern (New York)</Select.Item>
                  <Select.Item value="America/Chicago">Central (Chicago)</Select.Item>
                  <Select.Item value="America/Denver">Mountain (Denver)</Select.Item>
                  <Select.Item value="America/Los_Angeles">Pacific (Los Angeles)</Select.Item>
                  <Select.Item value="America/Vancouver">Pacific (Vancouver)</Select.Item>
                  <Select.Item value="America/Edmonton">Mountain (Edmonton)</Select.Item>
                  <Select.Item value="America/Winnipeg">Central (Winnipeg)</Select.Item>
                  <Select.Item value="America/Halifax">Atlantic (Halifax)</Select.Item>
                  <Select.Item value="America/Mexico_City">Central (Mexico City)</Select.Item>
                  <Select.Item value="Europe/London">London (GMT)</Select.Item>
                  <Select.Item value="Europe/Amsterdam">Amsterdam (CET)</Select.Item>
                  <Select.Item value="Europe/Podgorica">Podgorica (CET)</Select.Item>
                  <Select.Item value="Asia/Bangkok">Bangkok (ICT)</Select.Item>
                  <Select.Item value="Australia/Sydney">Sydney (AEDT)</Select.Item>
                  <Select.Item value="Pacific/Auckland">Auckland (NZDT)</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>

            {/* Date/Time Input */}
            <Box>
              <Text size="2" weight="medium" mb="1">Date & Time</Text>
              <TextField.Root
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                placeholder="Leave empty to send immediately"
              />
            </Box>

            <Text size="1" color="gray" mt="1">
              Leave empty to send immediately. Selected time will be in {scheduleTimezone.split('/')[1].replace('_', ' ')} timezone.
            </Text>
          </Box>

          {/* Dry Run Mode */}
          <Card variant="surface">
            <Flex align="center" gap="3">
              <Checkbox
                checked={dryRunMode}
                onCheckedChange={setDryRunMode}
              />
              <Box>
                <Text size="2" weight="bold">Dry Run Mode (Test)</Text>
                <Text size="2" color="gray" style={{ display: 'block' }}>
                  Send only to +14163025959 for testing (ignores actual recipients)
                </Text>
              </Box>
            </Flex>
          </Card>

          {editingCampaign && (
            <Callout.Root color="blue">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                Editing campaign: {editingCampaign.name}. Submitting will create a new campaign.
                <Button
                  size="1"
                  variant="soft"
                  ml="2"
                  onClick={() => {
                    setEditingCampaign(null);
                    setCampaignName('');
                    setMessage('');
                    setScheduledAt('');
                    setDryRunMode(false);
                  }}
                >
                  Cancel Edit
                </Button>
              </Callout.Text>
            </Callout.Root>
          )}

          <Button
            size="3"
            onClick={createCampaign}
            disabled={!campaignName || !message || audienceData.filtered_count === 0 || sending}
          >
            {sending ? (
              <><ReloadIcon className="animate-spin" /> Creating Campaign...</>
            ) : scheduledAt ? (
              <><CalendarIcon /> Schedule for {formatNumber(dryRunMode ? 1 : audienceData.filtered_count)} {dryRunMode ? 'test recipient' : 'people'}</>
            ) : (
              <><PaperPlaneIcon /> Send {dryRunMode ? 'test' : `to ${formatNumber(audienceData.filtered_count)} people`}</>
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

    {/* Campaign Details Modal */}
    <Dialog.Root open={showCampaignDetails} onOpenChange={setShowCampaignDetails}>
      <Dialog.Content style={{ maxWidth: 700 }}>
        <Flex direction="column" gap="3">
          <Dialog.Title>Campaign Details</Dialog.Title>

          {selectedCampaignForDetails && (
            <>
              <Card>
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="2">
                    <Text weight="bold" size="3">{selectedCampaignForDetails.name}</Text>
                    <Badge color={
                      selectedCampaignForDetails.status === 'completed' ? 'green' :
                      selectedCampaignForDetails.status === 'in_progress' ? 'blue' :
                      selectedCampaignForDetails.status === 'failed' ? 'red' : 'orange'
                    }>
                      {selectedCampaignForDetails.status}
                    </Badge>
                  </Flex>

                  {selectedCampaignForDetails.events && (
                    <Text size="2" color="gray">Event: {selectedCampaignForDetails.events.name}</Text>
                  )}

                  <Text size="2" style={{ fontStyle: 'italic', padding: '8px', backgroundColor: 'var(--gray-a2)', borderRadius: '4px' }}>
                    {selectedCampaignForDetails.metadata?.message_template || 'No message'}
                  </Text>

                  <Separator />

                  <Flex direction="column" gap="1">
                    <Flex justify="between">
                      <Text size="2" color="gray">Total Recipients:</Text>
                      <Text size="2" weight="bold">{formatNumber(selectedCampaignForDetails.total_recipients || 0)}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text size="2" color="gray">Successfully Sent:</Text>
                      <Text size="2" weight="bold" color="green">{formatNumber(selectedCampaignForDetails.messages_sent || 0)}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text size="2" color="gray">Failed:</Text>
                      <Text size="2" weight="bold" color="red">{formatNumber(selectedCampaignForDetails.messages_failed || 0)}</Text>
                    </Flex>
                    {selectedCampaignForDetails.total_cost_cents > 0 && (
                      <Flex justify="between">
                        <Text size="2" color="gray">Total Cost:</Text>
                        <Text size="2" weight="bold">{formatCurrency(selectedCampaignForDetails.total_cost_cents)}</Text>
                      </Flex>
                    )}
                    {selectedCampaignForDetails.scheduled_at && (
                      <Flex justify="between">
                        <Text size="2" color="gray">Scheduled:</Text>
                        <Text size="2">{new Date(selectedCampaignForDetails.scheduled_at).toLocaleString()}</Text>
                      </Flex>
                    )}
                    {selectedCampaignForDetails.completed_at && (
                      <Flex justify="between">
                        <Text size="2" color="gray">Completed:</Text>
                        <Text size="2">{new Date(selectedCampaignForDetails.completed_at).toLocaleString()}</Text>
                      </Flex>
                    )}
                  </Flex>
                </Flex>
              </Card>

              {/* Failed Recipients Section */}
              {selectedCampaignForDetails.metadata?.failure_details && selectedCampaignForDetails.metadata.failure_details.length > 0 && (
                <Card>
                  <Flex direction="column" gap="3">
                    <Heading size="4">Failed Messages ({selectedCampaignForDetails.metadata.failure_details.length})</Heading>
                    <ScrollArea style={{ maxHeight: '400px' }}>
                      <Flex direction="column" gap="2">
                        {selectedCampaignForDetails.metadata.failure_details.map((failure, idx) => (
                          <Card key={idx} variant="surface" style={{ padding: '8px' }}>
                            <Flex direction="column" gap="1">
                              <Flex justify="between" align="center">
                                <Text size="2" weight="bold">
                                  {failure.name || 'Unknown'} - {failure.phone}
                                </Text>
                                <Text size="1" color="gray">
                                  {new Date(failure.timestamp).toLocaleString()}
                                </Text>
                              </Flex>
                              <Text size="1" color="red" style={{ fontFamily: 'monospace', backgroundColor: 'var(--red-a2)', padding: '4px', borderRadius: '4px' }}>
                                {failure.error}
                              </Text>
                            </Flex>
                          </Card>
                        ))}
                      </Flex>
                    </ScrollArea>
                  </Flex>
                </Card>
              )}

              {selectedCampaignForDetails.messages_failed === 0 && (
                <Callout.Root color="green">
                  <Callout.Icon>
                    <CheckCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    All messages sent successfully - no failures to report!
                  </Callout.Text>
                </Callout.Root>
              )}
            </>
          )}

          <Flex justify="end" gap="2" mt="2">
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