import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { Flex, Box, Button, Text } from '@radix-ui/themes';
import { HamburgerMenuIcon, ExitIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AdminSidebar from './AdminSidebar';
import EventContextPanel from './EventContextPanel';
import BreadcrumbNavigation from './BreadcrumbNavigation';
import ReleaseNotesModal, { useReleaseNotes } from './ReleaseNotesModal';

const AdminLayout = () => {
  const { user, loading, adminEvents, signOut } = useAuth();
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState(null);
  const [showContextPanel, setShowContextPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  
  // Release notes modal
  const { showReleaseNotes, closeReleaseNotes } = useReleaseNotes();

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

        // Check if user exists in admin users using RPC function
        const { data: adminData, error } = await supabase
          .rpc('get_current_user_admin_info');

        if (error) {
          console.error('Error checking admin status:', error);
          setAdminError('Failed to verify admin permissions');
          setAdminUser(null);
        } else if (!adminData || adminData.length === 0) {
          console.log('User is not an admin:', user.email);
          setAdminError('Access denied: User is not an admin');
          setAdminUser(null);
        } else {
          console.log('User is admin:', adminData[0]);
          setAdminUser(adminData[0]);
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

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
          hideToggleAndSignOut={true}
        />
      </div>
      
      <div className="admin-main">
        {/* Breadcrumb Navigation with Logout */}
        <BreadcrumbNavigation 
          selectedEvent={selectedEvent} 
          onSignOut={handleSignOut}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          sidebarCollapsed={sidebarCollapsed}
        />
        
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

      {/* Release Notes Modal */}
      <ReleaseNotesModal 
        isOpen={showReleaseNotes} 
        onClose={closeReleaseNotes} 
      />
    </div>
  );
};

export default AdminLayout;