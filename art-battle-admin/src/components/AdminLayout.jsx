import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation, useParams } from 'react-router-dom';
import { Flex, Box } from '@radix-ui/themes';
import { useAuth } from '../contexts/AuthContext';
import AdminSidebar from './AdminSidebar';
import EventContextPanel from './EventContextPanel';
import BreadcrumbNavigation from './BreadcrumbNavigation';

const AdminLayout = () => {
  const { user, loading, adminEvents } = useAuth();
  const location = useLocation();
  const params = useParams();
  const [selectedEvent, setSelectedEvent] = useState(null);

  console.log('AdminLayout render:', { user: user?.email, loading, location: location.pathname });

  // Extract selected event from URL params
  useEffect(() => {
    const eventId = params.eventId;
    if (eventId && adminEvents) {
      const event = adminEvents.find(e => e.event_id === eventId || e.id === eventId);
      setSelectedEvent(event || null);
    } else {
      setSelectedEvent(null);
    }
  }, [params.eventId, adminEvents]);

  // Show loading state
  if (loading) {
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

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        <AdminSidebar />
      </div>
      
      <div className="admin-main">
        {/* Breadcrumb Navigation */}
        <BreadcrumbNavigation selectedEvent={selectedEvent} />
        
        {/* Main Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
      
      <div className="admin-context">
        <EventContextPanel selectedEventId={params.eventId} />
      </div>
    </div>
  );
};

export default AdminLayout;