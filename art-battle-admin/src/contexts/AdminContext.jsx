import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const AdminContext = createContext({});

export const useAdmin = () => useContext(AdminContext);

export const AdminProvider = ({ children }) => {
  const { user } = useAuth();
  const [adminEvents, setAdminEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userLevel, setUserLevel] = useState(null);

  const loadAdminPermissions = async () => {
    if (!user?.email) {
      setAdminEvents([]);
      setUserLevel(null);
      return;
    }

    try {
      setLoading(true);
      console.log('Loading admin permissions for:', user.email);
      
      // Try to get admin permissions from admin_users table
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('user_email, admin_level, event_access')
        .eq('user_email', user.email)
        .eq('active', true);

      if (adminError && adminError.code !== 'PGRST116') { // Ignore table not found
        console.error('Error loading admin data:', adminError);
      }

      if (adminData && adminData.length > 0) {
        const adminUser = adminData[0];
        setUserLevel(adminUser.admin_level);
        
        // If user has specific event access, load those events
        if (adminUser.event_access && adminUser.event_access.length > 0) {
          const { data: eventsData, error: eventsError } = await supabase
            .from('events')
            .select('id, eid, name, venue, event_start_datetime, event_end_datetime')
            .in('id', adminUser.event_access)
            .order('event_start_datetime', { ascending: false });

          if (!eventsError && eventsData) {
            const adminEvents = eventsData.map(event => ({
              event_id: event.id,
              level: adminUser.admin_level,
              event_name: event.name,
              event_eid: event.eid,
              event_venue: event.venue,
              event_start_datetime: event.event_start_datetime,
              event_end_datetime: event.event_end_datetime
            }));
            setAdminEvents(adminEvents);
          }
        } else if (adminUser.admin_level === 'super') {
          // Super admins get access to all events
          setUserLevel('super');
          // Load all events for super admin
          const { data: eventsData, error: eventsError } = await supabase
            .from('events')
            .select('id, eid, name, venue, event_start_datetime, event_end_datetime')
            .eq('enabled', true)
            .order('event_start_datetime', { ascending: false })
            .limit(100);

          if (!eventsError && eventsData) {
            const adminEvents = eventsData.map(event => ({
              event_id: event.id,
              level: 'super',
              event_name: event.name,
              event_eid: event.eid,
              event_venue: event.venue,
              event_start_datetime: event.event_start_datetime,
              event_end_datetime: event.event_end_datetime
            }));
            setAdminEvents(adminEvents);
          }
        }
      } else {
        // No admin permissions found - could be a regular user or admin table doesn't exist
        console.log('No admin permissions found for user:', user.email);
        setUserLevel(null);
        setAdminEvents([]);
      }
    } catch (error) {
      console.error('Error loading admin permissions:', error);
      setUserLevel(null);
      setAdminEvents([]);
    } finally {
      setLoading(false);
    }
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

  const isSuperAdmin = () => userLevel === 'super';

  const isAdmin = () => !!userLevel;

  // Load admin permissions when user changes
  useEffect(() => {
    if (user) {
      loadAdminPermissions();
    } else {
      setAdminEvents([]);
      setUserLevel(null);
    }
  }, [user]);

  const value = {
    adminEvents,
    userLevel,
    loading,
    hasEventAccess,
    isSuperAdmin,
    isAdmin,
    refreshPermissions: loadAdminPermissions,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};