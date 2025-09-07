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
  const personRef = useRef(null);

  // Keep ref in sync with person state
  useEffect(() => {
    personRef.current = person;
  }, [person]);

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
          await extractPersonFromMetadata(session.user, null); // Initial load, no current person
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
      // Only log meaningful auth events, not repeated SIGNED_IN events from tab focus
      if (event !== 'SIGNED_IN') {
        console.log('AuthContext: Auth state changed:', event, !!session);
      }
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Pass current person state to prevent unnecessary updates
        await extractPersonFromMetadata(session.user, personRef.current);
      } else {
        setPerson(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Empty dependency array is safe now with personRef

  const extractPersonFromMetadata = async (authUser, currentPerson = null) => {
    // Extract person data from auth metadata (no database query needed!)
    let metadata = authUser.user_metadata || {};
    
    // Handle JSONB storage issue - metadata might be stored as string in localStorage
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        console.warn('AuthContext: Could not parse user_metadata as JSON, using as-is');
        metadata = {};
      }
    }
    
    if (metadata.person_id) {
      // Check if person data has actually changed to prevent unnecessary re-renders
      const newPersonData = {
        id: metadata.person_id,
        hash: metadata.person_hash,
        name: metadata.person_name,
        phone: authUser.phone
      };
      
      // Only update if data has actually changed
      if (!currentPerson || 
          currentPerson.id !== newPersonData.id ||
          currentPerson.hash !== newPersonData.hash ||
          currentPerson.name !== newPersonData.name ||
          currentPerson.phone !== newPersonData.phone) {
        console.log('AuthContext: ✅ Found person_id, setting person');
        setPerson(newPersonData);
      }
    } else {
      console.log('AuthContext: ❌ No person_id found in metadata');
      // Check if we've already tried to sync metadata for this user recently
      const userId = authUser.id;
      const lastAttempt = metadataSyncAttempts[userId];
      const now = Date.now();
      
      if (lastAttempt && (now - lastAttempt) < 30000) { // 30 seconds cooldown
        console.log('Skipping metadata sync, recent attempt detected');
        return;
      }
      
      // Only update last attempt time for users without metadata to avoid unnecessary re-renders
      setMetadataSyncAttempts(prev => ({ ...prev, [userId]: now }));
      
      // Auth-webhook now handles all person linking automatically
      console.log('No person metadata found - auth-webhook will handle linking on next login');
      
      // REMOVED: Manual refreshSession() call that caused infinite refresh loops
      // The auth-webhook now handles person linking automatically during phone confirmation
      // Manual refresh calls trigger constant token refresh requests causing 15+ second delays
      // Trust the auth state change handler to receive updated metadata when ready
      console.log('No person metadata found - auth-webhook will handle linking automatically');
      setPerson(null);
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
    
    // REMOVED: Manual refreshSession() call that caused infinite refresh loops
    // The auth-webhook handles metadata updates automatically during phone confirmation
    // Auth state change listener will receive updated user data when webhook completes
    // Manual refresh calls were causing 15+ second delays and constant refresh spam
    
    return { data, error };
  };

  // DISABLED: Manual token refresh to prevent conflicts causing loading loops
  // Token refresh is now handled automatically by Supabase or user can re-login if needed
  const refreshSessionIfNeeded = async () => {
    console.log('AuthContext: Manual token refresh disabled to prevent loading loops');
    
    if (!session) return null;
    
    // Check if token is close to expiring and show warning
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;
    
    // Show warning if session expires soon, but don't refresh automatically
    if (timeUntilExpiry <= 300 && timeUntilExpiry > 60) {
      const minutesLeft = Math.floor(timeUntilExpiry / 60);
      setSessionWarning(`Session expires in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} - please refresh the page if needed`);
    } else if (timeUntilExpiry <= 60) {
      setSessionWarning('Session expired - please refresh the page to re-login');
    } else {
      setSessionWarning(null);
    }
    
    // Return current session without attempting refresh
    return session;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    setPerson(null);
    setSession(null);
    setUser(null);
    return { error };
  };

  // DISABLED: Automatic session refresh to prevent conflicts causing loading loops
  useEffect(() => {
    if (!session) return;
    
    // No logging needed - token refresh is disabled to prevent loading loops
    // Users can refresh the page if needed when sessions expire
    
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};