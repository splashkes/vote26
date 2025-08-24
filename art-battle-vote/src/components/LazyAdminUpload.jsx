import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, Spinner, Text } from '@radix-ui/themes';
import { useAuth } from '../contexts/AuthContext';

// Lazy load the admin upload component
const AdminImageUpload = lazy(() => import('./AdminImageUpload'));

const LazyAdminUpload = ({ eventId, eventCode, artCode, ...props }) => {
  const { user, isEventAdmin } = useAuth();
  
  // Use local admin check (no network calls!)
  const hasPhotoPermission = user && eventId && isEventAdmin(eventId, 'photo');

  // Only render for admin users with photo permissions
  if (!hasPhotoPermission) {
    return (
      <Box p="4">
        <Text size="2" color="gray">Photo upload requires photo admin permissions or higher.</Text>
      </Box>
    );
  }

  return (
    <Suspense 
      fallback={
        <Box p="4" style={{ textAlign: 'center' }}>
          <Spinner size="3" />
        </Box>
      }
    >
      <AdminImageUpload eventId={eventId} eventCode={eventCode} artCode={artCode} {...props} />
    </Suspense>
  );
};

export default LazyAdminUpload;