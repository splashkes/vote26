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
        }
      }, 500);
    }
    
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    setPerson(null);
    return { error };
  };

  const value = {
    user,
    person,
    session,
    loading,
    signInWithOtp,
    verifyOtp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};