import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation, useParams } from 'react-router-dom';
import { Flex, Box } from '@radix-ui/themes';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AdminSidebar from './AdminSidebar';
import EventContextPanel from './EventContextPanel';
import BreadcrumbNavigation from './BreadcrumbNavigation';

const AdminLayout = () => {
  const { user, loading, adminEvents } = useAuth();
  const location = useLocation();
  const params = useParams();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState(null);
  const [showContextPanel, setShowContextPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  console.log('AdminLayout render:', { user: user?.email, loading, location: location.pathname });

  // Check if user is actually an admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.email) {
        setAdminLoading(false);
        return;
      }

      try {
        setAdminLoading(true);
        setAdminError(null);

        // Check if user exists in abhq_admin_users table
        const { data: adminData, error } = await supabase
          .from('abhq_admin_users')
          .select('*')
          .eq('email', user.email)
          .eq('active', true)
          .maybeSingle();

        if (error) {
          console.error('Error checking admin status:', error);
          setAdminError('Failed to verify admin permissions');
          setAdminUser(null);
        } else if (!adminData) {
          console.log('User is not an admin:', user.email);
          setAdminError('Access denied: User is not an admin');
          setAdminUser(null);
        } else {
          console.log('User is admin:', adminData);
          setAdminUser(adminData);
        }
      } catch (err) {
        console.error('Exception checking admin status:', err);
        setAdminError('Error verifying admin permissions');
        setAdminUser(null);
      } finally {
        setAdminLoading(false);
      }
    };

    checkAdminStatus();
  }, [user?.email]);

  // Extract selected event from URL params and determine if context panel should show
  useEffect(() => {
    const eventId = params.eventId;
    
    // Hide context panel for admin-users and invitations pages
    const hideContextPanelRoutes = ['/admin-users', '/invitations'];
    const shouldHideContext = hideContextPanelRoutes.some(route => 
      location.pathname === route || location.pathname.startsWith(route + '/')
    );
    
    setShowContextPanel(!shouldHideContext && !!eventId);
    
    if (eventId && adminEvents) {
      const event = adminEvents.find(e => e.event_id === eventId || e.id === eventId);
      setSelectedEvent(event || null);
    } else {
      setSelectedEvent(null);
    }
  }, [params.eventId, adminEvents, location.pathname]);

  // Show loading state
  if (loading || adminLoading) {
    return (
      <Flex align="center" justify="center" style={{ height: '100vh' }}>
        Loading...
      </Flex>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    console.log('No user, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Show error or redirect if not admin
  if (adminError || !adminUser) {
    return (
      <Flex align="center" justify="center" direction="column" style={{ height: '100vh', padding: '2rem' }}>
        <h2>Access Denied</h2>
        <p>{adminError || 'You do not have admin permissions to access this area.'}</p>
        <p>Contact an administrator if you believe this is an error.</p>
        <button onClick={() => window.location.href = '/login'} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Return to Login
        </button>
      </Flex>
    );
  }

  return (
    <div className={`admin-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${!showContextPanel ? 'no-context' : ''}`}>
      <div className="admin-sidebar">
        <AdminSidebar 
          collapsed={sidebarCollapsed} 
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>
      
      <div className="admin-main">
        {/* Breadcrumb Navigation */}
        <BreadcrumbNavigation selectedEvent={selectedEvent} />
        
        {/* Main Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
      
      {showContextPanel && (
        <div className="admin-context">
          <EventContextPanel 
            selectedEventId={params.eventId}
            onClose={() => setShowContextPanel(false)}
          />
        </div>
      )}
    </div>
  );
};

export default AdminLayout;