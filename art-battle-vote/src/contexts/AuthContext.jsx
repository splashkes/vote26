import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [metadataSyncAttempts, setMetadataSyncAttempts] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(null);
  const [adminEvents, setAdminEvents] = useState({}); // Cache admin events locally
  const adminEventsFetched = useRef(false); // Prevent duplicate fetches

  useEffect(() => {
    console.log('AuthContext: Initializing...');
    
    // Get initial session with timeout and error handling
    const initializeAuth = async () => {
      try {
        console.log('AuthContext: Getting initial session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('AuthContext: Error getting session:', error);
          throw error;
        }
        
        console.log('AuthContext: Session retrieved:', !!session);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await extractPersonFromMetadata(session.user);
          await fetchAndCacheAdminEvents(session.user);
        }
      } catch (error) {
        console.error('AuthContext: Failed to initialize:', error);
        // Set to null state instead of staying in loading
        setSession(null);
        setUser(null);
        setPerson(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('AuthContext: Auth state changed:', event, !!session);
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await extractPersonFromMetadata(session.user);
        // Fetch admin events if we don't have them yet (check both flag and empty adminEvents)
        if (event === 'SIGNED_IN' && !adminEventsFetched.current) {
          adminEventsFetched.current = true;
          await fetchAndCacheAdminEvents(session.user);
        }
      } else {
        setPerson(null);
        setAdminEvents({});
        adminEventsFetched.current = false;
        // Clear admin cache from localStorage
        if (user?.phone) {
          localStorage.removeItem(`admin_events_${user.phone}`);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load admin events from localStorage on init (only once per phone number)
  useEffect(() => {
    if (!loading && user && user.phone && !adminEventsFetched.current) {
      const storageKey = `admin_events_${user.phone}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached);
          setAdminEvents(parsedCache);
          adminEventsFetched.current = true; // Mark as fetched since we loaded from cache
          console.log('Loaded cached admin events from localStorage');
        } catch (err) {
          console.warn('Failed to parse cached admin events:', err);
          localStorage.removeItem(storageKey);
          adminEventsFetched.current = true; // Mark as attempted even if failed
        }
      } else {
        // No cached data found, mark as fetched to prevent waiting
        adminEventsFetched.current = true;
      }
    }
  }, [user, loading]);

  // Fetch admin events only when needed (not on every login)
  const fetchAndCacheAdminEvents = async (authUser) => {
    if (!authUser?.phone) return;
    
    // Make this completely non-blocking and failure-safe
    setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .rpc('get_user_admin_events', { p_user_phone: authUser.phone });
        
        if (!error && data && data.length > 0) {
          const adminMap = {};
          // data should be array of { event_id, admin_level, event_eid }
          data.forEach(({ event_id, admin_level, event_eid }) => {
            adminMap[event_id] = admin_level;
            if (event_eid) {
              adminMap[event_eid] = admin_level; // Also cache by EID
            }
          });
          
          setAdminEvents(adminMap);
          
          // Cache in localStorage only if user has admin privileges
          const storageKey = `admin_events_${authUser.phone}`;
          localStorage.setItem(storageKey, JSON.stringify(adminMap));
        } else {
          // User is not admin for any events - don't create localStorage entries
          setAdminEvents({});
        }
      } catch (err) {
        console.warn('Failed to fetch admin events (non-critical):', err);
        setAdminEvents({});
      }
    }, 100); // Small delay to prevent auth loops
  };

  // Helper functions for components to use instead of broken adminHelpers
  const isEventAdmin = (eventId, minLevel = 'voting') => {
    const level = adminEvents[eventId];
    if (!level) return false;
    
    const hierarchy = {
      'super': ['super', 'producer', 'photo', 'voting'],
      'producer': ['producer', 'photo', 'voting'],
      'photo': ['photo', 'voting'],
      'voting': ['voting']
    };
    
    return hierarchy[level]?.includes(minLevel) || false;
  };

  const getAdminLevel = (eventId) => {
    return adminEvents[eventId] || null;
  };

  const extractPersonFromMetadata = async (authUser) => {
    // Extract person data from auth metadata (no database query needed!)
    const metadata = authUser.user_metadata || {};
    
    if (metadata.person_id) {
      setPerson({
        id: metadata.person_id,
        hash: metadata.person_hash,
        name: metadata.person_name,
        phone: authUser.phone
      });
    } else {
      // Check if we've already tried to sync metadata for this user recently
      const userId = authUser.id;
      const lastAttempt = metadataSyncAttempts[userId];
      const now = Date.now();
      
      if (lastAttempt && (now - lastAttempt) < 30000) { // 30 seconds cooldown
        console.log('Skipping metadata sync, recent attempt detected');
        return;
      }
      
      // Update last attempt time
      setMetadataSyncAttempts(prev => ({ ...prev, [userId]: now }));
      
      // Try to get metadata via RPC instead of infinite refresh loop
      console.log('No person metadata found, attempting to sync via RPC...');
      
      try {
        const { data, error } = await supabase.rpc('refresh_auth_metadata');
        
        if (!error && data && data.person_id) {
          // Update local state with person data
          setPerson({
            id: data.person_id,
            hash: data.person_hash,
            name: data.person_name,
            phone: authUser.phone
          });
          
          // Refresh session once to get updated JWT
          const { data: { session } } = await supabase.auth.refreshSession();
          if (session) {
            console.log('Session refreshed with metadata');
          }
        } else if (data?.error === 'Person not found' && authUser.phone) {
          // Person doesn't exist, create one
          console.log('Person not found, creating new person record...');
          const { data: personId } = await supabase.rpc('ensure_person_exists', {
            p_phone: authUser.phone
          });
          
          if (personId) {
            // Try to refresh metadata again
            const { data: refreshData } = await supabase.rpc('refresh_auth_metadata');
            if (refreshData && refreshData.person_id) {
              setPerson({
                id: refreshData.person_id,
                hash: refreshData.person_hash,
                name: refreshData.person_name,
                phone: authUser.phone
              });
            }
          }
        } else {
          console.error('Could not sync person metadata:', error || data?.error);
          setPerson(null);
        }
      } catch (err) {
        console.error('Error syncing metadata:', err);
        setPerson(null);
      }
    }
  };

  const signInWithOtp = async (phone) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone,
      options: {
        channel: 'sms',
      }
    });
    return { data, error };
  };

  const verifyOtp = async (phone, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: phone,
      token: token,
      type: 'sms'
    });
    
    // If verification successful, refresh session to get updated metadata
    if (data?.user && !error) {
      // Give the trigger a moment to update metadata
      setTimeout(async () => {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session?.user) {
          await extractPersonFromMetadata(session.user);
          await fetchAndCacheAdminEvents(session.user);
        }
      }, 500);
    }
    
    return { data, error };
  };

  // Function to refresh session when it expires
  const refreshSessionIfNeeded = async () => {
    if (isRefreshing) {
      // Wait for current refresh to complete
      return new Promise((resolve) => {
        const checkRefresh = () => {
          if (!isRefreshing) {
            resolve(session);
          } else {
            setTimeout(checkRefresh, 100);
          }
        };
        checkRefresh();
      });
    }
    
    if (!session) return null;
    
    // Check if token is close to expiring (within 5 minutes)
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;
    
    // Show warning only if session expires in less than 3 minutes (for 4-hour events)
    if (timeUntilExpiry <= 180 && timeUntilExpiry > 60) {
      const minutesLeft = Math.floor(timeUntilExpiry / 60);
      setSessionWarning(`Session expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`);
    } else {
      setSessionWarning(null);
    }
    
    // If token is still valid for more than 2 minutes, no refresh needed  
    if (timeUntilExpiry > 120) return session;
    
    console.log('AuthContext: Refreshing session (expires in', timeUntilExpiry, 'seconds)');
    setIsRefreshing(true);
    
    try {
      const { data: { session: newSession }, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('AuthContext: Session refresh failed:', error);
        
        // Only sign out if the error is definitely auth-related
        if (error.message?.includes('refresh_token') || 
            error.message?.includes('invalid_grant') ||
            error.message?.includes('expired')) {
          console.log('AuthContext: Refresh token expired, signing out');
          await signOut();
          return null;
        }
        
        // For other errors, return the current session and try again later
        console.log('AuthContext: Refresh failed with recoverable error, keeping current session');
        return session;
      }
      
      console.log('AuthContext: Session refreshed successfully, new expiry:', new Date(newSession.expires_at * 1000));
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setSessionWarning(null); // Clear any warnings
      
      if (newSession?.user) {
        await extractPersonFromMetadata(newSession.user);
      }
      
      return newSession;
    } catch (error) {
      console.error('AuthContext: Session refresh error:', error);
      
      // Only sign out for critical errors
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        console.log('AuthContext: Network error during refresh, keeping current session');
        return session;
      }
      
      await signOut();
      return null;
    } finally {
      setIsRefreshing(false);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    setPerson(null);
    setSession(null);
    setUser(null);
    return { error };
  };

  // Set up periodic session refresh and visibility change handler
  useEffect(() => {
    if (!session) return;
    
    // Refresh session every 45 minutes proactively
    const refreshInterval = setInterval(async () => {
      console.log('AuthContext: Periodic session refresh check');
      await refreshSessionIfNeeded();
    }, 45 * 60 * 1000); // 45 minutes
    
    // Only check session on visibility change if session expires in < 5 minutes (reduce excessive calls)
    const handleVisibilityChange = async () => {
      if (!document.hidden && session) {
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt - now;
        
        // Only check if session expires soon to reduce spam
        if (timeUntilExpiry <= 300) {
          console.log('AuthContext: Page visible, checking session (expires soon)');
          await refreshSessionIfNeeded();
        }
      }
    };
    
    // Reduced frequency visibility checking
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Remove focus listener to reduce excessive session checks
    
    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  const value = {
    user,
    person,
    session,
    loading,
    isRefreshing,
    sessionWarning,
    signInWithOtp,
    verifyOtp,
    signOut,
    refreshSessionIfNeeded,
    // Admin helpers (local, fast, no network calls)
    isEventAdmin,
    getAdminLevel,
    adminEvents
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};