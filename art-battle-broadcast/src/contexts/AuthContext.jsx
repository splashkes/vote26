import { createContext, useContext, useEffect, useState } from 'react';
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
      } else {
        setPerson(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};