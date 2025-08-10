import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUserAdminEvents } from '../lib/adminHelpers';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [adminEvents, setAdminEvents] = useState([]);
  const [loadingAdminEvents, setLoadingAdminEvents] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!isMounted) return;
      
      console.log('Initial session check:', { session, error });
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('User found, loading admin events for:', session.user.email);
        await loadAdminEvents(session.user);
      } else {
        console.log('No user session found');
      }
      setLoading(false);
    }).catch(err => {
      if (!isMounted) return;
      console.error('Error getting initial session:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      
      console.log('Auth state changed:', { event: _event, session: !!session });
      
      // Only update if session actually changed
      setSession(prevSession => {
        if (prevSession?.user?.id !== session?.user?.id) {
          setUser(session?.user ?? null);
          if (session?.user) {
            console.log('User found in auth change, loading admin events');
            loadAdminEvents(session.user);
          } else {
            console.log('No user in auth change, clearing admin events');
            setAdminEvents([]);
          }
        }
        return session;
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadAdminEvents = async (authUser) => {
    // Prevent concurrent calls
    if (loadingAdminEvents) {
      console.log('loadAdminEvents already in progress, skipping');
      return;
    }

    try {
      setLoadingAdminEvents(true);
      console.log('loadAdminEvents called for user:', authUser.email);
      
      // TEMPORARY: Skip admin table check for now to test auth flow
      // Just load some events for any authenticated user
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, eid, name, venue, event_start_datetime, event_end_datetime')
        .order('event_start_datetime', { ascending: false })
        .limit(10);

      if (eventsError) {
        console.error('Error loading events:', eventsError);
        setAdminEvents([]);
        return;
      }

      // Transform events data 
      const adminEvents = eventsData.map(event => ({
        event_id: event.id,
        level: 'super', // temporary
        event_name: event.name,
        event_eid: event.eid,
        event_venue: event.venue,
        event_start_datetime: event.event_start_datetime,
        event_end_datetime: event.event_end_datetime
      }));

      console.log('Loaded', adminEvents.length, 'events for admin user');
      setAdminEvents(adminEvents || []);
    } catch (error) {
      console.error('Error loading admin events:', error);
      setAdminEvents([]);
    } finally {
      setLoadingAdminEvents(false);
    }
  };

  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
    
    if (data?.user && !error) {
      await loadAdminEvents(data.user);
    }
    
    return { data, error };
  };

  const signUpWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    setAdminEvents([]);
    return { error };
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    return { data, error };
  };

  // Check if user has access to a specific event
  const hasEventAccess = (eventId, requiredLevel = 'voting') => {
    if (!adminEvents.length) return false;
    
    const event = adminEvents.find(e => e.event_id === eventId);
    if (!event) return false;

    // Permission hierarchy: super > producer > photo > voting
    const levels = ['voting', 'photo', 'producer', 'super'];
    const userLevelIndex = levels.indexOf(event.level);
    const requiredLevelIndex = levels.indexOf(requiredLevel);
    
    return userLevelIndex >= requiredLevelIndex;
  };

  const value = {
    user,
    session,
    loading,
    adminEvents,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    hasEventAccess,
    refreshAdminEvents: () => user && loadAdminEvents(user),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};