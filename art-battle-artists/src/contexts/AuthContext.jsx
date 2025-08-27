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
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('AuthContext: Initial session check:', !!session);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('AuthContext: User found, extracting metadata...');
        await extractPersonFromMetadata(session.user);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('AuthContext: Auth state change:', _event, !!session);
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
    console.log('AuthContext: Extracting person metadata from user:', authUser.id);
    // Extract person data from auth metadata (no database query needed!)
    const metadata = authUser.user_metadata || {};
    console.log('AuthContext: User metadata:', metadata);
    
    if (metadata.person_id) {
      console.log('AuthContext: Setting person from metadata:', metadata.person_id);
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
      
      try {
        // Just refresh the session to get updated JWT with person data
        const { data: { session } } = await supabase.auth.refreshSession();
        
        if (session && session.user?.user_metadata?.person_id) {
          // Update local state with person data from JWT
          setPerson({
            id: session.user.user_metadata.person_id,
            hash: session.user.user_metadata.person_hash,
            name: session.user.user_metadata.person_name,
            phone: authUser.phone
          });
          console.log('Session refreshed with person metadata');
        } else {
          console.log('No person metadata found in session - auth-webhook will handle on next login');
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