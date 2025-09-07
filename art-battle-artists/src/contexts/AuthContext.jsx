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
    
    // Extract person data from auth metadata - AUTH-FIRST APPROACH
    // Only use user_metadata (set by auth-webhook)
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
      
      // Auth-webhook handles all person linking automatically during phone confirmation
      console.log('No person metadata found - will be available after auth-webhook processing');
      setPerson(null);
    }
  };

  const signInWithOtp = async (phone) => {
    // Always use recovery flow since it works reliably
    // This will create new users if they don't exist, but via the working SMS path
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phone,
      options: {
        channel: 'sms',
        shouldCreateUser: true  // Allow user creation via recovery flow
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
    
    // Auth-webhook handles metadata updates automatically during phone confirmation
    // No need to manually refresh - next auth state change will have updated metadata
    
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