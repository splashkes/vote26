import { lazy, Suspense, useEffect, useState } from 'react';
import { Box, Spinner, Text } from '@radix-ui/themes';

// Lazy load the admin upload component
const AdminImageUpload = lazy(() => import('./AdminImageUpload'));

const LazyAdminUpload = ({ isAdmin, eventId, eventCode, artCode, user, ...props }) => {
  const [hasPhotoPermission, setHasPhotoPermission] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  useEffect(() => {
    const checkPhotoPermission = async () => {
      if (!isAdmin || !eventId || !user) {
        setHasPhotoPermission(false);
        setCheckingPermission(false);
        return;
      }

      try {
        const { checkEventAdminPermission } = await import('../lib/adminHelpers');
        // Check if user has photo permission or higher (photo, producer, super)
        const hasPermission = await checkEventAdminPermission(eventId, 'photo', user?.phone);
        setHasPhotoPermission(hasPermission);
      } catch (error) {
        console.error('Error checking photo permission:', error);
        setHasPhotoPermission(false);
      } finally {
        setCheckingPermission(false);
      }
    };

    checkPhotoPermission();
  }, [isAdmin, eventId, user]);

  // Don't render while checking permissions
  if (checkingPermission) {
    return null;
  }

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