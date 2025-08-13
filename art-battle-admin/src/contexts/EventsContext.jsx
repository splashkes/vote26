import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const EventsContext = createContext({});

export const useEvents = () => useContext(EventsContext);

export const EventsProvider = ({ children }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadEvents = async (limit = 100, offset = 0) => {
    if (!user) {
      setEvents([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading events with limit:', limit, 'offset:', offset);
      
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, eid, name, venue, event_start_datetime, event_end_datetime, enabled, show_in_app')
        .eq('enabled', true)
        .eq('show_in_app', true)
        .order('event_start_datetime', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (eventsError) {
        console.error('Error loading events:', eventsError);
        setError(eventsError.message);
        return;
      }

      console.log('Loaded', eventsData?.length || 0, 'events');
      setEvents(eventsData || []);
    } catch (err) {
      console.error('Error loading events:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreEvents = async (currentCount) => {
    if (!user || loading) return;

    try {
      setLoading(true);
      
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, eid, name, venue, event_start_datetime, event_end_datetime, enabled, show_in_app')
        .eq('enabled', true)
        .eq('show_in_app', true)
        .order('event_start_datetime', { ascending: false })
        .limit(100)
        .range(currentCount, currentCount + 99);

      if (eventsError) {
        console.error('Error loading more events:', eventsError);
        setError(eventsError.message);
        return;
      }

      console.log('Loaded', eventsData?.length || 0, 'more events');
      setEvents(prevEvents => [...prevEvents, ...(eventsData || [])]);
    } catch (err) {
      console.error('Error loading more events:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshEvents = () => {
    loadEvents();
  };

  // Load events when user changes
  useEffect(() => {
    if (user) {
      loadEvents();
    } else {
      setEvents([]);
    }
  }, [user]);

  const value = {
    events,
    loading,
    error,
    loadEvents,
    loadMoreEvents,
    refreshEvents,
  };

  return (
    <EventsContext.Provider value={value}>
      {children}
    </EventsContext.Provider>
  );
};