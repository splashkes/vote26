import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const personRef = useRef(null);

  // Keep ref in sync with person state
  useEffect(() => {
    personRef.current = person;
  }, [person]);

  useEffect(() => {
    console.log('AuthContext: Initializing...');
    
    // Keep loading state until we get first onAuthStateChange event
    // This ensures we wait for session to load before rendering UI
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Only log meaningful auth events, not repeated SIGNED_IN events from tab focus
      if (event !== 'SIGNED_IN') {
        console.log('AuthContext: Auth state changed:', event, !!session);
        console.log('AuthContext: onAuthStateChange session details:', session ? {
          hasAccessToken: !!session.access_token,
          userId: session.user?.id,
          phone: session.user?.phone
        } : 'null');
      }
      setSession(session);
      setUser(session?.user ?? null);
      
      // Set loading to false after any auth state change
      // This ensures UI waits for auth system to initialize
      if (loading) {
        setLoading(false);
      }
      
      if (session?.user) {
        // Extract person data for initial session, token refresh, or when person is missing
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && !personRef.current)) {
          console.log('🔄 [AUTH-V2] Extracting person data for event:', event, 'person exists:', !!personRef.current);
          // Set loading during JWT extraction to prevent UI from rendering prematurely
          if (event === 'TOKEN_REFRESHED') {
            setLoading(true);
          }
          await extractPersonFromJWT(session.user, personRef.current, session);
          if (event === 'TOKEN_REFRESHED') {
            setLoading(false);
          }
        }
      } else {
        setPerson(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Empty dependency array is safe now with personRef

  const extractPersonFromJWT = async (authUser, currentPerson = null, providedSession = null) => {
    // AUTH V2: Extract person data from JWT claims (Custom Access Token Hook)
    // This replaces metadata-based approach with secure, server-side JWT claims
    console.log('🔄 [AUTH-V2] Extracting person data from JWT claims...');
    
    let currentSession;
    
    if (providedSession) {
      // Use the provided session from onAuthStateChange
      currentSession = providedSession;
      console.log('✅ [AUTH-V2] Using provided session, access token length:', currentSession.access_token?.length || 0);
    } else {
      // Fallback to fetching session (for legacy calls)
      try {
        const { data } = await supabase.auth.getSession();
        currentSession = data.session;
        console.log('✅ [AUTH-V2] Fetched session, access token length:', currentSession?.access_token?.length || 0);
      } catch (sessionError) {
        console.warn('⚠️ [AUTH-V2] Session fetch failed, skipping JWT extraction:', sessionError.message);
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

  const signOut = async () => {
    console.log('🔄 [AUTH-V2] Logging out...');
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (!error) {
      console.log('✅ [AUTH-V2] Successfully signed out');
      setPerson(null);
      // Reload page to ensure clean state
      window.location.reload();
    } else {
      console.error('❌ [AUTH-V2] Logout failed:', error);
    }
    return { error };
  };

  const refreshAuth = async () => {
    console.log('🔄 [AUTH-V2] Refreshing authentication after profile changes...');
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('❌ [AUTH-V2] Token refresh failed:', error);
        return { error };
      }
      
      // Extract person data from the new JWT token
      if (data?.session?.user) {
        await extractPersonFromJWT(data.session.user, null, data.session);
        console.log('✅ [AUTH-V2] Authentication refreshed successfully');
      }
      
      return { error: null };
    } catch (err) {
      console.error('❌ [AUTH-V2] Refresh auth failed:', err);
      return { error: err };
    }
  };

  const value = {
    user,
    person,
    session,
    loading,
    signInWithOtp,
    verifyOtp,
    signOut,
    refreshAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};