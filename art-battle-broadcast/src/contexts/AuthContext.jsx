import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  // Removed metadataSyncAttempts - no longer needed with JWT claims approach
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
        
        // Extract person data if we have a session but person is not set
        if (session?.user) {
          console.log('🔄 [AUTH-V2] Extracting person data for existing session...');
          await extractPersonFromJWT(session.user);
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
        // Only extract person data for initial session and token refresh to prevent loops
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
          console.log('🔄 [AUTH-V2] Extracting person data for event:', event, 'person:', !!personRef.current);
          await extractPersonFromJWT(session.user, personRef.current, session);
        }
      } else {
        setPerson(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Empty dependency array is safe now with personRef

  // Simplified: Auth state is managed by onAuthStateChange only
  // No additional safeguards or complex fallback logic needed

  const extractPersonFromJWT = async (authUser, currentPerson = null, providedSession = null) => {
    console.log('🔄 [AUTH-V2] Extracting person data from JWT claims...');
    
    let currentSession = providedSession;
    
    if (!currentSession) {
      // Only fetch session if not provided (rare fallback case)
      try {
        const { data } = await supabase.auth.getSession();
        currentSession = data.session;
      } catch (sessionError) {
        console.warn('⚠️ [AUTH-V2] Session fetch failed:', sessionError.message);
        return;
      }
    }
    
    if (!currentSession?.access_token) {
      console.log('🔄 [AUTH-V2] No access token available, person data pending');
      setPerson(null);
      return;
    }

    try {
      // Decode JWT payload (it's base64 encoded)
      const tokenParts = currentSession.access_token.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }
      
      const payload = JSON.parse(atob(tokenParts[1]));
      console.log('🔄 [AUTH-V2] JWT payload decoded, checking for person claims...');
      console.log('🔍 [AUTH-V2] JWT payload contents:', payload);
      
      // HARD REQUIREMENT: Only v2-http system is supported, no legacy fallbacks
      if (payload.auth_version === 'v2-http') {
        console.log('✅ [AUTH-V2] Auth V2-HTTP system confirmed in JWT');
        
        if (payload.person_id) {
          // Build person data from JWT claims
          const newPersonData = {
            id: payload.person_id,
            hash: payload.person_hash,
            name: payload.person_name || 'User',
            verified: payload.person_verified || false,
            phone: authUser.phone,
            authVersion: 'v2-http'
          };
          
          // Only update if data has actually changed
          const hasChanges = !currentPerson || 
              currentPerson.id !== newPersonData.id ||
              currentPerson.hash !== newPersonData.hash ||
              currentPerson.name !== newPersonData.name ||
              currentPerson.verified !== newPersonData.verified ||
              currentPerson.authVersion !== newPersonData.authVersion;
              
          if (hasChanges) {
            console.log('✅ [AUTH-V2] Person data found in JWT, updating context:', newPersonData.id);
            setPerson(newPersonData);
          } else {
            console.log('🔄 [AUTH-V2] Person data unchanged, skipping update');
          }
        } else if (payload.person_pending) {
          console.log('⏳ [AUTH-V2] Person creation pending, trigger should handle this');
          setPerson(null);
        } else {
          console.log('❌ [AUTH-V2] No person data in JWT, may need phone verification');
          setPerson(null);
        }
      } else {
        // HARD CRASH: No legacy support
        const errorMsg = `🚨 [AUTH-V2] CRITICAL ERROR: Legacy auth system detected! Expected auth_version: 'v2-http' but got: '${payload.auth_version}'. Custom Access Token Hook not working properly.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('🚨 [AUTH-V2] CRITICAL ERROR: Failed to decode JWT or extract person data:', error);
      // HARD CRASH: No legacy fallbacks supported
      throw new Error(`🚨 [AUTH-V2] JWT processing failed: ${error.message}. Auth system is broken.`);
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
    
    // Custom Access Token Hook now handles JWT claims automatically
    // No manual session refresh needed - prevents cascading token refresh loops
    
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
    try {
      // Clear local state immediately
      setPerson(null);
      setSession(null);
      setUser(null);
      
      // Sign out from Supabase with scope 'global' to clear all sessions
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      
      if (error) {
        console.error('SignOut error:', error);
      } else {
        console.log('✅ [AUTH-V2] Successfully signed out');
      }
      
      return { error };
    } catch (err) {
      console.error('SignOut failed:', err);
      return { error: err };
    }
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