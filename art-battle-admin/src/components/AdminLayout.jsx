import { useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Flex, Box } from '@radix-ui/themes';
import { useAuth } from '../contexts/AuthContext';
import AdminSidebar from './AdminSidebar';
import AdminContext from './AdminContext';

const AdminLayout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  console.log('AdminLayout render:', { user: user?.email, loading, location: location.pathname });

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
        <Outlet />
      </div>
      
      <div className="admin-context">
        <AdminContext />
      </div>
    </div>
  );
};

export default AdminLayout;